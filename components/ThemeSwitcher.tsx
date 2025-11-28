import React from 'react';
import { PaletteIcon } from './Icons';

interface ThemeSwitcherProps {
    theme: string;
    setTheme: (theme: string) => void;
}

const THEMES = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'sunset', label: 'Sunset' },
    { value: 'peter-shower', label: 'Peter Shower' },
    { value: 'beautiful-universe', label: 'Universe' },
];

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ theme, setTheme }) => {
    return (
        <div className="relative inline-block text-left">
            <div className="group">
                 <span className="inline-flex items-center rounded-md bg-[var(--bg-secondary)] border border-[var(--border-color)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)]">
                    <PaletteIcon className="h-5 w-5 text-[var(--accent-color)]" />
                 </span>

                <div className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-[var(--bg-secondary)] shadow-lg ring-1 ring-[var(--border-color)] ring-opacity-50 focus:outline-none opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-200">
                    <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                        {THEMES.map((themeOption) => (
                            <button
                                key={themeOption.value}
                                onClick={() => setTheme(themeOption.value)}
                                className={`${
                                    theme === themeOption.value ? 'bg-[var(--input-bg-hover)] text-[var(--text-tertiary)]' : 'text-[var(--text-secondary)]'
                                } block w-full text-left px-4 py-2 text-sm hover:bg-[var(--input-bg-hover)] hover:text-[var(--text-tertiary)]`}
                                role="menuitem"
                            >
                                {themeOption.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
