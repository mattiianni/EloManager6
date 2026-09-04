
import React from 'react';
import { MaterialIcon } from './Icons.tsx';

interface ThemeToggleProps {
    theme: 'light' | 'dark';
    onToggle: () => void;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle }) => {
    return (
        <button
            onClick={onToggle}
            className="hig-focus-ring flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-200/60 dark:hover:bg-white/10"
            aria-label={theme === 'light' ? 'Attiva tema scuro' : 'Attiva tema chiaro'}
        >
            <span className="flex h-[1.125rem] w-[1.125rem] items-center justify-center">
                <MaterialIcon name={theme === 'light' ? 'dark_mode' : 'light_mode'} className="text-[1.125rem]" />
            </span>
        </button>
    );
};

export default ThemeToggle;
