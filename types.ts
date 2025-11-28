export interface AudioFile {
    file: File;
    id: string; // UUID
    name: string;
    status: 'idle' | 'processing' | 'encoding' | 'completed' | 'error';
    progress: number;
    error?: string;
}

export interface ConfigOptions {
    pitchShift: number;
    playbackRate: number;
    soundOptimization: boolean;
    concurrency: number;
}

export interface ProcessedTrackInfo {
    fileName: string;
    originalDuration: number;
    finalDuration: number;
    size: number;
    blob: Blob;
}

export interface ProcessReport {
    totalFiles: number;
    successCount: number;
    errorCount: number;
    startTime: number;
    endTime: number;
    errors: { name: string; msg: string }[];
}
