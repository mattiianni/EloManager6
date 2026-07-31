import React, { useEffect, useMemo, useRef, useState } from 'react';
import Card from '../components/ui/Card.tsx';
import { HIGList, HIGListRow, HIGListSection } from '../components/ui/HIGList.tsx';
import SFIcon from '../components/ui/SFIcon.tsx';
import Button from '../components/ui/Button.tsx';
import { ChevronDownIcon, PrintIcon } from '../components/ui/Icons.tsx';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import { Player, Tournament, Match, TournamentType, TeamTournamentMatchday, TeamTournamentTeam, TeamTournamentPlayerStatsRow } from '../types.ts';
import { printTeamTournamentReport, printTeamTournamentStatistics, printTournamentStatistics } from '../services/printService.ts';
import { formatPlayerShortName } from '../utils/format.ts';

interface TournamentStats {
    tournament: Tournament;
    isPartial: boolean;
    giornate: string[];
    numeroGiornate: number;
    totalePartite: number;
    totaleGamesDisputati: number;
    mediaGamesPerPartita: number;
    giocatoriPartecipanti: number;
    periodo: { inizio: string; fine: string };
    
    // Top 5
    top5: {
        player: Player;
        eloTorneo: number; // Tournament-specific final ELO
        variazioneElo: number;
        gamesWon: number;
        gamesLost: number;
    }[];
    
    // Statistiche avanzate
    giocatoreConPiuGamesVinti: { player: Player; games: number }[];
    giocatoreConPiuGamesPersi: { player: Player; games: number }[];
    coppiaFrequente: { players: [Player, Player]; partite: number }[];
    serieVittorie: { player: Player; vittorie: number }[];
    upset: { count: number; details: string[] }[];
    maggiorGuadagnoElo: { player: Player; guadagno: number; data: string }[];
    peggiorPerditaElo: { player: Player; perdita: number; data: string }[];
    
    // Premi simbolici
    mvp: { player: Player; vittorieGiornate: number }[];
    
    // Nuove statistiche
    gameWinRate: { player: Player; percentage: number }[];
    gameRatio: { player: Player; ratio: number }[];
    partiteVinte: { player: Player; wins: number }[];
    eloPerPartita: { player: Player; eloPerMatch: number }[];
    upsetPercentage: { player: Player; percentage: number }[];
    migliorCoppiaWinRate: { players: [Player, Player]; winRate: number; partite: number }[];
    serieSconfitte: { player: Player; sconfitte: number }[];
    resilienza: { player: Player; perditaMedia: number }[];

    // Nuove statistiche aggiunte
    form: { player: Player; form: string; lastMatches: number }[];
    clutchPerformance: { player: Player; clutchWinRate: number; clutchMatches: number }[];
    difesaFerrea: { player: Player; avgGameDifference: number; wins: number }[];
}

// Helper function to safely clone player objects - using JSON for deep copy
const clonePlayer = (player: Player): Player => {
    return JSON.parse(JSON.stringify(player));
};

const classicMatchHasResult = (match: Match): boolean =>
    match.winner !== null || match.sets.some(set => Number(set.team1 || 0) !== 0 || Number(set.team2 || 0) !== 0);

const teamSubMatchHasResult = (sets: Match['sets'] | null | undefined): boolean =>
    Array.isArray(sets) && sets.some(set => Number(set.team1 || 0) !== 0 || Number(set.team2 || 0) !== 0);

