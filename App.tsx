import React, { useState, useCallback, useReducer } from 'react';
import { v4 as uuidv4 } from 'uuid'; // User needs this or simple random string
import { AudioFile, ConfigOptions, ProcessReport } from './types';
import { BatchProcessor } from './services/audioProcessor';
import { FileUpload } from './components/FileUpload';
import { ResultsDisplay } from './components/ResultsDisplay';
import { Header } from './components/Header';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { SettingsIcon, LoaderIcon, CheckCircleIcon, WarningIcon } from './components/Icons';
import { t } from './localization/vi';

// --- State Reducer for Performance ---
type Action = 
    | { type: 'ADD_FILES', payload: AudioFile[] }
    | { type: 'UPDATE_STATUS', id: string, status: string, progress: number }
    | { type: 'RESET' }
    | { type: 'SET_CONFIG', payload: ConfigOptions };

function reducer(state: { files: AudioFile[], config: ConfigOptions }, action: Action) {
    switch (action.type) {
        case 'ADD_FILES':
            return { ...state, files: action.payload };
        case 'UPDATE_STATUS':
             // Optimization: Array map searching for ID every frame is slow for 200 files.
             // But valid for React Render Cycle.
            const newFiles = state.files.map(f => 
                f.id === action.id ? { ...f, status: action.status, progress: action.progress } : f
            );
            return { ...state, files: newFiles as AudioFile[] }; // Cast to fix type noise
        case 'RESET':
            return { ...state, files: [] };
        case 'SET_CONFIG':
            return { ...state, config: action.payload };
        default:
            return state;
    }
}

const INITIAL_CONFIG: ConfigOptions = {
    pitchShift: 0,
    playbackRate: 1.0,
    soundOptimization: true,
    concurrency: navigator.hardwareConcurrency || 4
};

