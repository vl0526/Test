import { AudioFile, ConfigOptions, ProcessReport, ProcessedTrackInfo } from '../types';
import { mp3Pool } from '../utils/workerPool';

declare const JSZip: any;

// Tăng giới hạn xử lý song song
const MAX_ACTIVE_RENDER_CONTEXTS = 8; 

// --- Smart Silence Trimming (Soft Mode -60dB) ---
// Giữ lại nhiều chi tiết hơn, cắt nhẹ nhàng hơn
function smartTrim(buffer: AudioBuffer): AudioBuffer {
    const threshold = 0.001; // ~ -60dB (Giữ lại tiếng thở/air noise nhẹ)
    const { numberOfChannels, length, sampleRate } = buffer;
    
    let start = 0;
    let end = length;
    
    // Scan Start (Bước nhảy nhỏ 64 để chính xác)
    for (let i = 0; i < length; i += 64) {
        let max = 0;
        for (let c = 0; c < numberOfChannels; c++) {
             const val = Math.abs(buffer.getChannelData(c)[i]);
             if (val > max) max = val;
        }
        if (max > threshold) {
            // Lùi lại 200ms (khoảng 8800 mẫu) để tạo độ Fade-in tự nhiên
            start = Math.max(0, i - 8800); 
            break;
        }
    }

    // Scan End
    for (let i = length - 1; i >= start; i -= 64) {
        let max = 0;
        for (let c = 0; c < numberOfChannels; c++) {
            const val = Math.abs(buffer.getChannelData(c)[i]);
            if (val > max) max = val;
        }
        if (max > threshold) {
             // Lùi lại 200ms để tạo độ Fade-out tự nhiên
            end = Math.min(length, i + 8800);
            break;
        }
    }

    const newLength = end - start;
    if (newLength <= 0 || newLength >= length) return buffer;

    const ctx = new AudioContext();
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
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
}

export class BatchProcessor {
    private queue: AudioFile[] = [];
    private activeRenderers = 0;
    private results: ProcessedTrackInfo[] = [];
    private errors: { name: string, msg: string }[] = [];
    private startTime = 0;
    
    constructor(
        private files: AudioFile[],
        private config: ConfigOptions,
        private onUpdate: (id: string, s: any, p: number) => void,
        private onComplete: (z: Blob, r: ProcessReport) => void
    ) {
        this.queue = [...files];
        mp3Pool.init();
    }

    public start() {
        this.startTime = Date.now();
        this.scheduler();
    }

    private scheduler() {
        while (this.activeRenderers < MAX_ACTIVE_RENDER_CONTEXTS && this.queue.length > 0) {
            const file = this.queue.shift();
            if (file) {
                this.activeRenderers++;
                this.processSingleFile(file).finally(() => {
                    this.activeRenderers--;
                    if (this.queue.length === 0 && this.activeRenderers === 0) {
                        this.finalize();
                    } else {
                        this.scheduler();
                    }
                });
            }
        }
    }

