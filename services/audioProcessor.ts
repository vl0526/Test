import { AudioFile, ConfigOptions, ProcessReport, ProcessedTrackInfo } from '../types';
import { pitchProcessorCode } from './pitchProcessor';
import { mp3Pool } from '../utils/workerPool';
import { t } from '../localization/vi';

declare const JSZip: any;

let workletURL: string | null = null;
const getWorkletURL = () => {
    if (!workletURL) {
        workletURL = URL.createObjectURL(
            new Blob([pitchProcessorCode], { type: "application/javascript" })
        );
    }
    return workletURL;
};

// Singleton context for decoding to prevent context limit errors
let sharedAudioCtx: AudioContext | null = null;
const getAudioContext = () => {
    if (!sharedAudioCtx) sharedAudioCtx = new AudioContext();
    return sharedAudioCtx;
};

// --- Helper: Trim Silence ---
function trimSilence(audioBuffer: AudioBuffer, dbThreshold = -50): { start: number, end: number, buffer: AudioBuffer } {
    const { numberOfChannels, sampleRate, length } = audioBuffer;
    const threshold = Math.pow(10, dbThreshold / 20);
    
    // Low-resolution scan for performance (step 50 samples)
    let start = 0;
    let end = length;
    
    // Find Start
    for (let i = 0; i < length; i += 50) {
        let max = 0;
        for (let c = 0; c < numberOfChannels; c++) max = Math.max(max, Math.abs(audioBuffer.getChannelData(c)[i]));
        if (max > threshold) {
            start = Math.max(0, i - 50); // backstep slightly
            break;
        }
    }
    
    // Find End
    for (let i = length - 1; i >= start; i -= 50) {
        let max = 0;
        for (let c = 0; c < numberOfChannels; c++) max = Math.max(max, Math.abs(audioBuffer.getChannelData(c)[i]));
        if (max > threshold) {
            end = Math.min(length, i + 50);
            break;
        }
    }

    const newLen = end - start;
    if (newLen <= 0) return { start: 0, end: length, buffer: audioBuffer };

    const ctx = getAudioContext();
    const newBuf = ctx.createBuffer(numberOfChannels, newLen, sampleRate);
    for (let c = 0; c < numberOfChannels; c++) {
        newBuf.getChannelData(c).set(audioBuffer.getChannelData(c).subarray(start, end));
    }
    return { start, end, buffer: newBuf };
}

// --- Convert Float32 to Int16 for LameJS ---
function convertBuffer(float32: Float32Array) {
    const l = float32.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        // Clamp and scale
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
}

// --- Processor ---
export class BatchProcessor {
    private queue: AudioFile[] = [];
    private activeCount = 0;
    private results: ProcessedTrackInfo[] = [];
    private errors: { name: string, msg: string }[] = [];
    private onUpdate: (fileId: string, status: string, progress: number) => void;
    private onComplete: (zipBlob: Blob, report: ProcessReport) => void;
    private config: ConfigOptions;
    
    // Max parallel processing tracks (Decoding/Rendering)
    // Note: Encoding is handled by the WorkerPool which has its own concurrency
    private concurrencyLimit = 6; 

    constructor(
        files: AudioFile[], 
        config: ConfigOptions,
        onUpdate: (id: string, s: string, p: number) => void,
        onComplete: (z: Blob, r: ProcessReport) => void
    ) {
        this.queue = [...files]; // Clone
        this.config = config;
        this.onUpdate = onUpdate;
        this.onComplete = onComplete;
        this.concurrencyLimit = config.concurrency || 6;
        
        // Init pool
        mp3Pool.init();
    }

    public start() {
        if (this.queue.length === 0) return;
        this.next();
    }

    private next() {
        // Check if we can start more tasks
        while (this.activeCount < this.concurrencyLimit && this.queue.length > 0) {
            const file = this.queue.shift();
            if (file) {
                this.activeCount++;
                this.processFile(file).finally(() => {
                    this.activeCount--;
                    this.next(); // Trigger next when one finishes
                    
                    // Check if *really* all done
                    if (this.activeCount === 0 && this.queue.length === 0) {
                        this.finish();
                    }
                });
            }
        }
    }

    private async processFile(fileWrapper: AudioFile): Promise<void> {
        const { file, id, name } = fileWrapper;
        try {
            this.onUpdate(id, 'processing', 20);
            
            // 1. Decode
            const arrayBuffer = await file.arrayBuffer();
            const ctx = getAudioContext();
            let audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            
            if (this.config.soundOptimization) {
                const res = trimSilence(audioBuffer);
                audioBuffer = res.buffer;
            }
            this.onUpdate(id, 'processing', 40);

            // 2. Offline Render (Pitch/Speed)
            const newDuration = audioBuffer.duration / this.config.playbackRate;
            const offlineCtx = new OfflineAudioContext(
                audioBuffer.numberOfChannels,
                Math.ceil(newDuration * audioBuffer.sampleRate),
                audioBuffer.sampleRate
            );
            
            await offlineCtx.audioWorklet.addModule(getWorkletURL());
            
            const source = offlineCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.playbackRate.value = this.config.playbackRate;
            
            // Pitch correction logic
            const pitchShiftFromRate = 12 * Math.log2(this.config.playbackRate);
            const neededShift = this.config.pitchShift - pitchShiftFromRate;
            const resampleRatio = Math.pow(2, neededShift / 12);
            
            const pitchNode = new AudioWorkletNode(offlineCtx, 'pitch-processor');
            pitchNode.port.postMessage({ resampleRatio });
            
            source.connect(pitchNode).connect(offlineCtx.destination);
            source.start(0);
            
            const renderedBuffer = await offlineCtx.startRendering();
            this.onUpdate(id, 'encoding', 60);

            // 3. Encode (Offloaded to Worker Pool)
            // Prepare data for transfer
            const pcmLeft = convertBuffer(renderedBuffer.getChannelData(0));
            const pcmRight = renderedBuffer.numberOfChannels > 1 
                ? convertBuffer(renderedBuffer.getChannelData(1))
                : undefined;

            const mp3Blob = await mp3Pool.encode(id, {
                channels: renderedBuffer.numberOfChannels,
                sampleRate: renderedBuffer.sampleRate,
                pcmLeft,
                pcmRight
            });

            this.results.push({
                fileName: name.replace(/\.[^/.]+$/, "") + ".mp3",
                originalDuration: audioBuffer.duration,
                finalDuration: renderedBuffer.duration,
                size: mp3Blob.size,
                blob: mp3Blob
            });
            
            this.onUpdate(id, 'completed', 100);

        } catch (error: any) {
            console.error(`Error ${name}:`, error);
            this.errors.push({ name, msg: error.message || "Unknown error" });
            this.onUpdate(id, 'error', 0);
        }
    }

    private async finish() {
        // Zip all results
        const zip = new JSZip();
        this.results.forEach(track => {
            zip.file(track.fileName, track.blob);
        });

        const zipBlob = await zip.generateAsync({ type: "blob" });
        
        const report: ProcessReport = {
            totalFiles: this.results.length + this.errors.length,
            successCount: this.results.length,
            errorCount: this.errors.length,
            bypassCount: 0,
            startTime: 0,
            endTime: Date.now(),
            errors: this.errors
        };

        this.onComplete(zipBlob, report);
    }
}