
import React, { useState, useEffect, useMemo } from 'react';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import { calculateTournamentStandings, calculateFinalStandingsForRoundRobinFinali } from '../services/tournamentService.ts';
import { calculateTeamTournamentStandings } from '../services/teamTournamentService.ts';
import { printTournamentReport, printBeatTheBoxComplete, printBeatTheBoxBlank, printTorneoLiberoComplete, printGironiTournament, printTeamTournamentRoundRobinSchedule, printTeamTournamentMatchdayCalendar, printTeamTournamentReport, printTeamTournamentMatchdayReport } from '../services/printService.ts';
import { calculateAllBoxStandings, createFinalsMatches, groupMatchesByPlayerSets } from '../services/beatTheBoxService.ts';
import { Tournament, TournamentType, Match, Player, TournamentStandingEntry, TeamTournamentFixture, TeamTournamentTeam, TeamTournamentMatchday } from '../types.ts';
import Card from '../components/ui/Card.tsx';
import Button from '../components/ui/Button.tsx';
import { HIGSheet } from '../components/ui/HIGSheet';
import { HIGAlert } from '../components/ui/HIGAlert';
import { TrashIcon, PrintIcon, PencilIcon, ChevronDownIcon } from '../components/ui/Icons.tsx';
import { getTournamentDisplayName } from '../utils/tournamentLabels.ts';
import { formatPlayerName } from '../utils/format.ts';
import TpraBracketView from '../components/TpraBracketView.tsx';

type Page = 'Ranking' | 'Players' | 'Matches' | 'Draw' | 'Tournaments' | 'TeamSummary';

interface TournamentsPageProps {
    setActivePage: (page: Page) => void;
    onOpenDrawLauncher: () => void;
    onNavigateToResults: (tournamentId: string) => void;
    onNavigateToNewGiornata: (tournamentName: string) => void;
    onNavigateToTeamTournamentConfiguration: (tournamentId: string) => void;
    onNavigateToNewTeamTournamentMatchday: (rootTournamentId: string) => void;
    onNavigateToTeamTournamentFixture: (rootTournamentId: string, fixtureId: string) => void;
    onNavigateToTeamTournamentMatchdayResults: (tournamentDayId: string) => void;
    onNavigateToTeamTournamentSummary: (rootTournamentId: string) => void;
    tournamentToExpand?: string | null;
    clearTournamentToExpand?: () => void;
}

const TournamentsSkeleton = () => (
    <div className="space-y-6 animate-pulse">
        {[...Array(2)].map((_, i) => (
            <div key={i} className="app-panel rounded-[24px]">
                <div className="border-b border-[var(--app-border)] p-4">
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                </div>
                <div className="p-6">
                     <div className="h-12 bg-gray-50 dark:bg-gray-900 rounded-lg"></div>
                </div>
            </div>
        ))}
    </div>
);


// Helper functions for Beat the Box
const processBeatTheBoxData = (matches: Match[], getPlayerById: (id: string) => Player | undefined) => {
    // Use player-set grouping (order-independent)
    const { boxes: groupedBoxes, phaseMatches: remainingMatches } = groupMatchesByPlayerSets(matches);
    const numBoxes = groupedBoxes.size;
    const boxMatches = Array.from(groupedBoxes.values()).flat();

    // SE I MATCH NON HANNO WINNER (torneo vecchio o bug), calcolali dai set
    const boxMatchesWithWinner = boxMatches.map(match => {
        if (match.winner) return match;
        const sets = match.sets || [];
        if (sets.length === 0) return match;
        const team1Games = sets.reduce((sum, set) => sum + set.team1, 0);
        const team2Games = sets.reduce((sum, set) => sum + set.team2, 0);
        const winner = team1Games === team2Games ? 'draw' : (team1Games > team2Games ? 'team1' : 'team2');
        return { ...match, winner } as Match;
    });

    // Separate semifinals and finals
    let semifinalMatches: Match[] = [];
    let finalMatches: Match[] = [];

    if (remainingMatches.length >= 4) {
        semifinalMatches = remainingMatches.slice(0, 2);
        finalMatches = remainingMatches.slice(2);
    } else {
        finalMatches = remainingMatches;
    }

    // Create boxes from player-set grouping
    const boxes: { boxNumber: number; players: Player[]; matches: Match[] }[] = [];
    groupedBoxes.forEach((bMatches, boxNum) => {
        const bMatchesWithWinner = bMatches.map(m => {
            if (m.winner) return m;
            const sets = m.sets || [];
            if (sets.length === 0) return m;
            const t1 = sets.reduce((sum, set) => sum + set.team1, 0);
            const t2 = sets.reduce((sum, set) => sum + set.team2, 0);
            return { ...m, winner: t1 === t2 ? 'draw' : (t1 > t2 ? 'team1' : 'team2') } as Match;
        });
        const playerIdsSet = new Set<string>();
        bMatchesWithWinner.forEach(m => {
            m.team1.forEach(id => playerIdsSet.add(id));
            m.team2.forEach(id => playerIdsSet.add(id));
        });
        boxes.push({
            boxNumber: boxNum,
            players: Array.from(playerIdsSet).map(id => getPlayerById(id)).filter((p): p is Player => p !== undefined),
            matches: bMatchesWithWinner
        });
    });
    
    // Calcola le classifiche usando calculateAllBoxStandings
    // IMPORTANTE: usa boxMatchesWithWinner che ha i winner corretti
    const boxStandings = calculateAllBoxStandings(boxMatchesWithWinner, boxes);
    
    // Calculate games won/lost for each player (per fallback se non c'è elo_history)
    const playerStats = new Map<string, { gamesWon: number; gamesLost: number }>();
    
    matches.forEach(m => {
        if (!m.winner || m.winner === 'draw') return;
        const sets = m.sets || [];
        sets.forEach(set => {
            m.team1.forEach(pid => {
                const stats = playerStats.get(pid) || { gamesWon: 0, gamesLost: 0 };
                stats.gamesWon += set.team1;
                stats.gamesLost += set.team2;
                playerStats.set(pid, stats);
            });
            m.team2.forEach(pid => {
                const stats = playerStats.get(pid) || { gamesWon: 0, gamesLost: 0 };
                stats.gamesWon += set.team2;
                stats.gamesLost += set.team1;
                playerStats.set(pid, stats);
            });
        });
    });
    
    // Crea classifica individuale basata su statistiche (Games W/L e % vittorie)
    const individualStandings: { player: Player; eloChange: number; gamesWon: number; gamesLost: number; winPercentage: number; rank: number }[] = [];
    
    boxes.forEach(box => {
        box.players.forEach(player => {
            const stats = playerStats.get(player.id) || { gamesWon: 0, gamesLost: 0 };
            const winPercentage = (stats.gamesWon + stats.gamesLost) > 0
                ? (stats.gamesWon / (stats.gamesWon + stats.gamesLost)) * 100
                : 0;
            
            individualStandings.push({
                player,
                eloChange: 0, // Non più usato, ma manteniamo per compatibilità
                gamesWon: stats.gamesWon,
                gamesLost: stats.gamesLost,
                winPercentage,
                rank: 0
            });
        });
    });
    
    // Ordina per % vittorie decrescente, poi per gamesWon
    individualStandings.sort((a, b) => {
        if (b.winPercentage !== a.winPercentage) {
            return b.winPercentage - a.winPercentage;
        }
        return b.gamesWon - a.gamesWon;
    });
    individualStandings.forEach((entry, idx) => {
        entry.rank = idx + 1;
    });
    
    return { boxes, boxStandings, semifinalMatches, finalMatches, individualStandings };
};

const expectedTeamTournamentRoundRobinMatchdays = (config: any) => {
    const schedule = config?.schedule;
    if (schedule?.kind === 'round_robin' && Array.isArray(schedule.days)) {
        return schedule.days.reduce((sum: number, day: any) => sum + (Array.isArray(day.matches) ? day.matches.length : 0), 0);
    }
    const teamCount = Number(config?.initialTeamCount || 0);
    return teamCount >= 2 ? Math.floor((teamCount * (teamCount - 1)) / 2) : 0;
};

const teamTournamentQualifiedCount = (config: any) => {
    if (config?.format === 'ELIMINAZIONE DIRETTA') return 0;
    if (config?.roundRobinFinalPhase === 'FINALI') return 2;
    if (config?.roundRobinFinalPhase === 'SEMIFINALI E FINALI') return 4;
    if (config?.roundRobinFinalPhase === 'QUARTI, SEMIFINALI E FINALI') return 8;
    return 0;
};

const isTeamTournamentFinalStageCompleted = (config: any, fixtures: TeamTournamentFixture[]) => {
    if (config?.format === 'ELIMINAZIONE DIRETTA') {
        // In elimination direct, the grand final must be a real match (not an auto-bye).
        return fixtures.some(f => f.phase === 'final_1_2' && f.slot === 1 && f.status === 'completed' && !f.isBye);
    }
    if (!config?.roundRobinFinalPhase || config?.format !== 'ROUND ROBIN') return false;
    const required: Array<{ phase: TeamTournamentFixture['phase']; slot: number }> = [];
    if (config.roundRobinFinalPhase === 'FINALI') {
        required.push({ phase: 'final_1_2', slot: 1 });
    } else if (config.roundRobinFinalPhase === 'SEMIFINALI E FINALI') {
        required.push(
            { phase: 'semifinal', slot: 1 },
            { phase: 'semifinal', slot: 2 },
            { phase: 'final_3_4', slot: 1 },
            { phase: 'final_1_2', slot: 1 }
        );
    } else if (config.roundRobinFinalPhase === 'QUARTI, SEMIFINALI E FINALI') {
        required.push(
            { phase: 'quarterfinal', slot: 1 },
            { phase: 'quarterfinal', slot: 2 },
            { phase: 'quarterfinal', slot: 3 },
            { phase: 'quarterfinal', slot: 4 },
            { phase: 'semifinal', slot: 1 },
            { phase: 'semifinal', slot: 2 },
            { phase: 'final_3_4', slot: 1 },
            { phase: 'final_1_2', slot: 1 }
        );
    }
    return required.every(r => fixtures.some(f => f.phase === r.phase && f.slot === r.slot && f.status === 'completed'));
};