    private async processSingleFile(fileItem: AudioFile) {
        const { file, id, name } = fileItem;
        try {
            this.onUpdate(id, 'decoding', 10);
            
            const arrayBuffer = await file.arrayBuffer();
            const decodeCtx = new AudioContext(); // Native decoding is best
            const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
            await decodeCtx.close();

            this.onUpdate(id, 'rendering', 30);

            // --- STUDIO ENGINE V3: NATIVE COUPLING ---
            // Thay vì dùng AudioWorklet (gây sạn), chúng ta dùng thuật toán Native Detune.
            // Đây là cách trình duyệt xử lý mượt nhất.
            
            // 1. Calculate Targets
            // User muốn Speed 1.2x. -> PlaybackRate = 1.2
            // User muốn Pitch +2st.
            
            // Native Logic: PlaybackRate 1.2 TỰ ĐỘNG tăng Pitch lên +3.16st (12 * log2(1.2))
            // Vậy Pitch hiện tại đang là +3.16st.
            // User muốn +2st. Nghĩa là phải GIẢM Pitch đi 1.16st.
            // Detune = -116 cents.
            
            // TUY NHIÊN: Người dùng bản cũ thường thích kiểu "Speed riêng, Pitch riêng".
            // Nếu bạn set Speed 1.2 và Pitch +2 -> Kết quả họ muốn là NHANH (1.2) và CAO (+2).
            // Logic tốt nhất cho tai người nghe (Nightcore style):
            // Giữ Speed thuần túy bằng PlaybackRate.
            // Dùng Detune để chỉnh Pitch.
            
            // Công thức "Organic":
            const finalRate = this.config.playbackRate;
            
            // Tính toán Detune cần thiết.
            // Nếu chúng ta muốn GIỮ NGUYÊN Pitch gốc khi tăng tốc -> Detune bù trừ.
            // Nếu chúng ta muốn Pitch tăng theo tốc độ + Pitch người dùng chỉnh -> Detune cộng dồn.
            
            // Ở chế độ Studio này, tôi dùng chế độ "Cộng dồn bán phần" (Hybrid):
            // Chúng ta tôn trọng Pitch của người dùng chỉnh LÀ CAO ĐỘ CUỐI CÙNG MONG MUỐN.
            // Ví dụ: User muốn +2st. Bất kể tốc độ bao nhiêu, đầu ra phải sai khác +2st so với gốc.
            
            const naturalPitchShift = 12 * Math.log2(finalRate); // VD: Speed 1.2 -> +3.16st
            const targetPitchShift = this.config.pitchShift;     // VD: +2st
            
            // Cần Detune bù trừ: Target - Natural
            // VD: 2 - 3.16 = -1.16 st.
            let detuneValue = (targetPitchShift - naturalPitchShift) * 100;

            // Tuy nhiên, Detune trong WebAudio sẽ làm thay đổi Tốc độ một chút nữa.
            // Đây là vật lý âm học. Nếu ta Detune xuống, âm thanh lại chậm lại.
            // Để khắc phục triệt để và cho ra âm thanh TỰ NHIÊN NHẤT (không méo):
            // Ta chấp nhận sự thay đổi tốc độ vi mô này để đổi lấy chất lượng âm thanh pha lê.
            // Hoặc: Ta Recalculate duration.
            
            // QUYẾT ĐỊNH: Dùng phương pháp Resampling Rate thuần tuý (Highest Quality)
            // Final Frequency Ratio = 2^(TargetPitch / 12)
            // Final Time Ratio = 1 / TargetSpeed
            // Kết hợp 2 biến số này vào 1 Offline Context.

            // Tính toán độ dài buffer mới dựa trên Tốc Độ mong muốn
            const newDuration = audioBuffer.duration / finalRate;
            
            const offlineCtx = new OfflineAudioContext(
                audioBuffer.numberOfChannels,
                Math.ceil(newDuration * audioBuffer.sampleRate),
                audioBuffer.sampleRate
            );

            const source = offlineCtx.createBufferSource();
            source.buffer = audioBuffer;

            // Setup tham số "Vàng":
            // 1. Set Rate theo Speed người dùng muốn.
            source.playbackRate.value = finalRate;
            
            // 2. Set Detune để đạt Pitch người dùng muốn (Bù trừ hiệu ứng Doppler của Speed)
            source.detune.value = detuneValue;

            // Lưu ý: Việc Detune bù trừ này sẽ làm tốc độ thực tế bị lệch đi một chút.
            // VD: Speed 1.2, Pitch +2. (Thực tế Pitch +3.16). Ta giảm Pitch -> Tốc độ giảm theo.
            // Kết quả thực tế: Pitch chuẩn +2. Speed thực tế ~1.12.
            // ĐA SỐ người dùng thích sự tự nhiên này hơn là bị méo tiếng do Time-stretch cưỡng bức.
            
            // NẾU bạn MUỐN Speed CHÍNH XÁC TUYỆT ĐỐI 1.2:
            // Chúng ta phải tăng PlaybackRate lên để bù cho việc Detune giảm xuống.
            // Correction Factor = 2^(-detuneCorrection/1200)
            const speedCorrection = Math.pow(2, -detuneValue / 1200);
            
            // Apply Correction để Speed ra đúng 100% như config (Logic Bản Cũ)
            source.playbackRate.value = finalRate * speedCorrection;

            source.connect(offlineCtx.destination);
            source.start(0);

            let renderedBuffer = await offlineCtx.startRendering();

            this.onUpdate(id, 'trimming', 60);
            if (this.config.soundOptimization) {
                renderedBuffer = smartTrim(renderedBuffer);
            }

            this.onUpdate(id, 'encoding', 80);
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
                blob: mp3Blob,
                size: mp3Blob.size
            });

            this.onUpdate(id, 'completed', 100);

        } catch (e: any) {
            console.error(e);
            this.errors.push({ name, msg: e.message });
            this.onUpdate(id, 'error', 0);
        }
    }

    private async finalize() {
        const zip = new JSZip();
        let zipName = this.config.zipFileName.trim();
        // Auto-fix extension
        if (!/\.zip$/i.test(zipName)) zipName += ".zip";
        if (zipName === ".zip") zipName = "Processed_Audio.zip";

        this.results.forEach(t => zip.file(t.fileName, t.blob));
        
        const content = await zip.generateAsync({ type: "blob" });
        const finalFile = new File([content], zipName, { type: "application/zip" });

        this.onComplete(finalFile, {
            totalFiles: this.queue.length + this.results.length + this.errors.length,
            successCount: this.results.length,
            errorCount: this.errors.length,
            timeElapsed: Date.now() - this.startTime
        });
    }
}
