import React, { useState } from 'react';
import { HIGSegmentedControl } from './ui/HIGSegmentedControl.tsx';
import { IOSPrintMode, getIOSPrintMode, isIOS, setIOSPrintMode } from '../services/printService.ts';

const MODES: IOSPrintMode[] = ['pdf', 'native', 'blob'];
const DESCRIPTIONS: Record<IOSPrintMode, string> = {
    pdf: 'PDF + foglio di condivisione (predefinito).',
    native: 'Stampa nativa dentro l\'app.',
    blob: 'Pagina con auto-stampa: il metodo della versione 6.10.4.',
};

/**
 * Selettore del metodo di stampa su iPhone e iPad quando l'app è aggiunta alla Home.
 * Visibile solo su iOS/iPadOS. La scelta resta salvata sul dispositivo.
 * In Safari (app non installata) la stampa è sempre quella nativa.
 */
const PrintDiagnostics: React.FC = () => {
    const [mode, setMode] = useState<IOSPrintMode>(() => getIOSPrintMode());
    if (!isIOS()) return null;

    return (
        <div className="mb-6 px-4 md:px-0 max-w-2xl mx-auto">
            <div className="text-[13px] font-semibold text-gray-600 dark:text-gray-300 mb-2">Diagnostica stampa iOS (app installata)</div>
            <HIGSegmentedControl
                segments={['PDF', 'Nativa', '6.10.4']}
                selectedIndex={MODES.indexOf(mode)}
                onChange={(idx) => {
                    const next = MODES[idx] || 'pdf';
                    setIOSPrintMode(next);
                    setMode(next);
                }}
            />
            <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-2">{DESCRIPTIONS[mode]}</div>
        </div>
    );
};

export default PrintDiagnostics;
