import React from 'react';
import { SetScore } from '../../types.ts';
import Button from './Button.tsx';
import { MaterialIcon } from './Icons.tsx';

interface MatchScoreInputProps {
    sets: SetScore[];
    onSetsChange?: (sets: SetScore[]) => void;
    disabled?: boolean;
}

const MatchScoreInput: React.FC<MatchScoreInputProps> = ({ sets, onSetsChange, disabled = false }) => {
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
        <div className="flex flex-wrap items-center justify-center gap-2">
            {displaySets.map((set, index) => (
                <div key={index} className="group relative flex items-center space-x-1 rounded-xl border border-white/10 bg-white/5 px-2 py-2 backdrop-blur-sm">
                    <input
                        type="number"
                        min="0"
                        value={set.team1 || ''}
                        onChange={(e) => handleScoreChange(index, 'team1', e.target.value)}
                        className="w-10 border-b border-white/15 bg-transparent text-center text-sm font-semibold focus:border-sky-400 focus:outline-none"
                        placeholder="0"
                        disabled={disabled}
                    />
                    <span>-</span>
                    <input
                        type="number"
                        min="0"
                        value={set.team2 || ''}
                        onChange={(e) => handleScoreChange(index, 'team2', e.target.value)}
                        className="w-10 border-b border-white/15 bg-transparent text-center text-sm font-semibold focus:border-sky-400 focus:outline-none"
                        placeholder="0"
                        disabled={disabled}
                    />
                    {displaySets.length > 1 && !disabled && (
                         <button
                            type="button"
                            onClick={() => removeSet(index)}
                            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs opacity-0 transition-opacity group-hover:opacity-100"
                            aria-label="Remove set"
                        >
                            &times;
                        </button>
                    )}
                </div>
            ))}
            {displaySets.length < 3 && !disabled && (
                <Button type="button" onClick={addSet} size="sm" variant="ghost" className="h-8 w-8 rounded-full !p-2">
                    <MaterialIcon name="add" className="text-[18px]" />
                </Button>
            )}
        </div>
    );
};

export default MatchScoreInput;
