
import React, { useState, useEffect, useMemo } from 'react';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import { calculateTournamentStandings, calculateFinalStandingsForRoundRobinFinali } from '../services/tournamentService.ts';
import { calculateTeamTournamentStandings } from '../services/teamTournamentService.ts';
import { printTournamentReport, printBeatTheBoxComplete, printBeatTheBoxBlank, printTorneoLiberoComplete, printGironiTournament, printTpraTournamentReport, printTeamTournamentRoundRobinSchedule, printTeamTournamentMatchdayCalendar, printTeamTournamentReport, printTeamTournamentMatchdayReport, printTournamentStatistics } from '../services/printService.ts';
import { calculateAllBoxStandings, createFinalsMatches, groupMatchesByPlayerSets } from '../services/beatTheBoxService.ts';
import { Tournament, TournamentType, Match, Player, TournamentStandingEntry, TeamTournamentFixture, TeamTournamentTeam, TeamTournamentMatchday } from '../types.ts';
import Card from '../components/ui/Card.tsx';
import Button from '../components/ui/Button.tsx';
import HIGButton from '../components/ui/HIGButton.tsx';
import MatchScoreInput from '../components/ui/MatchScoreInput.tsx';
import { HIGSheet } from '../components/ui/HIGSheet';
import { HIGAlert } from '../components/ui/HIGAlert';
import { TrashIcon, PrintIcon, PencilIcon, ChevronDownIcon } from '../components/ui/Icons.tsx';
import { getTournamentDisplayName } from '../utils/tournamentLabels.ts';
import { formatPlayerName } from '../utils/format.ts';
import TpraBracketView from '../components/TpraBracketView.tsx';
import { normalizeTournamentRounds } from '../utils/tournamentRounds.ts';
import { MATCH_OUTCOME, outcomeErrorMessage, validateMatchOutcome } from '../utils/matchOutcome.js';
import { showHIGAlert } from '../utils/higDialogService.ts';
import { buildTournamentStats } from './StatistichePage.tsx';

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


const parseMatchSets = (raw: any): { team1: number; team2: number }[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
};

