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

const FORMAT_DESCRIPTIONS: Record<SingleTournamentFormat, string> = {
    'torneotto-30': "3 coppie si sfidano in 3 partite da 30' ciascuna.",
    'beat-the-box': '4 giocatori si sfidano su un singolo campo, in 3 partite. I migliori procedono alla fase finale.',
    'americano': 'Tutti contro tutti, le coppie ruotano continuamente.',
    'round-robin-finali': "Campionato a girone singolo all'italiana. Possibilità di andata e ritorno. Fase finale opzionale.",
    'gironi-fase-finale': "Gironi all'italiana. Tabellone finale a eliminazione.",
    'eliminazione-diretta': 'Torneo a eliminazione diretta. Possibilità di BYE.',
    'torneo-libero': 'Possibilità di creare una serie di partite a piacimento.',
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
                                className="flex items-center justify-between p-4 rounded-2xl bg-white/60 dark:bg-slate-900/80 border border-slate-200/60 dark:border-white/10 shadow-sm backdrop-blur-xl cursor-pointer text-left active:scale-[0.98]"
                            >
                                <span className="min-w-0 flex-1 pr-3">
                                    <span className="block text-[17px] font-bold text-slate-900 dark:text-white">
                                        {getFormatDisplayName(format)}
                                    </span>
                                    <span className="mt-1 block text-xs font-medium leading-snug text-slate-500 dark:text-slate-400">
                                        {FORMAT_DESCRIPTIONS[format]}
                                    </span>
                                </span>
                                <span className="w-8 h-8 shrink-0 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold text-sm">
                                    →
                                </span>
                            </button>
                        ))}
                    </div>
                    <div className="pt-2 flex justify-center">
                        <Button variant="outline" onClick={onBack} className="!rounded-2xl border border-slate-200/60 dark:border-white/10">
                            Torna indietro
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default TournamentFormatSelector;
