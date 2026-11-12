import React from 'react';
import { SetScore } from '../../types.ts';
import Button from './Button.tsx';
import { MaterialIcon } from './Icons.tsx';

interface MatchScoreInputProps {
    sets: SetScore[];
    onSetsChange?: (sets: SetScore[]) => void;
    disabled?: boolean;
    phaseLabel?: string;
}

const MatchScoreInput: React.FC<MatchScoreInputProps> = ({ sets, onSetsChange, disabled = false, phaseLabel }) => {
    // Assicurati che ci sia sempre almeno un set
    const displaySets = !sets || sets.length === 0 ? [{ team1: 0, team2: 0 }] : sets;
    
    const handleScoreChange = (setIndex: number, team: 'team1' | 'team2', value: string) => {
        const newSets = [...displaySets];
        const score = parseInt(value, 10);
        newSets[setIndex] = {
            ...newSets[setIndex],
            [team]: isNaN(score) ? 0 : score,
        };
        onSetsChange?.(newSets);
    };

    const addSet = () => {
        if (displaySets.length < 3) {
            onSetsChange?.([...displaySets, { team1: 0, team2: 0 }]);
        }
    };

    const removeSet = (setIndex: number) => {
        if (displaySets.length > 1) {
            onSetsChange?.(displaySets.filter((_, index) => index !== setIndex));
        }
    };

    return (
        <div className="flex flex-col items-center gap-1">
            {phaseLabel && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/60">
                    {phaseLabel}
                </span>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2">
                {displaySets.map((set, index) => (
                <div key={index} className="group relative flex items-center gap-1.5 rounded-xl border border-slate-200/70 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/80 px-2.5 py-1.5 backdrop-blur-md shadow-sm">
                    <input
                        type="number"
                        inputMode="numeric"
                        aria-label={`Games squadra 1, set ${index + 1}`}
                        min="0"
                        value={(set.team1 || set.team2) ? set.team1 : ''}
                        onChange={(e) => handleScoreChange(index, 'team1', e.target.value)}
                        className="h-11 w-12 rounded-lg border border-slate-200/60 dark:border-white/10 bg-white dark:bg-slate-800 text-center text-base sm:text-sm font-bold text-slate-900 dark:text-sky-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all"
                        placeholder="0"
                        disabled={disabled}
                    />
                    <span className="text-xs font-black text-slate-500 dark:text-slate-400">-</span>
                    <input
                        type="number"
                        inputMode="numeric"
                        aria-label={`Games squadra 2, set ${index + 1}`}
                        min="0"
                        value={(set.team1 || set.team2) ? set.team2 : ''}
                        onChange={(e) => handleScoreChange(index, 'team2', e.target.value)}
                        className="h-11 w-12 rounded-lg border border-slate-200/60 dark:border-white/10 bg-white dark:bg-slate-800 text-center text-base sm:text-sm font-bold text-slate-900 dark:text-sky-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all"
                        placeholder="0"
                        disabled={disabled}
                    />
                    {displaySets.length > 1 && !disabled && (
                         <button
                            type="button"
                            onClick={() => removeSet(index)}
                            className="absolute -right-3 -top-3 flex h-8 w-8 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 items-center justify-center rounded-full bg-rose-500 text-white text-xs opacity-100 [@media(hover:hover)]:opacity-0 transition-opacity [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 shadow-md"
                            aria-label="Rimuovi set"
                        >
                            <MaterialIcon name="close" className="text-[14px]" />
                        </button>
                    )}
                </div>
            ))}
            {displaySets.length < 3 && !disabled && (
                <Button type="button" onClick={addSet} aria-label="Aggiungi set" size="sm" variant="ghost" className="h-8 w-8 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 rounded-full !p-0 border border-slate-200/60 dark:border-white/10 flex items-center justify-center">
                    <MaterialIcon name="add" className="text-[18px]" />
                </Button>
            )}
            </div>
        </div>
    );
};

export default MatchScoreInput;
