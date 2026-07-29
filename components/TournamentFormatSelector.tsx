import React from 'react';
import Card from './ui/Card.tsx';
import Button from './ui/Button.tsx';

export type SingleTournamentFormat = 
  | 'torneotto-30'
  | 'round-robin-finali'
  | 'americano'
  | 'torneo-libero'
  | 'gironi-fase-finale'
  | 'beat-the-box'
  | 'eliminazione-diretta';

export const getFormatDisplayName = (format: SingleTournamentFormat): string => {
    switch (format) {
        case 'torneotto-30': return 'TorneOtto 30\'';
        case 'round-robin-finali': return 'Round Robin + Finali';
        case 'americano': return 'Americano';
        case 'torneo-libero': return 'Torneo Libero';
        case 'gironi-fase-finale': return 'Gironi + Fase Finale';
        case 'beat-the-box': return 'Beat the Box';
        case 'eliminazione-diretta': return 'Eliminazione Diretta';
        default: return '';
    }
};

const ALL_FORMATS: SingleTournamentFormat[] = [
    'torneotto-30',
    'beat-the-box',
    'americano',
    'round-robin-finali',
    'gironi-fase-finale',
    'eliminazione-diretta',
    'torneo-libero'
];

interface TournamentFormatSelectorProps {
    onSelectFormat: (format: SingleTournamentFormat) => void;
    onBack: () => void;
}

const TournamentFormatSelector: React.FC<TournamentFormatSelectorProps> = ({ onSelectFormat, onBack }) => {
    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <Card title="Seleziona Formato Torneo">
                <div className="space-y-5">
                    <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
                        Scegli la tipologia di formato per la giornata. Ogni formato si adatta al numero di coppie e campi disponibili.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {ALL_FORMATS.map((format) => (
                            <button
                                key={format}
                                onClick={() => onSelectFormat(format)}
                                className="flex items-center justify-between p-4 rounded-2xl bg-white/60 dark:bg-slate-900/80 border border-slate-200/60 dark:border-white/10 hover:border-sky-500/80 dark:hover:border-sky-400/80 hover:bg-sky-500/5 shadow-sm hover:shadow-md backdrop-blur-xl transition-all duration-200 cursor-pointer text-left group active:scale-[0.98]"
                            >
                                <span className="font-bold text-base text-slate-900 dark:text-white group-hover:text-sky-500 dark:group-hover:text-sky-400 transition-colors">
                                    {getFormatDisplayName(format)}
                                </span>
                                <span className="w-8 h-8 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold text-sm group-hover:bg-sky-500 group-hover:text-white transition-all">
                                    →
                                </span>
                            </button>
                        ))}
                    </div>
                    <div className="pt-2 flex justify-center">
                        <Button variant="secondary" onClick={onBack} className="!rounded-2xl border border-slate-200/60 dark:border-white/10">
                            Torna indietro
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default TournamentFormatSelector;
