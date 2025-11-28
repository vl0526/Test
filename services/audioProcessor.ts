import { AudioFile, ConfigOptions, ProcessReport, ProcessedTrackInfo } from '../types';
import { pitchProcessorCode } from './pitchProcessor';
import { mp3Pool } from '../utils/workerPool';

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

// Singleton context
let sharedAudioCtx: AudioContext | null = null;
const getAudioContext = () => {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
        sharedAudioCtx = new AudioContext();
    }
    return sharedAudioCtx;
};

// --- Optimized Silence Trimming (-50dB) ---
function trimSilence(audioBuffer: AudioBuffer, dbThreshold = -50) {
    const { numberOfChannels, sampleRate, length } = audioBuffer;
    const threshold = Math.pow(10, dbThreshold / 20);
    
    // Fast scan (step 100 samples)
    let start = 0;
    let end = length;
    
    for (let i = 0; i < length; i += 100) {
        let max = 0;
        for (let c = 0; c < numberOfChannels; c++) max = Math.max(max, Math.abs(audioBuffer.getChannelData(c)[i]));
        if (max > threshold) { start = Math.max(0, i - 100); break; }
    }
    
    for (let i = length - 1; i >= start; i -= 100) {
        let max = 0;
        for (let c = 0; c < numberOfChannels; c++) max = Math.max(max, Math.abs(audioBuffer.getChannelData(c)[i]));
        if (max > threshold) { end = Math.min(length, i + 100); break; }
    }

    const newLen = end - start;
    if (newLen <= 0 || newLen >= length) return audioBuffer;

    const ctx = getAudioContext();
    const newBuf = ctx.createBuffer(numberOfChannels, newLen, sampleRate);
    for (let c = 0; c < numberOfChannels; c++) {
        newBuf.getChannelData(c).set(audioBuffer.getChannelData(c).subarray(start, end));
    }
    return newBuf;
}

function convertBuffer(float32: Float32Array) {
    const l = float32.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
}

export class BatchProcessor {
    private queue: AudioFile[] = [];
    private activeCount = 0;
    private results: ProcessedTrackInfo[] = [];
    private errors: { name: string, msg: string }[] = [];
    private onUpdate: (fileId: string, status: string, progress: number) => void;
    private onComplete: (zipBlob: Blob, report: ProcessReport) => void;
    private config: ConfigOptions;
    
    constructor(
        files: AudioFile[], 
        config: ConfigOptions,
        onUpdate: (id: string, s: string, p: number) => void,
        onComplete: (z: Blob, r: ProcessReport) => void
    ) {
        this.queue = [...files];
        this.config = config;
        this.onUpdate = onUpdate;
        this.onComplete = onComplete;
        mp3Pool.init();
    }

    public start() {
        if (this.queue.length === 0) return;
        this.next();
    }

    private next() {
        while (this.activeCount < this.config.concurrency && this.queue.length > 0) {
            const file = this.queue.shift();
            if (file) {
                this.activeCount++;
                this.processFile(file).finally(() => {
                    this.activeCount--;
                    this.next();
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
            this.onUpdate(id, 'processing', 10);
            
            const arrayBuffer = await file.arrayBuffer();
            const ctx = getAudioContext();
            let audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            
            if (this.config.soundOptimization) {
                audioBuffer = trimSilence(audioBuffer);
            }
            this.onUpdate(id, 'processing', 30);

            // Exact logic: New Duration = Old Duration / Rate
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
            
            // Calculate Pitch Compensation
            const pitchShiftFromRate = 12 * Math.log2(this.config.playbackRate);
            const neededShift = this.config.pitchShift - pitchShiftFromRate;
            const resampleRatio = Math.pow(2, neededShift / 12);
            
            const pitchNode = new AudioWorkletNode(offlineCtx, 'pitch-processor');
            pitchNode.port.postMessage({ resampleRatio });
            
            source.connect(pitchNode).connect(offlineCtx.destination);
            source.start(0);
            
            const renderedBuffer = await offlineCtx.startRendering();
            this.onUpdate(id, 'encoding', 60);

            const pcmLeft = convertBuffer(renderedBuffer.getChannelData(0));
            const pcmRight = renderedBuffer.numberOfChannels > 1 
                ? convertBuffer(renderedBuffer.getChannelData(1)) : undefined;

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
        const zip = new JSZip();
        this.results.forEach(track => zip.file(track.fileName, track.blob));
        const zipBlob = await zip.generateAsync({ type: "blob" });
        
        const report: ProcessReport = {
            totalFiles: this.results.length + this.errors.length,
            successCount: this.results.length,
            errorCount: this.errors.length,
            startTime: 0, 
            endTime: Date.now(),
            errors: this.errors
        };

        this.onComplete(zipBlob, report);
    }
}