const TournamentsPage: React.FC<TournamentsPageProps> = ({ 
    setActivePage, 
    onOpenDrawLauncher, 
    onNavigateToResults, 
    onNavigateToNewGiornata, 
    onNavigateToTeamTournamentConfiguration, 
    onNavigateToNewTeamTournamentMatchday, 
    onNavigateToTeamTournamentFixture, 
    onNavigateToTeamTournamentMatchdayResults, 
    onNavigateToTeamTournamentSummary,
    tournamentToExpand,
    clearTournamentToExpand
}) => {
    const { tournaments, matches, deleteTournament, deleteTournamentSeries, getPlayerById, updateTournament, updateTournamentSeriesName, loading, eloHistory, getTeamTournamentConfig, getTeamTournamentTeams, getTeamTournamentFixtures, getTeamTournamentMatchdayByTournamentDayId, getTeamTournamentMatchdays } = usePadelStore();
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [deleteAlert, setDeleteAlert] = useState<{
        isOpen: boolean;
        type: 'tournament' | 'series' | null;
        idOrName: string | null;
        isDeleting?: boolean;
        progressPercent?: number;
        loadingText?: string;
    }>({ isOpen: false, type: null, idOrName: null, isDeleting: false, progressPercent: 0, loadingText: '' });
    const [tournamentToEdit, setTournamentToEdit] = useState<Tournament | null>(null);
    const [editName, setEditName] = useState('');
    const [editClub, setEditClub] = useState('');
    const [editDate, setEditDate] = useState('');
    const [seriesEditModalOpen, setSeriesEditModalOpen] = useState(false);
    const [seriesEditOldName, setSeriesEditOldName] = useState('');
    const [seriesEditNewName, setSeriesEditNewName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [expandedNames, setExpandedNames] = useState<Set<string>>(new Set());
    const [expandedMatchdays, setExpandedMatchdays] = useState<Set<string>>(new Set());
    const [teamTournamentFixturesByRoot, setTeamTournamentFixturesByRoot] = useState<Record<string, TeamTournamentFixture[]>>({});
    const [teamTournamentTeamsByRoot, setTeamTournamentTeamsByRoot] = useState<Record<string, TeamTournamentTeam[]>>({});
    const [teamTournamentMatchdaysByRoot, setTeamTournamentMatchdaysByRoot] = useState<Record<string, TeamTournamentMatchday[]>>({});
    const [teamTournamentConfigByRoot, setTeamTournamentConfigByRoot] = useState<Record<string, any>>({});
    const teamTournamentMetaPillClass = 'inline-flex items-center self-start rounded-md border px-3 py-1 text-[11px] font-bold uppercase tracking-wide';
    const teamTournamentInfoPillClass = `${teamTournamentMetaPillClass} bg-slate-100 text-slate-700 border-slate-300/70 dark:bg-white/15 dark:text-white/90 dark:border-white/15`;
    const roundRobinDayPillClass = `${teamTournamentMetaPillClass} bg-sky-100 text-sky-800 border-sky-300/60 dark:bg-white/10 dark:text-white/80 dark:border-white/10`;
    const playoffDayPillClass = `${teamTournamentMetaPillClass} bg-orange-100 text-orange-800 border-orange-300/60 dark:bg-orange-500/20 dark:text-orange-100 dark:border-orange-300/20`;
    const tournamentActionButtonClass = '!p-1.5';
    const tournamentActionButtonOnDarkClass = `${tournamentActionButtonClass} !bg-slate-100 hover:!bg-slate-200 !text-slate-700 border border-slate-300/70 dark:!bg-white/15 dark:hover:!bg-white/25 dark:!text-white dark:border-white/20`;

    useEffect(() => {
        if (tournamentToEdit) {
            setEditName(tournamentToEdit.name);
            setEditClub(tournamentToEdit.club);
            setEditDate(new Date(tournamentToEdit.date).toISOString().split('T')[0]);
        }
    }, [tournamentToEdit]);

    useEffect(() => {
        if (tournamentToExpand && tournaments.length > 0) {
            const tournament = tournaments.find(t => t.id === tournamentToExpand);
            if (tournament) {
                const groupId = (tournament as any).groupId || tournament.id;
                setExpandedNames(prev => new Set(prev).add(groupId));
                setExpandedMatchdays(prev => new Set(prev).add(tournamentToExpand));
            }
            if (clearTournamentToExpand) clearTournamentToExpand();
        }
    }, [tournamentToExpand, tournaments, clearTournamentToExpand]);

    const toggleExpandedMatchday = (matchdayId: string) => {
        setExpandedMatchdays(prev => {
            const next = new Set(prev);
            if (next.has(matchdayId)) {
                next.delete(matchdayId);
            } else {
                next.add(matchdayId);
            }
            return next;
        });
    };

    // NOTE: fixtures loading effect is defined after grouping memo to avoid TDZ issues.

    const fixturePhaseLabel = (phase: TeamTournamentFixture['phase'], slot: number) => {
        if (phase === 'round_of_32') return `Trentaduesimo ${slot}`;
        if (phase === 'round_of_16') return `Ottavo ${slot}`;
        if (phase === 'quarterfinal') return `Quarto di finale ${slot}`;
        if (phase === 'semifinal') return `Semifinale ${slot}`;
        if (phase === 'final_3_4') return 'Finale 3°-4°';
        if (phase === 'final_1_2') return 'Finale 1°-2°';
        return phase;
    };

    const fixtureDependsLabel = (fixture: TeamTournamentFixture) => {
        if (fixture.dependsOn?.type === 'winners' && Array.isArray(fixture.dependsOn?.slots) && fixture.dependsOn?.from) {
            return `Vincente ${phaseLabelShort(fixture.dependsOn.from)}`;
        }
        if (fixture.dependsOn?.type === 'winners' && fixture.dependsOn?.from === 'semifinal') {
            return 'Vincente semifinale';
        }
        if (fixture.dependsOn?.type === 'losers' && fixture.dependsOn?.from === 'semifinal') {
            return 'Perdente semifinale';
        }
        if (fixture.dependsOn?.type === 'winners' && fixture.dependsOn?.from === 'quarterfinal') {
            return 'Vincente quarto';
        }
        return 'Squadra da definire';
    };

    const phaseLabelShort = (phase: TeamTournamentFixture['phase']) => {
        if (phase === 'round_of_32') return 'trentaduesimo';
        if (phase === 'round_of_16') return 'ottavo';
        if (phase === 'quarterfinal') return 'quarto';
        if (phase === 'semifinal') return 'semifinale';
        if (phase === 'final_1_2') return 'finale';
        if (phase === 'final_3_4') return 'finalina';
        return 'turno precedente';
    };

    const teamNameForRoot = (rootId: string, teamNumber: number | null) => {
        if (!teamNumber) return '';
        const teams = teamTournamentTeamsByRoot[rootId] || [];
        return teams.find(t => t.teamNumber === teamNumber)?.name || `Squadra ${teamNumber}`;
    };

    const resolveFixtureTeamName = (rootId: string, fixture: TeamTournamentFixture, side: 'left' | 'right') => {
        const directTeamNumber = side === 'left' ? fixture.team1Number : fixture.team2Number;
        if (directTeamNumber) {
            return teamNameForRoot(rootId, directTeamNumber);
        }

        const dep = fixture.dependsOn;
        const fixtures = teamTournamentFixturesByRoot[rootId] || [];
        const matchdays = teamTournamentMatchdaysByRoot[rootId] || [];
        const matchdayByTournamentDayId = new Map<string, TeamTournamentMatchday>(matchdays.map(md => [md.tournamentDayId, md]));

        const resolveWinnerLoser = (phase: TeamTournamentFixture['phase'], slot: number) => {
            const sourceFixture = fixtures.find(f => f.phase === phase && f.slot === slot);
            if (sourceFixture?.winnerTeamNumber) {
                return {
                    winner: sourceFixture.winnerTeamNumber,
                    loser: sourceFixture.loserTeamNumber ?? null,
                };
            }
            if (!sourceFixture?.tournamentDayId) return null;
            const md = matchdayByTournamentDayId.get(sourceFixture.tournamentDayId);
            const summary = md?.summary;
            if (!md || md.status !== 'completed' || !summary?.winner) return null;
            if (summary.winner === 'team1') {
                return { winner: md.team1Number, loser: md.team2Number };
            }
            if (summary.winner === 'team2') {
                return { winner: md.team2Number, loser: md.team1Number };
            }
            return null;
        };

        if (dep?.type === 'winners' && Array.isArray(dep?.slots) && dep?.from) {
            const sourceSlot = side === 'left' ? dep.slots[0] : dep.slots[1];
            const result = resolveWinnerLoser(dep.from, sourceSlot);
            if (result?.winner) return teamNameForRoot(rootId, result.winner);
        }
        if (dep?.type === 'winners' && dep?.from === 'semifinal') {
            const slot = side === 'left' ? 1 : 2;
            const result = resolveWinnerLoser('semifinal', slot);
            if (result?.winner) return teamNameForRoot(rootId, result.winner);
        }
        if (dep?.type === 'losers' && dep?.from === 'semifinal') {
            const slot = side === 'left' ? 1 : 2;
            const result = resolveWinnerLoser('semifinal', slot);
            if (result?.loser) return teamNameForRoot(rootId, result.loser);
        }
        if (dep?.type === 'winners' && dep?.from === 'quarterfinal' && Array.isArray(dep.slots)) {
            const slot = side === 'left' ? dep.slots[0] : dep.slots[1];
            const result = resolveWinnerLoser('quarterfinal', slot);
            if (result?.winner) return teamNameForRoot(rootId, result.winner);
        }

        return fixtureDependsLabel(fixture);
    };

    const matchdayForRootAndTournamentDay = (rootId: string, tournamentDayId: string) => {
        const mds = teamTournamentMatchdaysByRoot[rootId] || [];
        return mds.find(md => md.tournamentDayId === tournamentDayId) || null;
    };

    const toggleExpand = (groupId: string) => {
        setExpandedNames(prev => {
            const newSet = new Set(prev);
            if (newSet.has(groupId)) {
                newSet.delete(groupId);
            } else {
                newSet.add(groupId);
            }
            return newSet;
        });
    };

    const calculateAmericanoStandings = (matches: Match[], scoringType?: 'games-diff' | 'points'): TournamentStandingEntry[] => {
        console.log(`🎯 TournamentsPage Americano: Starting calculation with ${matches.length} matches`);
        
        const playerStats = new Map<string, {
            player: Player;
            totalPoints: number;
            totalGamesWon: number;
            totalGamesLost: number;
            matchesPlayed: number;
        }>();

        // Get all unique players from matches (these are the draw players)
        const allPlayers = new Set<string>();
        matches.forEach(match => {
            [...match.team1, ...match.team2].forEach(playerId => allPlayers.add(playerId));
        });

        console.log(`🎯 TournamentsPage Americano: Found ${allPlayers.size} unique players in ${matches.length} matches`);

        // Initialize all players (only those who were in the draw)
        allPlayers.forEach(playerId => {
            const player = getPlayerById(playerId);
            if (player) {
                playerStats.set(playerId, {
                    player,
                    totalPoints: 0,
                    totalGamesWon: 0,
                    totalGamesLost: 0,
                    matchesPlayed: 0
                });
            }
        });

        // Process each match
        matches.forEach(match => {
            const team1Players = match.team1.map(id => getPlayerById(id)).filter(Boolean) as Player[];
            const team2Players = match.team2.map(id => getPlayerById(id)).filter(Boolean) as Player[];
            
            if (team1Players.length === 2 && team2Players.length === 2 && match.sets) {
                const team1Games = match.sets.reduce((sum, set) => sum + set.team1, 0);
                const team2Games = match.sets.reduce((sum, set) => sum + set.team2, 0);
                
                [...team1Players, ...team2Players].forEach(player => {
                    const stats = playerStats.get(player.id);
                    if (stats) {
                        stats.matchesPlayed++;
                        
                        if (team1Players.includes(player)) {
                            stats.totalPoints += team1Games;
                            stats.totalGamesWon += team1Games;
                            stats.totalGamesLost += team2Games;
                        } else {
                            stats.totalPoints += team2Games;
                            stats.totalGamesWon += team2Games;
                            stats.totalGamesLost += team1Games;
                        }
                    }
                });
            }
        });

        // Convert to standings array
        const standings: TournamentStandingEntry[] = Array.from(playerStats.values()).map(stats => {
            const gameDifference = stats.totalGamesWon - stats.totalGamesLost;
            const points = scoringType === 'points' ? stats.totalGamesWon : gameDifference;
            
            return {
                teamId: stats.player.id,
                team: [stats.player],
                points,
                gamesWon: stats.totalGamesWon,
                gamesLost: stats.totalGamesLost,
                gameDifference,
                matches: stats.matchesPlayed
            };
        });

        console.log(`🎯 TournamentsPage Americano: Created ${standings.length} standings entries`);
        
        return standings.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            return b.gamesWon - a.gamesWon;
        });
    };

    const handlePrint = async (tournament: Tournament) => {
        const tournamentMatches = matches.filter(m => m.tournamentId === tournament.id);
        const displayName = getTournamentDisplayName(tournament, tournaments);

        if (tournament.type === TournamentType.TorneoASquadre) {
            try {
                await handleTeamTournamentPrint(tournament);
            } catch (error) {
                console.error('Failed to print team tournament:', error);
            }
            return;
        }
        
        // Handle Beat the Box tournaments
        if (tournament.type === TournamentType.BeatTheBox) {
            if (tournament.status === 'scheduled') {
                // Print blank score sheet for scheduled tournaments
                // FILTRA SOLO I BOX MATCHES (escludi semifinali e finali)
                
                // Use player-set grouping (order-independent)
                const { boxes: groupedPrintBoxes } = groupMatchesByPlayerSets(tournamentMatches);
                const boxes: { boxNumber: number; players: Player[]; matches: Match[] }[] = [];
                groupedPrintBoxes.forEach((bMatches, boxNum) => {
                    const playerIdsSet = new Set<string>();
                    bMatches.forEach(m => {
                        m.team1.forEach(id => playerIdsSet.add(id));
                        m.team2.forEach(id => playerIdsSet.add(id));
                    });
                    boxes.push({
                        boxNumber: boxNum,
                        players: Array.from(playerIdsSet).map(id => getPlayerById(id)).filter((p): p is Player => p !== undefined),
                        matches: bMatches
                    });
                });
                
                printBeatTheBoxBlank(tournament, boxes, getPlayerById as any);
            } else {
                // Print complete report for completed tournaments
                const { boxes, boxStandings, semifinalMatches, finalMatches, individualStandings } = processBeatTheBoxData(tournamentMatches, getPlayerById as any);
                
                // USA SEMPRE I DATI RICALCOLATI (stesso algoritmo dell'UI)
                printBeatTheBoxComplete(tournament, boxes, boxStandings, semifinalMatches, finalMatches, individualStandings, getPlayerById, displayName);
            }
            return;
        }
        
        // Handle Torneo Libero tournaments
        if (tournament.type === TournamentType.TorneoLibero) {
            // Extract unique pairs from matches
            const pairMap = new Map<string, [Player, Player]>();
            tournamentMatches.forEach(match => {
                const p1a = getPlayerById(match.team1[0]);
                const p1b = getPlayerById(match.team1[1]);
                const p2a = getPlayerById(match.team2[0]);
                const p2b = getPlayerById(match.team2[1]);
                
                if (p1a && p1b) {
                    const key = [match.team1[0], match.team1[1]].sort().join('-');
                    if (!pairMap.has(key)) {
                        pairMap.set(key, [p1a, p1b]);
                    }
                }
                if (p2a && p2b) {
                    const key = [match.team2[0], match.team2[1]].sort().join('-');
                    if (!pairMap.has(key)) {
                        pairMap.set(key, [p2a, p2b]);
                    }
                }
            });
            
            const pairs = Array.from(pairMap.values());
            
            // Determine mode by checking if same players appear in multiple pairs
            const playerPairCount = new Map<string, number>();
            pairs.forEach(pair => {
                pair.forEach(player => {
                    playerPairCount.set(player.id, (playerPairCount.get(player.id) || 0) + 1);
                });
            });
            
            const isRotating = Array.from(playerPairCount.values()).some(count => count > 1);
            const mode: 'fixed' | 'rotating' = isRotating ? 'rotating' : 'fixed';
            
            printTorneoLiberoComplete(
                tournament,
                tournamentMatches,
                pairs,
                mode,
                getPlayerById,
                displayName
            );
            return;
        }
        
        let standings: TournamentStandingEntry[];
        if (tournament.type === TournamentType.Americano) {
            standings = calculateAmericanoStandings(tournamentMatches, tournament.americanoScoringType);
        } else if (tournament.type === TournamentType.RoundRobinFinali && tournamentMatches.length > 2) {
            // For Round Robin + Finali, calculate based on finals results
            const roundRobinMatchCount = tournamentMatches.length - 2;
            standings = calculateFinalStandingsForRoundRobinFinali(tournamentMatches, roundRobinMatchCount, getPlayerById as any);
        } else {
            standings = calculateTournamentStandings(tournamentMatches, getPlayerById as any);
        }
        
        // For Americano tournaments, we need to get the americanoFields parameter
        // Use the actual americanoFields from the tournament data
        const americanoFields = tournament.type === TournamentType.Americano ? tournament.americanoFields : undefined;
        
        // For Round Robin + Finali tournaments, calculate the number of round robin matches
        // (Total matches - 2 finals matches)
        const roundRobinMatchCount = tournament.type === TournamentType.RoundRobinFinali && tournamentMatches.length > 2
            ? tournamentMatches.length - 2
            : undefined;
        
        // Handle Gironi + Fase Finale tournaments
        if (tournament.type === TournamentType.GironiFaseFinale) {
            printGironiTournament(tournament, tournamentMatches, getPlayerById, displayName);
        } else {
            printTournamentReport(tournament, standings, tournamentMatches, getPlayerById, americanoFields, tournament.americanoScoringType, roundRobinMatchCount, displayName);
        }
    };
    const handlePrintSeries = (days: Tournament[]) => {
        if (!days || days.length === 0) return;
        const seriesMatches = matches.filter(m => days.some(d => d.id === m.tournamentId));
        const firstDay = days[0];
        const seriesRoot: Tournament = {
            ...firstDay,
            id: firstDay.id, // using first day id as anchor
            name: firstDay.giornataName || firstDay.name,
        };
        const displayName = seriesRoot.name;

        if (firstDay.type === TournamentType.BeatTheBox) {
            const { boxes, boxStandings, semifinalMatches, finalMatches, individualStandings } = processBeatTheBoxData(seriesMatches, getPlayerById as any);
            printBeatTheBoxComplete(seriesRoot, boxes, boxStandings, semifinalMatches, finalMatches, individualStandings, getPlayerById, displayName);
            return;
        }
        
        let standings: TournamentStandingEntry[];
        if (firstDay.type === TournamentType.Americano) {
            standings = calculateAmericanoStandings(seriesMatches, firstDay.americanoScoringType);
        } else if (firstDay.type === TournamentType.RoundRobinFinali && seriesMatches.length > 2) {
            const roundRobinMatchCount = seriesMatches.length - 2;
            standings = calculateFinalStandingsForRoundRobinFinali(seriesMatches, roundRobinMatchCount, getPlayerById as any);
        } else {
            standings = calculateTournamentStandings(seriesMatches, getPlayerById as any);
        }

        const americanoFields = firstDay.type === TournamentType.Americano ? firstDay.americanoFields : undefined;
        
        if (firstDay.type === TournamentType.GironiFaseFinale) {
            printGironiTournament(seriesRoot, seriesMatches, getPlayerById, displayName);
        } else {
            printTournamentReport(seriesRoot, standings, seriesMatches, getPlayerById, americanoFields, firstDay.americanoScoringType, undefined, displayName);
        }
    };

    const handleDelete = (tournamentId: string) => {
        setDeleteAlert({ isOpen: true, type: 'tournament', idOrName: tournamentId });
    };

    const handleConfirmDelete = async (cascade: boolean) => {
        setDeleteAlert(prev => ({
            ...prev,
            isDeleting: true,
            progressPercent: 10,
            loadingText: cascade ? "Eliminazione torneo e giocatori..." : "Eliminazione torneo in corso..."
        }));

        try {
            // Simulated smooth progress steps
            const progressInterval = setInterval(() => {
                setDeleteAlert(prev => {
                    if (prev.progressPercent && prev.progressPercent < 85) {
                        return { ...prev, progressPercent: prev.progressPercent + 15 };
                    }
                    return prev;
                });
            }, 120);

            if (deleteAlert.type === 'tournament' && deleteAlert.idOrName) {
                await deleteTournament(deleteAlert.idOrName, cascade);
            } else if (deleteAlert.type === 'series' && deleteAlert.idOrName) {
                await deleteTournamentSeries(deleteAlert.idOrName, cascade);
            }

            clearInterval(progressInterval);
            setDeleteAlert(prev => ({ ...prev, progressPercent: 100, loadingText: "Completato!" }));
            
            setTimeout(() => {
                setDeleteAlert({ isOpen: false, type: null, idOrName: null, isDeleting: false, progressPercent: 0, loadingText: '' });
            }, 300);
        } catch (error) {
            console.error("Errore eliminazione:", error);
            setDeleteAlert({ isOpen: false, type: null, idOrName: null, isDeleting: false, progressPercent: 0, loadingText: '' });
        }
    };
    
    const handleEdit = (tournament: Tournament) => {
        setTournamentToEdit(tournament);
        setIsEditModalOpen(true);
    };

    const handleEditSeriesSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await updateTournamentSeriesName(seriesEditOldName, seriesEditNewName);
            setSeriesEditModalOpen(false);
            setSeriesEditOldName('');
            setSeriesEditNewName('');
            
            // Re-expand the newly named series if it was expanded
            setExpandedNames(prev => {
                const next = new Set(prev);
                next.delete(seriesEditOldName);
                next.add(seriesEditNewName);
                return next;
            });
        } catch (error) {
            console.error("Failed to update series name:", error);
            alert("Errore nell'aggiornamento del nome della serie.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleTeamTournamentPrint = async (tournament: Tournament) => {
        const preOpenedWindow = window.open('', '_blank');
        try {
            // If this is a saved "giornata" (child tournament), print the calendar for that giornata
            if (tournament.giornataName) {
                const matchday = await getTeamTournamentMatchdayByTournamentDayId(tournament.id);
                const rootId = matchday.rootTournamentId;
                const [config, teams, allMatchdays, fixtures] = await Promise.all([
                    getTeamTournamentConfig(rootId),
                    getTeamTournamentTeams(rootId),
                    getTeamTournamentMatchdays(rootId),
                    getTeamTournamentFixtures(rootId),
                ]);
                if (!config) {
                    preOpenedWindow?.close();
                    alert('Configurazione torneo non trovata.');
                    return;
                }

                printTeamTournamentMatchdayReport(
                    { name: tournament.name, club: tournament.club, type: TournamentType.TorneoASquadre },
                    config,
                    teams,
                    allMatchdays,
                    matchday,
                    fixtures,
                    preOpenedWindow
                );
                return;
            }

            // Otherwise, print the global team tournament report from the root.
            const rootId = tournament.teamTournamentRootId || tournament.id;
            const [config, teams, matchdays, fixtures] = await Promise.all([
                getTeamTournamentConfig(rootId),
                getTeamTournamentTeams(rootId),
                getTeamTournamentMatchdays(rootId),
                getTeamTournamentFixtures(rootId),
            ]);

            if (!config) {
                preOpenedWindow?.close();
                alert('Configurazione torneo non trovata.');
                return;
            }

            if ((config.format === 'ROUND ROBIN' && config.schedule) || config.format === 'ELIMINAZIONE DIRETTA') {
                printTeamTournamentReport(
                    { name: tournament.name, club: tournament.club, type: TournamentType.TorneoASquadre },
                    config,
                    teams,
                    matchdays,
                    fixtures,
                    preOpenedWindow
                );
            } else {
                // Fallback reserved for older/unimplemented formats.
                preOpenedWindow?.close();
                printTeamTournamentRoundRobinSchedule(tournament, config, teams);
            }
        } catch (error) {
            preOpenedWindow?.close();
            throw error;
        }
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (tournamentToEdit && editClub.trim() && editName.trim()) {
            setIsSubmitting(true);
            try {
                await updateTournament(tournamentToEdit.id, {
                    name: editName,
                    club: editClub,
                    date: new Date(editDate).toISOString(),
                });
                setIsEditModalOpen(false);
                setTournamentToEdit(null);
            } catch (error) {
                console.error("Failed to update tournament:", error);
            } finally {
                setIsSubmitting(false);
            }
        }
    };
    
    // Grouping key for Team Tournaments must be stable (root id), otherwise a rename can temporarily
    // create two groups if some "giornate" still have an old `giornataName`.
    const { tournamentsByGroupId, groupLabelById } = useMemo(() => {
        const groups: Record<string, Tournament[]> = {};
        const labels: Record<string, string> = {};

        tournaments.forEach(t => {
            const groupId =
                t.type === TournamentType.TorneoASquadre
                    ? (t.teamTournamentRootId || t.id)
                    : (t.giornataName || t.name);

            if (!groups[groupId]) groups[groupId] = [];
            groups[groupId].push(t);
        });

        Object.values(groups).forEach(group =>
            group.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        );

        Object.entries(groups).forEach(([groupId, group]) => {
            if (group[0]?.type === TournamentType.TorneoASquadre) {
                const root =
                    group.find(d =>
                        d.type === TournamentType.TorneoASquadre &&
                        !d.giornataName &&
                        (d.teamTournamentRootId ? d.teamTournamentRootId === d.id : true)
                    ) || group[0];
                labels[groupId] = root.name;
            } else {
                labels[groupId] = groupId;
            }
        });

        return { tournamentsByGroupId: groups, groupLabelById: labels };
    }, [tournaments]);

    useEffect(() => {
        // Load team tournament support data so the root card can decide whether the next step
        // is still "Inserisci Giornata" or already "Inserisci Finali".
        const rootIds = (Object.values(tournamentsByGroupId) as Tournament[][])
            .map(group => {
                if (!group || group.length === 0) return null;
                if (group[0]?.type !== TournamentType.TorneoASquadre) return null;
                const root = group.find(d => d.type === TournamentType.TorneoASquadre && !d.giornataName && (d.teamTournamentRootId ? d.teamTournamentRootId === d.id : true)) || group[0];
                return root.teamTournamentRootId || root.id;
            })
            .filter((v): v is string => !!v);
        if (rootIds.length === 0) return;

        let cancelled = false;

        const load = async () => {
            for (const rootId of rootIds) {
                try {
                    const [cfgResult, fxResult, tmsResult, mdsResult] = await Promise.allSettled([
                        getTeamTournamentConfig(rootId),
                        getTeamTournamentFixtures(rootId),
                        getTeamTournamentTeams(rootId),
                        getTeamTournamentMatchdays(rootId),
                    ]);
                    if (cancelled) return;
                    if (cfgResult.status === 'fulfilled') {
                        setTeamTournamentConfigByRoot(prev => ({ ...prev, [rootId]: cfgResult.value }));
                    }
                    if (fxResult.status === 'fulfilled') {
                        setTeamTournamentFixturesByRoot(prev => ({ ...prev, [rootId]: fxResult.value }));
                    }
                    if (tmsResult.status === 'fulfilled') {
                        setTeamTournamentTeamsByRoot(prev => ({ ...prev, [rootId]: tmsResult.value }));
                    }
                    if (mdsResult.status === 'fulfilled') {
                        setTeamTournamentMatchdaysByRoot(prev => ({ ...prev, [rootId]: mdsResult.value }));
                    }
                } catch {
                    // ignore
                }
            }
        };

        load();
        return () => { cancelled = true; };
    }, [tournamentsByGroupId, getTeamTournamentConfig, getTeamTournamentFixtures, getTeamTournamentTeams, getTeamTournamentMatchdays]);

    const sortedGroupIds = Object.keys(tournamentsByGroupId).sort((a, b) => {
        const dateA = new Date(tournamentsByGroupId[a][0].date).getTime();
        const dateB = new Date(tournamentsByGroupId[b][0].date).getTime();
        return dateB - dateA;
    });

    return (
        <>
            <div className="mb-6">
                 <Card>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-2">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                Inizia da qui!
                            </h2>
                            <p className="text-gray-500 dark:text-gray-400 mt-1">
                                Organizza un nuovo torneo, inserisci una giornata, sorteggia le coppie e memorizza i risultati
                            </p>
                        </div>
                        <Button onClick={onOpenDrawLauncher} size="lg" className="w-full flex-shrink-0 !font-bold !text-white sm:w-auto">
                            Nuovo Torneo / Nuova Giornata
                        </Button>
                    </div>
                </Card>
            </div>

            <div className="space-y-6">
                {loading ? (
                    <TournamentsSkeleton />
                ) : sortedGroupIds.length > 0 ? (
                    <>
                    <div className="px-3 md:px-4 pt-3 mb-4">
                        <h2 className="text-[1.62rem] font-black leading-none tracking-tight text-sky-500 dark:text-sky-300 sm:text-[1.78rem] md:text-[2.25rem]">Tornei Attivi</h2>
                    </div>
                    {sortedGroupIds.map(groupId => {
                        const tournamentDays = tournamentsByGroupId[groupId];
                        const displayName = groupLabelById[groupId] || groupId;
                        const isExpanded = expandedNames.has(groupId);
                        const groupRepresentsTeamTournament = tournamentDays[0]?.type === TournamentType.TorneoASquadre;
                        const teamTournamentRoot = groupRepresentsTeamTournament
                            ? (tournamentDays.find(d => d.type === TournamentType.TorneoASquadre && !d.giornataName && (d.teamTournamentRootId ? d.teamTournamentRootId === d.id : true)) || tournamentDays[0])
                            : null;
                        const teamTournamentRootId = teamTournamentRoot?.teamTournamentRootId || teamTournamentRoot?.id || null;
                        const teamTournamentNeedsConfiguration = groupRepresentsTeamTournament && !(teamTournamentRoot?.teamTournamentConfigCompleted);
                        const visibleTournamentDays = groupRepresentsTeamTournament
                            ? tournamentDays
                                .filter(d => !!d.giornataName) // show only saved giornate
                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            : [...tournamentDays].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                        const normalTournamentDaysChronological = !groupRepresentsTeamTournament
                            ? [...tournamentDays].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                            : [];
                        const normalTournamentDayOrder = new Map(
                            normalTournamentDaysChronological.map((day, index) => [day.id, index + 1])
                        );
                        const normalTournamentTotalDays = normalTournamentDaysChronological.length;
                        const teamTournamentConfig = teamTournamentRootId ? teamTournamentConfigByRoot[teamTournamentRootId] : null;
                        const teamTournamentFixtures = teamTournamentRootId ? (teamTournamentFixturesByRoot[teamTournamentRootId] || []) : [];
                        const teamTournamentTeams = teamTournamentRootId ? (teamTournamentTeamsByRoot[teamTournamentRootId] || []) : [];
                        const teamTournamentMatchdays = teamTournamentRootId ? (teamTournamentMatchdaysByRoot[teamTournamentRootId] || []) : [];
                        const totalRoundRobin = teamTournamentConfig ? expectedTeamTournamentRoundRobinMatchdays(teamTournamentConfig) : 0;
                        const playedRoundRobin = teamTournamentMatchdays
                            .filter(md => (md.phase ?? 'round_robin') === 'round_robin')
                            .filter(md => md.status === 'completed' && md.summary).length;
                        const isRoundRobinComplete = totalRoundRobin > 0 && playedRoundRobin >= totalRoundRobin;
                        const teamTournamentHasFinalPhase = !!teamTournamentConfig?.roundRobinFinalPhase && teamTournamentConfig?.format === 'ROUND ROBIN';
                        const isEliminationDirect = teamTournamentConfig?.format === 'ELIMINAZIONE DIRETTA';
                        const readyPlayoffFixtures = teamTournamentFixtures.filter(f => f.status === 'planned' && !!f.team1Number && !!f.team2Number);
                        const scheduledPlayoffFixtures = teamTournamentFixtures.filter(f => f.status === 'scheduled' && !!f.tournamentDayId);
                        const hasActivePlayoffStage = isEliminationDirect
                            ? teamTournamentFixtures.length > 0
                            : (isRoundRobinComplete && teamTournamentHasFinalPhase);
                        const isTeamTournamentCompleted = hasActivePlayoffStage && isTeamTournamentFinalStageCompleted(teamTournamentConfig, teamTournamentFixtures);
                        const qualifiedTeamNumbers = (isRoundRobinComplete && teamTournamentConfig)
                            ? calculateTeamTournamentStandings(teamTournamentTeams, teamTournamentMatchdays, teamTournamentConfig.scoringType)
                                .slice(0, teamTournamentQualifiedCount(teamTournamentConfig))
                                .map(row => row.teamNumber)
                            : [];
                        return (
                            <Card
                                key={groupId}
                                title={
                                    <div className="flex items-center justify-between w-full">
                                        <div
                                            onClick={() => {
                                                if (!teamTournamentNeedsConfiguration) toggleExpand(groupId);
                                            }}
                                            className={`flex items-center flex-1 ${teamTournamentNeedsConfiguration ? '' : 'cursor-pointer'}`}
                                        >
                                            {!teamTournamentNeedsConfiguration && (
                                                <ChevronDownIcon className={`h-5 w-5 mr-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                            )}
                                            <span className="font-bold text-xl">{displayName}</span>
                                        </div>
                                        {teamTournamentNeedsConfiguration ? (
                                            <div className="flex flex-col items-end gap-2 ml-4">
                                                <Button
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onNavigateToTeamTournamentConfiguration(teamTournamentRootId || tournamentDays[0].id);
                                                    }}
                                                    className="!bg-orange-500 hover:!bg-orange-600 !border-orange-700/50 dark:!border-orange-300/35 !text-white !px-3 !py-1.5 !text-sm"
                                                >
                                                    + Completa Configurazione
                                                </Button>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (teamTournamentRootId) onNavigateToTeamTournamentConfiguration(teamTournamentRootId);
                                                        }}
                                                        className={tournamentActionButtonClass}
                                                        aria-label="Edit Team Tournament"
                                                    >
                                                        <PencilIcon />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (teamTournamentRoot) handlePrint(teamTournamentRoot);
                                                        }}
                                                        className={tournamentActionButtonClass}
                                                        aria-label="Print Team Tournament"
                                                    >
                                                        <PrintIcon />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="danger"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (teamTournamentRoot) handleDelete(teamTournamentRoot.id);
                                                        }}
                                                        className={tournamentActionButtonClass}
                                                        aria-label="Delete Team Tournament"
                                                    >
                                                        <TrashIcon />
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 ml-4">
                                                <Button
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (groupRepresentsTeamTournament) {
                                                            if (teamTournamentRootId) {
                                                                if (isTeamTournamentCompleted) {
                                                                    onNavigateToTeamTournamentSummary(teamTournamentRootId);
                                                                } else if (hasActivePlayoffStage) {
                                                                    if (scheduledPlayoffFixtures[0]?.tournamentDayId) {
                                                                        onNavigateToTeamTournamentMatchdayResults(scheduledPlayoffFixtures[0].tournamentDayId);
                                                                    } else {
                                                                        onNavigateToNewTeamTournamentMatchday(teamTournamentRootId);
                                                                    }
                                                                } else {
                                                                    onNavigateToNewTeamTournamentMatchday(teamTournamentRootId);
                                                                }
                                                            }
                                                        } else {
                                                            onNavigateToNewGiornata(displayName);
                                                        }
                                                    }}
                                                    className={`${groupRepresentsTeamTournament && isTeamTournamentCompleted ? '!bg-sky-500 hover:!bg-sky-600 !border-sky-600 dark:!border-sky-300/35' : (groupRepresentsTeamTournament && hasActivePlayoffStage ? '!bg-orange-500 hover:!bg-orange-600 !border-orange-700/50 dark:!border-orange-300/35' : '!bg-green-600 hover:!bg-green-700 !border-green-700/50 dark:!border-green-300/35')} !text-white !px-3 !py-1.5 !text-sm`}
                                                >
                                                    {groupRepresentsTeamTournament && isTeamTournamentCompleted
                                                        ? 'Riepilogo'
                                                        : (groupRepresentsTeamTournament && hasActivePlayoffStage
                                                            ? (isEliminationDirect ? '+ Aggiungi Partita' : '+ Inserisci Finali')
                                                            : '+ Inserisci Giornata')}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                }
                            >
                                {!teamTournamentNeedsConfiguration && isExpanded && (
                                    <div className="space-y-3">
                                        {groupRepresentsTeamTournament && teamTournamentRoot && (
                                            <div className="rounded-2xl border border-slate-200/45 bg-[linear-gradient(135deg,rgba(137,206,255,0.16),rgba(241,245,251,0.92))] p-3 shadow-sm dark:border-white/6 dark:bg-[linear-gradient(135deg,rgba(137,206,255,0.10),rgba(255,255,255,0.03))] dark:text-white sm:p-4">
                                                <div>
                                                    <div className="mb-1.5 flex items-start justify-between gap-2 sm:mb-2 sm:items-center sm:gap-3">
                                                        <span className={teamTournamentInfoPillClass}>
                                                            Gestione torneo
                                                        </span>
                                                        <div className="flex flex-shrink-0 items-center gap-1">
                                                            <Button
                                                                size="sm"
                                                                variant="secondary"
                                                                onClick={() => {
                                                                    if (teamTournamentRootId) onNavigateToTeamTournamentConfiguration(teamTournamentRootId);
                                                                }}
                                                                className={`${tournamentActionButtonOnDarkClass} !p-1.25 sm:!p-1.5`}
                                                                aria-label="Edit Team Tournament"
                                                            >
                                                                <PencilIcon />
                                                            </Button>
                                                            <Button size="sm" variant="secondary" onClick={() => handlePrint(teamTournamentRoot)} aria-label="Print Team Tournament" className={`${tournamentActionButtonOnDarkClass} !p-1.25 sm:!p-1.5`}><PrintIcon /></Button>
                                                            <Button size="sm" variant="danger" onClick={() => handleDelete(teamTournamentRoot.id)} className={`${tournamentActionButtonClass} !p-1.25 sm:!p-1.5`} aria-label="Delete Team Tournament"><TrashIcon /></Button>
                                                        </div>
                                                    </div>
                                                    <p className="text-sm text-app-soft dark:text-white/80">
                                                    {teamTournamentRoot.club}
                                                    </p>
                                                    {(() => {
                                                        if (!teamTournamentRootId) return null;
                                                        const completed = isEliminationDirect
                                                            ? teamTournamentFixtures.filter(f => f.status === 'completed' && !f.isBye).length
                                                            : playedRoundRobin;
                                                        const total = isEliminationDirect
                                                            ? teamTournamentFixtures.filter(f => !f.isBye).length
                                                            : totalRoundRobin;
                                                        const label = total > 0 ? `${completed} su ${total}` : `${completed}`;
                                                        return (
                                                            <p className="mt-0.5 text-sm leading-tight text-app-soft dark:text-white/80">
                                                                {isEliminationDirect ? 'Sfide completate' : 'Partite completate'}: <strong className="font-semibold text-app dark:text-white">{label}</strong>
                                                            </p>
                                                        );
                                                    })()}
                                                </div>

                                                {teamTournamentConfig && teamTournamentTeams.length > 0 && !isEliminationDirect && (
                                                    <div className="mt-3 overflow-x-auto border-t border-slate-200/45 pt-2.5 dark:border-white/8 sm:mt-4 sm:rounded-xl sm:border sm:bg-white/72 sm:p-3 dark:sm:bg-white/5">
                                                        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-app-muted dark:text-white/80 sm:mb-2 sm:text-xs">
                                                            {isRoundRobinComplete ? 'Classifica Finale Round Robin' : 'Classifica provvisoria'}
                                                        </div>
                                                        <table className="w-full min-w-[280px] text-[12px] sm:min-w-[300px] sm:text-sm">
                                                            <thead>
                                                                <tr className="text-app-muted dark:text-white/80">
                                                                    <th className="py-0.5 pr-2 text-left sm:py-1 sm:pr-3">Pos</th>
                                                                    <th className="py-0.5 pr-2 text-left sm:py-1 sm:pr-3">Squadra</th>
                                                                    <th className="px-1.5 py-0.5 text-center sm:px-2 sm:py-1">{teamTournamentConfig.scoringType === 'Differenza Games' ? 'Diff' : 'Pt'}</th>
                                                                    <th className="px-1.5 py-0.5 text-center sm:px-2 sm:py-1">G / V / P</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {calculateTeamTournamentStandings(teamTournamentTeams, teamTournamentMatchdays, teamTournamentConfig.scoringType).map((row, index) => {
                                                                    const isQualified = qualifiedTeamNumbers.includes(row.teamNumber);
                                                                    return (
                                                                        <tr key={row.teamNumber} className={isQualified ? 'rounded-md bg-green-100/80 text-emerald-950 dark:bg-green-200/90' : 'text-app dark:text-white'}>
                                                                            <td className="py-0.5 pr-2 sm:py-1 sm:pr-3">{index + 1}</td>
                                                                            <td className="py-0.5 pr-2 font-medium sm:py-1 sm:pr-3">{row.teamName}</td>
                                                                            <td className="px-1.5 py-0.5 text-center sm:px-2 sm:py-1">{teamTournamentConfig.scoringType === 'Differenza Games' ? (row.gamesDiff >= 0 ? `+${row.gamesDiff}` : `${row.gamesDiff}`) : row.points}</td>
                                                                            <td className="whitespace-nowrap px-1.5 py-0.5 text-center sm:px-2 sm:py-1">{row.played} / {row.won} / {row.lost}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}

                                                {(() => {
                                                    const fx = teamTournamentFixtures;
                                                    if (!teamTournamentRootId || ((!isRoundRobinComplete && !isEliminationDirect) || fx.length === 0)) return null;
                                                    return (
                                                        <div className="mt-3 border-t border-slate-200/45 pt-2.5 dark:border-white/10 sm:mt-4 sm:rounded-xl sm:border sm:bg-white/72 sm:p-3 dark:sm:bg-white/5">
                                                            <div className="text-[11px] font-bold uppercase tracking-wide text-app-muted dark:text-white/80 sm:text-xs">
                                                                {isEliminationDirect ? 'Tabellone' : 'Fase finale'}
                                                            </div>
                                                            <div className="mt-2 space-y-1.5 sm:space-y-2">
                                                                {fx.map(f => {
                                                                    const left = resolveFixtureTeamName(teamTournamentRootId, f, 'left');
                                                                    const right = resolveFixtureTeamName(teamTournamentRootId, f, 'right');
                                                                    const ready = !!f.team1Number && !!f.team2Number && f.status === 'planned';
                                                                    const canOpen = f.status === 'scheduled' && !!f.tournamentDayId;
                                                                    const isGrandFinal = f.phase === 'final_1_2';
                                                                    return (
                                                                        <div
                                                                            key={f.id}
                                                                            className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1.5 rounded-lg border px-2.5 py-2 sm:gap-x-3 sm:px-3 ${
                                                                                isGrandFinal
                                                                                    ? 'bg-amber-100/95 border-amber-300 !text-slate-900'
                                                                                    : 'bg-slate-50/85 border-slate-200/45 dark:bg-white/10 dark:border-white/10'
                                                                            }`}
                                                                        >
                                                                            <div className="min-w-0">
                                                                                <div className={`text-[11px] font-semibold sm:text-xs ${isGrandFinal ? '!text-slate-700' : 'text-app-muted dark:text-white/90'}`}>{fixturePhaseLabel(f.phase, f.slot)}</div>
                                                                                <div className={`text-sm font-semibold leading-tight sm:truncate ${isGrandFinal ? '!text-slate-900' : 'text-app dark:text-white'}`}>
                                                                                    {left} <span className={`font-normal ${isGrandFinal ? '!text-slate-600' : 'text-app-soft dark:text-white/80'}`}>vs</span> {right}
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex flex-shrink-0 justify-self-end self-start gap-1.5">
                                                                                {canOpen ? (
                                                                                    <Button
                                                                                        size="sm"
                                                                                        onClick={() => onNavigateToTeamTournamentMatchdayResults(f.tournamentDayId!)}
                                                                                        className="!bg-orange-500 hover:!bg-orange-600 !border-orange-700/50 dark:!border-orange-300/35 !text-white !px-2.5 !py-1.25 !text-[11px] sm:!px-3 sm:!py-1.5 sm:!text-xs"
                                                                                    >
                                                                                        Inserisci risultati
                                                                                    </Button>
                                                                                ) : f.status === 'completed' ? (
                                                                                    <span
                                                                                        className={`inline-flex items-center rounded-md border px-2.5 py-0.75 text-[11px] font-bold sm:px-3 sm:py-1 sm:text-xs ${
                                                                                            isGrandFinal
                                                                                                ? 'border-slate-900/15 bg-slate-900/5 text-slate-700'
                                                                                                : 'border-slate-200/45 bg-slate-100/80 text-app-muted dark:border-white/15 dark:bg-white/10 dark:text-white/80'
                                                                                        }`}
                                                                                    >
                                                                                        Completata
                                                                                    </span>
                                                                                ) : (
                                                                                    <Button
                                                                                        size="sm"
                                                                                        onClick={() => onNavigateToTeamTournamentFixture(teamTournamentRootId, f.id)}
                                                                                        disabled={!ready}
                                                                                        className="!bg-orange-500 hover:!bg-orange-600 !border-orange-700/50 dark:!border-orange-300/35 !text-white !px-2.5 !py-1.25 !text-[11px] sm:!px-3 sm:!py-1.5 sm:!text-xs disabled:!border-slate-200/45 disabled:!bg-slate-100/80 disabled:!text-slate-400 dark:disabled:!border-white/10 dark:disabled:!bg-white/15 dark:disabled:!text-white/50"
                                                                                    >
                                                                                        + Aggiungi partita
                                                                                    </Button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}

                                        {(!groupRepresentsTeamTournament && (tournamentDays.length > 1 || !!tournamentDays[0].giornataName)) && (
                                            <div className="rounded-2xl border border-slate-200/45 bg-[linear-gradient(135deg,rgba(137,206,255,0.16),rgba(241,245,251,0.92))] p-3 shadow-sm dark:border-white/6 dark:bg-[linear-gradient(135deg,rgba(137,206,255,0.10),rgba(255,255,255,0.03))] dark:text-white sm:p-4">
                                                <div className="flex items-start justify-between gap-2 sm:items-center sm:gap-3">
                                                    <span className={teamTournamentInfoPillClass}>
                                                        Gestione torneo
                                                    </span>
                                                    <div className="flex flex-shrink-0 items-center gap-1">
                                                        <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            onClick={() => {
                                                                setSeriesEditOldName(displayName);
                                                                setSeriesEditNewName(displayName);
                                                                setSeriesEditModalOpen(true);
                                                            }}
                                                            className={`${tournamentActionButtonOnDarkClass} !p-1.25 sm:!p-1.5`}
                                                            aria-label="Modifica Serie"
                                                        >
                                                            <PencilIcon />
                                                        </Button>
                                                        <Button size="sm" variant="secondary" onClick={() => handlePrintSeries(visibleTournamentDays)} aria-label="Stampa Serie" className={`${tournamentActionButtonOnDarkClass} !p-1.25 sm:!p-1.5`}><PrintIcon /></Button>
                                                        <Button size="sm" variant="danger" onClick={() => setDeleteAlert({ isOpen: true, type: 'series', idOrName: displayName })} className={`${tournamentActionButtonClass} !p-1.25 sm:!p-1.5`} aria-label="Elimina Serie"><TrashIcon /></Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {visibleTournamentDays.map(day => {
                                            const tournamentDayDisplayName = getTournamentDisplayName(day, tournaments);
                                            const hasInlineActionRow =
                                                (day.type === TournamentType.TorneoASquadre && !!day.giornataName) ||
                                                (normalTournamentTotalDays > 1 && normalTournamentDayOrder.has(day.id)) ||
                                                day.status === 'scheduled';
                                            return (
                                            <div key={day.id} className="stitch-row p-4 rounded-lg flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="min-w-0 flex-1">
                                                    <div className="min-w-0">
                                                        {day.type === TournamentType.TorneoASquadre && (day.giornataName || day.teamTournamentRoundNumber || day.teamTournamentPhase) ? (
                                                            (() => {
                                                                const rootId = teamTournamentRootId || day.teamTournamentRootId || '';
                                                                const md = rootId ? matchdayForRootAndTournamentDay(rootId, day.id) : null;
                                                                const t1 = md?.team1Number ?? day.teamTournamentTeam1Number ?? null;
                                                                const t2 = md?.team2Number ?? day.teamTournamentTeam2Number ?? null;
                                                                const left = rootId ? (teamNameForRoot(rootId, t1) || `Squadra ${t1 ?? ''}`) : `Squadra ${t1 ?? ''}`;
                                                                const right = rootId ? (teamNameForRoot(rootId, t2) || `Squadra ${t2 ?? ''}`) : `Squadra ${t2 ?? ''}`;
                                                                const isCompleted = day.status === 'completed';
                                                                const isExpanded = expandedMatchdays.has(day.id);
                                                                const rootIdForLabel = teamTournamentRootId || day.teamTournamentRootId || '';
                                                                const mdForLabel = rootIdForLabel ? matchdayForRootAndTournamentDay(rootIdForLabel, day.id) : null;
                                                                let scoreBadge = null;
                                                                if (mdForLabel?.summary && isCompleted) {
                                                                    const s = mdForLabel.summary;
                                                                    scoreBadge = (
                                                                        <span className="ml-2 bg-ios-blue/10 dark:bg-ios-blue/20 text-ios-blue px-2.5 py-1 rounded-md text-lg font-bold shadow-sm">
                                                                            {s.team1Points ?? s.team1Wins} - {s.team2Points ?? s.team2Wins}
                                                                        </span>
                                                                    );
                                                                }
                                                                const isSfidaInCaricamento = !(t1 && t2);
                                                                
                                                                return (
                                                                        <div 
                                                                            className={`flex items-center gap-2 flex-wrap cursor-pointer select-none group`}
                                                                            onClick={() => toggleExpandedMatchday(day.id)}
                                                                        >
                                                                            <h3 className={`text-base font-semibold leading-snug break-words flex items-center flex-wrap gap-1.5 text-app group-hover:text-sky-600 dark:text-white dark:group-hover:text-sky-400 transition-colors`}>
                                                                                {isSfidaInCaricamento ? (
                                                                                    <span>Sfida in caricamento...</span>
                                                                                ) : (
                                                                                    <>
                                                                                        <span>{left}</span>
                                                                                        <span className="font-normal text-gray-500 dark:text-gray-400 text-sm">vs</span>
                                                                                        <span>{right}</span>
                                                                                        {scoreBadge}
                                                                                    </>
                                                                                )}
                                                                            </h3>
                                                                            <ChevronDownIcon className={`h-5 w-5 text-gray-400 group-hover:text-sky-500 dark:group-hover:text-sky-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                                        </div>
                                                                );
                                                            })()
                                                        ) : (
                                                            <div 
                                                                className={`flex items-center gap-2 flex-wrap cursor-pointer select-none group`}
                                                                onClick={() => toggleExpandedMatchday(day.id)}
                                                            >
                                                                <h3 className="font-semibold text-lg text-gray-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                                                                    {day.giornataName ? tournamentDayDisplayName : day.type}
                                                                </h3>
                                                                <ChevronDownIcon className={`h-5 w-5 text-gray-400 group-hover:text-sky-500 dark:group-hover:text-sky-400 transition-transform ${expandedMatchdays.has(day.id) ? 'rotate-180' : ''}`} />
                                                            </div>
                                                        )}
                                                    </div>
                                                    {day.type === TournamentType.TorneoASquadre && (day.giornataName || day.teamTournamentRoundNumber || day.teamTournamentPhase) ? (
                                                        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                                            <p className="leading-tight">
                                                                {new Date(day.date).toLocaleDateString('it-IT')}
                                                            </p>
                                                            <div className="mt-3 flex items-center justify-between gap-3">
                                                                <div className="min-w-0 flex flex-wrap items-center gap-2">
                                                                    {day.teamTournamentPhase && day.teamTournamentPhase !== 'round_robin' ? (
                                                                        <span className={playoffDayPillClass}>
                                                                            {fixturePhaseLabel(day.teamTournamentPhase, 1)}
                                                                        </span>
                                                                    ) : day.teamTournamentRoundNumber ? (
                                                                        <span className={roundRobinDayPillClass}>
                                                                            Giornata {day.teamTournamentRoundNumber}{day.teamTournamentTotalDays ? ` di ${day.teamTournamentTotalDays}` : ''}
                                                                        </span>
                                                                    ) : null}
                                                                    {day.status === 'scheduled' && day.type !== TournamentType.EliminazioneDiretta && (
                                                                        <button
                                                                            onClick={() => onNavigateToTeamTournamentMatchdayResults(day.id)}
                                                                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-full transition-colors cursor-pointer"
                                                                        >
                                                                            In Corso - Inserisci Risultati
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <div className="flex flex-shrink-0 items-center gap-1.5">
                                                                    <Button
                                                                        size="sm"
                                                                        variant="secondary"
                                                                        onClick={() => {
                                                                            if (day.type === TournamentType.TorneoASquadre && day.giornataName) {
                                                                                onNavigateToTeamTournamentMatchdayResults(day.id);
                                                                            } else if (day.type === TournamentType.TorneoASquadre) {
                                                                                onNavigateToTeamTournamentConfiguration(day.teamTournamentRootId || day.id);
                                                                            } else {
                                                                                handleEdit(day);
                                                                            }
                                                                        }}
                                                                        className={tournamentActionButtonClass}
                                                                        aria-label="Modifica Torneo"
                                                                    >
                                                                        <PencilIcon />
                                                                    </Button>
                                                                    <Button size="sm" variant="secondary" onClick={() => handlePrint(day)} className={tournamentActionButtonClass} aria-label="Stampa Riepilogo"><PrintIcon /></Button>
                                                                    <Button size="sm" variant="danger" onClick={() => handleDelete(day.id)} className={tournamentActionButtonClass} aria-label="Elimina Torneo"><TrashIcon /></Button>
                                                                </div>
                                                            </div>
                                                            {/* EXPANDED MATCHES */}
                                                            {(() => {
                                                                const rootId = teamTournamentRootId || day.teamTournamentRootId || '';
                                                                const md = rootId ? matchdayForRootAndTournamentDay(rootId, day.id) : null;
                                                                if (!md || !expandedMatchdays.has(day.id)) return null;

                                                                const scoringType = teamTournamentConfigByRoot[rootId]?.scoringType;
                                                                const summary = md.summary;
                                                                
                                                                return (
                                                                    <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-white/10">
                                                                        {summary && scoringType === 'Differenza Games' && (
                                                                            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                                                                                <span className="font-semibold text-app dark:text-white">Differenza Games:</span>
                                                                                <span className="bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 px-2.5 py-1 rounded font-bold">
                                                                                    {summary.gamesDiff > 0 ? `+${summary.gamesDiff}` : summary.gamesDiff}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                                                            {(md.subMatches || []).map((sm, idx) => {
                                                                                const t1Name = (sm.team1Players || []).map(p => `${p.name} ${p.surname}`).join(' / ') || 'Squadra 1';
                                                                                const t2Name = (sm.team2Players || []).map(p => `${p.name} ${p.surname}`).join(' / ') || 'Squadra 2';
                                                                                
                                                                                const t1SetsDisplay = sm.sets && sm.sets.length > 0 ? (
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        {sm.sets.map((s, i) => (
                                                                                            <span key={i} className="flex items-center justify-center w-7 h-7 text-sm font-bold font-mono text-app dark:text-white bg-white dark:bg-black/20 rounded shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-slate-200/80 dark:border-white/10">
                                                                                                {s.team1}
                                                                                            </span>
                                                                                        ))}
                                                                                    </div>
                                                                                ) : <span className="text-sm font-bold text-app-muted dark:text-white/40">-</span>;
                                                                                
                                                                                const t2SetsDisplay = sm.sets && sm.sets.length > 0 ? (
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        {sm.sets.map((s, i) => (
                                                                                            <span key={i} className="flex items-center justify-center w-7 h-7 text-sm font-bold font-mono text-app dark:text-white bg-white dark:bg-black/20 rounded shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-slate-200/80 dark:border-white/10">
                                                                                                {s.team2}
                                                                                            </span>
                                                                                        ))}
                                                                                    </div>
                                                                                ) : <span className="text-sm font-bold text-app-muted dark:text-white/40">-</span>;
                                                                                
                                                                                return (
                                                                                    <div key={idx} className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 sm:p-4 flex flex-col gap-2 border border-slate-200/60 dark:border-white/10 shadow-sm">
                                                                                        {sm.cancelled ? (
                                                                                            <div className="text-center text-sm font-semibold text-orange-600 dark:text-orange-400 py-3">Partita Annullata</div>
                                                                                        ) : (
                                                                                            <>
                                                                                                <div className="flex items-center justify-between gap-3">
                                                                                                    <span className={`text-sm ${sm.winner === 'team1' ? 'font-bold text-gray-900 dark:text-white' : 'font-normal text-gray-500 dark:text-gray-400'} leading-tight flex-1`}>{t1Name}</span>
                                                                                                    {t1SetsDisplay}
                                                                                                </div>
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/10"></div>
                                                                                                    <span className="text-[10px] uppercase font-bold text-app-muted dark:text-white/40 tracking-wider">vs</span>
                                                                                                    <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/10"></div>
                                                                                                </div>
                                                                                                <div className="flex items-center justify-between gap-3">
                                                                                                    <span className={`text-sm ${sm.winner === 'team2' ? 'font-bold text-gray-900 dark:text-white' : 'font-normal text-gray-500 dark:text-gray-400'} leading-tight flex-1`}>{t2Name}</span>
                                                                                                    {t2SetsDisplay}
                                                                                                </div>
                                                                                            </>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    ) : (
                                                        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                                            <p>
                                                                {`${day.club} - ${new Date(day.date).toLocaleDateString('it-IT')}`}
                                                            </p>
                                                            {normalTournamentTotalDays > 1 && normalTournamentDayOrder.has(day.id) ? (
                                                                <div className="mt-3 flex items-center justify-between gap-3">
                                                                    <div className="min-w-0 flex flex-wrap items-center gap-2">
                                                                        <span className={roundRobinDayPillClass}>
                                                                            Giornata {normalTournamentDayOrder.get(day.id)} di {normalTournamentTotalDays}
                                                                        </span>
                                                                        {day.status === 'scheduled' && (
                                                                            <button
                                                                                onClick={() => {
                                                                                    if (!expandedMatchdays.has(day.id)) {
                                                                                        toggleExpandedMatchday(day.id);
                                                                                    }
                                                                                    if (day.type === TournamentType.TorneoASquadre) {
                                                                                        onNavigateToTeamTournamentMatchdayResults?.(day.id);
                                                                                    } else if (day.type !== TournamentType.EliminazioneDiretta) {
                                                                                        onNavigateToResults?.(day.id);
                                                                                    }
                                                                                }}
                                                                                className="inline-flex items-center px-3 py-1.5 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-full transition-colors cursor-pointer"
                                                                            >
                                                                                In Corso - Inserisci Risultati
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex flex-shrink-0 items-center gap-1.5">
                                                                        <Button
                                                                            size="sm"
                                                                            variant="secondary"
                                                                            onClick={() => {
                                                                                if (day.type === TournamentType.TorneoASquadre && day.giornataName) {
                                                                                    onNavigateToTeamTournamentMatchdayResults(day.id);
                                                                                } else if (day.type === TournamentType.TorneoASquadre) {
                                                                                    onNavigateToTeamTournamentConfiguration(day.teamTournamentRootId || day.id);
                                                                                } else {
                                                                                    handleEdit(day);
                                                                                }
                                                                            }}
                                                                            className={tournamentActionButtonClass}
                                                                            aria-label="Modifica Torneo"
                                                                        >
                                                                            <PencilIcon />
                                                                        </Button>
                                                                        <Button size="sm" variant="secondary" onClick={() => handlePrint(day)} className={tournamentActionButtonClass} aria-label="Stampa Riepilogo"><PrintIcon /></Button>
                                                                        <Button size="sm" variant="danger" onClick={() => handleDelete(day.id)} className={tournamentActionButtonClass} aria-label="Elimina Torneo"><TrashIcon /></Button>
                                                                    </div>
                                                                </div>
                                                            ) : null}
                                                            
                                                            {expandedMatchdays.has(day.id) && (() => {
                                                                const tournamentMatches = matches.filter(m => m.tournamentId === day.id);
                                                                if (day.type === TournamentType.EliminazioneDiretta) {
                                                                    return (
                                                                        <TpraBracketView tournament={day} matches={tournamentMatches} />
                                                                    );
                                                                }
                                                                if (tournamentMatches.length === 0) {
                                                                    return (
                                                                        <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-white/10 text-sm text-gray-500 italic">
                                                                            Nessuna partita registrata.
                                                                        </div>
                                                                    );
                                                                }
                                                                return (
                                                                    <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-white/10">
                                                                        <div className="space-y-3">
                                                                            {(() => {
                                                                                if (day.type === TournamentType.Americano) {
                                                                                    const roundsMap = new Map<number, typeof tournamentMatches>();
                                                                                    
                                                                                    const allPlayersIds = new Set(tournamentMatches.flatMap(m => [...(m.team1 || []), ...(m.team2 || [])]));
                                                                                    const numPlayers = allPlayersIds.size;
                                                                                    const matchesPerRound = Math.min(day.americanoFields || 2, Math.floor(numPlayers / 4));

                                                                                    tournamentMatches.forEach((sm, index) => {
                                                                                        const r = sm.roundNumber || (matchesPerRound > 0 ? Math.floor(index / matchesPerRound) + 1 : 1);
                                                                                        if (!roundsMap.has(r)) roundsMap.set(r, []);
                                                                                        roundsMap.get(r)!.push(sm);
                                                                                    });
                                                                                    
                                                                                    const allPlayers = Array.from(allPlayersIds).map(id => getPlayerById(id)).filter(Boolean) as Player[];

                                                                                    return Array.from(roundsMap.entries()).sort((a,b)=>a[0]-b[0]).map(([r, matchesForRound]) => {
                                                                                        const playersInRound = new Set(matchesForRound.flatMap(m => [...(m.team1 || []), ...(m.team2 || [])]));
                                                                                        const restingPlayers = allPlayers.filter(p => !playersInRound.has(p.id));
                                                                                        
                                                                                        return (
                                                                                            <div key={`round-${r}`} className="mb-4">
                                                                                                <div className="flex justify-between items-start mb-2">
                                                                                                    <h4 className="font-semibold text-gray-800 dark:text-gray-200">Turno {r}</h4>
                                                                                                    {restingPlayers.length > 0 && (
                                                                                                        <div className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 px-2.5 py-1 rounded-md text-right">
                                                                                                            <span className="font-semibold block">Riposo:</span>
                                                                                                            {restingPlayers.map(p => (
                                                                                                                <div key={p.id}>{p.name} {p.surname}</div>
                                                                                                            ))}
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                                                                                    {matchesForRound.map((m, idx) => {
                                                                                                        const t1Names = m.team1.map(pId => { const p = getPlayerById(pId); return p ? formatPlayerName(p) : pId; }).join(' / ');
                                                                                                        const t2Names = m.team2.map(pId => { const p = getPlayerById(pId); return p ? formatPlayerName(p) : pId; }).join(' / ');
                                                                                                        const t1SetsDisplay = m.sets && m.sets.length > 0 ? (
                                                                                                            <div className="flex items-center gap-1.5">
                                                                                                                {m.sets.map((s, i) => (
                                                                                                                    <span key={i} className="flex items-center justify-center w-7 h-7 text-sm font-bold font-mono text-app dark:text-white bg-white dark:bg-black/20 rounded shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-slate-200/80 dark:border-white/10">
                                                                                                                        {s.team1}
                                                                                                                    </span>
                                                                                                                ))}
                                                                                                            </div>
                                                                                                        ) : <span className="text-sm font-bold text-app-muted dark:text-white/40">-</span>;
                                                                                                        const t2SetsDisplay = m.sets && m.sets.length > 0 ? (
                                                                                                            <div className="flex items-center gap-1.5">
                                                                                                                {m.sets.map((s, i) => (
                                                                                                                    <span key={i} className="flex items-center justify-center w-7 h-7 text-sm font-bold font-mono text-app dark:text-white bg-white dark:bg-black/20 rounded shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-slate-200/80 dark:border-white/10">
                                                                                                                        {s.team2}
                                                                                                                    </span>
                                                                                                                ))}
                                                                                                            </div>
                                                                                                        ) : <span className="text-sm font-bold text-app-muted dark:text-white/40">-</span>;
                                                                                                        
                                                                                                        return (
                                                                                                            <div key={idx} className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 sm:p-4 flex flex-col gap-2 border border-slate-200/60 dark:border-white/10 shadow-sm">
                                                                                                                <div className="flex items-center justify-between gap-3">
                                                                                                                    <span className={`text-sm ${m.winner === 'team1' ? 'font-bold text-app dark:text-white' : 'font-medium text-app/80 dark:text-white/80'} leading-tight flex-1`}>{t1Names}</span>
                                                                                                                    {t1SetsDisplay}
                                                                                                                </div>
                                                                                                                <div className="flex items-center gap-2">
                                                                                                                    <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/10"></div>
                                                                                                                    <span className="text-[10px] uppercase font-bold text-app-muted dark:text-white/40 tracking-wider">vs</span>
                                                                                                                    <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/10"></div>
                                                                                                                </div>
                                                                                                                <div className="flex items-center justify-between gap-3">
                                                                                                                    <span className={`text-sm ${m.winner === 'team2' ? 'font-bold text-app dark:text-white' : 'font-medium text-app/80 dark:text-white/80'} leading-tight flex-1`}>{t2Names}</span>
                                                                                                                    {t2SetsDisplay}
                                                                                                                </div>
                                                                                                            </div>
                                                                                                        );
                                                                                                    })}
                                                                                                </div>
                                                                                            </div>
                                                                                        );
                                                                                    });
                                                                                } else {
                                                                                    return (
                                                                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                                                                            {tournamentMatches.map((m, idx) => {
                                                                                                const t1Names = m.team1.map(pId => { const p = getPlayerById(pId); return p ? formatPlayerName(p) : pId; }).join(' / ');
                                                                                                const t2Names = m.team2.map(pId => { const p = getPlayerById(pId); return p ? formatPlayerName(p) : pId; }).join(' / ');
                                                                                                const t1SetsDisplay = m.sets && m.sets.length > 0 ? (
                                                                                                    <div className="flex items-center gap-1.5">
                                                                                                        {m.sets.map((s, i) => (
                                                                                                            <span key={i} className="flex items-center justify-center w-7 h-7 text-sm font-bold font-mono text-app dark:text-white bg-white dark:bg-black/20 rounded shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-slate-200/80 dark:border-white/10">
                                                                                                                {s.team1}
                                                                                                            </span>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                ) : <span className="text-sm font-bold text-app-muted dark:text-white/40">-</span>;
                                                                                                const t2SetsDisplay = m.sets && m.sets.length > 0 ? (
                                                                                                    <div className="flex items-center gap-1.5">
                                                                                                        {m.sets.map((s, i) => (
                                                                                                            <span key={i} className="flex items-center justify-center w-7 h-7 text-sm font-bold font-mono text-app dark:text-white bg-white dark:bg-black/20 rounded shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-slate-200/80 dark:border-white/10">
                                                                                                                {s.team2}
                                                                                                            </span>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                ) : <span className="text-sm font-bold text-app-muted dark:text-white/40">-</span>;
                                                                                                
                                                                                                return (
                                                                                                    <div key={idx} className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 sm:p-4 flex flex-col gap-2 border border-slate-200/60 dark:border-white/10 shadow-sm">
                                                                                                        <div className="flex items-center justify-between gap-3">
                                                                                                            <span className={`text-sm ${m.winner === 'team1' ? 'font-bold text-app dark:text-white' : 'font-medium text-app/80 dark:text-white/80'} leading-tight flex-1`}>{t1Names}</span>
                                                                                                            {t1SetsDisplay}
                                                                                                        </div>
                                                                                                        <div className="flex items-center gap-2">
                                                                                                            <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/10"></div>
                                                                                                            <span className="text-[10px] uppercase font-bold text-app-muted dark:text-white/40 tracking-wider">vs</span>
                                                                                                            <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/10"></div>
                                                                                                        </div>
                                                                                                        <div className="flex items-center justify-between gap-3">
                                                                                                            <span className={`text-sm ${m.winner === 'team2' ? 'font-bold text-app dark:text-white' : 'font-medium text-app/80 dark:text-white/80'} leading-tight flex-1`}>{t2Names}</span>
                                                                                                            {t2SetsDisplay}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    );
                                                                                }
                                                                            })()}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    )}
                                                    {day.status === 'scheduled' && !(day.type === TournamentType.TorneoASquadre && day.giornataName) && !(normalTournamentTotalDays > 1 && normalTournamentDayOrder.has(day.id)) && (
                                                        <div className="mt-3 flex items-center justify-between gap-3">
                                                            <button
                                                                onClick={() => {
                                                                    if (!expandedMatchdays.has(day.id)) {
                                                                        toggleExpandedMatchday(day.id);
                                                                    }
                                                                    if (day.type === TournamentType.TorneoASquadre) {
                                                                        onNavigateToTeamTournamentMatchdayResults?.(day.id);
                                                                    } else {
                                                                        onNavigateToResults?.(day.id);
                                                                    }
                                                                }}
                                                                className="inline-flex items-center px-3 py-1.5 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-full transition-colors cursor-pointer"
                                                            >
                                                                In Corso - Inserisci Risultati
                                                            </button>
                                                            <div className="flex flex-shrink-0 items-center gap-1.5">
                                                                <Button
                                                                    size="sm"
                                                                    variant="secondary"
                                                                    onClick={() => {
                                                                        if (day.type === TournamentType.TorneoASquadre && day.giornataName) {
                                                                            onNavigateToTeamTournamentMatchdayResults(day.id);
                                                                        } else if (day.type === TournamentType.TorneoASquadre) {
                                                                            onNavigateToTeamTournamentConfiguration(day.teamTournamentRootId || day.id);
                                                                        } else {
                                                                            handleEdit(day);
                                                                        }
                                                                    }}
                                                                    className={tournamentActionButtonClass}
                                                                    aria-label="Modifica Torneo"
                                                                >
                                                                    <PencilIcon />
                                                                </Button>
                                                                <Button size="sm" variant="secondary" onClick={() => handlePrint(day)} className={tournamentActionButtonClass} aria-label="Stampa Riepilogo"><PrintIcon /></Button>
                                                                <Button size="sm" variant="danger" onClick={() => handleDelete(day.id)} className={tournamentActionButtonClass} aria-label="Elimina Torneo"><TrashIcon /></Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className={`flex w-full flex-wrap justify-end gap-2 sm:w-auto sm:flex-nowrap sm:justify-start ${hasInlineActionRow ? 'hidden' : ''}`}>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => {
                                                            if (day.type === TournamentType.TorneoASquadre && day.giornataName) {
                                                                onNavigateToTeamTournamentMatchdayResults(day.id);
                                                            } else if (day.type === TournamentType.TorneoASquadre) {
                                                                onNavigateToTeamTournamentConfiguration(day.teamTournamentRootId || day.id);
                                                            } else {
                                                                handleEdit(day);
                                                            }
                                                        }}
                                                        className={tournamentActionButtonClass}
                                                        aria-label="Modifica Torneo"
                                                    >
                                                        <PencilIcon />
                                                    </Button>
                                                    <Button size="sm" variant="secondary" onClick={() => handlePrint(day)} className={tournamentActionButtonClass} aria-label="Stampa Riepilogo"><PrintIcon /></Button>
                                                    <Button size="sm" variant="danger" onClick={() => handleDelete(day.id)} className={tournamentActionButtonClass} aria-label="Elimina Torneo"><TrashIcon /></Button>
                                                </div>
                                            </div>
                                        )})}
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                    </>
                ) : (
                    <Card>
                        <p className="text-center py-8 text-gray-500">Nessun torneo attivo. Inserisci una nuova partita o sorteggia delle nuove coppie per registrarne uno.</p>
                    </Card>
                )}
            </div>

            <HIGSheet isOpen={seriesEditModalOpen} onClose={() => setSeriesEditModalOpen(false)} title="Modifica Serie">
                <form onSubmit={handleEditSeriesSubmit} className="space-y-4 px-4 pb-4">
                     <div>
                        <label htmlFor="edit-series-name" className="block text-sm font-medium text-gray-500 dark:text-gray-400">Nome Serie (si aggiornerà su tutte le giornate)</label>
                        <input
                            type="text"
                            id="edit-series-name"
                            value={seriesEditNewName}
                            onChange={(e) => setSeriesEditNewName(e.target.value)}
                            className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                            required
                            disabled={isSubmitting}
                        />
                    </div>
                    <div className="flex justify-end pt-4">
                        <Button type="button" variant="secondary" onClick={() => setSeriesEditModalOpen(false)} className="mr-2" disabled={isSubmitting}>Annulla</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Salvataggio...' : 'Rinomina Serie'}
                        </Button>
                    </div>
                </form>
            </HIGSheet>

            <HIGSheet isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Modifica Torneo">
                <form onSubmit={handleEditSubmit} className="space-y-4 px-4 pt-2">
                     <div>
                        <label htmlFor="edit-name" className="block text-sm font-medium text-gray-500 dark:text-gray-400">Nome Torneo</label>
                        <input
                            type="text"
                            id="edit-name"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                            required
                            disabled={isSubmitting}
                        />
                    </div>
                     <div>
                        <label htmlFor="edit-club" className="block text-sm font-medium text-gray-500 dark:text-gray-400">Nome Circolo</label>
                        <input
                            type="text"
                            id="edit-club"
                            value={editClub}
                            onChange={(e) => setEditClub(e.target.value)}
                            className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                            required
                            disabled={isSubmitting}
                        />
                    </div>
                    <div>
                        <label htmlFor="edit-date" className="block text-sm font-medium text-gray-500 dark:text-gray-400">Date</label>
                        <input
                            type="date"
                            id="edit-date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                            required
                            disabled={isSubmitting}
                        />
                    </div>
                    <div className="flex justify-end pt-4">
                        <Button type="button" variant="secondary" onClick={() => setIsEditModalOpen(false)} className="mr-2" disabled={isSubmitting}>Cancel</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Salvataggio...' : 'Salva Modifiche'}
                        </Button>
                    </div>
                </form>
            </HIGSheet>
            <HIGAlert
                isOpen={deleteAlert.isOpen}
                title={deleteAlert.type === 'series' ? "Elimina Serie" : "Elimina Evento"}
                message="Rimuovi tutti i match e i dati? Puoi scegliere di eliminare anche i giocatori 'isolati' che hanno partecipato solo a questo evento."
                isLoading={deleteAlert.isDeleting}
                loadingText={deleteAlert.loadingText}
                progressPercent={deleteAlert.progressPercent}
                actions={[
                    {
                        label: "Elimina Solo Torneo",
                        style: "default",
                        onPress: () => handleConfirmDelete(false)
                    },
                    {
                        label: "Elimina Torneo e Giocatori Non Più Attivi",
                        style: "destructive",
                        onPress: () => handleConfirmDelete(true)
                    },
                    {
                        label: "Annulla",
                        style: "cancel",
                        onPress: () => setDeleteAlert({ isOpen: false, type: null, idOrName: null, isDeleting: false, progressPercent: 0, loadingText: '' })
                    }
                ]}
            />
        </>
    );
};

export default TournamentsPage;
