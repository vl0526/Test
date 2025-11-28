import React from 'react';
import { ConfigOptions } from '../types';
import { SettingsIcon } from './Icons';

interface ConfigurationPanelProps {
    config: ConfigOptions;
    setConfig: React.Dispatch<React.SetStateAction<ConfigOptions>>;
}

export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({ config, setConfig }) => {
    const handleChange = (key: keyof ConfigOptions, val: string | number | boolean) => {
        setConfig(prev => ({ ...prev, [key]: val }));
    };

    return (
        <div className="bg-[var(--bg-panel)] rounded-xl p-5 shadow-sm border border-[var(--border-color)]">
            <h3 className="text-sm font-bold text-[var(--accent-color)] uppercase tracking-wider mb-4 flex items-center gap-2">
                <SettingsIcon className="w-5 h-5" /> Config Parameters
            </h3>
            
            <div className="space-y-5">
                {/* Threads */}
                <div>
                    <div className="flex justify-between mb-1">
                        <label className="text-sm font-medium text-[var(--text-secondary)]">Concurrency (Threads)</label>
                        <span className="text-xs font-mono font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{config.concurrency} Core</span>
                    </div>
                    <input 
                        type="range" min="1" max="16" step="1" 
                        value={config.concurrency}
                        onChange={e => handleChange('concurrency', Number(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[var(--accent-color)]"
                    />
                </div>

                {/* Pitch & Speed Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <div className="flex justify-between mb-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)]">Pitch (Semi)</label>
                            <span className="text-xs font-mono">{config.pitchShift > 0 ? '+' : ''}{config.pitchShift}</span>
                        </div>
                        <input 
                            type="range" min="-12" max="12" step="1"
                            value={config.pitchShift}
                            onChange={e => handleChange('pitchShift', Number(e.target.value))}
                            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[var(--accent-color)]"
                        />
                    </div>
                    <div>
                        <div className="flex justify-between mb-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)]">Speed (Rate)</label>
                            <span className="text-xs font-mono">{config.playbackRate.toFixed(2)}x</span>
                        </div>
                        <input 
                            type="range" min="0.5" max="2.0" step="0.05"
                            value={config.playbackRate}
                            onChange={e => handleChange('playbackRate', Number(e.target.value))}
                            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[var(--accent-color)]"
                        />
                    </div>
                </div>

                {/* Toggle */}
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-color)]">
                    <span className="text-sm font-medium text-[var(--text-primary)]">Smart Silence Trim</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={config.soundOptimization}
                            onChange={e => handleChange('soundOptimization', e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--accent-color)]"></div>
                    </label>
                </div>
            </div>
        </div>
    );
};
