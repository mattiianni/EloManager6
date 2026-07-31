import React, { useState, useMemo } from 'react';
import { Player, Match, TournamentType, Tournament } from '../types.ts';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import { generateTpraBracket, BracketNode } from '../services/tpraService.ts';
import Card from './ui/Card.tsx';
import Button from './ui/Button.tsx';

interface TpraCreationFlowProps {
    pairs: [Player, Player][];
    onFinish: () => void;
    tournamentDate: string;
    clubName: string;
    tournamentName: string;
}

type Step = 'preview' | 'results';

const TpraCreationFlow: React.FC<TpraCreationFlowProps> = ({
    pairs,
    onFinish,
    tournamentDate,
    clubName,
    tournamentName,
}) => {
    const { addMultipleMatches } = usePadelStore();
    const [step, setStep] = useState<Step>('preview');
    const [isSaving, setIsSaving] = useState(false);

    const firstRoundNodes = useMemo(() => generateTpraBracket(pairs), [pairs]);

    const handleSaveBracket = async () => {
        setIsSaving(true);
        try {
            const validDate = tournamentDate && !isNaN(new Date(tournamentDate).getTime())
                ? new Date(tournamentDate).toISOString()
                : new Date().toISOString();
            const finalName = tournamentName.trim();
            const finalClub = clubName.trim();
            if (!finalName || !finalClub) {
                throw new Error('Nome del torneo e circolo sono obbligatori');
            }

            // Save the tournament to the database
            const tournament: Omit<Tournament, 'id'> = {
                name: finalName,
                club: finalClub,
                date: validDate,
                type: TournamentType.EliminazioneDiretta,
                matchIds: [],
                status: 'scheduled',
                finalStandings: { bracket: firstRoundNodes } // We store the bracket structure in finalStandings
            };

            // In eliminazione diretta, we do not create all matches instantly since we don't know the winners.
            // We just create the first round matches. 
            const initialMatches: Omit<Match, 'id'>[] = firstRoundNodes.map((node, i) => {
                return {
                    date: validDate,
                    team1: node.team1 ? [node.team1[0].id, node.team1[1].id] : ['bye1', 'bye2'],
                    team2: node.team2 ? [node.team2[0].id, node.team2[1].id] : ['bye1', 'bye2'],
                    sets: [],
                    winner: node.isBye ? node.winner : null,
                    isBye: node.isBye,
                } as any;
            });

            // Filter out BYEs so we only save real matches to `matches` table
            const realMatches = initialMatches.filter(m => !(m as any).isBye);

            await addMultipleMatches(realMatches, tournament);
            setStep('results');
        } catch (error) {
            console.error("Error saving TPRA bracket", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card title="Tabellone Eliminazione Diretta (TPRA)">
            <div className="p-4">
                {step === 'preview' && (
                    <div className="space-y-4">
                        <p className="text-gray-700 dark:text-gray-300">
                            Il tabellone iniziale prevede {firstRoundNodes.length * 2} slot, di cui {firstRoundNodes.length * 2 - pairs.length} BYE (passaggi turno automatici per le teste di serie).
                        </p>

                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 grid gap-2">
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Primo Turno</h3>
                            {firstRoundNodes.map((node, i) => (
                                <div key={i} className="flex justify-between items-center bg-white dark:bg-gray-800 p-3 rounded shadow-sm">
                                    <div className={`flex-1 ${node.winner === 'team2' ? 'opacity-50' : 'font-semibold text-gray-900 dark:text-white'}`}>
                                        {node.team1 ? `${node.team1[0].surname} / ${node.team1[1].surname}` : 'BYE'}
                                    </div>
                                    <div className="px-4 font-bold text-gray-400">VS</div>
                                    <div className={`flex-1 text-right ${node.winner === 'team1' ? 'opacity-50' : 'font-semibold text-gray-900 dark:text-white'}`}>
                                        {node.team2 ? `${node.team2[0].surname} / ${node.team2[1].surname}` : 'BYE'}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-4 mt-6">
                            <Button variant="outline" className="flex-1" onClick={onFinish}>Annulla</Button>
                            <Button className="flex-1" onClick={handleSaveBracket} disabled={isSaving || !tournamentName.trim() || !clubName.trim()}>
                                {isSaving ? 'Salvataggio...' : 'Crea Torneo TPRA'}
                            </Button>
                        </div>
                    </div>
                )}
                {step === 'results' && (
                    <div className="text-center space-y-4 py-8">
                        <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Torneo TPRA Creato!</h3>
                        <p className="text-gray-500 dark:text-gray-400">
                            Il tabellone è stato generato e salvato. Potrai gestire i turni successivi dalla pagina del torneo.
                        </p>
                        <Button className="w-full mt-6" onClick={onFinish}>
                            Torna alla Dashboard
                        </Button>
                    </div>
                )}
            </div>
        </Card>
    );
};

export default TpraCreationFlow;
