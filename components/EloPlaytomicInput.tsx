import React, { useState, useEffect } from 'react';
import { eloToPlaytomic, playtomicToElo, playtomicLabel } from '../utils/eloPlaytomicUtils';
import { SFIcon } from './ui/SFIcon';

interface EloPlaytomicInputProps {
    elo: number;
    onEloChange: (elo: number) => void;
    disabled?: boolean;
}

const EloPlaytomicInput: React.FC<EloPlaytomicInputProps> = ({ elo, onEloChange, disabled }) => {
    const [localElo, setLocalElo] = useState<string>(elo.toString());
    const [localPt, setLocalPt] = useState<string>(eloToPlaytomic(elo).toFixed(2));

    useEffect(() => {
        // Sync local states if external elo changes (e.g. from parent initial state)
        if (parseFloat(localElo) !== elo) {
            setLocalElo(elo.toString());
            setLocalPt(eloToPlaytomic(elo).toFixed(2));
        }
    }, [elo]);

    const handleEloChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setLocalElo(val);
        const parsedElo = parseFloat(val);
        if (!isNaN(parsedElo) && parsedElo >= 0) {
            const pt = eloToPlaytomic(parsedElo);
            setLocalPt(pt.toFixed(2));
            onEloChange(parsedElo);
        }
    };

    const handlePtChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setLocalPt(val);
        const parsedPt = parseFloat(val);
        if (!isNaN(parsedPt) && parsedPt >= 1.0 && parsedPt <= 6.0) {
            const calculatedElo = playtomicToElo(parsedPt);
            setLocalElo(calculatedElo.toString());
            onEloChange(calculatedElo);
        }
    };

    const parsedPt = parseFloat(localPt);
    const label = !isNaN(parsedPt) ? playtomicLabel(parsedPt) : '---';

    return (
        <div className="flex flex-col space-y-2">
            <div className="flex items-center space-x-2">
                <div className="flex-1">
                    <label className="block text-xs font-medium text-ios-label-secondary mb-1">ELO Attuale</label>
                    <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={localElo}
                        onChange={handleEloChange}
                        disabled={disabled}
                        className="w-full bg-ios-fill dark:bg-gray-800 border-none rounded-lg py-2 px-3 focus:ring-2 focus:ring-ios-blue text-sm disabled:opacity-50"
                    />
                </div>
                <div className="flex flex-col items-center justify-center pt-5 px-1 text-ios-label-secondary">
                    <SFIcon name="arrow.left.and.right" size={16} />
                </div>
                <div className="flex-1">
                    <label className="block text-xs font-medium text-ios-label-secondary mb-1">Livello Playtomic</label>
                    <input
                        type="number"
                        min="1.0"
                        max="6.0"
                        step="any"
                        inputMode="decimal"
                        value={localPt}
                        onChange={handlePtChange}
                        disabled={disabled}
                        className="w-full bg-ios-fill dark:bg-gray-800 border-none rounded-lg py-2 px-3 focus:ring-2 focus:ring-ios-blue text-sm disabled:opacity-50"
                    />
                </div>
            </div>
            <div className="text-right text-[11px] text-ios-label-secondary font-medium px-1">
                Fascia: <span className="text-ios-blue">{label}</span>
            </div>
        </div>
    );
};

export default EloPlaytomicInput;
