import React, { useState, useCallback, useReducer } from 'react';
import { AudioFile, ConfigOptions, ProcessReport } from './types';
import { BatchProcessor } from './services/audioProcessor';
import { FileUpload } from './components/FileUpload';
import { ResultsDisplay } from './components/ResultsDisplay';
import { Header } from './components/Header';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { LoaderIcon, CheckCircleIcon, WarningIcon, SettingsIcon } from './components/Icons';
import { t } from './localization/vi';

// Helper for reducer
type Action = 
    | { type: 'ADD_FILES', payload: AudioFile[] }
    | { type: 'UPDATE_STATUS', id: string, status: string, progress: number }
    | { type: 'RESET' }
    | { type: 'SET_CONFIG', payload: ConfigOptions };

function reducer(state: { files: AudioFile[], config: ConfigOptions }, action: Action) {
    switch (action.type) {
        case 'ADD_FILES': return { ...state, files: action.payload };
        case 'UPDATE_STATUS':
            const newFiles = state.files.map(f => 
                f.id === action.id ? { ...f, status: action.status, progress: action.progress } : f
            );
            return { ...state, files: newFiles as AudioFile[] };
        case 'RESET': return { ...state, files: [] };
        case 'SET_CONFIG': return { ...state, config: action.payload };
        default: return state;
    }
}

const INITIAL_CONFIG: ConfigOptions = {
    pitchShift: 0,
    playbackRate: 1.0,
    soundOptimization: true,
    concurrency: navigator.hardwareConcurrency || 4
};

