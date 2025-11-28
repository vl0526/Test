import React from 'react';
import { ConfigOptions, DurationMode } from '../types';
import { SettingsIcon } from './Icons';
import { t } from '../localization/vi';

interface ConfigurationPanelProps {
    config: ConfigOptions;
    setConfig: React.Dispatch<React.SetStateAction<ConfigOptions>>;
}

// Helper components for consistent styling
const Label: React.FC<{ htmlFor: string; children: React.ReactNode; value?: string | number | React.ReactNode }> = ({ htmlFor, children, value }) => (
     <div className="flex justify-between items-center mb-2">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-[var(--text-secondary)]">{children}</label>
        {value && <span className="text-xs font-mono font-bold text-[var(--accent-color)] bg-[var(--input-bg)] px-2 py-0.5 rounded border border-[var(--border-color)]">{value}</span>}
    </div>
);

const RangeInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <div className="relative w-full h-6 flex items-center">
        <input
            type="range"
            {...props}
            className="w-full h-2 bg-[var(--input-bg)] rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] focus:ring-[var(--accent-color)] z-10"
            style={{accentColor: 'var(--accent-color)'}}
        />
        {/* Track decoration could go here */}
    </div>
);

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
    <div className="relative">
        <select
            {...props}
            className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md shadow-sm py-2 px-3 text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)] appearance-none transition-colors duration-200 hover:bg-[var(--input-bg-hover)]"
        >
            {props.children}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[var(--text-secondary)]">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
        </div>
    </div>
);

export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({ config, setConfig }) => {
    
    const handleConfigChange = (field: keyof ConfigOptions, value: any) => {
        if (field === 'pitchShift' || field === 'playbackRate' || field === 'concurrency') {
            setConfig(prev => ({ ...prev, [field]: Number(value) }));
        } else if (field === 'soundOptimization') {
            setConfig(prev => ({ ...prev, [field]: Boolean(value) }));
        } else {
            setConfig(prev => ({ ...prev, [field]: value }));
        }
    };

    return (
        <div className="bg-[var(--bg-secondary)] rounded-lg p-6 shadow-lg border border-[var(--border-color)] transition-all duration-300 hover:shadow-[0_0_15px_rgba(34,211,238,0.1)]">
            <h2 className="text-xl font-bold text-[var(--accent-color)] mb-6 flex items-center gap-2">
                <SettingsIcon className="w-6 h-6 animate-pulse-slow"/> 
                {t.configuration.title}
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                {/* 1. Pitch Shift */}
                <div className="sm:col-span-1 p-3 rounded-md bg-[var(--bg-primary)] border border-[var(--border-color)]">
                    <Label htmlFor="pitchShift" value={`${config.pitchShift > 0 ? '+' : ''}${config.pitchShift} st`}>
                        {t.configuration.pitch}
                    </Label>
                    <RangeInput
                        id="pitchShift"
                        min="-12"
                        max="12"
                        step="1"
                        value={config.pitchShift}
                        onChange={e => handleConfigChange('pitchShift', e.target.value)}
                    />
                    <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mt-1 font-mono">
                        <span>-12</span>
                        <span>0</span>
                        <span>+12</span>
                    </div>
                </div>

                {/* 2. Playback Speed */}
                <div className="sm:col-span-1 p-3 rounded-md bg-[var(--bg-primary)] border border-[var(--border-color)]">
                    <Label htmlFor="playbackRate" value={`${config.playbackRate.toFixed(2)}x`}>
                        {t.configuration.speed}
                    </Label>
                    <RangeInput
                        id="playbackRate"
                        min="0.5"
                        max="2.0"
                        step="0.05"
                        value={config.playbackRate}
                        onChange={e => handleConfigChange('playbackRate', e.target.value)}
                    />
                    <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mt-1 font-mono">
                        <span>0.5x</span>
                        <span>1.0x</span>
                        <span>2.0x</span>
                    </div>
                </div>

                {/* 3. Concurrency (New) */}
                <div className="sm:col-span-1">
                    <Label htmlFor="concurrency" value={`${config.concurrency || 4} Threads`}>
                        Luồng xử lý (Concurrency)
                    </Label>
                    <Select
                        id="concurrency"
                        value={config.concurrency || 4}
                        onChange={e => handleConfigChange('concurrency', e.target.value)}
                    >
                        <option value="1">1 (Single Thread - Safe)</option>
                        <option value="2">2 (Dual Core)</option>
                        <option value="4">4 (Quad Core - Standard)</option>
                        <option value="8">8 (Octa Core - High Perf)</option>
                        <option value="16">16 (Turbo Mode - Extreme)</option>
                    </Select>
                </div>

                {/* 4. Duration Mode */}
                <div className="sm:col-span-1">
                    <Label htmlFor="durationMode" value={config.durationMode === DurationMode.KEEP ? 'KEEP' : 'CUT'}>
                        {t.configuration.durationMode}
                    </Label>
                    <Select
                        id="durationMode"
                        value={config.durationMode}
                        onChange={e => handleConfigChange('durationMode', e.target.value as DurationMode)}
                    >
                        <option value={DurationMode.KEEP}>{t.configuration.durationKeep}</option>
                        <option value={DurationMode.TRUNCATE}>{t.configuration.durationTruncate}</option>
                    </Select>
                </div>
            </div>

            {/* Bottom: Checkbox */}
            <div className="border-t border-[var(--border-color)] pt-4">
                <div className="relative flex items-start group cursor-pointer" onClick={() => handleConfigChange('soundOptimization', !config.soundOptimization)}>
                    <div className="flex h-6 items-center">
                        <input
                            id="soundOptimization"
                            aria-describedby="soundOptimization-description"
                            name="soundOptimization"
                            type="checkbox"
                            checked={config.soundOptimization}
                            onChange={e => handleConfigChange('soundOptimization', e.target.checked)}
                            className="h-5 w-5 rounded border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--accent-color)] focus:ring-[var(--accent-color)] focus:ring-offset-[var(--bg-secondary)] cursor-pointer"
                        />
                    </div>
                    <div className="ml-3 text-sm leading-6">
                        <label htmlFor="soundOptimization" className="font-medium text-[var(--text-tertiary)] cursor-pointer group-hover:text-[var(--accent-color)] transition-colors">
                            {t.configuration.soundOptimization}
                        </label>
                        <p id="soundOptimization-description" className="text-[var(--text-secondary)] text-xs mt-1">
                            {t.configuration.soundOptimizationTooltip}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};