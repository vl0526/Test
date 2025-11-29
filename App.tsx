import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AudioFile, ConfigOptions, ProcessReport } from './types';
import { BatchProcessor } from './services/audioProcessor';
import { FileUpload } from './components/FileUpload';
import { Header } from './components/Header';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { LoaderIcon, CheckCircleIcon, WarningIcon, SettingsIcon, DownloadIcon } from './components/Icons';

// Default Studio Config
const DEFAULT_CONFIG: ConfigOptions = {
    pitchShift: 2,
    playbackRate: 1.2,
    soundOptimization: true,
    concurrency: 16, // Giữ mức an toàn cho AudioContext, Worker sẽ chạy max
    zipFileName: 'Rendered_Studio_Mix'
};

const App: React.FC = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [zipFile, setZipFile] = useState<File | null>(null);
    const [report, setReport] = useState<ProcessReport | null>(null);
    const [config, setConfig] = useState<ConfigOptions>(DEFAULT_CONFIG);

    // --- OPTIMIZATION CORE: Detached State ---
    // Sử dụng Ref để lưu trữ trạng thái realtime mà không gây re-render
    const fileStatusRef = useRef<Map<string, Partial<AudioFile>>>(new Map());
    // Files State chỉ dùng để Render UI
    const [files, setFiles] = useState<AudioFile[]>([]);
    
    // Biến cờ để kiểm soát vòng lặp UI update
    const uiLoopRef = useRef<number | null>(null);

    const handleUpload = useCallback((fileList: FileList | null) => {
        if (!fileList) return;
        const newFs = Array.from(fileList)
            .filter(f => /\.(mp3|wav|m4a|ogg|flac)$/i.test(f.name))
            .map(f => ({
                file: f, id: Math.random().toString(36).substr(2, 9), 
                name: f.name, originalSize: f.size, status: 'idle' as const, progress: 0
            }));
        
        // Reset Ref
        fileStatusRef.current.clear();
        setFiles(newFs);
        setZipFile(null);
        setReport(null);
    }, []);

    // --- UI LOOP ENGINE ---
    // Chỉ cập nhật giao diện mỗi 100ms (10fps) để tránh UI Lag tuyệt đối
    useEffect(() => {
        if (!isProcessing) return;

        const loop = () => {
            setFiles(prevFiles => {
                let hasChanges = false;
                const nextFiles = prevFiles.map(f => {
                    const updates = fileStatusRef.current.get(f.id);
                    if (updates) {
                        // Chỉ tạo object mới nếu có thay đổi thực sự
                        if (updates.status !== f.status || updates.progress !== f.progress) {
                            hasChanges = true;
                            return { ...f, ...updates };
                        }
                    }
                    return f;
                });
                return hasChanges ? nextFiles : prevFiles;
            });
            uiLoopRef.current = requestAnimationFrame(() => setTimeout(loop, 100)); // Throttle 100ms
        };

        loop();

        return () => {
            if (uiLoopRef.current) cancelAnimationFrame(uiLoopRef.current);
        };
    }, [isProcessing]);

    const runBatch = useCallback(() => {
        if (files.length === 0) return;
        setIsProcessing(true);
        
        // Init Ref with current state
        files.forEach(f => fileStatusRef.current.set(f.id, { status: f.status, progress: f.progress }));

        const engine = new BatchProcessor(files, config, 
            (id, status, progress) => {
                // UPDATE REF ONLY - NO RE-RENDER HERE
                const current = fileStatusRef.current.get(id) || {};
                fileStatusRef.current.set(id, { ...current, status: status as any, progress });
            },
            (finalZip, rep) => {
                setZipFile(finalZip);
                setReport(rep);
                setIsProcessing(false); // Stop UI Loop
                // Force Final update to ensure nothing is missed
                setFiles(prev => prev.map(f => {
                     const u = fileStatusRef.current.get(f.id);
                     return u ? { ...f, ...u } : f;
                }));
            }
        );
        engine.start();
    }, [files, config]);

    const downloadZip = () => {
        if (!zipFile) return;
        const url = URL.createObjectURL(zipFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipFile.name;
        a.click();
        URL.revokeObjectURL(url);
    };

    const completed = files.filter(f => f.status === 'completed').length;
    const progressPerc = files.length ? Math.round((completed / files.length) * 100) : 0;

    return (
        <div className="flex flex-col h-screen bg-[#f8fafc] text-slate-800 font-sans overflow-hidden">
            <Header />
            <main className="flex-1 flex overflow-hidden max-w-[1800px] w-full mx-auto p-4 gap-4">
                <aside className="w-[360px] flex-shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                    <FileUpload id="files" title="Input Source" description="Drag audio files here" onFileUpload={handleUpload} multiple fileCount={files.length} />
                    <ConfigurationPanel config={config} setConfig={setConfig} />
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
                                {isProcessing ? 'PROCESSING...' : 'START BATCH'}
                            </button>
                        ) : (
                            <button onClick={downloadZip} className="w-full py-3.5 rounded-lg font-bold text-white bg-emerald-500 hover:bg-emerald-600 shadow-md flex items-center justify-center gap-2 animate-bounce-short">
                                <DownloadIcon /> DOWNLOAD ZIP
                            </button>
                        )}
                         {files.length > 0 && (
                            <div className="mt-4 flex justify-between text-xs font-medium text-slate-500">
                                <span>Progress: {progressPerc}%</span>
                                <span>{completed}/{files.length} Done</span>
                            </div>
                        )}
                    </div>
                </aside>

                <section className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h2 className="font-bold text-slate-700 flex items-center gap-2">
                            Studio Queue <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs">{files.length}</span>
                        </h2>
                        {report && <span className="text-xs text-emerald-600 font-bold">Done in {(report.timeElapsed/1000).toFixed(1)}s</span>}
                    </div>

                    {/* CSS Optimization: content-visibility for massive lists */}
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar" style={{ contentVisibility: 'auto' } as any}>
                        {files.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-30">
                                <SettingsIcon className="w-24 h-24 text-slate-400 mb-4" />
                                <p className="text-xl font-bold text-slate-400">WAITING FOR INPUT</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {files.map(file => (
                                    <ViewFileItem key={file.id} file={file} />
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
};

// Memo component để tránh re-render không cần thiết cho từng item con
const ViewFileItem = React.memo(({ file }: { file: AudioFile }) => (
    <div className="relative bg-white border border-slate-100 rounded-lg p-3 hover:shadow-md transition-shadow overflow-hidden">
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
        <p className="text-xs text-slate-400 font-mono">{(file.originalSize / 1024 / 1024).toFixed(2)} MB</p>
    </div>
));

export default App;
