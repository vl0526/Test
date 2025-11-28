export interface AudioFile {
    file: File;
    id: string; // UUID
    name: string;
    originalSize: number;
    status: 'idle' | 'decoding' | 'rendering' | 'trimming' | 'encoding' | 'completed' | 'error';
    progress: number;
    error?: string;
}

export interface ConfigOptions {
    pitchShift: number;     // Default: +2
    playbackRate: number;   // Default: 1.2
    soundOptimization: boolean;
    concurrency: number;    // Default: 120
    zipFileName: string;    // New: User defined
}

export interface ProcessedTrackInfo {
    fileName: string;
    blob: Blob;
    size: number;
}

export interface ProcessReport {
    totalFiles: number;
    successCount: number;
    errorCount: number;
    timeElapsed: number;
}
