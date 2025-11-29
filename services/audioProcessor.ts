import { AudioFile, ConfigOptions, ProcessReport, ProcessedTrackInfo } from '../types';
import { mp3Pool } from '../utils/workerPool';

declare const JSZip: any;

// Giới hạn cứng của trình duyệt (Chrome usually 6-10 active contexts).
// Nếu set quá cao, sẽ gặp lỗi "Failed to construct 'OfflineAudioContext'".
const HARD_LIMIT_AUDIO_CONTEXTS = 12;

function smartTrim(buffer: AudioBuffer): AudioBuffer {
    // ... (Giữ nguyên logic SmartTrim cũ, nó đã ổn)
    const threshold = 0.001;
    const { numberOfChannels, length, sampleRate } = buffer;
    let start = 0;
    let end = length;
    
    // Quick Scan (Bước nhảy lớn hơn để nhanh hơn)
    for (let i = 0; i < length; i += 128) { // Optimized step
        let max = 0;
        for (let c = 0; c < numberOfChannels; c++) {
             const val = Math.abs(buffer.getChannelData(c)[i]);
             if (val > max) max = val;
        }
        if (max > threshold) {
            start = Math.max(0, i - 4410); // ~100ms fadein
            break;
        }
    }

    for (let i = length - 1; i >= start; i -= 128) {
        let max = 0;
        for (let c = 0; c < numberOfChannels; c++) {
            const val = Math.abs(buffer.getChannelData(c)[i]);
            if (val > max) max = val;
        }
        if (max > threshold) {
            end = Math.min(length, i + 4410); // ~100ms fadeout
            break;
        }
    }

    const newLength = end - start;
    if (newLength <= 0 || newLength >= length) return buffer;

    const ctx = new AudioContext(); // Decoding context reuse? No, lightweight enough.
    const newBuffer = ctx.createBuffer(numberOfChannels, newLength, sampleRate);
    for (let c = 0; c < numberOfChannels; c++) {
        newBuffer.getChannelData(c).set(buffer.getChannelData(c).subarray(start, end));
    }
    ctx.close();
    return newBuffer;
}

function convertBuffer(float32: Float32Array) {
    const l = float32.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        // Linear clipping instead of Math.max/min for speed? No, robustness first.
        const s = float32[i]; 
        // Manual clamp is faster than calling Math.max/min
        const sClamped = s < -1 ? -1 : s > 1 ? 1 : s;
        int16[i] = sClamped < 0 ? sClamped * 0x8000 : sClamped * 0x7FFF;
    }
    return int16;
}

export class BatchProcessor {
    private queue: AudioFile[] = [];
    private activeContexts = 0; // Đếm số AudioContext đang mở
    private results: ProcessedTrackInfo[] = [];
    private errors: any[] = [];
    private startTime = 0;
    private processedCount = 0; // Tổng số đã xong (success + error)
    private total = 0;

    constructor(
        files: AudioFile[],
        private config: ConfigOptions,
        private onUpdate: (id: string, s: any, p: number) => void,
        private onComplete: (z: Blob, r: ProcessReport) => void
    ) {
        this.queue = [...files];
        this.total = files.length;
        mp3Pool.init();
    }

    public start() {
        this.startTime = Date.now();
        this.scheduler();
    }

    // Cơ chế Scheduler thông minh
    private scheduler() {
        // Chỉ spawn task mới nếu số Context đang hoạt động thấp hơn giới hạn cứng
        while (this.activeContexts < HARD_LIMIT_AUDIO_CONTEXTS && this.queue.length > 0) {
            const file = this.queue.shift();
            if (file) {
                this.activeContexts++;
                this.processSingleFile(file);
            }
        }

        // Nếu hết hàng đợi và không còn ai đang xử lý
        if (this.queue.length === 0 && this.processedCount === this.total) {
            this.finalize();
        }
    }