// Helper functions for Beat the Box
const processBeatTheBoxData = (matches: Match[], getPlayerById: (id: string) => Player | undefined, tournament?: Tournament) => {
    // Use player-set grouping (order-independent) to separate box matches from phase matches
    const { boxes: groupedBoxes, phaseMatches: rawPhaseMatches } = groupMatchesByPlayerSets(matches);

    // Deduplicate phase matches to fix old DBs with duplicated finals
    const seenPhaseMatches = new Set<string>();
    const dedupedPhaseMatches = rawPhaseMatches.filter(m => {
        const signature = [...m.team1].sort().join(',') + '|' + [...m.team2].sort().join(',');
        const signatureReverse = [...m.team2].sort().join(',') + '|' + [...m.team1].sort().join(',');
        if (seenPhaseMatches.has(signature) || seenPhaseMatches.has(signatureReverse)) return false;
        seenPhaseMatches.add(signature);
        return true;
    });

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
    const boxStandings = calculateAllBoxStandings(boxMatchesWithWinner, boxes);

    // RIGENERAZIONE A RUNTIME DEI PLAYOFF per tornei in corso senza playoff salvati a DB
    let remainingMatches = [...dedupedPhaseMatches];

    if (tournament && tournament.status === 'scheduled' && remainingMatches.length === 0) {
        const playoffType = (tournament.playoffType as any) || 'finals_only';
        if (playoffType !== 'no_finals') {
            const generated = createFinalsMatches(numBoxes, boxStandings, tournament.date, undefined, playoffType);
            const generatedSemis = generated.semifinals || [];
            const generatedFinals = generated.finals || [];

            const enrichGenerated = (m: any, idx: number, phaseName: string) => ({
                id: `generated-${phaseName}-${idx}`,
                tournamentId: tournament.id,
                date: tournament.date,
                team1: m.team1,
                team2: m.team2,
                sets: m.sets || [{ team1: 0, team2: 0 }],
                winner: null,
                phase: m.phase || phaseName,
                roundNumber: m.roundNumber || 4,
                createdAt: new Date().toISOString()
            } as Match);

            const enrichedSemis = generatedSemis.map((m: any, i: number) => enrichGenerated(m, i, 'semifinal'));
            const enrichedFinals = generatedFinals.map((m: any, i: number) => {
                let phase = 'consolation';
                if (generatedSemis.length > 0 && generatedFinals.length === 1) {
                    // If we generated semifinals but only 1 final, it means we don't know the finalists yet, so it's the consolation match.
                    phase = 'consolation';
                } else {
                    phase = i === 0 ? 'final_1_2' : (i === 1 ? 'final_3_4' : 'consolation');
                }
                return enrichGenerated(m, i, phase);
            });

            remainingMatches = [...enrichedSemis, ...enrichedFinals];
        }
    }

    // Separate semifinals and finals using the robust algorithm from MatchesPage
    let semifinalMatches: Match[] = [];
    let finalMatches: Match[] = [];

    if (remainingMatches.some(m => m.phase && m.phase !== 'ordinary')) {
        // Nuova logica basata sulla proprietà phase
        semifinalMatches = remainingMatches.filter(m => m.phase === 'semifinal');
        const phaseOrder: { [key: string]: number } = { 'final_1_2': 0, 'final_3_4': 1, 'consolation': 2, 'consolation_final': 3, 'finalina': 4 };
        finalMatches = remainingMatches
            .filter(m => m.phase && m.phase !== 'semifinal' && m.phase !== 'ordinary')
            .sort((a, b) => (phaseOrder[a.phase || ''] ?? 99) - (phaseOrder[b.phase || ''] ?? 99));
    } else {
        // Fallback per vecchi tornei pre-v6 senza phase
        if (remainingMatches.length >= 4) {
            const allPlayerOccurrences = new Map<string, number>();
            remainingMatches.forEach(m => {
                m.team1.concat(m.team2).forEach(p => {
                    allPlayerOccurrences.set(p, (allPlayerOccurrences.get(p) || 0) + 1);
                });
            });

            let consolazioneMatch: Match | null = null;
            const mainMatches: Match[] = [];

            remainingMatches.forEach(m => {
                // Partita Consolazione players only appear once across all phase matches
                const isConsolazione = m.team1.concat(m.team2).every(p => allPlayerOccurrences.get(p) === 1);
                if (isConsolazione) {
                    consolazioneMatch = m;
                } else {
                    mainMatches.push(m);
                }
            });

            if (mainMatches.length === 4) {
                let foundSemis = false;
                for (let i = 0; i < 4; i++) {
                    for (let j = i + 1; j < 4; j++) {
                        const s1 = mainMatches[i];
                        const s2 = mainMatches[j];

                        if (!s1.winner || !s2.winner || s1.winner === 'draw' || s2.winner === 'draw') continue;

                        const w1 = s1.winner === 'team1' ? s1.team1 : s1.team2;
                        const w2 = s2.winner === 'team1' ? s2.team1 : s2.team2;
                        const l1 = s1.winner === 'team1' ? s1.team2 : s1.team1;
                        const l2 = s2.winner === 'team1' ? s2.team2 : s2.team1;

                        const isMatchBetween = (m: Match, tA: string[], tB: string[]) => {
                            const m1 = [...m.team1].sort().join(',');
                            const m2 = [...m.team2].sort().join(',');
                            const a = [...tA].sort().join(',');
                            const b = [...tB].sort().join(',');
                            return (m1 === a && m2 === b) || (m1 === b && m2 === a);
                        };

                        const otherMatches = mainMatches.filter(m => m !== s1 && m !== s2);
                        const finale12 = otherMatches.find(m => isMatchBetween(m, w1, w2));
                        const finale34 = otherMatches.find(m => isMatchBetween(m, l1, l2));

                        if (finale12 && finale34) {
                            semifinalMatches = [s1, s2];
                            finalMatches = [finale12, finale34];
                            foundSemis = true;
                            break;
                        }
                    }
                    if (foundSemis) break;
                }

                if (!foundSemis) {
                    semifinalMatches = mainMatches.slice(0, 2);
                    finalMatches = mainMatches.slice(2);
                }
            } else {
                semifinalMatches = remainingMatches.slice(0, 2);
                finalMatches = remainingMatches.slice(2);
            }

            if (consolazioneMatch && finalMatches.length === 2) {
                finalMatches.push(consolazioneMatch);
            }
        } else if (remainingMatches.length === 2) {
            if (tournament?.playoffType === 'finals_only' || (numBoxes === 2 && tournament?.playoffType !== 'semifinals')) {
                finalMatches = remainingMatches;
            } else {
                semifinalMatches = remainingMatches;
            }
        } else {
            finalMatches = remainingMatches;
        }
    }

    // Calculate games won/lost for each player
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

    // Crea classifica individuale basata su statistiche
    const individualStandings: { player: Player; eloChange: number; gamesWon: number; gamesLost: number; winPercentage: number; rank: number }[] = [];

    boxes.forEach(box => {
        box.players.forEach(player => {
            const stats = playerStats.get(player.id) || { gamesWon: 0, gamesLost: 0 };
            const winPercentage = (stats.gamesWon + stats.gamesLost) > 0
                ? (stats.gamesWon / (stats.gamesWon + stats.gamesLost)) * 100
                : 0;

            individualStandings.push({
                player,
                eloChange: 0,
                gamesWon: stats.gamesWon,
                gamesLost: stats.gamesLost,
                winPercentage,
                rank: 0
            });
        });
    });

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
    const { tournaments, matches, players, deleteTournament, deleteTournamentSeries, getPlayerById, updateTournament, updateTournamentSeriesName, loading, eloHistory, getTeamTournamentConfig, getTeamTournamentTeams, getTeamTournamentFixtures, getTeamTournamentMatchdayByTournamentDayId, getTeamTournamentMatchdays, updateTournamentMatches, completeTournament } = usePadelStore();
    
    // State for Single Match Edit Modal
    const [selectedSingleMatch, setSelectedSingleMatch] = useState<Match | null>(null);
    const [singleMatchSets, setSingleMatchSets] = useState<{ team1: number; team2: number }[]>([{ team1: 0, team2: 0 }]);
    const [isSingleMatchModalOpen, setIsSingleMatchModalOpen] = useState(false);
    const [isSavingSingleMatch, setIsSavingSingleMatch] = useState(false);
    const [singleMatchError, setSingleMatchError] = useState<string | null>(null);

    const handleOpenSingleMatchModal = (m: Match) => {
        if (!Array.isArray(m?.team1) || !Array.isArray(m?.team2)) {
            console.warn('Partita incompleta: apertura del modal risultato ignorata.', m);
            return;
        }
        setSelectedSingleMatch(m);
        const parsed = parseMatchSets(m.sets);
        setSingleMatchSets(parsed.length > 0 ? parsed : [{ team1: 0, team2: 0 }]);
        setSingleMatchError(null);
        setIsSingleMatchModalOpen(true);
    };

    const handleSaveSingleMatch = async () => {
        if (!selectedSingleMatch) return;
        const parentTournament = tournaments.find(t => t.id === selectedSingleMatch.tournamentId);
        const outcome = validateMatchOutcome({
            sets: singleMatchSets,
            tournamentType: parentTournament?.type,
            phase: selectedSingleMatch.phase,
        });
        if (outcome.status === MATCH_OUTCOME.NOT_ENTERED || outcome.status === MATCH_OUTCOME.FORBIDDEN_DRAW || outcome.status === MATCH_OUTCOME.INVALID_SCORE) {
            setSingleMatchError(outcomeErrorMessage(outcome.status));
            return;
        }
        setSingleMatchError(null);
        setIsSavingSingleMatch(true);
        try {
            await updateTournamentMatches([
                { matchId: selectedSingleMatch.id, sets: singleMatchSets, winner: outcome.winner }
            ]);

            // I tornei multifase non possono essere chiusi contando soltanto le
            // partite attualmente presenti: dopo gironi/box/round robin devono
            // ancora essere create e disputate le rispettive fasi conclusive.
            const isMultiPhaseTournament = parentTournament && [
                TournamentType.GironiFaseFinale,
                TournamentType.RoundRobinFinali,
                TournamentType.BeatTheBox,
            ].includes(parentTournament.type);
            if (parentTournament && parentTournament.status !== 'completed' && !isMultiPhaseTournament) {
                const tournamentMatches = matches.filter(m => m.tournamentId === parentTournament.id);
                const allOtherDone = tournamentMatches
                    .filter(m => m.id !== selectedSingleMatch.id)
                    .every(m => m.winner !== null);
                if (allOtherDone) {
                    await completeTournament(parentTournament.id);
                }
            }

            setIsSingleMatchModalOpen(false);
            setSelectedSingleMatch(null);
            showHIGAlert('Risultato salvato con successo!', 'Successo');
        } catch (err) {
            console.error('Error saving single match:', err);
            setSingleMatchError('Errore durante il salvataggio. Riprova più tardi.');
        } finally {
            setIsSavingSingleMatch(false);
        }
    };
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
            const hasAnyResults = tournamentMatches.some(m => m.winner || (m.sets && m.sets.some(s => Number(s.team1 || 0) > 0 || Number(s.team2 || 0) > 0)));
            if (!hasAnyResults) {
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
                
                printBeatTheBoxBlank({ ...tournament, name: displayName } as any, boxes, getPlayerById as any, (tournament as any).playoffType);
            } else {
                // Print complete report for completed or in-progress tournaments with scores
                const { boxes, boxStandings, semifinalMatches, finalMatches, individualStandings } = processBeatTheBoxData(tournamentMatches, getPlayerById as any, tournament);
                
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
        
        const playoffType = tournament.roundRobinPlayoffType || tournament.round_robin_playoff_type || 'finals_only';
        let expectedPlayoffMatches = 0;
        if (tournament.status === 'completed') {
            if (playoffType === 'semifinals') expectedPlayoffMatches = 4;
            else if (playoffType === 'finals_only') expectedPlayoffMatches = 2;
        }
        const roundRobinMatchCountVal = tournament.type === TournamentType.RoundRobinFinali && tournamentMatches.length > expectedPlayoffMatches
            ? tournamentMatches.length - expectedPlayoffMatches
            : undefined;

        let standings: TournamentStandingEntry[];
        if (tournament.type === TournamentType.Americano) {
            standings = calculateAmericanoStandings(tournamentMatches, tournament.americanoScoringType);
        } else if (tournament.type === TournamentType.RoundRobinFinali && roundRobinMatchCountVal) {
            standings = calculateFinalStandingsForRoundRobinFinali(tournamentMatches, roundRobinMatchCountVal, getPlayerById as any);
        } else {
            standings = calculateTournamentStandings(tournamentMatches, getPlayerById as any);
        }
        
        // For Americano tournaments, we need to get the americanoFields parameter
        // Use the actual americanoFields from the tournament data
        const americanoFields = tournament.type === TournamentType.Americano ? tournament.americanoFields : undefined;
        
        // For Round Robin + Finali tournaments, calculate the number of round robin matches
        const roundRobinMatchCount = roundRobinMatchCountVal;
        
        // Handle Eliminazione Diretta (TPRA) & Gironi + Fase Finale tournaments
        if (tournament.type === TournamentType.EliminazioneDiretta) {
            printTpraTournamentReport(tournament, tournamentMatches, getPlayerById as any, displayName);
        } else if (tournament.type === TournamentType.GironiFaseFinale) {
            printGironiTournament(tournament, tournamentMatches, getPlayerById, displayName);
        } else {
            printTournamentReport(tournament, standings, tournamentMatches, getPlayerById, americanoFields, tournament.americanoScoringType, roundRobinMatchCount, displayName, tournament.roundRobinFields);
        }
    };
    const handlePrintSeries = (days: Tournament[]) => {
        if (!days || days.length === 0) return;
        const stats = buildTournamentStats(days[0], tournaments, matches, players, getPlayerById);
        if (!stats) {
            showHIGAlert('Non ci sono ancora risultati da includere nelle statistiche di questo torneo.');
            return;
        }
        printTournamentStatistics(stats);
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
            showHIGAlert("Errore nell'aggiornamento del nome della serie.");
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
                    showHIGAlert('Configurazione torneo non trovata.');
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
                showHIGAlert('Configurazione torneo non trovata.');
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
                        <Button onClick={onOpenDrawLauncher} size="lg" className="w-full flex-shrink-0 !bg-gradient-to-r !from-sky-500 !to-blue-600 !text-white shadow-md shadow-sky-500/25 !font-bold sm:w-auto">
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
                                bodyClassName="!overflow-visible !rounded-none !border-0 !bg-transparent !shadow-none !backdrop-blur-none [&>div]:!p-0"
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
                                                        onNavigateToTeamTournamentConfiguration?.(teamTournamentRootId || tournamentDays[0].id);
                                                    }}
                                                    className="!px-3 !py-1.5 !text-sm"
                                                >
                                                    + Completa Configurazione
                                                </Button>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (teamTournamentRootId) onNavigateToTeamTournamentConfiguration?.(teamTournamentRootId);
                                                        }}
                                                        className={tournamentActionButtonClass}
                                                        aria-label="Modifica torneo a squadre"
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
                                                        aria-label="Stampa torneo a squadre"
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
                                                        aria-label="Elimina torneo a squadre"
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
                                                                    onNavigateToTeamTournamentSummary?.(teamTournamentRootId);
                                                                } else if (hasActivePlayoffStage) {
                                                                    if (scheduledPlayoffFixtures[0]?.tournamentDayId) {
                                                                        onNavigateToTeamTournamentMatchdayResults?.(scheduledPlayoffFixtures[0].tournamentDayId);
                                                                    } else {
                                                                        onNavigateToNewTeamTournamentMatchday?.(teamTournamentRootId);
                                                                    }
                                                                } else {
                                                                    onNavigateToNewTeamTournamentMatchday?.(teamTournamentRootId);
                                                                }
                                                            }
                                                        } else {
                                                            onNavigateToNewGiornata?.(displayName);
                                                        }
                                                    }}
                                                    className="!px-3 !py-1.5 !text-sm"
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
                                                                aria-label="Modifica torneo a squadre"
                                                            >
                                                                <PencilIcon />
                                                            </Button>
                                                            <Button size="sm" variant="secondary" onClick={() => handlePrint(teamTournamentRoot)} aria-label="Stampa torneo a squadre" className={`${tournamentActionButtonOnDarkClass} !p-1.25 sm:!p-1.5`}><PrintIcon /></Button>
                                                            <Button size="sm" variant="danger" onClick={() => handleDelete(teamTournamentRoot.id)} className={`${tournamentActionButtonClass} !p-1.25 sm:!p-1.5`} aria-label="Elimina torneo a squadre"><TrashIcon /></Button>
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
                                                                                        onClick={() => onNavigateToTeamTournamentMatchdayResults?.(f.tournamentDayId!)}
                                                                                        className="!px-2.5 !py-1.25 !text-[11px] sm:!px-3 sm:!py-1.5 sm:!text-xs"
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
                                                                                        onClick={() => onNavigateToTeamTournamentFixture?.(teamTournamentRootId, f.id)}
                                                                                        disabled={!ready}
                                                                                        className="!px-2.5 !py-1.25 !text-[11px] sm:!px-3 sm:!py-1.5 sm:!text-xs disabled:!border-slate-200/45 disabled:!bg-slate-100/80 disabled:!text-slate-400 dark:disabled:!border-white/10 dark:disabled:!bg-white/15 dark:disabled:!text-white/50"
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
                                                        <Button size="sm" variant="secondary" onClick={() => handlePrintSeries(visibleTournamentDays)} aria-label="Stampa statistiche torneo" className={`${tournamentActionButtonOnDarkClass} !p-1.25 sm:!p-1.5`}><PrintIcon /></Button>
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
                                                                            onClick={() => onNavigateToTeamTournamentMatchdayResults?.(day.id)}
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
                                                                                onNavigateToTeamTournamentMatchdayResults?.(day.id);
                                                                            } else if (day.type === TournamentType.TorneoASquadre) {
                                                                                onNavigateToTeamTournamentConfiguration?.(day.teamTournamentRootId || day.id);
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
                                                                                const matchSets = parseMatchSets(sm.sets);
                                                                                const hasScores = matchSets.length > 0 && matchSets.some(s => Number(s.team1) > 0 || Number(s.team2) > 0);
                                                                                const isCompleted = !!sm.winner || hasScores;

                                                                                const t1SetsDisplay = hasScores ? (
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        {matchSets.map((s, i) => (
                                                                                            <span key={i} className="flex items-center justify-center w-7 h-7 text-sm font-bold font-mono text-app dark:text-white bg-white dark:bg-black/20 rounded shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-slate-200/80 dark:border-white/10">
                                                                                                {s.team1}
                                                                                            </span>
                                                                                        ))}
                                                                                    </div>
                                                                                ) : <span className="text-sm font-bold text-app-muted dark:text-white/40">-</span>;
                                                                                
                                                                                const t2SetsDisplay = hasScores ? (
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        {matchSets.map((s, i) => (
                                                                                            <span key={i} className="flex items-center justify-center w-7 h-7 text-sm font-bold font-mono text-app dark:text-white bg-white dark:bg-black/20 rounded shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-slate-200/80 dark:border-white/10">
                                                                                                {s.team2}
                                                                                            </span>
                                                                                        ))}
                                                                                    </div>
                                                                                ) : <span className="text-sm font-bold text-app-muted dark:text-white/40">-</span>;
                                                                                return (
                                                                                    <div 
                                                                                        key={idx} 
                                                                                        onClick={() => !sm.cancelled && onNavigateToTeamTournamentMatchdayResults(day.id)}
                                                                                        title={sm.cancelled ? 'Partita Annullata' : ((sm.team1Players || []).length === 0 || (sm.team2Players || []).length === 0 ? 'Definisci la partita scegliendo i giocatori delle squadre' : 'Inserisci o modifica il risultato')}
                                                                                        className={`rounded-xl p-3 sm:p-4 flex flex-col gap-2 shadow-sm transition-all active:scale-[0.99] ${
                                                                                            sm.cancelled
                                                                                                ? 'bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/10'
                                                                                                : isCompleted
                                                                                                    ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-500/50 dark:border-emerald-500/40 hover:border-emerald-500/80 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/40 cursor-pointer'
                                                                                                    : 'bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 hover:border-sky-500/50 hover:bg-sky-50/20 dark:hover:bg-white/[0.08] cursor-pointer'
                                                                                        }`}
                                                                                    >
                                                                                        {sm.cancelled ? (
                                                                                            <div className="text-center text-sm font-semibold text-orange-600 dark:text-orange-400 py-3">Partita Annullata</div>
                                                                                        ) : (
                                                                                            <>
                                                                                                {isCompleted && (
                                                                                                    <div className="flex items-center justify-between pb-1.5 mb-0.5 border-b border-emerald-500/30 dark:border-emerald-400/30">
                                                                                                        <span className="text-[10px] font-extrabold tracking-wider uppercase text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                                                                                            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                                                                                                            RISULTATO INSERITO
                                                                                                        </span>
                                                                                                        <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 font-medium">Modifica</span>
                                                                                                    </div>
                                                                                                )}
                                                                                                <div className="flex items-center justify-between gap-3">
                                                                                                    <span className={`text-sm ${sm.winner === 'team1' ? 'font-bold text-emerald-900 dark:text-emerald-200' : isCompleted ? 'font-medium text-slate-700 dark:text-slate-300' : 'font-normal text-gray-500 dark:text-gray-400'} leading-tight flex-1`}>{t1Name}</span>
                                                                                                    {t1SetsDisplay}
                                                                                                </div>
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/10"></div>
                                                                                                    <span className="text-[10px] uppercase font-bold text-app-muted dark:text-white/40 tracking-wider">vs</span>
                                                                                                    <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/10"></div>
                                                                                                </div>
                                                                                                <div className="flex items-center justify-between gap-3">
                                                                                                    <span className={`text-sm ${sm.winner === 'team2' ? 'font-bold text-emerald-900 dark:text-emerald-200' : isCompleted ? 'font-medium text-slate-700 dark:text-slate-300' : 'font-normal text-gray-500 dark:text-gray-400'} leading-tight flex-1`}>{t2Name}</span>
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
                                                                                    } else {
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
                                                                                    onNavigateToTeamTournamentMatchdayResults?.(day.id);
                                                                                } else if (day.type === TournamentType.TorneoASquadre) {
                                                                                    onNavigateToTeamTournamentConfiguration?.(day.teamTournamentRootId || day.id);
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
                                                                                if (day.type === TournamentType.Americano || day.type === TournamentType.TorneOtto) {
                                                                                    const allPlayersIds = new Set(tournamentMatches.flatMap(m => [...(m.team1 || []), ...(m.team2 || [])]));
                                                                                    const numPlayers = allPlayersIds.size;
                                                                                    const matchesPerRound = Math.min(day.americanoFields || 2, Math.floor(numPlayers / 4));
                                                                                    const normalizedRounds = normalizeTournamentRounds(tournamentMatches, day.type, {
                                                                                        fields: matchesPerRound,
                                                                                        participantIds: Array.from(allPlayersIds),
                                                                                    });
                                                                                    const roundsMap = new Map(normalizedRounds.map(round => [
                                                                                        round.roundNumber,
                                                                                        round.matches.map(item => item.match),
                                                                                    ]));
                                                                                    
                                                                                    const allPlayers = Array.from(allPlayersIds).map(id => getPlayerById(id)).filter(Boolean) as Player[];

                                                                                    const totalRoundsCount = roundsMap.size;
                                                                                    const isRoundRobin = day.type === TournamentType.RoundRobinFinali;
                                                                                    const isHomeAway = day.roundRobinHomeAway || false;

                                                                                    return Array.from(roundsMap.entries()).sort((a,b)=>a[0]-b[0]).map(([r, matchesForRound]) => {
                                                                                        let roundTitle = `Turno ${r}`;
                                                                                        if (isRoundRobin) {
                                                                                            if (isHomeAway && totalRoundsCount > 1 && totalRoundsCount % 2 === 0) {
                                                                                                const half = totalRoundsCount / 2;
                                                                                                if (r <= half) {
                                                                                                    roundTitle = `${r}ª Giornata di Andata`;
                                                                                                } else {
                                                                                                    roundTitle = `${r - half}ª Giornata di Ritorno`;
                                                                                                }
                                                                                            } else {
                                                                                                roundTitle = `Giornata ${r} di ${totalRoundsCount}`;
                                                                                            }
                                                                                        }

                                                                                        const playersInRound = new Set(matchesForRound.flatMap(m => [...(m.team1 || []), ...(m.team2 || [])]));
                                                                                        const restingPlayers = allPlayers.filter(p => !playersInRound.has(p.id));
                                                                                        
                                                                                        return (
                                                                                            <div key={`round-${r}`} className="mb-4">
                                                                                                <div className="flex justify-between items-start mb-2">
                                                                                                    <h4 className="font-semibold text-gray-800 dark:text-gray-200">{roundTitle}</h4>
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
                                                                                                        const matchSets = parseMatchSets(m.sets);
                                                                                                        const hasScores = matchSets.length > 0 && matchSets.some(s => Number(s.team1) > 0 || Number(s.team2) > 0);
                                                                                                        const isCompleted = !!m.winner || hasScores;

                                                                                                        const t1SetsDisplay = hasScores ? (
                                                                                                            <div className="flex items-center gap-1.5">
                                                                                                                {matchSets.map((s, i) => (
                                                                                                                    <span key={i} className="flex items-center justify-center w-7 h-7 text-sm font-bold font-mono text-app dark:text-white bg-white dark:bg-black/20 rounded shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-slate-200/80 dark:border-white/10">
                                                                                                                        {s.team1}
                                                                                                                    </span>
                                                                                                                ))}
                                                                                                            </div>
                                                                                                        ) : <span className="text-sm font-bold text-app-muted dark:text-white/40">-</span>;
                                                                                                        const t2SetsDisplay = hasScores ? (
                                                                                                            <div className="flex items-center gap-1.5">
                                                                                                                {matchSets.map((s, i) => (
                                                                                                                    <span key={i} className="flex items-center justify-center w-7 h-7 text-sm font-bold font-mono text-app dark:text-white bg-white dark:bg-black/20 rounded shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-slate-200/80 dark:border-white/10">
                                                                                                                        {s.team2}
                                                                                                                    </span>
                                                                                                                ))}
                                                                                                            </div>
                                                                                                        ) : <span className="text-sm font-bold text-app-muted dark:text-white/40">-</span>;
                                                                                                        
                                                                                                        return (
                                                                                                            <div 
                                                                                                                key={idx} 
                                                                                                                onClick={() => handleOpenSingleMatchModal(m)}
                                                                                                                title="Clicca per inserire o modificare il risultato"
                                                                                                                className={`rounded-xl p-3 sm:p-4 flex flex-col gap-2 shadow-sm cursor-pointer transition-all active:scale-[0.99] ${
                                                                                                                    isCompleted
                                                                                                                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-500/50 dark:border-emerald-500/40 hover:border-emerald-500/80 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/40'
                                                                                                                        : 'bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 hover:border-sky-500/50 hover:bg-sky-50/20 dark:hover:bg-white/[0.08]'
                                                                                                                }`}
                                                                                                            >
                                                                                                                {isCompleted && (
                                                                                                                    <div className="flex items-center justify-between pb-1.5 mb-0.5 border-b border-emerald-500/30 dark:border-emerald-400/30">
                                                                                                                        <span className="text-[10px] font-extrabold tracking-wider uppercase text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                                                                                                            <svg className="w-3.5 h-3.5 fill-current text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                                                                                                                            RISULTATO INSERITO
                                                                                                                        </span>
                                                                                                                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">Modifica</span>
                                                                                                                    </div>
                                                                                                                )}
                                                                                                                <div className="flex items-center justify-between gap-3">
                                                                                                                    <span className={`text-sm ${m.winner === 'team1' ? 'font-bold text-emerald-900 dark:text-emerald-200' : isCompleted ? 'font-medium text-slate-700 dark:text-slate-300' : 'font-medium text-app/80 dark:text-white/80'} leading-tight flex-1`}>{t1Names}</span>
                                                                                                                    {t1SetsDisplay}
                                                                                                                </div>
                                                                                                                <div className="flex items-center gap-2">
                                                                                                                    <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/10"></div>
                                                                                                                    <span className="text-[10px] uppercase font-bold text-app-muted dark:text-white/40 tracking-wider">vs</span>
                                                                                                                    <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/10"></div>
                                                                                                                </div>
                                                                                                                <div className="flex items-center justify-between gap-3">
                                                                                                                    <span className={`text-sm ${m.winner === 'team2' ? 'font-bold text-emerald-900 dark:text-emerald-200' : isCompleted ? 'font-medium text-slate-700 dark:text-slate-300' : 'font-medium text-app/80 dark:text-white/80'} leading-tight flex-1`}>{t2Names}</span>
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
                                                                                    let initialMatches: Match[] = [];
                                                                                    let playoffMatches: Match[] = [];
                                                                                    let renderError: string | null = null;

                                                                                    try {
                                                                                        if (day.type === TournamentType.BeatTheBox) {
                                                                                            const { boxes: groupedBoxes, phaseMatches: rawPhaseMatches } = groupMatchesByPlayerSets(tournamentMatches);
                                                                                            const enrichedBoxMatches: Match[] = [];
                                                                                            groupedBoxes.forEach((bMatches, boxNum) => {
                                                                                                bMatches.forEach(m => {
                                                                                                    enrichedBoxMatches.push({
                                                                                                        ...m,
                                                                                                        groupNumber: boxNum
                                                                                                    });
                                                                                                });
                                                                                            });
                                                                                            initialMatches = enrichedBoxMatches;
                                                                                            playoffMatches = rawPhaseMatches;
                                                                                        } else {
                                                                                            // Fasi knockout esplicite (indipendenti dal tipo di torneo)
                                                                                            const KNOCKOUT_PHASES = ["quarterfinal", "semifinal", "final_1_2", "final_3_4", "final", "finalina", "consolation", "consolation_final", "playoff"];
                                                                                            const isPlayoffMatch = (m: Match) => {
                                                                                                if (m.phase && KNOCKOUT_PHASES.includes(m.phase)) return true;
                                                                                                // GironiFaseFinale: i gironi hanno phase='group' o groupNumber > 0
                                                                                                if (day.type === TournamentType.GironiFaseFinale) {
                                                                                                    if (m.phase === 'group') return false;
                                                                                                    if (m.groupNumber && m.groupNumber > 0) return false;
                                                                                                    return false;
                                                                                                }
                                                                                                return false;
                                                                                            };

                                                                                            initialMatches = tournamentMatches.filter(m => !isPlayoffMatch(m));
                                                                                            playoffMatches = tournamentMatches.filter(m => isPlayoffMatch(m));
                                                                                        }
                                                                                    } catch (e: any) {
                                                                                        console.error("Error processing tournament matches:", e);
                                                                                        renderError = e.message || String(e);
                                                                                    }

                                                                                    const getMatchLabel = (m: Match, sectionMatches: Match[], idx: number): string => {
                                                                                        const phaseMatchIdx = sectionMatches
                                                                                            .filter(x => x.phase === m.phase)
                                                                                            .findIndex(x => x.id === m.id) + 1;
                                                                                        if (m.phase === "quarterfinal") return `Quarto di Finale ${phaseMatchIdx}`;
                                                                                        if (m.phase === "semifinal") return `Semifinale ${phaseMatchIdx}`;
                                                                                        if (m.phase === "final_1_2") return "Finale 1°-2° Posto";
                                                                                        if (m.phase === "final_3_4") return "Finale 3°-4° Posto";
                                                                                        if (m.phase === "finalina" || m.phase === "consolation_final") return "Finalina 3°-4°";
                                                                                        if (m.phase === "consolation") {
                                                                                            return `Partita Consolazione`;
                                                                                        }
                                                                                        if (day.type === TournamentType.BeatTheBox) {
                                                                                            if (!m.groupNumber) {
                                                                                                // Playoff match senza groupNumber - etichetta basata su phase
                                                                                                if (m.phase === 'semifinal') return `Semifinale ${phaseMatchIdx}`;
                                                                                                if (m.phase === 'final_1_2') return 'Finale 1°-2° Posto';
                                                                                                if (m.phase === 'final_3_4') return 'Finale 3°-4° Posto';
                                                                                                return `Playoff - Partita ${phaseMatchIdx}`;
                                                                                            }
                                                                                            // Indice corretto dentro il box specifico
                                                                                            const boxMatches = sectionMatches.filter(x => x.groupNumber === m.groupNumber);
                                                                                            const boxIdx = boxMatches.findIndex(x => x.id === m.id) + 1;
                                                                                            return `Box ${m.groupNumber} - Partita ${boxIdx}`;
                                                                                        }
                                                                                        if (day.type === TournamentType.GironiFaseFinale) {
                                                                                            const letter = String.fromCharCode(64 + (m.groupNumber || 1));
                                                                                            return `Girone ${letter} - Turno ${m.roundNumber || idx + 1}`;
                                                                                        }
                                                                                        if (day.type === TournamentType.RoundRobinFinali || day.type === TournamentType.Americano || day.type === TournamentType.TorneOtto) {
                                                                                            const fieldsCount = (day.type === TournamentType.RoundRobinFinali ? day.roundRobinFields : day.americanoFields) || 2;
                                                                                            const normalizedRounds = normalizeTournamentRounds(sectionMatches, day.type, {
                                                                                                fields: fieldsCount,
                                                                                                homeAway: day.roundRobinHomeAway || false,
                                                                                            });
                                                                                            for (const round of normalizedRounds) {
                                                                                                const item = round.matches.find(x => x.match.id === m.id);
                                                                                                if (item) {
                                                                                                    const prefix = day.type === TournamentType.RoundRobinFinali ? 'GIORNATA' : 'TURNO';
                                                                                                    return `${prefix} ${round.roundNumber} - CAMPO ${item.courtNumber}`;
                                                                                                }
                                                                                            }
                                                                                        }
                                                                                        return `Partita ${idx + 1}`;
                                                                                    };

                                                                                    const getMatchBadgeClass = (m: Match): string => {
                                                                                        if (m.phase === "final_1_2" || m.phase === "final_3_4" || m.phase === "finalina" || m.phase === "consolation_final")
                                                                                            return "text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border-purple-200/60 dark:border-purple-800/60";
                                                                                        if (m.phase === "quarterfinal" || m.phase === "semifinal" || m.phase === "consolation")
                                                                                            return "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 border-sky-200/60 dark:border-sky-800/60";
                                                                                        if (day.type === TournamentType.BeatTheBox && !m.groupNumber)
                                                                                            return "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 border-sky-200/60 dark:border-sky-800/60";
                                                                                        return "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border-blue-200/60 dark:border-blue-800/60";
                                                                                    };

                                                                                    const renderMatchCard = (m: Match, idx: number, sectionMatches: Match[]) => {
                                                                                        const t1Names = Array.isArray(m.team1) ? m.team1.map(pId => { const p = getPlayerById(pId); return p ? formatPlayerName(p) : pId; }).join(" / ") : '';
                                                                                        const t2Names = Array.isArray(m.team2) ? m.team2.map(pId => { const p = getPlayerById(pId); return p ? formatPlayerName(p) : pId; }).join(" / ") : '';
                                                                                        const matchSets = parseMatchSets(m.sets);
                                                                                        const hasScores = matchSets.length > 0 && matchSets.some(s => Number(s.team1) > 0 || Number(s.team2) > 0);
                                                                                        const isCompleted = !!m.winner || hasScores;

                                                                                        const t1SetsDisplay = hasScores ? (
                                                                                            <div className="flex items-center gap-1.5">
                                                                                                {matchSets.map((s, i) => (
                                                                                                    <span key={i} className="flex items-center justify-center w-7 h-7 text-sm font-bold font-mono text-app dark:text-white bg-white dark:bg-black/20 rounded shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-slate-200/80 dark:border-white/10">
                                                                                                        {s.team1}
                                                                                                    </span>
                                                                                                ))}
                                                                                            </div>
                                                                                        ) : <span className="text-sm font-bold text-app-muted dark:text-white/40">-</span>;
                                                                                        const t2SetsDisplay = hasScores ? (
                                                                                            <div className="flex items-center gap-1.5">
                                                                                                {matchSets.map((s, i) => (
                                                                                                    <span key={i} className="flex items-center justify-center w-7 h-7 text-sm font-bold font-mono text-app dark:text-white bg-white dark:bg-black/20 rounded shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-slate-200/80 dark:border-white/10">
                                                                                                        {s.team2}
                                                                                                    </span>
                                                                                                ))}
                                                                                            </div>
                                                                                        ) : <span className="text-sm font-bold text-app-muted dark:text-white/40">-</span>;

                                                                                        return (
                                                                                            <div 
                                                                                                key={m.id || idx} 
                                                                                                onClick={() => handleOpenSingleMatchModal(m)}
                                                                                                title="Clicca per inserire o modificare il risultato"
                                                                                                className={`rounded-xl p-3 sm:p-4 flex flex-col gap-2 shadow-sm cursor-pointer transition-all active:scale-[0.99] ${
                                                                                                    isCompleted
                                                                                                        ? "bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-800/40 hover:border-emerald-300 dark:hover:border-emerald-700/60"
                                                                                                        : "bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 hover:border-sky-500/50 hover:bg-sky-50/20 dark:hover:bg-white/[0.08]"
                                                                                                }`}
                                                                                            >
                                                                                                <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-200/40 dark:border-white/10">
                                                                                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getMatchBadgeClass(m)}`}>
                                                                                                        {getMatchLabel(m, sectionMatches, idx)}
                                                                                                    </span>
                                                                                                    {isCompleted && (
                                                                                                        <span className="text-[10px] font-extrabold tracking-wider uppercase text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                                                                                            <svg className="w-3.5 h-3.5 fill-current text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20">
                                                                                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                                                                                                            </svg>
                                                                                                            INSERITO
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                                <div className="flex items-center justify-between gap-3">
                                                                                                    <span className={`text-sm ${m.winner === "team1" ? "font-bold text-emerald-900 dark:text-emerald-200" : isCompleted ? "font-medium text-slate-700 dark:text-slate-300" : "font-medium text-app/80 dark:text-white/80"} leading-tight flex-1`}>{t1Names}</span>
                                                                                                    {t1SetsDisplay}
                                                                                                </div>
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/10"></div>
                                                                                                    <span className="text-[10px] uppercase font-bold text-app-muted dark:text-white/40 tracking-wider">vs</span>
                                                                                                    <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/10"></div>
                                                                                                </div>
                                                                                                <div className="flex items-center justify-between gap-3">
                                                                                                    <span className={`text-sm ${m.winner === "team2" ? "font-bold text-emerald-900 dark:text-emerald-200" : isCompleted ? "font-medium text-slate-700 dark:text-slate-300" : "font-medium text-app/80 dark:text-white/80"} leading-tight flex-1`}>{t2Names}</span>
                                                                                                    {t2SetsDisplay}
                                                                                                </div>
                                                                                            </div>
                                                                                        );
                                                                                    };

                                                                                    if (renderError) {
                                                                                        return (
                                                                                            <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl text-red-700 dark:text-red-300 text-sm">
                                                                                                <p className="font-bold mb-1">Errore nel caricamento delle partite del torneo:</p>
                                                                                                <code className="text-xs">{renderError}</code>
                                                                                            </div>
                                                                                        );
                                                                                    }

                                                                                    return (
                                                                                        <div className="space-y-6">
                                                                                            <div>
                                                                                                {playoffMatches.length > 0 && (
                                                                                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
                                                                                                        Fase Iniziale (Gironi / Box)
                                                                                                    </h4>
                                                                                                )}
                                                                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                                                                                    {initialMatches.map((m, idx) => renderMatchCard(m, idx, initialMatches))}
                                                                                                </div>
                                                                                            </div>

                                                                                            {playoffMatches.length > 0 && (
                                                                                                <div className="pt-4 border-t border-purple-500/20 dark:border-purple-400/20">
                                                                                                    <h4 className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 mb-2.5 flex items-center gap-1.5">
                                                                                                        <span>🏆</span> Fase Finale & Playoff
                                                                                                    </h4>
                                                                                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                                                                                        {playoffMatches.map((m, idx) => renderMatchCard(m, idx, playoffMatches))}
                                                                                                    </div>
                                                                                                </div>
                                                                                            )}
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
                                                                            onNavigateToTeamTournamentMatchdayResults?.(day.id);
                                                                        } else if (day.type === TournamentType.TorneoASquadre) {
                                                                            onNavigateToTeamTournamentConfiguration?.(day.teamTournamentRootId || day.id);
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
                                                                onNavigateToTeamTournamentMatchdayResults?.(day.id);
                                                            } else if (day.type === TournamentType.TorneoASquadre) {
                                                                onNavigateToTeamTournamentConfiguration?.(day.teamTournamentRootId || day.id);
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
                        <Button type="submit" variant="success" disabled={isSubmitting}>
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
                        <label htmlFor="edit-date" className="block text-sm font-medium text-gray-500 dark:text-gray-400">Data</label>
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
                        <Button type="button" variant="secondary" onClick={() => setIsEditModalOpen(false)} className="mr-2" disabled={isSubmitting}>Annulla</Button>
                        <Button type="submit" variant="success" disabled={isSubmitting}>
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
            {isSingleMatchModalOpen && selectedSingleMatch && Array.isArray(selectedSingleMatch.team1) && Array.isArray(selectedSingleMatch.team2) && (() => {
                const team1Players = selectedSingleMatch.team1.map(pId => getPlayerById(pId)).filter(Boolean) as Player[];
                const team2Players = selectedSingleMatch.team2.map(pId => getPlayerById(pId)).filter(Boolean) as Player[];

                return (
                    <HIGSheet
                        isOpen={isSingleMatchModalOpen}
                        onClose={() => {
                            if (!isSavingSingleMatch) {
                                setIsSingleMatchModalOpen(false);
                                setSelectedSingleMatch(null);
                            }
                        }}
                        title="Inserisci Risultato Match"
                    >
                        <div className="p-4 space-y-4">
                            <div className="flex justify-between items-center mb-6 bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-200/60 dark:border-white/10">
                                <div className="text-center w-1/2">
                                    {team1Players.map((p, idx) => (
                                        <p key={p.id || idx} className="font-bold text-sm text-app dark:text-white leading-snug">
                                            {formatPlayerName(p)}
                                        </p>
                                    ))}
                                    {team1Players.length === 0 && (
                                        <p className="font-bold text-sm text-app dark:text-white">Squadra 1</p>
                                    )}
                                </div>
                                <div className="text-sky-600 dark:text-sky-400 font-extrabold text-sm px-2">VS</div>
                                <div className="text-center w-1/2">
                                    {team2Players.map((p, idx) => (
                                        <p key={p.id || idx} className="font-bold text-sm text-app dark:text-white leading-snug">
                                            {formatPlayerName(p)}
                                        </p>
                                    ))}
                                    {team2Players.length === 0 && (
                                        <p className="font-bold text-sm text-app dark:text-white">Squadra 2</p>
                                    )}
                                </div>
                            </div>

                            <MatchScoreInput
                                sets={singleMatchSets}
                                onSetsChange={(sets) => {
                                    setSingleMatchSets(sets);
                                    setSingleMatchError(null);
                                }}
                                disabled={isSavingSingleMatch}
                            />

                            {singleMatchError && (
                                <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                                    {singleMatchError}
                                </p>
                            )}

                            <div className="mt-8 flex items-center gap-3">
                                <HIGButton
                                    variant="gray"
                                    size="large"
                                    fullWidth
                                    onClick={() => {
                                        setIsSingleMatchModalOpen(false);
                                        setSelectedSingleMatch(null);
                                    }}
                                    disabled={isSavingSingleMatch}
                                >
                                    Annulla
                                </HIGButton>
                                <HIGButton
                                    variant="success"
                                    size="large"
                                    fullWidth
                                    onClick={handleSaveSingleMatch}
                                    disabled={isSavingSingleMatch}
                                >
                                    {isSavingSingleMatch ? 'Salvataggio...' : 'Salva Risultato'}
                                </HIGButton>
                            </div>
                        </div>
                    </HIGSheet>
                );
            })()}
        </>
    );
};

export default TournamentsPage;
