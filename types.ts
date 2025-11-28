export interface AudioFile {
    file: File;
    id: string; // UUID
    name: string;
    status: 'idle' | 'processing' | 'encoding' | 'completed' | 'error';
    progress: number; // 0-100
    error?: string;
}

export enum DurationMode {
    KEEP = 'keep',
    TRUNCATE = 'truncate',
}

export interface ConfigOptions {
    pitchShift: number;
    playbackRate: number;
    soundOptimization: boolean;
    concurrency: number; // New: Cho phép user chỉnh số luồng nếu muốn
}

export interface ProcessedTrackInfo {
    fileName: string;
    originalDuration: number;
    finalDuration: number;
    size: number;
    blob: Blob; // Giữ blob trong memory tạm thời để zip
}

export interface ProcessReport {
    totalFiles: number;
    successCount: number;
    errorCount: number;
    bypassCount: number;
    startTime: number;
    endTime: number;
    errors: { name: string; msg: string }[];
}