    private async processSingleFile(fileItem: AudioFile) {
        const { file, id, name } = fileItem;
        
        try {
            this.onUpdate(id, 'decoding', 10);
            
            const arrayBuffer = await file.arrayBuffer();
            const decodeCtx = new AudioContext({ sampleRate: 44100 }); // Fix sample rate chuẩn để tránh resample thừa
            const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
            await decodeCtx.close(); // Đóng ngay lập tức để giải phóng slot

            this.onUpdate(id, 'rendering', 30);

            // --- STUDIO LOGIC ---
            const finalRate = this.config.playbackRate;
            const naturalPitchShift = 12 * Math.log2(finalRate);
            const targetPitchShift = this.config.pitchShift;
            let detuneValue = (targetPitchShift - naturalPitchShift) * 100;
            const newDuration = audioBuffer.duration / finalRate;
            
            // Context này là nặng nhất -> Cần được giải phóng nhanh
            const offlineCtx = new OfflineAudioContext(
                audioBuffer.numberOfChannels,
                Math.ceil(newDuration * 44100),
                44100
            );

            const source = offlineCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.playbackRate.value = finalRate;
            source.detune.value = detuneValue;

            source.connect(offlineCtx.destination);
            source.start(0);

            let renderedBuffer = await offlineCtx.startRendering(); // Render xong block này

            // QUAN TRỌNG: Giảm counter activeContexts NGAY TẠI ĐÂY
            // Vì AudioContext đã xong việc, việc encode phía sau là của Worker (CPU)
            // Cho phép Scheduler nạp file tiếp theo vào AudioContext Slot ngay lập tức.
            this.activeContexts--; 
            this.scheduler(); // Kích hoạt ngay slot tiếp theo

            // --- WORKER PHASE (CPU BOUND, NOT AUDIO CONTEXT BOUND) ---
            this.onUpdate(id, 'trimming', 60);
            if (this.config.soundOptimization) {
                renderedBuffer = smartTrim(renderedBuffer);
            }

            this.onUpdate(id, 'encoding', 80);
            
            // Transfer Data ownership -> Worker
            // Cần copy dữ liệu ra Int16Array trước khi gửi
            const pcmLeft = convertBuffer(renderedBuffer.getChannelData(0));
            const pcmRight = renderedBuffer.numberOfChannels > 1 
                ? convertBuffer(renderedBuffer.getChannelData(1)) : undefined;

            // Sau khi convert, renderedBuffer (Float32) không cần thiết nữa -> Cho GC hốt
            // (Không thể explicit delete trong JS, nhưng scope block sẽ giúp)

            const mp3Blob = await mp3Pool.encode(id, {
                channels: renderedBuffer.numberOfChannels,
                sampleRate: renderedBuffer.sampleRate,
                pcmLeft,
                pcmRight
            });

            this.results.push({
                fileName: name.replace(/\.[^/.]+$/, "") + ".mp3",
                blob: mp3Blob,
                size: mp3Blob.size
            });

            this.onUpdate(id, 'completed', 100);

        } catch (e: any) {
            console.error(`Error processing ${name}:`, e);
            this.errors.push(e.message);
            this.onUpdate(id, 'error', 0);
            this.activeContexts--; // Giảm count nếu lỗi xảy ra sớm
            this.scheduler();
        } finally {
            this.processedCount++;
            // Check finalize lần nữa phòng trường hợp race condition
            if (this.processedCount === this.total) {
                this.finalize();
            }
        }
    }

    private async finalize() {
        const zip = new JSZip();
        let zipName = this.config.zipFileName.trim();
        if (!/\.zip$/i.test(zipName)) zipName += ".zip";
        
        this.results.forEach(t => zip.file(t.fileName, t.blob));
        
        const content = await zip.generateAsync({ type: "blob" });
        const finalFile = new File([content], zipName, { type: "application/zip" });

        this.onComplete(finalFile, {
            totalFiles: this.total,
            successCount: this.results.length,
            errorCount: this.errors.length,
            timeElapsed: Date.now() - this.startTime
        });
    }
}
