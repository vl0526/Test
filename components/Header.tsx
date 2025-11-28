import React from 'react';
import { WaveformIcon } from './Icons';

export const Header: React.FC = () => (
    <header className="flex h-16 items-center flex-shrink-0 px-6 bg-[var(--bg-panel)] border-b border-[var(--border-color)] shadow-sm z-20">
        <div className="flex items-center gap-3">
            <div className="bg-[var(--accent-color)] p-2 rounded-lg text-white shadow-lg shadow-blue-500/30">
                <WaveformIcon className="h-6 w-6" />
            </div>
            <div>
                <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                    Studio <span className="text-[var(--accent-color)]">BatchProcessor</span>
                </h1>
                <p className="text-xs text-[var(--text-secondary)] font-medium">Professional Audio Rendering Engine</p>
            </div>
        </div>
    </header>
);
