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
  | 'eliminazione-diretta'
  | 'torneo-personale';

export const getFormatDisplayName = (format: SingleTournamentFormat): string => {
    switch (format) {
        case 'torneotto-30': return 'TorneOtto 30\'';
        case 'round-robin-finali': return 'Round Robin + Finali';
        case 'americano': return 'Americano';
        case 'torneo-libero': return 'Torneo Libero';
        case 'gironi-fase-finale': return 'Gironi + Fase Finale';
        case 'beat-the-box': return 'Beat the Box';
        case 'eliminazione-diretta': return 'Eliminazione Diretta';
        case 'torneo-personale': return 'Crea Torneo Personale';
        default: return '';
    }
};

const FORMAT_DESCRIPTIONS: Record<SingleTournamentFormat, string> = {
    'torneo-personale': 'Torneo personalizzabile in tutte le sue fasi.',
    'torneotto-30': "3 coppie si sfidano in 3 partite da 30' ciascuna.",
    'beat-the-box': '4 giocatori si sfidano su un singolo campo, in 3 partite. I migliori procedono alla fase finale.',
    'americano': 'Tutti contro tutti, le coppie ruotano continuamente.',
    'round-robin-finali': "Campionato a girone singolo all'italiana. Possibilità di andata e ritorno. Fase finale opzionale.",
    'gironi-fase-finale': "Gironi all'italiana. Tabellone finale a eliminazione.",
    'eliminazione-diretta': 'Torneo a eliminazione diretta. Possibilità di BYE.',
    'torneo-libero': 'Possibilità di creare una serie di partite a piacimento.',
};

const ALL_FORMATS: SingleTournamentFormat[] = [
    'torneo-personale',
    'torneotto-30',
    'beat-the-box',
    'americano',
    'round-robin-finali',
    'gironi-fase-finale',
    'eliminazione-diretta',
    'torneo-libero'
];

const SINGLES_FORMATS: SingleTournamentFormat[] = [
    'americano',
    'beat-the-box',
    'torneo-personale'
];

interface TournamentFormatSelectorProps {
    onSelectFormat: (format: SingleTournamentFormat) => void;
    onBack: () => void;
    playerMode?: 'pairs' | 'singles';
}

const TournamentFormatSelector: React.FC<TournamentFormatSelectorProps> = ({ onSelectFormat, onBack, playerMode = 'pairs' }) => {
    const formatsToShow = playerMode === 'singles' ? SINGLES_FORMATS : ALL_FORMATS;

    const getSinglesDescription = (format: SingleTournamentFormat): string => {
        if (format === 'americano') return 'Tutti contro tutti, rotazione individuale continua su tutti i campi.';
        if (format === 'beat-the-box') return 'Gironi da 4 o 5 singoli con rotazione interna e qualificazione alla fase finale.';
        if (format === 'torneo-personale') return 'Torneo personalizzabile in tutte le sue fasi per singoli.';
        return FORMAT_DESCRIPTIONS[format];
    };

    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <Card title={playerMode === 'singles' ? "Seleziona Formato Torneo (Singoli)" : "Seleziona Formato Torneo"}>
                <div className="space-y-5">
                    <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
                        {playerMode === 'singles'
                            ? "Scegli il formato per i giocatori singoli selezionati. I partecipanti ruoteranno ad ogni partita o girone."
                            : "Scegli la tipologia di formato per la giornata. Ogni formato si adatta al numero di coppie e campi disponibili."}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {formatsToShow.map((format) => {
                            const isPersonale = format === 'torneo-personale';
                            return (
                                <button
                                    key={format}
                                    onClick={() => onSelectFormat(format)}
                                    className={`flex items-center justify-between p-4 rounded-2xl shadow-sm backdrop-blur-xl cursor-pointer text-left active:scale-[0.98] transition-all min-h-[92px] h-full ${
                                        isPersonale
                                            ? 'sm:col-span-2 bg-blue-50/90 dark:bg-blue-950/40 border-2 border-blue-300/80 dark:border-blue-400/40 hover:border-blue-500'
                                            : 'bg-white/60 dark:bg-slate-900/80 border border-slate-200/60 dark:border-white/10 hover:border-sky-400'
                                    }`}
                                >
                                    <span className="min-w-0 flex-1 pr-3">
                                        <span className={`block text-[17px] font-bold ${
                                            isPersonale ? 'text-blue-950 dark:text-blue-200' : 'text-slate-900 dark:text-white'
                                        }`}>
                                            {getFormatDisplayName(format)}
                                        </span>
                                        <span className={`mt-1 block text-xs font-medium leading-snug ${
                                            isPersonale ? 'text-blue-700/80 dark:text-blue-300/80' : 'text-slate-500 dark:text-slate-400'
                                        }`}>
                                            {playerMode === 'singles' ? getSinglesDescription(format) : FORMAT_DESCRIPTIONS[format]}
                                        </span>
                                    </span>
                                    <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-bold text-sm ${
                                        isPersonale
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                                    }`}>
                                        →
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="pt-2 flex justify-center">
                        <Button variant="outline" onClick={onBack} className="border border-slate-200/60 dark:border-white/10 font-medium">
                            Torna indietro
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default TournamentFormatSelector;
