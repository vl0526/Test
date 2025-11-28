import React from 'react';
import { WaveformIcon } from './Icons';
import { t } from '../localization/vi';
import { ThemeSwitcher } from './ThemeSwitcher';

interface HeaderProps {
    theme: string;
    setTheme: (theme: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ theme, setTheme }) => (
    <header className="text-center mb-8 relative">
        <div className="absolute top-0 right-0">
            <ThemeSwitcher theme={theme} setTheme={setTheme} />
        </div>
        <div className="flex items-center justify-center gap-4 mb-4">
            <WaveformIcon className="h-12 w-12 text-[var(--accent-color)]" />
            <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-gradient-from)] to-[var(--accent-gradient-to)]">
                {t.header.title}
            </h1>
        </div>
        <p className="max-w-3xl mx-auto text-lg text-[var(--text-secondary)]">
            {t.header.description}
        </p>
    </header>
);
