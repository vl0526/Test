import React from 'react';
import { ConfigOptions } from '../types';
import { SettingsIcon } from './Icons';

interface ConfigurationPanelProps {
    config: ConfigOptions;
    setConfig: React.Dispatch<React.SetStateAction<ConfigOptions>>;
}

export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({ config, setConfig }) => {
    const update = (k: keyof ConfigOptions, v: any) => setConfig(p => ({ ...p, [k]: v }));

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-6">
            <div className="flex items-center gap-2 text-[var(--accent-color)] font-bold uppercase text-xs tracking-wider border-b border-slate-100 pb-2">
                <SettingsIcon className="w-4 h-4" /> Parameters
            </div>

            {/* Pitch */}
            <div className="space-y-2">
                <div className="flex justify-between text-sm">
                    <span className="font-medium text-slate-700">Pitch Shift</span>
                    <span className="font-mono font-bold text-[var(--accent-color)] bg-blue-50 px-2 rounded">
                        {config.pitchShift > 0 ? '+' : ''}{config.pitchShift} st
                    </span>
                </div>
                <input 
                    type="range" min="-12" max="12" step="1"
                    value={config.pitchShift}
                    onChange={(e) => update('pitchShift', Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[var(--accent-color)]"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Deep (-12)</span>
                    <span>Standard (+2)</span>
                    <span>Chipmunk (+12)</span>
                </div>
            </div>

            {/* Speed */}
            <div className="space-y-2">
                <div className="flex justify-between text-sm">
                    <span className="font-medium text-slate-700">Speed (Rate)</span>
                    <span className="font-mono font-bold text-[var(--accent-color)] bg-blue-50 px-2 rounded">
                        {config.playbackRate.toFixed(2)}x
                    </span>
                </div>
                <input 
                    type="range" min="0.5" max="2.0" step="0.05"
                    value={config.playbackRate}
                    onChange={(e) => update('playbackRate', Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[var(--accent-color)]"
                />
            </div>

            {/* Separator */}
            <div className="h-px bg-slate-100"></div>

            {/* Advanced Toggles */}
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-700">Smart Silence Trim</span>
                    <span className="text-[10px] text-slate-400">Auto-cut -50dB start/end</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={config.soundOptimization} onChange={(e) => update('soundOptimization', e.target.checked)} />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent-color)]"></div>
                </label>
            </div>

            <div className="flex items-center justify-between">
                 <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-700">Max Threads</span>
                    <span className="text-[10px] text-slate-400">Studio Concurrency</span>
                </div>
                <div className="flex items-center gap-2">
                    <input 
                        type="number" 
                        value={config.concurrency} 
                        onChange={(e) => update('concurrency', Math.max(1, Number(e.target.value)))}
                        className="w-16 text-center text-sm font-mono border border-slate-300 rounded p-1 focus:ring-1 focus:ring-blue-500 outline-none" 
                    />
                </div>
            </div>
        </div>
    );
};
