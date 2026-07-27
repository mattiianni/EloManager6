import React, { useState, useEffect } from 'react';
import { Match, Player, Tournament, SetScore } from '../types.ts';
import { BracketNode } from '../services/tpraService.ts';
import Button from './ui/Button.tsx';
import MatchScoreInput from './ui/MatchScoreInput.tsx';
import { HIGSheet } from './ui/HIGSheet.tsx';
import { usePadelStore } from '../hooks/usePadelStore.tsx';

interface TpraBracketViewProps {
    tournament: Tournament;
    matches: Match[];
}

const TpraBracketView: React.FC<TpraBracketViewProps> = ({
    tournament,
    matches,
}) => {
    const { addMatch, completeTournament } = usePadelStore();
    
    const [rounds, setRounds] = useState<BracketNode[][]>([]);
    const [selectedNode, setSelectedNode] = useState<BracketNode | null>(null);
    const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
    const [currentSets, setCurrentSets] = useState<SetScore[]>([]);

    useEffect(() => {
        if (tournament.finalStandings && tournament.finalStandings.bracket) {
            const initialRound = tournament.finalStandings.bracket as BracketNode[];
            const builtRounds = computeBracketRounds(initialRound, matches);
            setRounds(builtRounds);
        }
    }, [tournament, matches]);

    const computeBracketRounds = (initialRound: BracketNode[], currentMatches: Match[]): BracketNode[][] => {
        const computedRounds: BracketNode[][] = [];
        
        // Helper to find a match between two teams
        const findMatchWinner = (team1: [Player, Player], team2: [Player, Player]) => {
            const match = currentMatches.find(m => {
                const mTeam1Ids = [m.team1[0], m.team1[1]].sort().join(',');
                const mTeam2Ids = [m.team2[0], m.team2[1]].sort().join(',');
                
                const t1Ids = [team1[0].id, team1[1].id].sort().join(',');
                const t2Ids = [team2[0].id, team2[1].id].sort().join(',');
                
                return (mTeam1Ids === t1Ids && mTeam2Ids === t2Ids) || (mTeam1Ids === t2Ids && mTeam2Ids === t1Ids);
            });
            
            if (!match || !match.winner || match.winner === 'draw') return undefined;
            
            const matchTeam1Ids = [match.team1[0], match.team1[1]].sort().join(',');
            const nodeTeam1Ids = [team1[0].id, team1[1].id].sort().join(',');
            
            if (matchTeam1Ids === nodeTeam1Ids) {
                return match.winner; // 'team1' means node's team1 won
            } else {
                return match.winner === 'team1' ? 'team2' : 'team1'; // Inverted
            }
        };

        // Hydrate initial round with winners
        let currentRound: BracketNode[] = initialRound.map(node => {
            // Bye nodes: the non-null team advances automatically
            if (node.isBye) {
                const advancingTeam = node.team1 || node.team2;
                const autoWinner = node.team1 ? 'team1' : 'team2';
                return { ...node, winner: autoWinner };
            }
            let winner = node.winner;
            if (!winner && node.team1 && node.team2) {
                winner = findMatchWinner(node.team1, node.team2);
            }
            return { ...node, winner };
        });
        
        computedRounds.push(currentRound);
        let roundIndex = 0;

        while (currentRound.length > 1) {
            const nextRound: BracketNode[] = [];
            for (let i = 0; i < currentRound.length; i += 2) {
                const node1 = currentRound[i];
                const node2 = currentRound[i + 1];

                // Handle bye propagation: if a node is a bye, its winner already propagated automatically above
                const winner1 = node1.winner === 'team1' ? node1.team1 : (node1.winner === 'team2' ? node1.team2 : undefined);
                const winner2 = node2.winner === 'team1' ? node2.team1 : (node2.winner === 'team2' ? node2.team2 : undefined);

                let nextNodeWinner: 'team1' | 'team2' | undefined = undefined;
                if (winner1 && winner2) {
                    nextNodeWinner = findMatchWinner(winner1, winner2);
                }

                nextRound.push({
                    id: `r${roundIndex + 1}_p${i/2}`,
                    round: roundIndex + 1,
                    position: i/2,
                    team1: winner1,
                    team2: winner2,
                    isBye: false,
                    winner: nextNodeWinner,
                });
            }
            computedRounds.push(nextRound);
            currentRound = nextRound;
            roundIndex++;
        }

        return computedRounds;
    };

    const handleNodeClick = (node: BracketNode) => {
        if (!node.team1 || !node.team2 || node.isBye) return;
        setSelectedNode(node);
        
        const existingMatch = matches.find(m => {
            const mTeam1 = [m.team1[0], m.team1[1]].sort().join(',');
            const mTeam2 = [m.team2[0], m.team2[1]].sort().join(',');
            const t1 = [node.team1![0].id, node.team1![1].id].sort().join(',');
            const t2 = [node.team2![0].id, node.team2![1].id].sort().join(',');
            return (mTeam1 === t1 && mTeam2 === t2) || (mTeam1 === t2 && mTeam2 === t1);
        });

        if (existingMatch && existingMatch.sets && existingMatch.sets.length > 0) {
            setCurrentSets(existingMatch.sets);
        } else {
            setCurrentSets([{ team1: 0, team2: 0 }]);
        }
        setIsScoreModalOpen(true);
    };

    const handleSaveScore = async () => {
        if (!selectedNode || !selectedNode.team1 || !selectedNode.team2) return;
        
        let t1Sets = 0;
        let t2Sets = 0;
        currentSets.forEach(s => {
            if (s.team1 > s.team2) t1Sets++;
            else if (s.team2 > s.team1) t2Sets++;
        });
        
        const winner = t1Sets > t2Sets ? 'team1' : (t2Sets > t1Sets ? 'team2' : 'draw');
        if (winner === 'draw') {
            alert('Il match non può finire in pareggio.');
            return;
        }

        const newMatch: Omit<Match, 'id'> = {
            date: tournament.date,
            team1: [selectedNode.team1[0].id, selectedNode.team1[1].id],
            team2: [selectedNode.team2[0].id, selectedNode.team2[1].id],
            sets: currentSets,
            winner: winner,
            tournamentId: tournament.id,
        };

        await addMatch(newMatch);
        setIsScoreModalOpen(false);
    };

    const handleComplete = async () => {
        if (!confirm('Sei sicuro di voler concludere il torneo? Tutti i punteggi ELO verranno aggiornati.')) return;
        try {
            await completeTournament(tournament.id);
            alert('Torneo completato! I punteggi ELO sono stati aggiornati.');
        } catch (e) {
            alert('Errore durante la conclusione del torneo.');
        }
    };

    if (rounds.length === 0) return null;

    const isTournamentFinished = rounds.length > 0 && !!rounds[rounds.length - 1][0].winner;

    return (
        <div className="overflow-x-auto py-8">
            <div className="flex gap-12 min-w-max px-4">
                {rounds.map((roundNodes, rIndex) => (
                    <div key={rIndex} className="flex flex-col justify-around gap-4 w-64">
                        {roundNodes.map(node => {
                            const isClickable = node.team1 && node.team2 && !node.isBye;
                            const existingMatch = matches.find(m => {
                                if (!node.team1 || !node.team2) return false;
                                const mTeam1 = [m.team1[0], m.team1[1]].sort().join(',');
                                const mTeam2 = [m.team2[0], m.team2[1]].sort().join(',');
                                const t1 = [node.team1[0].id, node.team1[1].id].sort().join(',');
                                const t2 = [node.team2[0].id, node.team2[1].id].sort().join(',');
                                return (mTeam1 === t1 && mTeam2 === t2) || (mTeam1 === t2 && mTeam2 === t1);
                            });

                            return (
                                <div 
                                    key={node.id} 
                                    onClick={() => handleNodeClick(node)}
                                    className={`bg-white dark:bg-gray-800 border ${isClickable ? 'border-sky-500 hover:border-sky-600 shadow-md cursor-pointer hover:scale-[1.02]' : 'border-gray-200 dark:border-gray-700'} rounded-xl p-3 shadow-sm relative transition-all`}
                                >
                                    <div className={`text-sm flex justify-between items-center ${node.winner === 'team1' ? 'font-bold text-green-600 dark:text-green-400' : (node.winner === 'team2' ? 'opacity-50' : '')}`}>
                                        <span>{node.team1 ? `${node.team1[0].surname} / ${node.team1[1].surname}` : 'BYE'}</span>
                                        {existingMatch && existingMatch.sets && existingMatch.sets.length > 0 && (
                                            <span className="font-mono text-xs font-bold text-sky-600 dark:text-sky-400 ml-2">
                                                {existingMatch.sets.map(s => s.team1).join('-')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="h-px w-full bg-gray-200 dark:bg-gray-700 my-2"></div>
                                    <div className={`text-sm flex justify-between items-center ${node.winner === 'team2' ? 'font-bold text-green-600 dark:text-green-400' : (node.winner === 'team1' ? 'opacity-50' : '')}`}>
                                        <span>{node.team2 ? `${node.team2[0].surname} / ${node.team2[1].surname}` : 'BYE'}</span>
                                        {existingMatch && existingMatch.sets && existingMatch.sets.length > 0 && (
                                            <span className="font-mono text-xs font-bold text-sky-600 dark:text-sky-400 ml-2">
                                                {existingMatch.sets.map(s => s.team2).join('-')}
                                            </span>
                                        )}
                                    </div>
                                    {isClickable && (
                                        <div className="mt-2 pt-1 border-t border-gray-100 dark:border-gray-700/50 flex justify-end">
                                            {node.winner ? (
                                                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                    ✏️ Modifica Risultato
                                                </span>
                                            ) : (
                                                <span className="text-[11px] font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1">
                                                    ⚡ Inserisci Risultato
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            {tournament.status === 'scheduled' && isTournamentFinished && (
                <div className="mt-8 px-4 flex justify-center">
                    <Button onClick={handleComplete} size="lg" className="w-full sm:w-auto bg-green-600 hover:bg-green-700">
                        Concludi Torneo TPRA (Calcola ELO)
                    </Button>
                </div>
            )}

            <HIGSheet 
                isOpen={isScoreModalOpen} 
                onClose={() => setIsScoreModalOpen(false)}
                title="Inserisci Risultato"
            >
                <div className="p-4 space-y-4">
                    {selectedNode?.team1 && selectedNode?.team2 && (
                        <div className="flex justify-between items-center mb-6">
                            <div className="text-center w-1/2">
                                <p className="font-bold">{selectedNode.team1[0].surname}</p>
                                <p className="font-bold">{selectedNode.team1[1].surname}</p>
                            </div>
                            <div className="text-gray-400 font-bold">VS</div>
                            <div className="text-center w-1/2">
                                <p className="font-bold">{selectedNode.team2[0].surname}</p>
                                <p className="font-bold">{selectedNode.team2[1].surname}</p>
                            </div>
                        </div>
                    )}
                    
                    <MatchScoreInput
                        sets={currentSets}
                        onChange={setCurrentSets}
                        disabled={false}
                    />

                    <div className="mt-8">
                        <Button className="w-full" onClick={handleSaveScore}>
                            Salva Risultato
                        </Button>
                    </div>
                </div>
            </HIGSheet>
        </div>
    );
};

export default TpraBracketView;