const StatistichePage: React.FC = () => {
    const { tournaments, matches, players, getPlayerById, eloHistory, getTeamTournamentPlayerStats, getTeamTournamentConfig, getTeamTournamentMatchdays, getTeamTournamentTeams } = usePadelStore();
    const [expandedTournament, setExpandedTournament] = useState<string | null>(null);
    // Unified dropdown key: '' | `series:${seriesKey}` | `tt:${rootId}`
    const [selectedTournamentKey, setSelectedTournamentKey] = useState<string>('');
    const shouldAutoExpandOnNextSelectionRef = useRef(false);
    const [teamTournamentPlayerStatsByRoot, setTeamTournamentPlayerStatsByRoot] = useState<Record<string, TeamTournamentPlayerStatsRow[]>>({});
    const [teamTournamentConfigByRoot, setTeamTournamentConfigByRoot] = useState<Record<string, any>>({});
    const [teamTournamentTeamsByRoot, setTeamTournamentTeamsByRoot] = useState<Record<string, TeamTournamentTeam[]>>({});
    const [teamTournamentMatchdaysByRoot, setTeamTournamentMatchdaysByRoot] = useState<Record<string, TeamTournamentMatchday[]>>({});
    const [teamTournamentLoadingByRoot, setTeamTournamentLoadingByRoot] = useState<Record<string, boolean>>({});

    const selectedTeamTournamentRootId = selectedTournamentKey.startsWith('tt:') ? selectedTournamentKey.slice(3) : null;
    const selectedSeriesKey = selectedTournamentKey.startsWith('series:') ? selectedTournamentKey.slice(7) : null;

    const classicTournamentIdsWithResults = useMemo(() => {
        const ids = new Set<string>();
        matches.forEach(match => {
            if (match.tournamentId && classicMatchHasResult(match)) {
                ids.add(match.tournamentId);
            }
        });
        return ids;
    }, [matches]);

    // Get classic tournaments with at least one completed match for filter dropdown
    const completedTournaments = useMemo(() => {
        const eligible = tournaments
            .filter(t => t.type !== TournamentType.TorneoASquadre)
            .filter(t => classicTournamentIdsWithResults.has(t.id));
        const groupedByName = new Map<string, Tournament>();

        eligible.forEach(t => {
            const seriesKey = (t.giornataName || t.name);
            const existing = groupedByName.get(seriesKey);
            if (!existing || new Date(t.date).getTime() >= new Date(existing.date).getTime()) {
                groupedByName.set(seriesKey, { ...t });
            }
        });

        return Array.from(groupedByName.values()).sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );
    }, [tournaments, classicTournamentIdsWithResults]);

    const teamTournamentRoots = useMemo(() => {
        // Root = no giornataName, Torneo a Squadre
        const roots = tournaments
            .filter(t => t.type === TournamentType.TorneoASquadre)
            .filter(t => !t.giornataName)
            .map(t => ({ ...t, rootId: t.teamTournamentRootId || t.id }))
            // Keep only actual roots (id == rootId) to avoid any weirdness
            .filter(t => t.id === t.rootId);

        // Deduplicate by (name, club). This prevents accidental duplicates from buggy edits
        // from polluting the statistics dropdown while we keep DB cleanup separate.
        const norm = (s: string) => s.trim().toLowerCase();
        const map = new Map<string, Tournament>();
        roots.forEach(r => {
            const key = `${norm(r.name)}|${norm(r.club)}`;
            const existing = map.get(key);
            if (!existing) {
                map.set(key, r);
                return;
            }
            const existingTime = new Date(existing.date).getTime();
            const nextTime = new Date(r.date).getTime();
            if (Number.isFinite(nextTime) && nextTime >= existingTime) {
                map.set(key, r);
            }
        });
        return Array.from(map.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [tournaments]);

    // Raggruppa tornei per SERIE (seriesKey = giornataName || name)
    const activeTournaments = useMemo(() => {
        const available = tournaments
            .filter(t => t.type !== TournamentType.TorneoASquadre)
            .filter(t => classicTournamentIdsWithResults.has(t.id));

        // Filter by selected classic series if specified
        const filteredAvailable = selectedSeriesKey
            ? available.filter(t => (t.giornataName || t.name) === selectedSeriesKey)
            : available;

        // Group by series key
        const groupedByName = new Map<string, Tournament>();
        filteredAvailable.forEach(t => {
            const seriesKey = (t.giornataName || t.name);
            const existing = groupedByName.get(seriesKey);
            if (!existing || new Date(t.date).getTime() >= new Date(existing.date).getTime()) {
                groupedByName.set(seriesKey, {
                    ...t,
                    matchIds: Array.from(new Set((existing?.matchIds || []).concat(t.matchIds || []))),
                });
            }
        });

        const uniqueTournaments = Array.from(groupedByName.values());
        console.log('📊 Active tournaments (grouped by series):', uniqueTournaments.length, '/', tournaments.length);
        console.log('📊 Tournaments:', uniqueTournaments.map(t => ({ key: (t.giornataName || t.name), matchIds: t.matchIds.length })));
        console.log('📊 Total matches:', matches.length);
        return uniqueTournaments;
    }, [tournaments, selectedSeriesKey, classicTournamentIdsWithResults, matches.length]);

    useEffect(() => {
        const availableKeys = [
            ...completedTournaments.map(t => `series:${t.giornataName || t.name}`),
            ...teamTournamentRoots.map(t => `tt:${t.id}`),
        ];

        if (availableKeys.length === 0) {
            if (selectedTournamentKey !== '') {
                shouldAutoExpandOnNextSelectionRef.current = false;
                setSelectedTournamentKey('');
            }
            setExpandedTournament(null);
            return;
        }

        if (!selectedTournamentKey || !availableKeys.includes(selectedTournamentKey)) {
            shouldAutoExpandOnNextSelectionRef.current = false;
            setSelectedTournamentKey(availableKeys[0]);
            setExpandedTournament(null);
        }
    }, [completedTournaments, teamTournamentRoots, selectedTournamentKey]);

    useEffect(() => {
        if (!shouldAutoExpandOnNextSelectionRef.current) {
            return;
        }

        shouldAutoExpandOnNextSelectionRef.current = false;

        if (selectedSeriesKey) {
            const selectedTournament = activeTournaments.find(t => (t.giornataName || t.name) === selectedSeriesKey) || null;
            setExpandedTournament(selectedTournament?.id || null);
            return;
        }

        if (!selectedTournamentKey) {
            setExpandedTournament(null);
        }
    }, [selectedTournamentKey, selectedSeriesKey, activeTournaments]);

    useEffect(() => {
        // Team Tournaments: load minimal dataset to compute the first statistics slices
        // (info, top 5, frequent pairs, streak) and print a consistent PDF.
        if (!selectedTeamTournamentRootId) return;
        if (
            teamTournamentPlayerStatsByRoot[selectedTeamTournamentRootId] &&
            teamTournamentConfigByRoot[selectedTeamTournamentRootId] &&
            teamTournamentTeamsByRoot[selectedTeamTournamentRootId] &&
            teamTournamentMatchdaysByRoot[selectedTeamTournamentRootId]
        ) {
            return;
        }

        let cancelled = false;

        const load = async () => {
            try {
                setTeamTournamentLoadingByRoot(prev => ({ ...prev, [selectedTeamTournamentRootId]: true }));
                const [stats, cfg, teams, matchdays] = await Promise.all([
                    getTeamTournamentPlayerStats(selectedTeamTournamentRootId),
                    getTeamTournamentConfig(selectedTeamTournamentRootId),
                    getTeamTournamentTeams(selectedTeamTournamentRootId),
                    getTeamTournamentMatchdays(selectedTeamTournamentRootId),
                ]);
                if (cancelled) return;
                setTeamTournamentPlayerStatsByRoot(prev => ({ ...prev, [selectedTeamTournamentRootId]: stats }));
                setTeamTournamentConfigByRoot(prev => ({ ...prev, [selectedTeamTournamentRootId]: cfg }));
                setTeamTournamentTeamsByRoot(prev => ({ ...prev, [selectedTeamTournamentRootId]: teams }));
                setTeamTournamentMatchdaysByRoot(prev => ({ ...prev, [selectedTeamTournamentRootId]: matchdays }));
            } catch {
                // keep non-blocking
            } finally {
                if (!cancelled) setTeamTournamentLoadingByRoot(prev => ({ ...prev, [selectedTeamTournamentRootId]: false }));
            }
        };

        load();
        return () => { cancelled = true; };
    }, [
        selectedTeamTournamentRootId,
        teamTournamentPlayerStatsByRoot,
        teamTournamentConfigByRoot,
        teamTournamentTeamsByRoot,
        teamTournamentMatchdaysByRoot,
        getTeamTournamentPlayerStats,
        getTeamTournamentConfig,
        getTeamTournamentTeams,
        getTeamTournamentMatchdays,
    ]);

    const teamTournamentDerived = useMemo(() => {
        if (!selectedTeamTournamentRootId) return null;
        const cfg = teamTournamentConfigByRoot[selectedTeamTournamentRootId] || null;
        const matchdays = teamTournamentMatchdaysByRoot[selectedTeamTournamentRootId] || [];

        const completedMatchdays = matchdays.filter(md => md.status === 'completed');
        const playedMatchdays = completedMatchdays.filter(md =>
            (md.subMatches || []).some(sm => !sm.cancelled && teamSubMatchHasResult(sm.sets))
        );
        const rrPlayedMatchdays = playedMatchdays.filter(md => md.phase === 'round_robin' || !md.phase);
        const playedMatchdaysChrono = [...playedMatchdays].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const scheduleTotal =
            cfg?.schedule?.kind === 'round_robin'
                ? (cfg.schedule.days || []).reduce((sum: number, d: any) => sum + (d.matches?.length || 0), 0)
                : 0;
        const playedTotal = playedMatchdays.length;
        const playedRoundRobin = rrPlayedMatchdays.length;

        const playerKey = (p: { name: string; surname: string }) => `${p.name}`.trim().toLowerCase() + '|' + `${p.surname}`.trim().toLowerCase();
        
        // Map players to team names
        const teamNameByPlayerKey = new Map<string, string>();
        const teams = teamTournamentTeamsByRoot[selectedTeamTournamentRootId] || [];
        teams.forEach(team => {
            if (Array.isArray(team.players)) {
                team.players.forEach(p => {
                    if (p && (p.name || p.surname)) {
                        teamNameByPlayerKey.set(playerKey(p), team.name);
                    }
                });
            }
        });

        const displayName = (p: { name: string; surname: string }) => {
            const base = `${p.name} ${p.surname}`.trim();
            const teamName = teamNameByPlayerKey.get(playerKey(p));
            return teamName ? `${base} (${teamName})` : base;
        };

        const isBlankSets = (sets: any[] | null) => {
            if (!sets || sets.length === 0) return true;
            return sets.every(s => Number(s.team1 || 0) === 0 && Number(s.team2 || 0) === 0);
        };

        const formatDate = (iso: string) => new Date(iso).toLocaleDateString('it-IT');
        const periodo = playedMatchdaysChrono.length > 0
            ? { inizio: formatDate(playedMatchdaysChrono[0].date), fine: formatDate(playedMatchdaysChrono[playedMatchdaysChrono.length - 1].date) }
            : { inizio: '—', fine: '—' };

        type PStat = {
            id?: string;
            name: string;
            surname: string;
            matchesPlayed: number;
            matchesWon: number;
            matchesLost: number;
            gamesWon: number;
            gamesLost: number;
        };

        const statsByPlayer = new Map<string, PStat>();
        const upsert = (p: { id?: string; name: string; surname: string; originalId?: string }) => {
            const key = playerKey(p);
            let actualId = p.id || (p as any).originalId;
            if (!actualId) {
                const found = players.find(dbP => playerKey(dbP) === key);
                if (found) actualId = found.id;
            }
            const existing = statsByPlayer.get(key);
            if (existing) {
                if (actualId && !existing.id) existing.id = actualId;
                return existing;
            }
            const created: PStat = {
                id: actualId,
                name: p.name,
                surname: p.surname,
                matchesPlayed: 0,
                matchesWon: 0,
                matchesLost: 0,
                gamesWon: 0,
                gamesLost: 0,
            };
            statsByPlayer.set(key, created);
            return created;
        };

        const pairAgg = new Map<string, { label: string; played: number; wins: number; draws: number; losses: number }>();
        const bumpPair = (a: { name: string; surname: string }, b: { name: string; surname: string }) => {
            const ka = playerKey(a);
            const kb = playerKey(b);
            const [x, y] = [ka, kb].sort();
            const key = `${x}--${y}`;
            const label = `${displayName(a)} & ${displayName(b)}`;
            const prev = pairAgg.get(key) || { label, played: 0, wins: 0, draws: 0, losses: 0 };
            pairAgg.set(key, prev);
        };

        const chronological = [...playedMatchdays].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        let gamesDisputati = 0;
        let partiteDisputate = 0; // sub-match played (non-blank sets)

        chronological.forEach(md => {
            (md.subMatches || [])
                .filter(sm => !sm.cancelled)
                .forEach(sm => {
                    const t1 = sm.team1Players || [];
                    const t2 = sm.team2Players || [];
                    if (t1.length >= 2) bumpPair(t1[0], t1[1]);
                    if (t2.length >= 2) bumpPair(t2[0], t2[1]);

                    if (isBlankSets(sm.sets as any)) return;

                    const t1Games = (sm.sets || []).reduce((sum: number, s: any) => sum + Number(s.team1 || 0), 0);
                    const t2Games = (sm.sets || []).reduce((sum: number, s: any) => sum + Number(s.team2 || 0), 0);
                    gamesDisputati += (t1Games + t2Games);
                    partiteDisputate += 1;

                    // Winner comes from backend, but fallback to games
                    const winner = sm.winner && sm.winner !== 'draw'
                        ? sm.winner
                        : (t1Games === t2Games ? null : (t1Games > t2Games ? 'team1' : 'team2'));

                    // Pair stats (wins/draws/losses)
                    if (t1.length >= 2) {
                        const key = [playerKey(t1[0]), playerKey(t1[1])].sort().join('--');
                        const p = pairAgg.get(key);
                        if (p) {
                            p.played += 1;
                            if (winner === 'team1') p.wins += 1;
                            else if (winner === 'team2') p.losses += 1;
                            else p.draws += 1;
                        }
                    }
                    if (t2.length >= 2) {
                        const key = [playerKey(t2[0]), playerKey(t2[1])].sort().join('--');
                        const p = pairAgg.get(key);
                        if (p) {
                            p.played += 1;
                            if (winner === 'team2') p.wins += 1;
                            else if (winner === 'team1') p.losses += 1;
                            else p.draws += 1;
                        }
                    }

                    t1.forEach(p => {
                        const st = upsert(p);
                        st.matchesPlayed += 1;
                        st.gamesWon += t1Games;
                        st.gamesLost += t2Games;
                        if (winner === 'team1') st.matchesWon += 1;
                        else if (winner === 'team2') st.matchesLost += 1;
                    });
                    t2.forEach(p => {
                        const st = upsert(p);
                        st.matchesPlayed += 1;
                        st.gamesWon += t2Games;
                        st.gamesLost += t1Games;
                        if (winner === 'team2') st.matchesWon += 1;
                        else if (winner === 'team1') st.matchesLost += 1;
                    });
                });
        });

        const matchdayIds = new Set(matchdays.map(m => m.id));
        const rows = Array.from(statsByPlayer.values()).map(s => {
            const diff = s.gamesWon - s.gamesLost;
            const winPct = s.matchesPlayed > 0 ? Math.round((s.matchesWon / s.matchesPlayed) * 100) : 0;
            
            let eloVar = 0;
            if (s.id) {
                const history = eloHistory.filter(e => e.playerId === s.id && matchdayIds.has(e.eventId));
                eloVar = history.reduce((sum, h) => sum + h.delta, 0);
            }
            
            return { ...s, gamesDiff: diff, winPercentage: winPct, eloVar };
        }).sort((a, b) => {
            if (b.eloVar !== a.eloVar) return b.eloVar - a.eloVar;
            return b.gamesDiff - a.gamesDiff;
        });

        const mediaGamesPerPartita = partiteDisputate > 0 ? (gamesDisputati / partiteDisputate) : 0;

        const top5 = [...rows]
            .filter(r => r.matchesPlayed > 0)
            .sort((a, b) => {
                if (b.eloVar !== a.eloVar) return b.eloVar - a.eloVar;
                return b.gamesDiff - a.gamesDiff;
            })
            .slice(0, 5);

        // Longest win streak across the chronological submatches
        const streakByPlayer = new Map<string, { label: string; current: number; best: number }>();
        const getStreak = (p: { name: string; surname: string }) => {
            const key = playerKey(p);
            const existing = streakByPlayer.get(key);
            if (existing) return existing;
            return { label: displayName(p), current: 0, best: 0 };
        };
        chronological.forEach(md => {
            (md.subMatches || [])
                .filter(sm => !sm.cancelled)
                .forEach(sm => {
                    if (isBlankSets(sm.sets as any)) return;
                    const t1Games = (sm.sets || []).reduce((sum: number, s: any) => sum + Number(s.team1 || 0), 0);
                    const t2Games = (sm.sets || []).reduce((sum: number, s: any) => sum + Number(s.team2 || 0), 0);
                    const winner = sm.winner && sm.winner !== 'draw'
                        ? sm.winner
                        : (t1Games === t2Games ? null : (t1Games > t2Games ? 'team1' : 'team2'));

                    (sm.team1Players || []).forEach(p => {
                        const st = getStreak(p);
                        let nextSt = { ...st };
                        if (winner === 'team1') {
                            nextSt.current += 1;
                            nextSt.best = Math.max(nextSt.best, nextSt.current);
                        } else if (winner === 'team2') {
                            nextSt.current = 0;
                        }
                        streakByPlayer.set(playerKey(p), nextSt);
                    });
                    (sm.team2Players || []).forEach(p => {
                        const st = getStreak(p);
                        let nextSt = { ...st };
                        if (winner === 'team2') {
                            nextSt.current += 1;
                            nextSt.best = Math.max(nextSt.best, nextSt.current);
                        } else if (winner === 'team1') {
                            nextSt.current = 0;
                        }
                        streakByPlayer.set(playerKey(p), nextSt);
                    });
                });
        });

        const streakTop = Array.from(streakByPlayer.values())
            .filter(s => s.best > 0)
            .sort((a, b) => b.best - a.best)
            .slice(0, 5);

        const pairsTop = Array.from(pairAgg.values())
            .filter(p => p.played > 1)
            .sort((a, b) => b.played - a.played)
            .slice(0, 5);

        const mostGamesWon = [...rows]
            .filter(r => r.gamesWon > 0)
            .sort((a, b) => b.gamesWon - a.gamesWon)
            .slice(0, 3);

        const mostGamesLost = [...rows]
            .filter(r => r.gamesLost > 0)
            .sort((a, b) => b.gamesLost - a.gamesLost)
            .slice(0, 3);

        const bestPairsByWinRate = Array.from(pairAgg.values())
            .filter(p => p.played >= 2)
            .map(p => ({ ...p, winRate: p.played > 0 ? (p.wins / p.played) * 100 : 0 }))
            .sort((a, b) => {
                if (b.winRate !== a.winRate) return b.winRate - a.winRate;
                return b.played - a.played;
            })
            .slice(0, 3);

        // ====== ADVANCED STATS FOR TEAM TOURNAMENT ======
        
        // UPSET - matches where lower ELO team won
        const upsets: string[] = [];
        const tournamentEloHistory = eloHistory.filter(h => matchdayIds.has(h.eventId));
        
        chronological.forEach(md => {
            (md.subMatches || []).filter(sm => !sm.cancelled).forEach(sm => {
                if (isBlankSets(sm.sets as any)) return;
                const t1Games = (sm.sets || []).reduce((sum: number, s: any) => sum + Number(s.team1 || 0), 0);
                const t2Games = (sm.sets || []).reduce((sum: number, s: any) => sum + Number(s.team2 || 0), 0);
                const winner = sm.winner && sm.winner !== 'draw' ? sm.winner : (t1Games === t2Games ? null : (t1Games > t2Games ? 'team1' : 'team2'));
                
                const t1Players = sm.team1Players || [];
                const t2Players = sm.team2Players || [];
                
                if (winner && t1Players.length === 2 && t2Players.length === 2) {
                    const matchHistory = tournamentEloHistory.filter(h => h.eventId === md.id);
                    let team1EloAvg = 0; let team2EloAvg = 0;
                    if (matchHistory.length > 0) {
                        const t1Sum = t1Players.reduce((sum, p) => sum + (matchHistory.find(h => h.playerId === p.id)?.eloBefore || 1500), 0);
                        const t2Sum = t2Players.reduce((sum, p) => sum + (matchHistory.find(h => h.playerId === p.id)?.eloBefore || 1500), 0);
                        team1EloAvg = t1Sum / 2; team2EloAvg = t2Sum / 2;
                    }
                    if ((winner === 'team1' && team1EloAvg < team2EloAvg - 20) || (winner === 'team2' && team2EloAvg < team1EloAvg - 20)) {
                        const winningTeam = winner === 'team1' ? t1Players : t2Players;
                        const losingTeam = winner === 'team1' ? t2Players : t1Players;
                        const diffElo = Math.abs(team1EloAvg - team2EloAvg).toFixed(2);
                        upsets.push(`${formatPlayerShortName(winningTeam[0])} & ${formatPlayerShortName(winningTeam[1])} vs ${formatPlayerShortName(losingTeam[0])} & ${formatPlayerShortName(losingTeam[1])} (Δ${diffElo})`);
                    }
                }
            });
        });

        // ELO Gain/Loss
        const eloPerGiornata = new Map<string, Map<string, number>>();
        tournamentEloHistory.forEach(h => {
            if (!eloPerGiornata.has(h.playerId)) eloPerGiornata.set(h.playerId, new Map());
            const currentDelta = eloPerGiornata.get(h.playerId)!.get(h.date) || 0;
            eloPerGiornata.get(h.playerId)!.set(h.date, currentDelta + h.delta);
        });

        let maggiorGuadagnoElo: { player: any; guadagno: number; data: string }[] = [];
        let peggiorPerditaElo: { player: any; perdita: number; data: string }[] = [];
        
        eloPerGiornata.forEach((giornateMap, playerId) => {
            const player = players.find(p => p.id === playerId);
            if (player) {
                giornateMap.forEach((delta, data) => {
                    if (delta > 0) maggiorGuadagnoElo.push({ player: clonePlayer(player), guadagno: delta, data: new Date(data).toLocaleDateString('it-IT') });
                    else if (delta < 0) peggiorPerditaElo.push({ player: clonePlayer(player), perdita: Math.abs(delta), data: new Date(data).toLocaleDateString('it-IT') });
                });
            }
        });
        
        maggiorGuadagnoElo = maggiorGuadagnoElo.sort((a, b) => b.guadagno - a.guadagno).slice(0, 3);
        peggiorPerditaElo = peggiorPerditaElo.sort((a, b) => b.perdita - a.perdita).slice(0, 3);

        // FORM (W/L/W/W)
        const form = rows.map(s => {
            const playerMatches: { won: boolean }[] = [];
            chronological.forEach(md => {
                (md.subMatches || []).filter(sm => !sm.cancelled).forEach(sm => {
                    const isT1 = (sm.team1Players || []).some(p => playerKey(p) === playerKey(s));
                    const isT2 = (sm.team2Players || []).some(p => playerKey(p) === playerKey(s));
                    if (!isT1 && !isT2) return;
                    if (isBlankSets(sm.sets as any)) return;
                    
                    const t1Games = (sm.sets || []).reduce((sum: number, set: any) => sum + Number(set.team1 || 0), 0);
                    const t2Games = (sm.sets || []).reduce((sum: number, set: any) => sum + Number(set.team2 || 0), 0);
                    const winner = sm.winner && sm.winner !== 'draw' ? sm.winner : (t1Games === t2Games ? null : (t1Games > t2Games ? 'team1' : 'team2'));
                    
                    if (winner) {
                        playerMatches.push({ won: (isT1 && winner === 'team1') || (isT2 && winner === 'team2') });
                    }
                });
            });
            const last5 = playerMatches.slice(-5);
            return {
                player: s,
                form: last5.map(m => m.won ? '🟢' : '🔴').join(' ') || 'N/A',
                lastMatches: last5.length
            };
        }).filter(f => f.lastMatches >= 3)
          .sort((a, b) => (b.form.match(/🟢/g) || []).length - (a.form.match(/🟢/g) || []).length)
          .slice(0, 5);

        // CLUTCH PERFORMANCE (wins by 1 game difference)
        const clutchPerformance = rows.map(s => {
            const playerMatches: { won: boolean, diff: number }[] = [];
            chronological.forEach(md => {
                (md.subMatches || []).filter(sm => !sm.cancelled).forEach(sm => {
                    const isT1 = (sm.team1Players || []).some(p => playerKey(p) === playerKey(s));
                    const isT2 = (sm.team2Players || []).some(p => playerKey(p) === playerKey(s));
                    if (!isT1 && !isT2) return;
                    if (isBlankSets(sm.sets as any)) return;
                    
                    const t1Games = (sm.sets || []).reduce((sum: number, set: any) => sum + Number(set.team1 || 0), 0);
                    const t2Games = (sm.sets || []).reduce((sum: number, set: any) => sum + Number(set.team2 || 0), 0);
                    const winner = sm.winner && sm.winner !== 'draw' ? sm.winner : (t1Games === t2Games ? null : (t1Games > t2Games ? 'team1' : 'team2'));
                    const diff = Math.abs(t1Games - t2Games);
                    
                    if (winner && diff === 1) { // Clutch is 1 game difference
                        playerMatches.push({ won: (isT1 && winner === 'team1') || (isT2 && winner === 'team2'), diff });
                    }
                });
            });
            const clutchWins = playerMatches.filter(m => m.won).length;
            return { player: s, clutchWinRate: playerMatches.length ? (clutchWins / playerMatches.length) * 100 : 0, clutchMatches: playerMatches.length };
        }).filter(c => c.clutchMatches >= 1).sort((a, b) => b.clutchWinRate - a.clutchWinRate).slice(0, 3);

        // DIFESA FERREA (Average positive diff)
        const difesaFerrea = rows.map(s => {
            let totalDiff = 0;
            let wins = 0;
            chronological.forEach(md => {
                (md.subMatches || []).filter(sm => !sm.cancelled).forEach(sm => {
                    const isT1 = (sm.team1Players || []).some(p => playerKey(p) === playerKey(s));
                    const isT2 = (sm.team2Players || []).some(p => playerKey(p) === playerKey(s));
                    if (!isT1 && !isT2) return;
                    if (isBlankSets(sm.sets as any)) return;
                    const t1Games = (sm.sets || []).reduce((sum: number, set: any) => sum + Number(set.team1 || 0), 0);
                    const t2Games = (sm.sets || []).reduce((sum: number, set: any) => sum + Number(set.team2 || 0), 0);
                    const winner = sm.winner && sm.winner !== 'draw' ? sm.winner : (t1Games === t2Games ? null : (t1Games > t2Games ? 'team1' : 'team2'));
                    if ((isT1 && winner === 'team1') || (isT2 && winner === 'team2')) {
                        wins++;
                        totalDiff += Math.abs(t1Games - t2Games);
                    }
                });
            });
            return { player: s, avgGameDifference: wins > 0 ? totalDiff / wins : 0, wins };
        }).filter(d => d.wins >= 2).sort((a, b) => b.avgGameDifference - a.avgGameDifference).slice(0, 3);
        
        // MVP (Most matchdays with positive game diff for the player)
        let mvp = rows.map(s => {
            let wonMatchdays = 0;
            chronological.forEach(md => {
                let mdDiff = 0;
                (md.subMatches || []).filter(sm => !sm.cancelled).forEach(sm => {
                    const isT1 = (sm.team1Players || []).some(p => playerKey(p) === playerKey(s));
                    const isT2 = (sm.team2Players || []).some(p => playerKey(p) === playerKey(s));
                    if (isT1) {
                        const t1Games = (sm.sets || []).reduce((sum: number, set: any) => sum + Number(set.team1 || 0), 0);
                        const t2Games = (sm.sets || []).reduce((sum: number, set: any) => sum + Number(set.team2 || 0), 0);
                        mdDiff += (t1Games - t2Games);
                    } else if (isT2) {
                        const t1Games = (sm.sets || []).reduce((sum: number, set: any) => sum + Number(set.team1 || 0), 0);
                        const t2Games = (sm.sets || []).reduce((sum: number, set: any) => sum + Number(set.team2 || 0), 0);
                        mdDiff += (t2Games - t1Games);
                    }
                });
                if (mdDiff > 0) wonMatchdays++;
            });
            return { player: s, vittorieGiornate: wonMatchdays };
        }).filter(m => m.vittorieGiornate > 0).sort((a, b) => b.vittorieGiornate - a.vittorieGiornate).slice(0, 3);

        const defaultPlayer = rows[0] || { id: '0', name: 'N/A', surname: '', currentElo: 0, initialElo: 0, position: 'Dx' } as any;
        if (maggiorGuadagnoElo.length === 0) maggiorGuadagnoElo = [{ player: defaultPlayer, guadagno: 0, data: '-' }];
        if (peggiorPerditaElo.length === 0) peggiorPerditaElo = [{ player: defaultPlayer, perdita: 0, data: '-' }];
        if (mvp.length === 0) mvp = [{ player: defaultPlayer, vittorieGiornate: 0 }];

        return {
            playedTotal,
            playedRoundRobin,
            scheduleTotal,
            cfg,
            periodo,
            gamesDisputati,
            mediaGamesPerPartita,
            top5,
            pairsTop,
            streakTop,
            mostGamesWon,
            mostGamesLost,
            bestPairsByWinRate,
            playerRows: rows,
            // Advanced stats
            upset: [{ count: upsets.length, details: upsets.slice(0, 3) }],
            maggiorGuadagnoElo,
            peggiorPerditaElo,
            form,
            clutchPerformance,
            difesaFerrea,
            mvp,
        };
    }, [selectedTeamTournamentRootId, teamTournamentConfigByRoot, teamTournamentMatchdaysByRoot, teamTournamentTeamsByRoot, players, eloHistory]);

    const calculateTournamentStats = (tournament: Tournament): TournamentStats | null => {
        // Get ALL tournament IDs with the same series key (for multi-giornata tournaments)
        const seriesKey = (tournament.giornataName || tournament.name);
        const seriesTournaments = tournaments.filter(t =>
            t.type !== TournamentType.TorneoASquadre && (t.giornataName || t.name) === seriesKey
        );
        const tournamentIds = seriesTournaments.map(t => t.id);

        // Get all matches for this tournament using ONLY tournamentId (like RankingPage)
        const tournamentMatches = matches.filter(m => 
            m.tournamentId && tournamentIds.includes(m.tournamentId) && classicMatchHasResult(m)
        );
        
        if (tournamentMatches.length === 0) {
            console.log('⚠️ No matches found for tournament:', tournament.name);
            return null;
        }

        const playedTournamentIds = Array.from(new Set(tournamentMatches.map(m => m.tournamentId).filter(Boolean))) as string[];
        const isPartial = seriesTournaments.some(t => t.status !== 'completed');
        
        console.log('✅ Found', tournamentMatches.length, 'matches for tournament:', tournament.name, 'across', tournamentIds.length, 'giornate');

        // Get unique giornate (dates) - each unique date is a giornata
        const giornate = Array.from(new Set(tournamentMatches.map(m => m.date))).sort();
        
        // Actually count number of tournament instances (giornate) instead of unique dates
        const numeroGiornate = playedTournamentIds.length;
        
        console.log('📊 Giornate (unique dates):', giornate.length, '| Tournament instances:', numeroGiornate);
        
        // Informazioni generali
        const totalePartite = tournamentMatches.length;
        const totaleGamesDisputati = tournamentMatches.reduce((sum, m) => 
            sum + m.sets.reduce((s, set) => s + set.team1 + set.team2, 0), 0
        );
        const mediaGamesPerPartita = totalePartite > 0 ? totaleGamesDisputati / totalePartite : 0;
        
        // Get unique players - COPY EXACT LOGIC FROM RANKINGPAGE
        // Get only players who participated in this tournament (any giornata) - EXACT COPY FROM RANKINGPAGE
        const playersInTournament = new Set<string>();
        tournamentMatches.forEach(m => {
            m.team1.forEach(id => playersInTournament.add(id));
            m.team2.forEach(id => playersInTournament.add(id));
        });
        const filteredPlayers = players.filter(p => playersInTournament.has(p.id));
        
        const giocatoriPartecipanti = filteredPlayers.length;
        
        const periodo = {
            inizio: new Date(giornate[0]).toLocaleDateString('it-IT'),
            fine: new Date(giornate[giornate.length - 1]).toLocaleDateString('it-IT')
        };

        // Get all tournament-related ELO history ONLY for players who actually played matches - COPY FROM RANKINGPAGE
        const tournamentEloHistory = eloHistory.filter(h => 
            tournamentIds.includes(h.eventId) && h.type === 'tournament' && playersInTournament.has(h.playerId)
        );

        // Calcola statistiche per giocatore - use plain object instead of Map
        const playerStatsObj: Record<string, {
            player: Player;
            gamesWon: number;
            gamesLost: number;
            partiteVinte: number;
            partiteTotali: number;
            vittorieConsecutive: number;
            vittorieConsecutiveMax: number;
            variazioneEloTotale: number;
            eloStart: number;
            variazioniElo: { delta: number; date: string }[];
            giornateVinte: number;
            eloPerGiornata: { date: string; elo: number }[];
        }> = {};

        // Initialize stats ONLY for players who actually played matches in this tournament - COPY FROM RANKINGPAGE
        filteredPlayers.forEach(player => {
            // Get player's ELO history for this tournament - EXACT COPY FROM RANKINGPAGE
            const tournamentEloEntries = eloHistory.filter(e => 
                e.playerId === player.id && tournamentIds.includes(e.eventId)
            ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Sort chronologically (oldest first)
            
            const eloStart = 1500; // Rankings always start from 1500 per tournament series
            const eloFinale = tournamentEloEntries.length > 0 ? tournamentEloEntries[tournamentEloEntries.length - 1].eloAfter : eloStart;
            const variazioniElo = tournamentEloEntries.map(h => ({ delta: h.delta, date: h.date }));
            
            // Calculate tournament-specific ELO - EXACT COPY FROM RANKINGPAGE
            let displayElo = player.currentElo;
            if (tournamentEloEntries.length > 0) {
                // Rankings always start from 1500 per tournament series
                const initialElo = 1500;
                // Calculate total delta for this tournament
                const tournamentDelta = tournamentEloEntries.reduce((sum, entry) => sum + entry.delta, 0);
                // Display ELO = initial ELO + tournament variations
                displayElo = initialElo + tournamentDelta;
            }
            
            const variazioneEloTotale = displayElo - eloStart;

            playerStatsObj[player.id] = {
                player: clonePlayer(player),
                gamesWon: 0,
                gamesLost: 0,
                partiteVinte: 0,
                partiteTotali: 0,
                vittorieConsecutive: 0,
                vittorieConsecutiveMax: 0,
                variazioneEloTotale,
                eloStart,
                variazioniElo,
                giornateVinte: 0,
                eloPerGiornata: []
            };
        });

        // Process each match (sorted by date)
        const sortedMatches = [...tournamentMatches].sort((a, b) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        sortedMatches.forEach(match => {
            const team1Players = match.team1.map(id => getPlayerById(id)).filter(Boolean) as Player[];
            const team2Players = match.team2.map(id => getPlayerById(id)).filter(Boolean) as Player[];
            
            if (team1Players.length === 2 && team2Players.length === 2) {
                const team1Games = match.sets.reduce((sum, set) => sum + set.team1, 0);
                const team2Games = match.sets.reduce((sum, set) => sum + set.team2, 0);
                
                // Update games stats and win streaks - direct mutation on OUR objects
                team1Players.forEach(p => {
                    const stats = playerStatsObj[p.id];
                    if (stats) {
                        stats.gamesWon += team1Games;
                        stats.gamesLost += team2Games;
                        stats.partiteTotali++;
                        if (match.winner === 'team1') {
                            stats.partiteVinte++;
                            stats.vittorieConsecutive++;
                            stats.vittorieConsecutiveMax = Math.max(stats.vittorieConsecutiveMax, stats.vittorieConsecutive);
                        } else {
                            stats.vittorieConsecutive = 0;
                        }
                    }
                });
                
                team2Players.forEach(p => {
                    const stats = playerStatsObj[p.id];
                    if (stats) {
                        stats.gamesWon += team2Games;
                        stats.gamesLost += team1Games;
                        stats.partiteTotali++;
                        if (match.winner === 'team2') {
                            stats.partiteVinte++;
                            stats.vittorieConsecutive++;
                            stats.vittorieConsecutiveMax = Math.max(stats.vittorieConsecutiveMax, stats.vittorieConsecutive);
                        } else {
                            stats.vittorieConsecutive = 0;
                        }
                    }
                });
            }
        });

        // Calculate MVP - giocatore che ha vinto più giornate (FIXED: iterate over tournament instances)
        const giornateVinteMap = new Map<string, number>();
        
        playedTournamentIds.forEach(tournamentId => {
            // Use same filtering logic as main tournament matches (ONLY tournamentId)
            const giornataMatches = tournamentMatches.filter(m => 
                m.tournamentId === tournamentId
            );
            
            const giornataPlayerPoints = new Map<string, number>();
            
            // Calculate points for each player in this giornata
            giornataMatches.forEach(match => {
                const team1Games = match.sets.reduce((sum, set) => sum + set.team1, 0);
                const team2Games = match.sets.reduce((sum, set) => sum + set.team2, 0);
                
                match.team1.forEach(id => {
                    giornataPlayerPoints.set(id, (giornataPlayerPoints.get(id) || 0) + team1Games - team2Games);
                });
                match.team2.forEach(id => {
                    giornataPlayerPoints.set(id, (giornataPlayerPoints.get(id) || 0) + team2Games - team1Games);
                });
            });
            
            // Find winner(s) of this giornata - handle ties
            let maxPoints = -Infinity;
            const winnerIds: string[] = [];

            // First pass: find max points
            giornataPlayerPoints.forEach((points, id) => {
                if (points > maxPoints) {
                    maxPoints = points;
                }
            });

            // Second pass: collect all players with max points
            giornataPlayerPoints.forEach((points, id) => {
                if (points === maxPoints) {
                    winnerIds.push(id);
                }
            });

            // Award victory to all tied winners
            winnerIds.forEach(id => {
                giornateVinteMap.set(id, (giornateVinteMap.get(id) || 0) + 1);
            });
        });
        
        Object.keys(playerStatsObj).forEach(id => {
            const stats = playerStatsObj[id];
            if (stats) {
                stats.giornateVinte = giornateVinteMap.get(id) || 0;
            }
        });

        // Create a COMPLETE deep copy to avoid any readonly issues
        const playerStatsArray = Object.values(playerStatsObj).map(s => ({
            ...s,
            player: clonePlayer(s.player),
            variazioniElo: [...s.variazioniElo],
            eloPerGiornata: [...s.eloPerGiornata]
        }));

        // Top 5 classifica - sort by tournament-specific final ELO
        const top5 = playerStatsArray
            .sort((a, b) => {
                // Use tournament-specific final ELO, not global ELO
                const aFinalElo = a.eloStart + a.variazioneEloTotale;
                const bFinalElo = b.eloStart + b.variazioneEloTotale;
                if (bFinalElo !== aFinalElo) return bFinalElo - aFinalElo;
                
                const aGamesDiff = a.gamesWon - a.gamesLost;
                const bGamesDiff = b.gamesWon - b.gamesLost;
                return bGamesDiff - aGamesDiff;
            })
            .slice(0, 5)
            .map(s => ({
                player: clonePlayer(s.player),
                eloTorneo: s.eloStart + s.variazioneEloTotale, // Tournament-specific final ELO
                variazioneElo: s.variazioneEloTotale,
                gamesWon: s.gamesWon,
                gamesLost: s.gamesLost
            }));

        // Giocatore con più games vinti
        const giocatoreConPiuGamesVinti = playerStatsArray
            .filter(s => s.gamesWon > 0)
            .sort((a, b) => b.gamesWon - a.gamesWon)
            .slice(0, 3)
            .map(s => ({ player: clonePlayer(s.player), games: s.gamesWon }));

        // Giocatore con più games persi
        const giocatoreConPiuGamesPersi = playerStatsArray
            .filter(s => s.gamesLost > 0)
            .sort((a, b) => b.gamesLost - a.gamesLost)
            .slice(0, 3)
            .map(s => ({ player: clonePlayer(s.player), games: s.gamesLost }));

        // Coppia più frequente
        const pairCounts = new Map<string, { players: [Player, Player]; count: number }>();
        tournamentMatches.forEach(match => {
            [match.team1, match.team2].forEach(team => {
                const p1 = getPlayerById(team[0]);
                const p2 = getPlayerById(team[1]);
                if (p1 && p2) {
                    const key = [team[0], team[1]].sort().join('-');
                    const existing = pairCounts.get(key);
                    if (!existing) {
                        pairCounts.set(key, { players: [clonePlayer(p1), clonePlayer(p2)], count: 1 });
                    } else {
                        pairCounts.set(key, { players: existing.players, count: existing.count + 1 });
                    }
                }
            });
        });
        const coppiaFrequente = Array.from(pairCounts.values())
            .filter(c => c.count > 1)
            .sort((a, b) => b.count - a.count)
            .slice(0, 3)
            .map(c => ({ players: c.players, partite: c.count }));

        // Serie di vittorie consecutive
        const serieVittorie = playerStatsArray
            .filter(s => s.vittorieConsecutiveMax > 0)
            .sort((a, b) => b.vittorieConsecutiveMax - a.vittorieConsecutiveMax)
            .slice(0, 3)
            .map(s => ({ player: clonePlayer(s.player), vittorie: s.vittorieConsecutiveMax }));

        // UPSET - matches where lower ELO team won
        const upsets: string[] = [];
        tournamentMatches.forEach(match => {
            const team1Players = match.team1.map(id => getPlayerById(id)).filter(Boolean) as Player[];
            const team2Players = match.team2.map(id => getPlayerById(id)).filter(Boolean) as Player[];
            
            if (team1Players.length === 2 && team2Players.length === 2) {
                // Get ELO at time of match using history
                const matchHistory = tournamentEloHistory.filter(h => 
                    [...match.team1, ...match.team2].includes(h.playerId) &&
                    h.date === match.date
                );
                
                let team1EloAvg = 0;
                let team2EloAvg = 0;
                
                if (matchHistory.length > 0) {
                    const team1EloSum = match.team1.reduce((sum, id) => {
                        const h = matchHistory.find(h => h.playerId === id);
                        return sum + (h ? h.eloBefore : 1500);
                    }, 0);
                    const team2EloSum = match.team2.reduce((sum, id) => {
                        const h = matchHistory.find(h => h.playerId === id);
                        return sum + (h ? h.eloBefore : 1500);
                    }, 0);
                    team1EloAvg = team1EloSum / 2;
                    team2EloAvg = team2EloSum / 2;
                } else {
                    team1EloAvg = (team1Players[0].currentElo + team1Players[1].currentElo) / 2;
                    team2EloAvg = (team2Players[0].currentElo + team2Players[1].currentElo) / 2;
                }
                
                if ((match.winner === 'team1' && team1EloAvg < team2EloAvg - 20) || 
                    (match.winner === 'team2' && team2EloAvg < team1EloAvg - 20)) {
                    const winningTeam = match.winner === 'team1' ? team1Players : team2Players;
                    const losingTeam = match.winner === 'team1' ? team2Players : team1Players;
                    const diffElo = Math.abs(team1EloAvg - team2EloAvg).toFixed(2);
                    upsets.push(
                        `${formatPlayerShortName(winningTeam[0])} & ${formatPlayerShortName(winningTeam[1])} vs ${formatPlayerShortName(losingTeam[0])} & ${formatPlayerShortName(losingTeam[1])} (Δ${diffElo})`
                    );
                }
            }
        });

        // Maggior guadagno e perdita ELO in una giornata
        const eloPerGiornata = new Map<string, Map<string, number>>(); // playerId -> giornata -> delta
        
        giornate.forEach(giornata => {
            const giornataHistory = tournamentEloHistory.filter(h => h.date === giornata);
            giornataHistory.forEach(h => {
                if (!eloPerGiornata.has(h.playerId)) {
                    eloPerGiornata.set(h.playerId, new Map());
                }
                const currentDelta = eloPerGiornata.get(h.playerId)!.get(giornata) || 0;
                eloPerGiornata.get(h.playerId)!.set(giornata, currentDelta + h.delta);
            });
        });

        let maggiorGuadagnoElo: { player: Player; guadagno: number; data: string }[] = [];
        let peggiorPerditaElo: { player: Player; perdita: number; data: string }[] = [];
        
        eloPerGiornata.forEach((giornateMap, playerId) => {
            const player = getPlayerById(playerId);
            if (player) {
                const playerCopy = clonePlayer(player);
                giornateMap.forEach((delta, giornata) => {
                    if (delta > 0) {
                        maggiorGuadagnoElo.push({
                            player: playerCopy,
                            guadagno: delta,
                            data: new Date(giornata).toLocaleDateString('it-IT')
                        });
                    } else if (delta < 0) {
                        peggiorPerditaElo.push({
                            player: playerCopy,
                            perdita: Math.abs(delta),
                            data: new Date(giornata).toLocaleDateString('it-IT')
                        });
                    }
                });
            }
        });
        
        maggiorGuadagnoElo = maggiorGuadagnoElo
            .sort((a, b) => b.guadagno - a.guadagno)
            .slice(0, 3);
        
        peggiorPerditaElo = peggiorPerditaElo
            .sort((a, b) => b.perdita - a.perdita)
            .slice(0, 3);

        // MVP - giocatore che ha vinto più giornate
        let mvp = playerStatsArray
            .filter(s => s.giornateVinte > 0)
            .sort((a, b) => b.giornateVinte - a.giornateVinte)
            .slice(0, 3)
            .map(s => ({ player: clonePlayer(s.player), vittorieGiornate: s.giornateVinte }));

        // NUOVE STATISTICHE - Game Win Rate %
        const gameWinRate = playerStatsArray
            .filter(s => s.gamesWon + s.gamesLost > 0)
            .map(s => ({
                player: clonePlayer(s.player),
                percentage: (s.gamesWon / (s.gamesWon + s.gamesLost)) * 100
            }))
            .sort((a, b) => b.percentage - a.percentage)
            .slice(0, 3);

        // Game Ratio
        const gameRatio = playerStatsArray
            .filter(s => s.gamesLost > 0)
            .map(s => ({
                player: clonePlayer(s.player),
                ratio: s.gamesWon / s.gamesLost
            }))
            .sort((a, b) => b.ratio - a.ratio)
            .slice(0, 3);

        // Partite Vinte
        const partiteVinte = playerStatsArray
            .filter(s => s.partiteVinte > 0)
            .sort((a, b) => b.partiteVinte - a.partiteVinte)
            .slice(0, 3)
            .map(s => ({ player: clonePlayer(s.player), wins: s.partiteVinte }));

        // ELO per Partita
        const eloPerPartita = playerStatsArray
            .filter(s => s.partiteTotali > 0)
            .map(s => ({
                player: clonePlayer(s.player),
                eloPerMatch: s.variazioneEloTotale / s.partiteTotali
            }))
            .sort((a, b) => b.eloPerMatch - a.eloPerMatch)
            .slice(0, 3);

        // % Upset (vittorie contro ELO superiori) - ALLINEATO con logica UPSET originale
        const upsetPercentage = playerStatsArray
            .filter(s => s.partiteTotali > 0)
            .map(s => {
                let upsetWins = 0;
                sortedMatches.forEach(match => {
                    const team1Players = match.team1.map(id => getPlayerById(id)).filter(Boolean) as Player[];
                    const team2Players = match.team2.map(id => getPlayerById(id)).filter(Boolean) as Player[];
                    
                    if (team1Players.length === 2 && team2Players.length === 2) {
                        const playerInTeam1 = team1Players.some(p => p.id === s.player.id);
                        const playerInTeam2 = team2Players.some(p => p.id === s.player.id);
                        
                        if ((playerInTeam1 && match.winner === 'team1') || (playerInTeam2 && match.winner === 'team2')) {
                            // Use same logic as UPSET calculation
                            const team1EloAvg = (team1Players[0].currentElo + team1Players[1].currentElo) / 2;
                            const team2EloAvg = (team2Players[0].currentElo + team2Players[1].currentElo) / 2;
                            
                            // Player's team won against stronger team (same logic as UPSET)
                            if ((playerInTeam1 && team1EloAvg < team2EloAvg - 20) || 
                                (playerInTeam2 && team2EloAvg < team1EloAvg - 20)) {
                                upsetWins++;
                            }
                        }
                    }
                });
                
                return {
                    player: clonePlayer(s.player),
                    percentage: (upsetWins / s.partiteTotali) * 100
                };
            })
            .filter(s => s.percentage > 0)
            .sort((a, b) => b.percentage - a.percentage)
            .slice(0, 3);

        // Miglior Coppia Win Rate
        const pairWinRates = new Map<string, { players: [Player, Player]; wins: number; total: number }>();
        tournamentMatches.forEach(match => {
            [match.team1, match.team2].forEach(team => {
                const p1 = getPlayerById(team[0]);
                const p2 = getPlayerById(team[1]);
                if (p1 && p2) {
                    const key = [team[0], team[1]].sort().join('-');
                    const existing = pairWinRates.get(key);
                    if (!existing) {
                        pairWinRates.set(key, { 
                            players: [clonePlayer(p1), clonePlayer(p2)], 
                            wins: match.winner === (team === match.team1 ? 'team1' : 'team2') ? 1 : 0,
                            total: 1
                        });
                    } else {
                        existing.total++;
                        if (match.winner === (team === match.team1 ? 'team1' : 'team2')) {
                            existing.wins++;
                        }
                    }
                }
            });
        });
        
        const migliorCoppiaWinRate = Array.from(pairWinRates.values())
            .filter(p => p.total >= 2)
            .map(p => ({
                players: p.players,
                winRate: (p.wins / p.total) * 100,
                partite: p.total
            }))
            .sort((a, b) => b.winRate - a.winRate)
            .slice(0, 3);

        // Serie Sconfitte Consecutive
        const serieSconfitte = playerStatsArray
            .filter(s => s.vittorieConsecutiveMax > 0 || s.partiteTotali > 0)
            .map(s => {
                // Calculate max consecutive losses
                let maxLosses = 0;
                let currentLosses = 0;
                
                sortedMatches.forEach(match => {
                    const team1Players = match.team1.map(id => getPlayerById(id)).filter(Boolean) as Player[];
                    const team2Players = match.team2.map(id => getPlayerById(id)).filter(Boolean) as Player[];
                    
                    if (team1Players.length === 2 && team2Players.length === 2) {
                        const playerInTeam1 = team1Players.some(p => p.id === s.player.id);
                        const playerInTeam2 = team2Players.some(p => p.id === s.player.id);
                        
                        if (playerInTeam1 || playerInTeam2) {
                            const won = (playerInTeam1 && match.winner === 'team1') || (playerInTeam2 && match.winner === 'team2');
                            if (won) {
                                currentLosses = 0;
                            } else {
                                currentLosses++;
                                maxLosses = Math.max(maxLosses, currentLosses);
                            }
                        }
                    }
                });
                
                return { player: clonePlayer(s.player), sconfitte: maxLosses };
            })
            .filter(s => s.sconfitte > 0)
            .sort((a, b) => b.sconfitte - a.sconfitte)
            .slice(0, 3);


        // Resilienza (perdita ELO media per sconfitta)
        const resilienza = playerStatsArray
            .filter(s => s.partiteTotali > s.partiteVinte && s.variazioneEloTotale < 0)
            .map(s => {
                const sconfitte = s.partiteTotali - s.partiteVinte;
                const perditaMedia = Math.abs(s.variazioneEloTotale) / sconfitte;
                return {
                    player: clonePlayer(s.player),
                    perditaMedia: perditaMedia
                };
            })
            .sort((a, b) => a.perditaMedia - b.perditaMedia) // Lower is better
            .slice(0, 3);

        // Fallback se non ci sono dati (evita array vuoti)
        const defaultPlayerSource = playerStatsArray[0]?.player || players[0];
        const defaultPlayer = defaultPlayerSource ? clonePlayer(defaultPlayerSource) : null;
        
        if (maggiorGuadagnoElo.length === 0 && defaultPlayer) {
            maggiorGuadagnoElo = [{ player: clonePlayer(defaultPlayer), guadagno: 0, data: '(in attesa di dati ulteriori)' }];
        }
        if (peggiorPerditaElo.length === 0 && defaultPlayer) {
            peggiorPerditaElo = [{ player: clonePlayer(defaultPlayer), perdita: 0, data: '(in attesa di dati ulteriori)' }];
        }
        if (mvp.length === 0 && defaultPlayer) {
            mvp = [{ player: clonePlayer(defaultPlayer), vittorieGiornate: 0 }];
        }
        if (giocatoreConPiuGamesVinti.length === 0 && defaultPlayer) {
            giocatoreConPiuGamesVinti.push({ player: clonePlayer(defaultPlayer), games: 0 });
        }
        if (giocatoreConPiuGamesPersi.length === 0 && defaultPlayer) {
            giocatoreConPiuGamesPersi.push({ player: clonePlayer(defaultPlayer), games: 0 });
        }
        if (coppiaFrequente.length === 0) {
            // Leave empty, will show "(in attesa...)" in UI
        }
        if (serieVittorie.length === 0 && defaultPlayer) {
            serieVittorie.push({ player: clonePlayer(defaultPlayer), vittorie: 0 });
        }

        // ===== NUOVE STATISTICHE =====

        // 1. FORM - Ultimi 5 match per giocatore (W/L pattern)
        const form = playerStatsArray
            .map(s => {
                // Get matches for this player, sorted by date
                const playerMatches = sortedMatches.filter(m =>
                    [...m.team1, ...m.team2].includes(s.player.id)
                );

                // Get last 5 matches
                const last5 = playerMatches.slice(-5);
                const formString = last5.map(match => {
                    const isTeam1 = match.team1.includes(s.player.id);
                    const won = (isTeam1 && match.winner === 'team1') ||
                                (!isTeam1 && match.winner === 'team2');
                    return won ? '🟢' : '🔴';
                }).join(' ');

                return {
                    player: clonePlayer(s.player),
                    form: formString || 'N/A',
                    lastMatches: last5.length
                };
            })
            .filter(f => f.lastMatches >= 3) // Show only players with at least 3 matches
            .sort((a, b) => {
                // Sort by number of green circles (wins) in form string
                const aWins = (a.form.match(/🟢/g) || []).length;
                const bWins = (b.form.match(/🟢/g) || []).length;
                return bWins - aWins;
            })
            .slice(0, 5);

        // 2. CLUTCH PERFORMANCE - Win rate in finals/semifinals
        // For Round Robin + Finali, last 2 matches are finals
        // For other formats, consider last 20% of matches as "clutch"
        const clutchPerformance = playerStatsArray
            .map(s => {
                const playerMatches = sortedMatches.filter(m =>
                    [...m.team1, ...m.team2].includes(s.player.id)
                );

                // Determine clutch matches (last 20% or minimum 2)
                const clutchCount = Math.max(2, Math.ceil(playerMatches.length * 0.2));
                const clutchMatches = playerMatches.slice(-clutchCount);

                let clutchWins = 0;
                clutchMatches.forEach(match => {
                    const isTeam1 = match.team1.includes(s.player.id);
                    const won = (isTeam1 && match.winner === 'team1') ||
                                (!isTeam1 && match.winner === 'team2');
                    if (won) clutchWins++;
                });

                const winRate = clutchMatches.length > 0
                    ? (clutchWins / clutchMatches.length) * 100
                    : 0;

                return {
                    player: clonePlayer(s.player),
                    clutchWinRate: winRate,
                    clutchMatches: clutchMatches.length
                };
            })
            .filter(c => c.clutchMatches >= 2)
            .sort((a, b) => b.clutchWinRate - a.clutchWinRate)
            .slice(0, 3);

        // 3. DIFESA FERREA - Average game difference in won matches
        const difesaFerrea = playerStatsArray
            .map(s => {
                const wonMatches = sortedMatches.filter(m => {
                    const isTeam1 = m.team1.includes(s.player.id);
                    return (isTeam1 && m.winner === 'team1') ||
                           (!isTeam1 && m.winner === 'team2');
                });

                if (wonMatches.length === 0) {
                    return {
                        player: clonePlayer(s.player),
                        avgGameDifference: 0,
                        wins: 0
                    };
                }

                // Calculate average game difference
                let totalDifference = 0;
                wonMatches.forEach(match => {
                    const isTeam1 = match.team1.includes(s.player.id);
                    match.sets.forEach(set => {
                        const diff = isTeam1
                            ? (set.team1 - set.team2)
                            : (set.team2 - set.team1);
                        totalDifference += diff;
                    });
                });

                const avgDiff = totalDifference / wonMatches.length;

                return {
                    player: clonePlayer(s.player),
                    avgGameDifference: avgDiff,
                    wins: wonMatches.length
                };
            })
            .filter(d => d.wins >= 2)
            .sort((a, b) => b.avgGameDifference - a.avgGameDifference)
            .slice(0, 3);

        return {
            tournament,
            isPartial,
            giornate,
            numeroGiornate,
            totalePartite,
            totaleGamesDisputati,
            mediaGamesPerPartita,
            giocatoriPartecipanti,
            periodo,
            top5,
            giocatoreConPiuGamesVinti,
            giocatoreConPiuGamesPersi,
            coppiaFrequente,
            serieVittorie,
            upset: [{ count: upsets.length, details: upsets.slice(0, 3) }],
            maggiorGuadagnoElo,
            peggiorPerditaElo,
            mvp,
            gameWinRate,
            gameRatio,
            partiteVinte,
            eloPerPartita,
            upsetPercentage,
            migliorCoppiaWinRate,
            serieSconfitte,
            resilienza,
            form,
            clutchPerformance,
            difesaFerrea
        };
    };

    const tournamentStats = useMemo(() => {
        const stats = activeTournaments
            .map(t => calculateTournamentStats(t))
            .filter(Boolean) as TournamentStats[];
        
        console.log('📊 Tournament stats calculated:', stats.length);
        return stats;
    }, [activeTournaments, matches, eloHistory]);

    const handlePrintStats = (stats: TournamentStats) => {
        printTournamentStatistics(stats);
    };

    // If user selected a team tournament, show the draft even if there are no classic stats.
    const isTeamTournamentMode = !!selectedTeamTournamentRootId;

    if (!isTeamTournamentMode && (activeTournaments.length === 0 || tournamentStats.length === 0)) {
        return (
            <div className="space-y-6">
                <Card>
                    <div className="text-center p-8">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                            Nessun Torneo Attivo
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400">
                            Per visualizzare le statistiche di un torneo è necessaria almeno una partita completata
                        </p>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Tournament Filter */}
            <Card>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Filtra per Torneo
                    </label>
                    <select
                        value={selectedTournamentKey || ''}
                        onChange={(e) => {
                            shouldAutoExpandOnNextSelectionRef.current = true;
                            setSelectedTournamentKey(e.target.value);
                        }}
                        className="w-full md:w-64 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    >
                        {teamTournamentRoots.length > 0 && (
                            <optgroup label="Tornei a Squadre">
                                {teamTournamentRoots.map(t => (
                                    <option key={`tt:${t.id}`} value={`tt:${t.id}`}>
                                        {t.name}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                        {completedTournaments.length > 0 && (
                            <optgroup label="Altri tornei">
                                {completedTournaments.map(tournament => (
                                    <option key={`series:${(tournament.giornataName || tournament.name)}`} value={`series:${(tournament.giornataName || tournament.name)}`}>
                                        {tournament.giornataName || tournament.name}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                </div>
            </Card>

            {/* Draft Team Tournament stats (basic only) */}
            {isTeamTournamentMode && selectedTeamTournamentRootId && (() => {
                const root = teamTournamentRoots.find(r => r.id === selectedTeamTournamentRootId) || null;
                const rows = teamTournamentDerived?.playerRows || [];
                const loading = !!teamTournamentLoadingByRoot[selectedTeamTournamentRootId];
                const cfg = teamTournamentConfigByRoot[selectedTeamTournamentRootId] || null;
                const teams = teamTournamentTeamsByRoot[selectedTeamTournamentRootId] || [];
                const matchdays = teamTournamentMatchdaysByRoot[selectedTeamTournamentRootId] || [];
                const derived = teamTournamentDerived;
                const isPartial = !!root && root.status !== 'completed';
                return (
                    <Card key={`tt-card:${selectedTeamTournamentRootId}`}>
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                        {root?.name || 'Torneo a Squadre'}
                                    </h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        {root?.club || ''}{cfg?.scoringType ? ` • ${cfg.scoringType}` : ''}{cfg?.matchesPerDay ? ` • ${cfg.matchesPerDay} partite` : ''}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                            if (!root || !cfg) return;
                                            printTeamTournamentStatistics(
                                                { name: root.name, club: root.club, type: TournamentType.TorneoASquadre, status: root.status },
                                                cfg,
                                                teams,
                                                matchdays,
                                                derived
                                            );
                                        }}
                                        disabled={loading || !root || !cfg}
                                    >
                                        <span className="flex items-center gap-1"><PrintIcon /> Stampa riepilogo</span>
                                    </Button>
                                    {isPartial && (
                                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-300/20 dark:bg-amber-200/90 dark:text-amber-950">
                                            Dati parziali
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* 1) Informazioni generali */}
                            <HIGListSection header="📋 Informazioni Generali">
                                <StatBox label="Squadre" value={teams.length ? String(teams.length) : (cfg?.initialTeamCount ? String(cfg.initialTeamCount) : '—')} />
                                <StatBox label="Giocatori/Team" value={cfg?.defaultPlayersPerTeam ? String(cfg.defaultPlayersPerTeam) : '—'} />
                                <StatBox label="Partite/Giornata" value={cfg?.matchesPerDay ? String(cfg.matchesPerDay) : '—'} />
                                <StatBox label="Periodo" value={derived ? `${derived.periodo.inizio} - ${derived.periodo.fine}` : '—'} />
                                <StatBox
                                    label={cfg?.format === 'ELIMINAZIONE DIRETTA' ? 'Matchday giocati' : 'Partite RR'}
                                    value={derived
                                        ? (cfg?.format === 'ELIMINAZIONE DIRETTA'
                                            ? String(derived.playedTotal)
                                            : `${derived.playedRoundRobin} / ${derived.scheduleTotal || '—'}`)
                                        : '—'}
                                />
                                <StatBox label="Games Disputati" value={derived ? String(derived.gamesDisputati) : '—'} />
                                <StatBox label="Media G/Partita" value={derived ? derived.mediaGamesPerPartita.toFixed(1) : '—'} />
                            </HIGListSection>

                            {/* 2) Top 5 (senza ELO) */}
                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                                <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 text-gray-900 dark:text-white text-sm font-bold">
                                    Top 5
                                </div>
                                {loading ? (
                                    <div className="p-4 text-sm text-gray-500 dark:text-gray-400">Caricamento...</div>
                                ) : !derived || derived.top5.length === 0 ? (
                                    <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
                                        Nessun dato disponibile. Serve almeno una partita completata.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                                                <tr>
                                                    <th className="px-3 py-2 text-left font-semibold">Giocatore</th>
                                                    <th className="px-3 py-2 text-center font-semibold">G</th>
                                                    <th className="px-3 py-2 text-center font-semibold">V</th>
                                                    <th className="px-3 py-2 text-center font-semibold">P</th>
                                                    <th className="px-3 py-2 text-center font-semibold">Diff</th>
                                                    <th className="px-3 py-2 text-center font-semibold">%</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                {derived.top5.map((r, idx) => (
                                                    <tr key={`${r.name}-${r.surname}-${idx}`}>
                                                        <td className="px-3 py-2 text-gray-900 dark:text-white whitespace-nowrap">{r.name} {r.surname}</td>
                                                        <td className="px-3 py-2 text-center">{r.matchesPlayed}</td>
                                                        <td className="px-3 py-2 text-center">{r.matchesWon}</td>
                                                        <td className="px-3 py-2 text-center">{r.matchesLost}</td>
                                                        <td className="px-3 py-2 text-center">{r.gamesDiff >= 0 ? `+${r.gamesDiff}` : r.gamesDiff}</td>
                                                        <td className="px-3 py-2 text-center">{r.winPercentage}%</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* 3) Statistiche Avanzate e Personali */}
                            <div className="space-y-6">
                                <h4 className="text-md font-bold text-gray-900 dark:text-white mb-3 mt-8">
                                    Statistiche Avanzate
                                </h4>
                                
                                <StatCard 
                                    title="Più Games Vinti" 
                                    icon={<SFIcon name="target" size={14} />}
                                    entries={!loading && derived && derived.mostGamesWon.length > 0
                                        ? derived.mostGamesWon.map(r => `${r.name} ${r.surname} (${r.gamesWon} games)`)
                                        : ['(in attesa di dati ulteriori)']
                                    }
                                />
                                
                                <StatCard 
                                    title="Più Games Persi" 
                                    icon={<SFIcon name="chart.bar" size={14} />}
                                    entries={!loading && derived && derived.mostGamesLost.length > 0
                                        ? derived.mostGamesLost.map(r => `${r.name} ${r.surname} (${r.gamesLost} games)`)
                                        : ['(in attesa di dati ulteriori)']
                                    }
                                />
                                
                                <StatCard 
                                    title="Coppia Più Frequente" 
                                    icon={<SFIcon name="person.2.fill" size={14} />}
                                    entries={!loading && derived && derived.pairsTop.length > 0
                                        ? derived.pairsTop.map(p => `${p.label} (${p.played} partite)`)
                                        : ['(in attesa di dati ulteriori)']
                                    }
                                />
                                
                                <StatCard 
                                    title="Miglior Coppia (Win Rate)" 
                                    icon={<SFIcon name="star.fill" size={14} color="var(--ios-systemYellow)" />}
                                    entries={!loading && derived && derived.bestPairsByWinRate.length > 0
                                        ? derived.bestPairsByWinRate.map(p => `${p.label} (${p.winRate.toFixed(0)}% in ${p.played} match)`)
                                        : ['(in attesa di dati ulteriori)']
                                    }
                                />
                                
                                <StatCard 
                                    title="Serie Vittorie Consecutive" 
                                    icon={<SFIcon name="flame.fill" size={14} color="var(--ios-systemOrange)" />}
                                    entries={!loading && derived && derived.streakTop.length > 0
                                        ? derived.streakTop.map(s => `${s.label} (${s.best} vittorie)`)
                                        : ['(in attesa di dati ulteriori)']
                                    }
                                />

                                {/* UPSET */}
                                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                                    <h5 className="font-semibold text-gray-900 dark:text-white mb-2 text-sm">UPSET</h5>
                                    <p className="text-xs italic text-gray-500 dark:text-gray-400 mb-3">
                                        (Vittorie contro avversari superiori... sulla carta!)
                                    </p>
                                    <div className="space-y-1">
                                        {!loading && derived && derived.upset[0].count > 0 ? (
                                            <>
                                                <div className="text-sm text-gray-700 dark:text-gray-300 font-semibold">
                                                    {derived.upset[0].count} upset{derived.upset[0].count > 1 ? 's' : ''} registrat{derived.upset[0].count > 1 ? 'i' : 'o'}
                                                </div>
                                                {derived.upset[0].details.map((detail: string, idx: number) => (
                                                    <div key={idx} className="text-xs text-gray-600 dark:text-gray-400">
                                                        {idx + 1}. {detail}
                                                    </div>
                                                ))}
                                            </>
                                        ) : (
                                            <div className="text-sm text-gray-700 dark:text-gray-300">
                                                Nessun upset registrato
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <StatCard 
                                    title="Maggior Guadagno ELO" 
                                    icon={<SFIcon name="arrow.up.right.circle" size={14} color="var(--ios-systemGreen)" />}
                                    entries={!loading && derived && derived.maggiorGuadagnoElo.length > 0 && derived.maggiorGuadagnoElo[0].guadagno > 0
                                        ? derived.maggiorGuadagnoElo.map(e => `${e.player.name} ${e.player.surname} (+${e.guadagno.toFixed(1)} il ${e.data})`)
                                        : ['(in attesa di dati ulteriori)']
                                    }
                                />
                                
                                <StatCard 
                                    title="Peggior Perdita ELO" 
                                    icon={<SFIcon name="arrow.down.right.circle" size={14} color="var(--ios-systemRed)" />}
                                    entries={!loading && derived && derived.peggiorPerditaElo.length > 0 && derived.peggiorPerditaElo[0].perdita > 0
                                        ? derived.peggiorPerditaElo.map(e => `${e.player.name} ${e.player.surname} (-${e.perdita.toFixed(1)} il ${e.data})`)
                                        : ['(in attesa di dati ulteriori)']
                                    }
                                />
                            </div>

                            {/* 4. Statistiche di Performance */}
                            <div className="space-y-6">
                                <h4 className="text-md font-bold text-gray-900 dark:text-white mb-3 mt-8">
                                    Statistiche di Performance
                                </h4>
                                
                                <StatCard 
                                    title="Forma (Ultime 5 partite)" 
                                    icon={<SFIcon name="waveform.path.ecg" size={14} color="var(--ios-systemIndigo)" />}
                                    entries={!loading && derived && derived.form && derived.form.length > 0
                                        ? derived.form.map(f => `${f.player.name} ${f.player.surname}: ${f.form}`)
                                        : ['(in attesa di dati ulteriori)']
                                    }
                                />
                                
                                <StatCard 
                                    title="Clutch Performance" 
                                    icon={<SFIcon name="bolt.fill" size={14} color="var(--ios-systemYellow)" />}
                                    entries={!loading && derived && derived.clutchPerformance && derived.clutchPerformance.length > 0
                                        ? derived.clutchPerformance.map(c => `${c.player.name} ${c.player.surname} (${c.clutchWinRate.toFixed(0)}% - ${c.clutchMatches} match tirati)`)
                                        : ['(in attesa di dati ulteriori)']
                                    }
                                />
                                
                                <StatCard 
                                    title="Difesa Ferrea" 
                                    icon={<SFIcon name="shield.fill" size={14} color="var(--ios-systemBlue)" />}
                                    entries={!loading && derived && derived.difesaFerrea && derived.difesaFerrea.length > 0
                                        ? derived.difesaFerrea.map(d => `${d.player.name} ${d.player.surname} (+${d.avgGameDifference.toFixed(1)} games per vittoria)`)
                                        : ['(in attesa di dati ulteriori)']
                                    }
                                />

                                <StatCard 
                                    title="MVP (Giornate Vinte)" 
                                    icon={<SFIcon name="crown.fill" size={14} color="var(--ios-systemYellow)" />}
                                    entries={!loading && derived && derived.mvp && derived.mvp.length > 0 && derived.mvp[0].vittorieGiornate > 0
                                        ? derived.mvp.map(m => `${m.player.name} ${m.player.surname} (${m.vittorieGiornate} giornate)`)
                                        : ['(in attesa di dati ulteriori)']
                                    }
                                />
                            </div>

                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                                <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 text-gray-900 dark:text-white text-sm font-bold">
                                    Classifica Giocatori
                                </div>
                                {loading ? (
                                    <div className="p-4 text-sm text-gray-500 dark:text-gray-400">Caricamento...</div>
                                ) : rows.length === 0 ? (
                                    <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
                                        Nessun dato disponibile. Serve almeno una giornata completata.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                                                <tr>
                                                    <th className="px-3 py-2 text-left font-semibold">Giocatore</th>
                                                    <th className="px-3 py-2 text-center font-semibold">G</th>
                                                    <th className="px-3 py-2 text-center font-semibold">V</th>
                                                    <th className="px-3 py-2 text-center font-semibold">P</th>
                                                    <th className="px-3 py-2 text-center font-semibold">GF</th>
                                                    <th className="px-3 py-2 text-center font-semibold">GS</th>
                                                    <th className="px-3 py-2 text-center font-semibold">Diff</th>
                                                    <th className="px-3 py-2 text-center font-semibold">%</th>
                                                    <th className="px-3 py-2 text-right font-semibold">Var. ELO</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                {rows.map((r, idx) => (
                                                    <tr key={`${r.name}-${r.surname}-${idx}`}>
                                                        <td className="px-3 py-2 text-gray-900 dark:text-white whitespace-nowrap">{r.name} {r.surname}</td>
                                                        <td className="px-3 py-2 text-center">{r.matchesPlayed}</td>
                                                        <td className="px-3 py-2 text-center">{r.matchesWon}</td>
                                                        <td className="px-3 py-2 text-center">{r.matchesLost}</td>
                                                        <td className="px-3 py-2 text-center">{r.gamesWon}</td>
                                                        <td className="px-3 py-2 text-center">{r.gamesLost}</td>
                                                        <td className="px-3 py-2 text-center">{r.gamesDiff >= 0 ? `+${r.gamesDiff}` : r.gamesDiff}</td>
                                                        <td className="px-3 py-2 text-center">{r.winPercentage}%</td>
                                                        <td className={`px-3 py-2 text-right font-bold ${r.eloVar > 0 ? 'text-green-500' : r.eloVar < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                                                            {r.eloVar > 0 ? '+' : ''}{r.eloVar?.toFixed(2) || '0.00'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>
                );
            })()}

            {/* Existing statistics for non-team tournaments (unchanged) */}
                            {!isTeamTournamentMode && tournamentStats.map(stats => {
                const isExpanded = expandedTournament === stats.tournament.id;
                
                return (
                    <Card key={stats.tournament.id}>
                        <div className="space-y-4">
                            {/* Header collapsibile */}
                            <div 
                                className="flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-3 rounded-lg transition-colors"
                                onClick={() => setExpandedTournament(isExpanded ? null : stats.tournament.id)}
                            >
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                        {stats.tournament.name}
                                    </h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        {stats.numeroGiornate} giornat{stats.numeroGiornate === 1 ? 'a' : 'e'} • {stats.totalePartite} partite • {stats.giocatoriPartecipanti} giocatori
                                    </p>
                                </div>
                                <ChevronDownIcon className={`h-6 w-6 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>

                            {/* Contenuto espandibile */}
                            {isExpanded && (
                                <div className="space-y-6 border-t border-gray-200 dark:border-gray-700 pt-6">
                                    {/* Bottone stampa */}
                                    <div className="flex flex-col items-end gap-2">
                                        <Button onClick={() => handlePrintStats(stats)} variant="secondary" size="sm">
                                            <span className="flex items-center gap-1"><PrintIcon /> Stampa Riepilogo</span>
                                        </Button>
                                        {stats.isPartial && (
                                            <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-300/20 dark:bg-amber-200/90 dark:text-amber-950">
                                                Dati parziali
                                            </span>
                                        )}
                                    </div>

                                    {/* 1. Informazioni Generali */}
                                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
                                        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 text-gray-900 dark:text-white text-sm font-bold">
                                            📋 Informazioni Generali
                                        </div>
                                        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <StatBox label="Periodo" value={`${stats.periodo.inizio} - ${stats.periodo.fine}`} />
                                            <StatBox label="Giornate" value={stats.numeroGiornate.toString()} />
                                            <StatBox label="Partite Totali" value={stats.totalePartite.toString()} />
                                            <StatBox label="Games Disputati" value={stats.totaleGamesDisputati.toString()} />
                                            <StatBox label="Media Games/Partita" value={stats.mediaGamesPerPartita.toFixed(1)} />
                                            <StatBox label="Giocatori" value={stats.giocatoriPartecipanti.toString()} />
                                            <StatBox label="Circolo" value={stats.tournament.club} />
                                        </div>
                                    </div>

                                    {/* 2. Top 5 Classifica */}
                                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
                                        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 text-gray-900 dark:text-white text-sm font-bold flex items-center gap-1.5">
                                            <SFIcon name="trophy.fill" size={16} color="var(--ios-systemYellow)" />
                                            <span>TOP 5 CLASSIFICA</span>
                                        </div>
                                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {stats.top5.map((entry, idx) => {
                                                let iconName = `${idx + 1}.circle.fill`;
                                                let iconColor = "var(--ios-tertiaryLabel)";
                                                if (idx === 0) { iconName = "trophy.fill"; iconColor = "var(--ios-systemYellow)"; }
                                                else if (idx === 1) { iconName = "medal.fill"; iconColor = "var(--ios-systemGray)"; }
                                                else if (idx === 2) { iconName = "medal.fill"; iconColor = "var(--ios-systemOrange)"; }

                                                return (
                                                    <div key={entry.player.id} className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 flex justify-center"><SFIcon name={iconName} color={iconColor} size={24} /></div>
                                                            <div>
                                                                <div className="font-semibold text-gray-900 dark:text-white">{`${entry.player.name} ${entry.player.surname}`}</div>
                                                                <div className="text-sm text-gray-500 dark:text-gray-400">Games V/P: {entry.gamesWon}/{entry.gamesLost}</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end text-right">
                                                            <span className="font-bold text-gray-900 dark:text-white">{entry.eloTorneo.toFixed(2)} ELO</span>
                                                            <span className={`text-xs font-semibold ${entry.variazioneElo >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                                {entry.variazioneElo >= 0 ? '+' : ''}{entry.variazioneElo.toFixed(2)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* 3. Statistiche Avanzate */}
                                    <div>
                                        <div className="space-y-6">
                                            <StatCard 
                                                title="Più Games Vinti" 
                                                icon={<SFIcon name="target" size={14} />}
                                                entries={stats.giocatoreConPiuGamesVinti.length > 0 && stats.giocatoreConPiuGamesVinti[0].games > 0
                                                    ? stats.giocatoreConPiuGamesVinti.map(e => 
                                                        `${e.player.name} ${e.player.surname} (${e.games} games)`
                                                    )
                                                    : ['(in attesa di dati ulteriori)']
                                                }
                                            />
                                            <StatCard 
                                                title="Più Games Persi" 
                                                icon={<SFIcon name="chart.bar" size={14} />}
                                                entries={stats.giocatoreConPiuGamesPersi.length > 0 && stats.giocatoreConPiuGamesPersi[0].games > 0
                                                    ? stats.giocatoreConPiuGamesPersi.map(e => 
                                                        `${e.player.name} ${e.player.surname} (${e.games} games)`
                                                    )
                                                    : ['(in attesa di dati ulteriori)']
                                                }
                                            />
                                            <StatCard 
                                                title="Coppia Più Frequente" 
                                                icon={<SFIcon name="person.2.fill" size={14} />}
                                                entries={stats.coppiaFrequente.length > 0
                                                    ? stats.coppiaFrequente.map(c => 
                                                        `${formatPlayerShortName(c.players[0])} & ${formatPlayerShortName(c.players[1])} (${c.partite} partite)`
                                                    )
                                                    : ['(in attesa di dati ulteriori)']
                                                }
                                            />
                                            <StatCard 
                                                title="Serie Vittorie Consecutive" 
                                                icon={<SFIcon name="flame.fill" size={14} color="var(--ios-systemOrange)" />}
                                                entries={stats.serieVittorie.length > 0 && stats.serieVittorie[0].vittorie > 0
                                                    ? stats.serieVittorie.map(s => 
                                                        `${s.player.name} ${s.player.surname} (${s.vittorie} vittorie)`
                                                    )
                                                    : ['(in attesa di dati ulteriori)']
                                                }
                                            />
                                            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg md:col-span-2">
                                                <h5 className="font-semibold text-gray-900 dark:text-white mb-2 text-sm">UPSET</h5>
                                                <p className="text-xs italic text-gray-500 dark:text-gray-400 mb-3">
                                                    (Vittorie contro avversari superiori... sulla carta!)
                                                </p>
                                                <div className="space-y-1">
                                                    {stats.upset[0].count > 0 ? (
                                                        <>
                                                            <div className="text-sm text-gray-700 dark:text-gray-300 font-semibold">
                                                                {stats.upset[0].count} upset{stats.upset[0].count > 1 ? 's' : ''} registrat{stats.upset[0].count > 1 ? 'i' : 'o'}
                                                            </div>
                                                            {stats.upset[0].details.map((detail: string, idx: number) => (
                                                                <div key={idx} className="text-xs text-gray-600 dark:text-gray-400">
                                                                    {idx + 1}. {detail}
                                                                </div>
                                                            ))}
                                                        </>
                                                    ) : (
                                                        <div className="text-sm text-gray-700 dark:text-gray-300">
                                                            Nessun upset registrato
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <StatCard 
                                                title="Maggior Guadagno ELO" 
                                                icon={<SFIcon name="arrow.up.right.circle" size={14} color="var(--ios-systemGreen)" />}
                                                entries={stats.maggiorGuadagnoElo.map(e => 
                                                    e.guadagno > 0 
                                                        ? `${e.player.name} ${e.player.surname} (+${e.guadagno.toFixed(1)} il ${e.data})`
                                                        : '(in attesa di dati ulteriori)'
                                                )}
                                            />
                                            <StatCard 
                                                title="Peggior Perdita ELO" 
                                                icon={<SFIcon name="arrow.down.right.circle" size={14} color="var(--ios-systemRed)" />}
                                                entries={stats.peggiorPerditaElo.map(e => 
                                                    e.perdita > 0 
                                                        ? `${e.player.name} ${e.player.surname} (-${e.perdita.toFixed(1)} il ${e.data})`
                                                        : '(in attesa di dati ulteriori)'
                                                )}
                                            />
                                        </div>
                                    </div>

                                    {/* 4. Statistiche di Performance */}
                                    <div>
                                        <h4 className="text-md font-bold text-gray-900 dark:text-white mb-3 mt-8">
                                            Statistiche di Performance
                                        </h4>
                                        <div className="space-y-6">
                                            <StatCard 
                                                title="Game Win Rate %" 
                                                icon={<SFIcon name="target" size={14} />}
                                                entries={stats.gameWinRate.length > 0
                                                    ? stats.gameWinRate.map(e => 
                                                        `${e.player.name} ${e.player.surname} (${e.percentage.toFixed(1)}%)`
                                                    )
                                                    : ['(in attesa di dati ulteriori)']
                                                }
                                            />
                                            <StatCard 
                                                title="Game Ratio" 
                                                icon={<SFIcon name="chart.pie.fill" size={14} />}
                                                entries={stats.gameRatio.length > 0
                                                    ? stats.gameRatio.map(e => 
                                                        `${e.player.name} ${e.player.surname} (${e.ratio.toFixed(2)})`
                                                    )
                                                    : ['(in attesa di dati ulteriori)']
                                                }
                                            />
                                            <StatCard 
                                                title="Partite Vinte" 
                                                icon={<SFIcon name="sportscourt" size={14} />}
                                                entries={stats.partiteVinte.length > 0
                                                    ? stats.partiteVinte.map(e => 
                                                        `${e.player.name} ${e.player.surname} (${e.wins} vittorie)`
                                                    )
                                                    : ['(in attesa di dati ulteriori)']
                                                }
                                            />
                                            <StatCard 
                                                title="ELO per Partita" 
                                                icon={<SFIcon name="chart.line.uptrend.xyaxis" size={14} />}
                                                entries={stats.eloPerPartita.length > 0
                                                    ? stats.eloPerPartita.map(e => 
                                                        `${e.player.name} ${e.player.surname} (${e.eloPerMatch >= 0 ? '+' : ''}${e.eloPerMatch.toFixed(1)})`
                                                    )
                                                    : ['(in attesa di dati ulteriori)']
                                                }
                                            />
                                            <StatCard 
                                                title="% Upset Riusciti" 
                                                icon={<SFIcon name="sparkles" size={14} />}
                                                entries={stats.upsetPercentage.length > 0
                                                    ? stats.upsetPercentage.map(e => 
                                                        `${e.player.name} ${e.player.surname} (${e.percentage.toFixed(1)}%)`
                                                    )
                                                    : ['(in attesa di dati ulteriori)']
                                                }
                                            />
                                            <StatCard
                                                title="Miglior Coppia (Win Rate)"
                                                icon={<SFIcon name="person.2.fill" size={14} />}
                                                entries={stats.migliorCoppiaWinRate.length > 0
                                                    ? stats.migliorCoppiaWinRate.map(e =>
                                                        `${formatPlayerShortName(e.players[0])} & ${formatPlayerShortName(e.players[1])} (${e.winRate.toFixed(1)}% - ${e.partite} partite)`
                                                    )
                                                    : ['(in attesa di dati ulteriori)']
                                                }
                                            />
                                            <StatCard
                                                title="Form (Ultimi Match)"
                                                icon={<SFIcon name="chart.bar.fill" size={14} />}
                                                entries={stats.form.length > 0
                                                    ? stats.form.map(f =>
                                                        `${f.player.name} ${f.player.surname} (${f.form})`
                                                    )
                                                    : ['(in attesa di dati ulteriori)']
                                                }
                                            />
                                            <StatCard
                                                title="Clutch Performance"
                                                icon={<SFIcon name="target" size={14} />}
                                                entries={stats.clutchPerformance.length > 0
                                                    ? stats.clutchPerformance.map(c =>
                                                        `${c.player.name} ${c.player.surname} (${c.clutchWinRate.toFixed(1)}% in ${c.clutchMatches} match decisivi)`
                                                    )
                                                    : ['(in attesa di dati ulteriori)']
                                                }
                                            />
                                            <StatCard
                                                title="Difesa Ferrea"
                                                icon={<SFIcon name="shield.fill" size={14} />}
                                                entries={stats.difesaFerrea.length > 0
                                                    ? stats.difesaFerrea.map(d =>
                                                        `${d.player.name} ${d.player.surname} (+${d.avgGameDifference.toFixed(1)} games di media in ${d.wins} vittorie)`
                                                    )
                                                    : ['(in attesa di dati ulteriori)']
                                                }
                                            />
                                        </div>
                                    </div>

                                    {/* 5. Premi Simbolici */}
                                    <div>
                                        <h4 className="text-md font-bold text-gray-900 dark:text-white mb-3 mt-8">
                                            Premi Simbolici
                                        </h4>
                                        <div className="grid grid-cols-1 gap-4">
                                            <AwardCard 
                                                title="MVP" 
                                                subtitle="Più giornate vinte"
                                                icon={<SFIcon name="crown.fill" size={24} color="var(--ios-systemYellow)" />}
                                                entries={stats.mvp.map(m => 
                                                    m.vittorieGiornate > 0 
                                                        ? `${m.player.name} ${m.player.surname} (${m.vittorieGiornate} giornat${m.vittorieGiornate === 1 ? 'a' : 'e'})`
                                                        : '(in attesa di dati ulteriori)'
                                                )}
                                                color="yellow"
                                            />
                                        </div>
                                    </div>

                                    {/* 6. Premi Speciali */}
                                    <div>
                                        <h4 className="text-md font-bold text-gray-900 dark:text-white mb-3 mt-8">
                                            Premi Speciali
                                        </h4>
                                        <div className="space-y-6">
                                            <AwardCard 
                                                title="Cecchino" 
                                                subtitle="Miglior Game Win Rate"
                                                icon={<SFIcon name="target" size={24} color="var(--ios-systemBlue)" />}
                                                entries={stats.gameWinRate.length > 0
                                                    ? [`${stats.gameWinRate[0].player.name} ${stats.gameWinRate[0].player.surname} (${stats.gameWinRate[0].percentage.toFixed(1)}%)`]
                                                    : ['(in attesa di dati ulteriori)']
                                                }
                                                color="blue"
                                            />
                                            <AwardCard 
                                                title="Giant Killer" 
                                                subtitle="Più vittorie contro ELO superiori"
                                                icon={<SFIcon name="sparkles" size={24} color="var(--ios-systemOrange)" />}
                                                entries={stats.upsetPercentage.length > 0
                                                    ? [`${stats.upsetPercentage[0].player.name} ${stats.upsetPercentage[0].player.surname} (${stats.upsetPercentage[0].percentage.toFixed(1)}%)`]
                                                    : ['(in attesa di dati ulteriori)']
                                                }
                                                color="orange"
                                            />
                                            <AwardCard 
                                                title="Incassatore" 
                                                subtitle="Resilienza (minor perdita ELO)"
                                                icon={<SFIcon name="shield.fill" size={24} color="var(--ios-systemTeal)" />}
                                                entries={stats.resilienza.length > 0
                                                    ? [`${stats.resilienza[0].player.name} ${stats.resilienza[0].player.surname} (-${stats.resilienza[0].perditaMedia.toFixed(1)} ELO/match)`]
                                                    : ['(in attesa di dati ulteriori)']
                                                }
                                                color="teal"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                );
            })}
        </div>
    );
};

// Componenti helper
const StatBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
        <div className="text-lg font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
);

const StatCard: React.FC<{ title: string; entries: string[]; icon?: React.ReactNode }> = ({ title, entries, icon }) => (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 text-gray-900 dark:text-white text-sm font-bold flex items-center gap-2">
            {icon}
            <span>{title}</span>
        </div>
        <div className="p-4 space-y-1 text-sm text-gray-800 dark:text-gray-200">
            {entries.map((entry, idx) => (
                <div key={idx}>{idx + 1}. {entry}</div>
            ))}
        </div>
    </div>
);

const AwardCard: React.FC<{ 
    title: string; 
    subtitle: string; 
    entries: string[]; 
    color: 'yellow' | 'purple' | 'green' | 'blue' | 'orange' | 'teal';
    icon?: React.ReactNode;
}> = ({ title, subtitle, entries, color, icon }) => {
    const colorClasses = {
        yellow: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400/50 dark:border-yellow-300/18',
        purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-400/50 dark:border-purple-300/18',
        green: 'bg-green-50 dark:bg-green-900/20 border-green-400/50 dark:border-green-300/18',
        blue: 'bg-gray-50 dark:bg-gray-800/20 border-blue-400/50 dark:border-blue-300/18',
        orange: 'bg-orange-50 dark:bg-orange-900/20 border-orange-400/50 dark:border-orange-300/18',
        teal: 'bg-teal-50 dark:bg-teal-900/20 border-teal-400/50 dark:border-teal-300/18'
    };

    return (
        <div className={`${colorClasses[color]} border p-4 rounded-lg`}>
            <h5 className="font-bold text-gray-900 dark:text-white mb-1">{title}</h5>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">{subtitle}</p>
            <div className="space-y-1">
                {entries.map((entry, idx) => (
                    <div key={idx} className="text-sm text-gray-800 dark:text-gray-200 font-medium">
                        {entry}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default StatistichePage;