const App: React.FC = () => {
    // Basic UI State
    const [isProcessing, setIsProcessing] = useState(false);
    const [report, setReport] = useState<ProcessReport | null>(null);
    const [zipBlob, setZipBlob] = useState<Blob | null>(null);
    const [theme, setTheme] = useState(() => localStorage.getItem('app-theme') || 'dark');

    // Complex Data State
    const [state, dispatch] = useReducer(reducer, {
        files: [],
        config: INITIAL_CONFIG
    });

    React.useEffect(() => {
        document.documentElement.className = `theme-${theme}`;
        localStorage.setItem('app-theme', theme);
    }, [theme]);

    const handleAudioUpload = useCallback((fileList: FileList | null) => {
        if (!fileList) return;
        
        const newFiles: AudioFile[] = Array.from(fileList)
            .filter(f => /\.(mp3|wav|m4a|ogg|flac)$/i.test(f.name))
            .map(f => ({
                file: f,
                id: Math.random().toString(36).substr(2, 9),
                name: f.name,
                status: 'idle',
                progress: 0
            }));
            
        dispatch({ type: 'ADD_FILES', payload: newFiles });
        setReport(null);
        setZipBlob(null);
    }, []);

    const handleProcess = useCallback(() => {
        if (state.files.length === 0) return;
        setIsProcessing(true);

        const processor = new BatchProcessor(
            state.files,
            state.config,
            (id, status, progress) => {
                 dispatch({ type: 'UPDATE_STATUS', id, status, progress });
            },
            (zip, report) => {
                setZipBlob(zip);
                setReport(report);
                setIsProcessing(false);
            }
        );

        // A small delay to allow UI to render the "Processing" state before thread gets busy
        setTimeout(() => processor.start(), 100);

    }, [state.files, state.config]);

    // Derived States
    const totalFiles = state.files.length;
    const completedCount = state.files.filter(f => f.status === 'completed').length;
    const errorCount = state.files.filter(f => f.status === 'error').length;
    const progressTotal = totalFiles === 0 ? 0 : Math.round((completedCount / totalFiles) * 100);

    return (
        <div className="min-h-screen flex flex-col items-center p-4 sm:p-6 md:p-8 transition-colors duration-500">
            <div className="w-full max-w-6xl mx-auto">
                <Header theme={theme} setTheme={setTheme} />
                
                <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Controls */}
                    <div className="lg:col-span-1 space-y-6">
                        <FileUpload
                            id="u-audio"
                            title={t.fileUpload.audioTitle}
                            description={t.fileUpload.audioDescription}
                            onFileUpload={handleAudioUpload}
                            directory={false}
                            multiple
                            fileCount={totalFiles}
                        />
                        
                        <ConfigurationPanel 
                            config={state.config} 
                            setConfig={(c) => {
                                // Direct state update wrapper
                                dispatch({ type: 'SET_CONFIG', payload: typeof c === 'function' ? c(state.config) : c });
                            }} 
                        />

                        {/* Status Card */}
                        <div className="bg-[var(--bg-secondary)] rounded-lg p-6 shadow-lg border border-[var(--border-color)] text-center">
                            <div className="text-4xl font-black text-[var(--accent-color)] tabular-nums mb-2">
                                {completedCount}<span className="text-xl text-[var(--text-secondary)]">/{totalFiles}</span>
                            </div>
                            <div className="w-full bg-[var(--progress-track-bg)] h-2 rounded-full mb-4 overflow-hidden">
                                <div 
                                    className="bg-[var(--accent-color)] h-full transition-all duration-300 ease-out"
                                    style={{ width: `${progressTotal}%` }}
                                />
                            </div>
                            
                            <button
                                onClick={handleProcess}
                                disabled={totalFiles === 0 || isProcessing}
                                className={`w-full py-4 rounded-lg font-bold text-lg shadow-xl transform transition-all 
                                    ${isProcessing ? 'bg-[var(--bg-primary)] text-[var(--text-secondary)] scale-95 cursor-wait' : 'bg-[var(--accent-color)] text-[var(--accent-text-color)] hover:scale-105 hover:shadow-cyan-500/50'}
                                    disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {isProcessing ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <LoaderIcon className="animate-spin h-6 w-6"/>
                                        <span>PROCESSING...</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center gap-2">
                                        <SettingsIcon className="h-6 w-6"/>
                                        <span>START ENGINE</span>
                                    </div>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Right Column: Grid Visualization aka "The HUD" */}
                    <div className="lg:col-span-2 space-y-6">
                         <div className="bg-[var(--bg-secondary)] rounded-lg p-6 shadow-lg border border-[var(--border-color)] h-[600px] flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold text-[var(--text-primary)]">Execution Queue</h2>
                                <span className="text-xs font-mono text-[var(--text-tertiary)] bg-[var(--input-bg)] px-2 py-1 rounded">
                                    THREADS: {state.config.concurrency}
                                </span>
                            </div>
                            
                            {/* Scrollable File List / Grid */}
                            <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                                {state.files.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-[var(--text-secondary)] opacity-50 border-2 border-dashed border-[var(--border-color)] rounded-lg">
                                        <p>No Files Queued</p>
                                    </div>
                                )}
                                {state.files.map((file) => (
                                    <div key={file.id} className="relative group bg-[var(--bg-primary)] p-3 rounded border border-[var(--border-color)] flex items-center gap-3 overflow-hidden">
                                        {/* Background Progress Bar */}
                                        <div 
                                            className={`absolute left-0 top-0 bottom-0 opacity-20 transition-all duration-300 ${
                                                file.status === 'error' ? 'bg-red-500' : 'bg-[var(--accent-color)]'
                                            }`}
                                            style={{ width: `${file.progress}%` }}
                                        />
                                        
                                        {/* Icon Status */}
                                        <div className="relative z-10 flex-shrink-0 w-8 flex justify-center">
                                            {file.status === 'idle' && <div className="w-3 h-3 rounded-full bg-[var(--text-secondary)]"/>}
                                            {file.status === 'processing' && <LoaderIcon className="w-5 h-5 animate-spin text-[var(--accent-color)]"/>}
                                            {file.status === 'encoding' && <div className="text-xs font-bold text-[var(--warning-color)] animate-pulse">MP3</div>}
                                            {file.status === 'completed' && <CheckCircleIcon className="w-5 h-5 text-[var(--success-color)]"/>}
                                            {file.status === 'error' && <WarningIcon className="w-5 h-5 text-[var(--error-text)]"/>}
                                        </div>

                                        {/* File Info */}
                                        <div className="relative z-10 flex-1 min-w-0">
                                            <div className="flex justify-between items-baseline">
                                                <p className="font-mono text-sm truncate text-[var(--text-primary)]" title={file.name}>{file.name}</p>
                                                <span className={`text-xs ml-2 font-bold ${
                                                    file.status === 'completed' ? 'text-[var(--success-color)]' : 
                                                    file.status === 'error' ? 'text-[var(--error-text)]' : 'text-[var(--text-secondary)]'
                                                }`}>
                                                    {file.status.toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Result Area */}
                        {(zipBlob || report) && (
                            <ResultsDisplay zipBlob={zipBlob} report={report} />
                        )}
                    </div>
                </main>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: var(--bg-primary); }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 3px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--accent-color); }
            `}</style>
        </div>
    );
};

export default App;