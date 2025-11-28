import React, { useState, useCallback, useReducer } from 'react';
import { AudioFile, ConfigOptions, ProcessReport } from './types';
import { BatchProcessor } from './services/audioProcessor';
import { FileUpload } from './components/FileUpload';
import { Header } from './components/Header';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { LoaderIcon, CheckCircleIcon, WarningIcon, SettingsIcon, DownloadIcon } from './components/Icons';

// Default Studio Config
const DEFAULT_CONFIG: ConfigOptions = {
    pitchShift: 2,          // +2 Semitones
    playbackRate: 1.2,      // 1.2x Speed
    soundOptimization: true,// ON
    concurrency: 120,       // 120 Threads
    zipFileName: 'Rendered_Studio_Mix'
};

const App: React.FC = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [zipFile, setZipFile] = useState<File | null>(null);
    const [report, setReport] = useState<ProcessReport | null>(null);

    // Simple State Management
    const [files, setFiles] = useState<AudioFile[]>([]);
    const [config, setConfig] = useState<ConfigOptions>(DEFAULT_CONFIG);

    const handleUpload = useCallback((fileList: FileList | null) => {
        if (!fileList) return;
        const newFs = Array.from(fileList)
            .filter(f => /\.(mp3|wav|m4a|ogg|flac)$/i.test(f.name))
            .map(f => ({
                file: f, id: Math.random().toString(36).substr(2, 9), 
                name: f.name, originalSize: f.size, status: 'idle' as const, progress: 0
            }));
        setFiles(newFs);
        setZipFile(null);
        setReport(null);
    }, []);

    const runBatch = useCallback(() => {
        if (files.length === 0) return;
        setIsProcessing(true);
        const engine = new BatchProcessor(files, config, 
            (id, status, progress) => {
                setFiles(prev => prev.map(f => f.id === id ? { ...f, status: status as any, progress } : f));
            },
            (finalZip, rep) => {
                setZipFile(finalZip);
                setReport(rep);
                setIsProcessing(false);
            }
        );
        engine.start();
    }, [files, config]);

    // Download Handler
    const downloadZip = () => {
        if (!zipFile) return;
        const url = URL.createObjectURL(zipFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipFile.name; // Uses the name we set in BatchProcessor
        a.click();
        URL.revokeObjectURL(url);
    };

    const completed = files.filter(f => f.status === 'completed').length;
    const progressPerc = files.length ? Math.round((completed / files.length) * 100) : 0;

    return (
        <div className="flex flex-col h-screen bg-[#f8fafc] text-slate-800 font-sans overflow-hidden">
            <Header />
            
            <main className="flex-1 flex overflow-hidden max-w-[1800px] w-full mx-auto p-4 gap-4">
                
                {/* --- LEFT PANEL: CONTROLS --- */}
                <aside className="w-[360px] flex-shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                    {/* 1. Upload */}
                    <FileUpload id="files" title="Input Source" description="Drag audio files here" onFileUpload={handleUpload} multiple fileCount={files.length} />

                    {/* 2. Config */}
                    <ConfigurationPanel config={config} setConfig={setConfig} />

                    {/* 3. Export Section (Always Visible) */}
                    <div className="bg-white rounded-xl shadow-lg border border-blue-100 p-5 sticky bottom-0">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Output Filename</label>
                        <div className="flex items-center gap-2 mb-4">
                            <input 
                                type="text" 
                                value={config.zipFileName}
                                onChange={e => setConfig(p => ({...p, zipFileName: e.target.value}))}
                                placeholder="Output Name"
                                className="flex-1 bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-[var(--accent-color)] outline-none"
                            />
                            <span className="text-slate-400 text-sm font-bold">.zip</span>
                        </div>
                        
                        {!zipFile ? (
                            <button 
                                onClick={runBatch} 
                                disabled={isProcessing || files.length === 0}
                                className={`w-full py-3.5 rounded-lg font-bold text-white shadow-md flex items-center justify-center gap-2 transition-all
                                    ${isProcessing ? 'bg-slate-400 cursor-not-allowed' : 'bg-[var(--accent-color)] hover:bg-blue-700 active:scale-95'}`}
                            >
                                {isProcessing ? <LoaderIcon className="animate-spin" /> : <SettingsIcon />}
                                {isProcessing ? 'RENDERING WR...' : 'START BATCH'}
                            </button>
                        ) : (
                            <button 
                                onClick={downloadZip}
                                className="w-full py-3.5 rounded-lg font-bold text-white bg-emerald-500 hover:bg-emerald-600 shadow-md flex items-center justify-center gap-2 animate-bounce-short"
                            >
                                <DownloadIcon /> DOWNLOAD ZIP
                            </button>
                        )}
                        
                        {/* Mini Stats */}
                        {files.length > 0 && (
                            <div className="mt-4 flex justify-between text-xs font-medium text-slate-500">
                                <span>Progress: {progressPerc}%</span>
                                <span>{completed}/{files.length} Done</span>
                            </div>
                        )}
                    </div>
                </aside>

                {/* --- RIGHT PANEL: MATRIX GRID --- */}
                <section className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h2 className="font-bold text-slate-700 flex items-center gap-2">
                            Studio Queue 
                            <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs">{files.length}</span>
                        </h2>
                        {report && <span className="text-xs text-emerald-600 font-bold">Done in {(report.timeElapsed/1000).toFixed(1)}s</span>}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {files.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-30">
                                <SettingsIcon className="w-24 h-24 text-slate-400 mb-4" />
                                <p className="text-xl font-bold text-slate-400">WAITING FOR INPUT</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {files.map(file => (
                                    <div key={file.id} className="relative bg-white border border-slate-100 rounded-lg p-3 hover:shadow-md transition-shadow overflow-hidden">
                                        {/* Progress Bar Background */}
                                        <div className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300" style={{width: `${file.progress}%`}}></div>
                                        
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="p-1.5 rounded bg-slate-50 border border-slate-100">
                                                {file.status === 'completed' ? <CheckCircleIcon className="w-5 h-5 text-emerald-500"/> :
                                                 file.status === 'error' ? <WarningIcon className="w-5 h-5 text-red-500"/> :
                                                 file.status === 'idle' ? <div className="w-5 h-5 rounded-full border-2 border-slate-300"/> :
                                                 <LoaderIcon className="w-5 h-5 text-blue-500 animate-spin"/>}
                                            </div>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                                file.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 
                                                file.status === 'rendering' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'
                                            }`}>
                                                {file.status}
                                            </span>
                                        </div>
                                        
                                        <p className="font-semibold text-sm text-slate-700 truncate mb-1" title={file.name}>{file.name}</p>
                                        <p className="text-xs text-slate-400 font-mono">
                                            {(file.originalSize / 1024 / 1024).toFixed(2)} MB
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
};

export default App;
