
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
            className="hig-focus-ring flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
            aria-label={theme === 'light' ? 'Attiva tema scuro' : 'Attiva tema chiaro'}
        >
            <span className="flex h-[1.125rem] w-[1.125rem] items-center justify-center">
                <MaterialIcon name={theme === 'light' ? 'dark_mode' : 'light_mode'} className="text-[1.125rem]" />
            </span>
        </button>
    );
};

export default ThemeToggle;