const App: React.FC = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [report, setReport] = useState<ProcessReport | null>(null);
    const [zipBlob, setZipBlob] = useState<Blob | null>(null);

    const [state, dispatch] = useReducer(reducer, {
        files: [],
        config: INITIAL_CONFIG
    });

    const handleAudioUpload = useCallback((fileList: FileList | null) => {
        if (!fileList) return;
        const newFiles = Array.from(fileList)
            .filter(f => /\.(mp3|wav|m4a|ogg|flac)$/i.test(f.name))
            .map(f => ({
                file: f, id: Math.random().toString(36).substr(2, 9), name: f.name, status: 'idle', progress: 0
            }));
        dispatch({ type: 'ADD_FILES', payload: newFiles as AudioFile[] });
        setReport(null); setZipBlob(null);
    }, []);

    const handleProcess = useCallback(() => {
        if (state.files.length === 0) return;
        setIsProcessing(true);
        const processor = new BatchProcessor( state.files, state.config,
            (id, status, progress) => dispatch({ type: 'UPDATE_STATUS', id, status, progress }),
            (zip, report) => {
                setZipBlob(zip); setReport(report); setIsProcessing(false);
            }
        );
        setTimeout(() => processor.start(), 100);
    }, [state.files, state.config]);

    const completedCount = state.files.filter(f => f.status === 'completed').length;
    const progressTotal = state.files.length === 0 ? 0 : Math.round((completedCount / state.files.length) * 100);

    return (
        <div className="flex flex-col h-screen bg-[var(--bg-body)]">
            <Header />
            
            {/* Split Screen Layout: Fixed Height Container */}
            <main className="flex-1 flex overflow-hidden p-4 gap-4 max-w-[1920px] mx-auto w-full">
                
                {/* LEFT SIDEBAR: Controls (Fixed, Scrollable if needed but mostly fits) */}
                <aside className="w-[340px] flex-shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar pb-4">
                    {/* Upload */}
                    <div className="bg-white rounded-xl shadow-sm border border-[var(--border-color)] overflow-hidden">
                        <FileUpload
                            id="u-audio" title="Import Audio" description="Drag & drop folder/files here"
                            onFileUpload={handleAudioUpload} directory={false} multiple fileCount={state.files.length}
                        />
                    </div>

                    {/* Stats */}
                    {state.files.length > 0 && (
                        <div className="bg-[var(--bg-panel)] rounded-xl p-5 shadow-sm border border-[var(--border-color)]">
                            <div className="text-center">
                                <span className="text-4xl font-extrabold text-[var(--text-primary)]">{completedCount}</span>
                                <span className="text-sm text-[var(--text-secondary)] font-medium"> / {state.files.length}</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
                                <div className="bg-[var(--accent-color)] h-full transition-all duration-300" style={{ width: `${progressTotal}%` }}></div>
                            </div>
                            <button
                                onClick={handleProcess}
                                disabled={isProcessing || !state.files.length}
                                className={`mt-4 w-full py-3 rounded-lg font-bold text-white transition-all transform active:scale-95 flex items-center justify-center gap-2
                                    ${isProcessing ? 'bg-slate-300 cursor-wait' : 'bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] shadow-lg shadow-blue-500/20'}`}
                            >
                                {isProcessing ? <><LoaderIcon className="animate-spin w-5 h-5"/>Processing</> : <><SettingsIcon className="w-5 h-5"/>Start Render</>}
                            </button>
                        </div>
                    )}

                    {/* Configuration */}
                    <ConfigurationPanel config={state.config} setConfig={(c) => dispatch({ type: 'SET_CONFIG', payload: typeof c === 'function' ? c(state.config) : c })} />
                    
                    {/* Results (Shows up at bottom of sidebar when done) */}
                    {(zipBlob || report) && <ResultsDisplay zipBlob={zipBlob} report={report} />}
                </aside>

                {/* RIGHT PANEL: Queue (Main Content - Takes remaining space) */}
                <section className="flex-1 bg-[var(--bg-panel)] rounded-xl shadow-sm border border-[var(--border-color)] flex flex-col overflow-hidden">
                    <div className="px-6 py-4 border-b border-[var(--border-color)] bg-slate-50 flex justify-between items-center">
                        <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                             Processing Queue
                             {state.files.length > 0 && <span className="text-xs bg-slate-200 px-2 py-0.5 rounded-full text-[var(--text-secondary)]">{state.files.length}</span>}
                        </h2>
                        <div className="text-xs font-mono text-[var(--text-tertiary)]">
                            {state.files.length === 0 ? 'Idle' : isProcessing ? 'Running...' : 'Ready'}
                        </div>
                    </div>

                    {/* Scrollable List */}
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
                        {state.files.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                                <p className="text-lg font-medium">Queue is empty</p>
                                <p className="text-sm">Import files from the left panel to begin.</p>
                            </div>
                        ) : (
                            state.files.map((file) => (
                                <div key={file.id} className="group flex items-center gap-4 bg-white p-3 rounded-lg border border-slate-100 hover:border-blue-200 hover:shadow-sm transition-all relative overflow-hidden">
                                     {/* Progress Background */}
                                     {file.status !== 'error' && (
                                        <div className="absolute left-0 bottom-0 h-1 bg-[var(--accent-color)] transition-all duration-300 opacity-20" style={{ width: `${file.progress}%` }}></div>
                                     )}
                                     
                                     {/* Status Icon */}
                                     <div className="w-8 flex-shrink-0 flex justify-center">
                                         {file.status === 'idle' && <div className="w-2 h-2 rounded-full bg-slate-300" />}
                                         {file.status === 'processing' && <LoaderIcon className="w-5 h-5 text-[var(--accent-color)] animate-spin" />}
                                         {file.status === 'encoding' && <span className="text-[10px] font-bold text-amber-500 border border-amber-200 px-1 rounded">MP3</span>}
                                         {file.status === 'completed' && <CheckCircleIcon className="w-5 h-5 text-[var(--success-color)]" />}
                                         {file.status === 'error' && <WarningIcon className="w-5 h-5 text-[var(--error-color)]" />}
                                     </div>

                                     {/* Info */}
                                     <div className="flex-1 min-w-0">
                                         <p className="text-sm font-medium text-[var(--text-primary)] truncate" title={file.name}>{file.name}</p>
                                         <div className="flex justify-between items-center">
                                            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                                                {file.status === 'processing' ? `Analysing & Pitch Shifting... ${file.progress}%` : 
                                                 file.status === 'encoding' ? 'LameJS Encoding...' :
                                                 file.status}
                                            </p>
                                         </div>
                                     </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
};

export default App;
