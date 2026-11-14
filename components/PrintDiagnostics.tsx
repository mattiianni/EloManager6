import React, { useState } from 'react';
import { HIGSegmentedControl } from './ui/HIGSegmentedControl.tsx';
import { IPhonePrintMode, getIPhonePrintMode, isIPhone, setIPhonePrintMode } from '../services/printService.ts';

const MODES: IPhonePrintMode[] = ['pdf', 'native', 'blob'];
const DESCRIPTIONS: Record<IPhonePrintMode, string> = {
    pdf: 'PDF + foglio di condivisione (predefinito).',
    native: 'Stampa nativa dentro l\'app, come su iPad e Safari.',
    blob: 'Pagina con auto-stampa: il metodo della versione 6.10.4.',
};

/**
 * Selettore diagnostico del metodo di stampa su iPhone (app aggiunta alla Home).
 * Visibile solo su iPhone. La scelta resta salvata sul dispositivo.
 */
const PrintDiagnostics: React.FC = () => {
    const [mode, setMode] = useState<IPhonePrintMode>(() => getIPhonePrintMode());
    if (!isIPhone()) return null;

    return (
        <div className="mb-6 px-4 md:px-0 max-w-2xl mx-auto">
            <div className="text-[13px] font-semibold text-gray-600 dark:text-gray-300 mb-2">Diagnostica stampa iPhone</div>
            <HIGSegmentedControl
                segments={['PDF', 'Nativa', '6.10.4']}
                selectedIndex={MODES.indexOf(mode)}
                onChange={(idx) => {
                    const next = MODES[idx] || 'pdf';
                    setIPhonePrintMode(next);
                    setMode(next);
                }}
            />
            <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-2">{DESCRIPTIONS[mode]}</div>
        </div>
    );
};

export default PrintDiagnostics;
