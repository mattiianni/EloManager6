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
        <div className="mx-auto max-w-3xl">
            <Card title="Seleziona Formato Torneo">
                <div className="space-y-6">
                    <p className="text-sm text-app-muted">
                        Scegli il tipo di torneo che vuoi organizzare. Il numero di giocatori selezionabili dipenderà dal formato scelto.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {ALL_FORMATS.map((format) => {
                            const isAmericano = format === 'americano';
                            return (
                                <Button
                                    key={format}
                                    onClick={() => isAmericano && onSelectFormat(format)}
                                    className={`w-full justify-center py-4 text-base font-semibold ${!isAmericano ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    variant={isAmericano ? "primary" : "secondary"}
                                    disabled={!isAmericano}
                                >
                                    {getFormatDisplayName(format)} {!isAmericano && '(In arrivo)'}
                                </Button>
                            );
                        })}
                    </div>
                    <div className="pt-4 flex justify-center">
                        <Button variant="secondary" onClick={onBack}>
                            Torna indietro
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default TournamentFormatSelector;
