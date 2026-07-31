import React, { useMemo, useState } from 'react';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import { Player, RankingEntry, SetScore, Tournament, TournamentType, TeamTournamentMatchday } from '../types.ts';
import RankingChart from '../components/RankingChart.tsx';
import { buildPlayerEloTimeline, formatLabel } from '../services/eloEventsService.ts';
import { printRanking } from '../services/printService.ts';
import { getTournamentDisplayName } from '../utils/tournamentLabels.ts';
import PlayerProfileModal from '../components/PlayerProfileModal.tsx';
import { SFIcon } from '../components/ui/SFIcon.tsx';
import HIGButton from '../components/ui/HIGButton.tsx';
import HIGSegmentedControl from '../components/ui/HIGSegmentedControl.tsx';
import Card from '../components/ui/Card.tsx';

interface RankingPageProps {
    theme: 'light' | 'dark';
}

const isTeamRoot = (t: Tournament) => t.type === TournamentType.TorneoASquadre && (!t.teamTournamentRootId || t.teamTournamentRootId === t.id);

const RankingPage: React.FC<RankingPageProps> = ({ theme = 'dark' }) => {
    const { players, matches, eloHistory, tournaments, loading, fetchData } = usePadelStore();
    const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
    const [profilePlayer, setProfilePlayer] = useState<Player | null>(null);
    const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
    const [presenceThreshold, setPresenceThreshold] = useState<number>(0);
    const [showAllPlayers, setShowAllPlayers] = useState<boolean>(false);
    const [selectedTeamTournamentMatchdayIds, setSelectedTeamTournamentMatchdayIds] = useState<string[]>([]);
    const [teamMatchdaysCache, setTeamMatchdaysCache] = useState<TeamTournamentMatchday[]>([]);
    const { getTeamTournamentMatchdays } = usePadelStore();

    // Fetch fresh data from DB when component mounts
    React.useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Reset showAllPlayers when tournament or threshold changes
    React.useEffect(() => {
        setShowAllPlayers(false);
    }, [selectedTournamentId, presenceThreshold]);

    // Fetch matchdays if the selected tournament is a team tournament
    React.useEffect(() => {
        if (!selectedTournamentId) {
            setSelectedTeamTournamentMatchdayIds([]);
            setTeamMatchdaysCache([]);
            return;
        }
        
        const isTeamTournament = tournaments.some(t => t.name === selectedTournamentId && isTeamRoot(t));
        if (isTeamTournament) {
            const rootTournament = tournaments.find(t => t.name === selectedTournamentId && isTeamRoot(t));
            if (rootTournament) {
                getTeamTournamentMatchdays(rootTournament.id).then(matchdays => {
                    setSelectedTeamTournamentMatchdayIds(matchdays.map(m => m.id));
                    setTeamMatchdaysCache(matchdays);
                }).catch(err => {
                    console.error("Failed to load matchdays for ranking", err);
                    setSelectedTeamTournamentMatchdayIds([]);
                    setTeamMatchdaysCache([]);
                });
            }
        } else {
            setSelectedTeamTournamentMatchdayIds([]);
            setTeamMatchdaysCache([]);
        }
    }, [selectedTournamentId, tournaments, getTeamTournamentMatchdays]);

    // Calculate giornate for selected tournament SERIES (by seriesKey = giornataName || name)
    const tournamentGiornate = useMemo(() => {
        if (!selectedTournamentId) return [];
        const isTeamTournament = tournaments.some(t => t.name === selectedTournamentId && isTeamRoot(t));
        if (isTeamTournament) {
            const rootId = tournaments.find(t => t.name === selectedTournamentId && isTeamRoot(t))?.id;
            const tournamentRecords = tournaments.filter(t => t.teamTournamentRootId === rootId);
            return tournamentRecords.map(t => new Date(t.date).toISOString().split('T')[0]).sort();
        }
        const tournamentRecords = tournaments.filter(t => (t.giornataName || t.name) === selectedTournamentId);
        return tournamentRecords.map(t => new Date(t.date).toISOString().split('T')[0]).sort();
    }, [selectedTournamentId, tournaments]);

    const rankingData: RankingEntry[] = useMemo(() => {
        if (loading && !players.length) {
            return [];
        }

        const sortedEventsByDate = [...eloHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        let filteredPlayers = players;
        
        if (selectedTournamentId) {
            const isTeamTournament = tournaments.some(t => t.name === selectedTournamentId && isTeamRoot(t));
            const playersInTournament = new Set<string>();
            
            if (isTeamTournament) {
                // Find all players that participated in these matchdays via eloHistory
                // (Since TeamTournamentMatchdays aren't loaded in matches state)
                eloHistory.forEach(e => {
                    if (selectedTeamTournamentMatchdayIds.includes(e.eventId)) {
                        playersInTournament.add(e.playerId);
                    }
                });
            } else {
                const normSelected = selectedTournamentId.trim().toLowerCase();
                const tournamentIds = tournaments
                    .filter(t => 
                        (t.giornataName && t.giornataName.trim().toLowerCase() === normSelected) || 
                        (t.name && t.name.trim().toLowerCase() === normSelected)
                    )
                    .map(t => t.id);
                const tournamentMatches = matches.filter(m => m.tournamentId && tournamentIds.includes(m.tournamentId));
                tournamentMatches.forEach(m => {
                    m.team1.forEach(id => playersInTournament.add(id));
                    m.team2.forEach(id => playersInTournament.add(id));
                });
            }
            filteredPlayers = players.filter(p => playersInTournament.has(p.id));
        }
        
        return filteredPlayers
            .map(player => {
                let playerMatches = matches.filter(m => {
                    const hasPlayer = m.team1.includes(player.id) || m.team2.includes(player.id);
                    if (!hasPlayer) return false;
                    
                    if (selectedTournamentId) {
                        const tournament = tournaments.find(t => t.id === m.tournamentId);
                        const normSelected = selectedTournamentId.trim().toLowerCase();
                        return tournament && (
                            (tournament.giornataName && tournament.giornataName.trim().toLowerCase() === normSelected) || 
                            (tournament.name && tournament.name.trim().toLowerCase() === normSelected)
                        );
                    }
                    
                    if (!m.tournamentId) return true;
                    
                    const tournament = tournaments.find(t => t.id === m.tournamentId);
                    return tournament?.status === 'completed';
                });
                
                const isTeamTournament = selectedTournamentId && tournaments.some(t => t.name === selectedTournamentId && isTeamRoot(t));
                
                let matchesPlayed = playerMatches.length;
                let matchesWon = 0;
                let gamesWon = 0;
                let gamesLost = 0;
                
                if (isTeamTournament) {
                    // For team tournaments, we don't have individual match data loaded in `matches` state globally.
                    // We deduce wins/losses from eloHistory deltas if needed, or we just leave them at 0 for team tournaments for now,
                    // as detailed match stats aren't easily available here without fetching all matches.
                    // But we DO know they played if they have an eloHistory entry for the matchday.
                    const tournamentEloEntries = eloHistory.filter(e => 
                        e.playerId === player.id && selectedTeamTournamentMatchdayIds.includes(e.eventId)
                    );
                    matchesPlayed = tournamentEloEntries.length; // Approximate matches played by matchdays participated
                } else {
                    playerMatches.forEach(match => {
                        const isTeam1 = match.team1.includes(player.id);
                        const setsArray = Array.isArray(match.sets) ? match.sets : Object.values(match.sets) as SetScore[];
                        const team1GamesTotal = setsArray.reduce((sum, set) => sum + (set.team1 || 0), 0);
                        const team2GamesTotal = setsArray.reduce((sum, set) => sum + (set.team2 || 0), 0);
    
                        if (isTeam1) {
                            gamesWon += team1GamesTotal;
                            gamesLost += team2GamesTotal;
                            if (match.winner === 'team1') {
                                matchesWon++;
                            }
                        } else {
                            gamesWon += team2GamesTotal;
                            gamesLost += team1GamesTotal;
                            if (match.winner === 'team2') {
                                matchesWon++;
                            }
                        }
                    });
                }
                
                const winPercentage = matchesPlayed > 0 ? (matchesWon / matchesPlayed) * 100 : 0;
                
                // Build aggregated timeline for the player
                const playerTimeline = buildPlayerEloTimeline(
                    player.id,
                    eloHistory,
                    matches,
                    tournaments,
                    teamMatchdaysCache,
                    { parentTournamentName: selectedTournamentId }
                );

                const playerGiornateCount = playerTimeline.length;

                // ELO visualizzato
                let displayElo = player.currentElo;
                if (selectedTournamentId) {
                    let tournamentDelta = playerTimeline.reduce((sum, entry) => sum + entry.delta, 0);
                    // Fallback: if eloHistory does not contain entries for this tournament yet, calculate delta on the fly from matches
                    if (playerTimeline.length === 0 && playerMatches.length > 0) {
                        const K = 16;
                        const currentCumElo = new Map<string, number>();

                        // Sort matches by round
                        const sortedMatches = [...playerMatches].sort((a, b) => (a.roundNumber || 1) - (b.roundNumber || 1));

                        sortedMatches.forEach(m => {
                            if (!m.winner) return;
                            const t1P1Elo = currentCumElo.get(m.team1[0]) ?? 1500;
                            const t1P2Elo = currentCumElo.get(m.team1[1]) ?? t1P1Elo;
                            const team1Avg = (t1P1Elo + t1P2Elo) / 2;

                            const t2P1Elo = currentCumElo.get(m.team2[0]) ?? 1500;
                            const t2P2Elo = currentCumElo.get(m.team2[1]) ?? t2P1Elo;
                            const team2Avg = (t2P1Elo + t2P2Elo) / 2;

                            const expected1 = 1 / (1 + Math.pow(10, (team2Avg - team1Avg) / 400));
                            const score1 = m.winner === 'team1' ? 1 : m.winner === 'team2' ? 0 : 0.5;
                            const delta1 = K * (score1 - expected1);
                            const delta2 = K * ((1 - score1) - (1 - expected1));

                            m.team1.forEach(pid => currentCumElo.set(pid, (currentCumElo.get(pid) ?? 1500) + delta1));
                            m.team2.forEach(pid => currentCumElo.set(pid, (currentCumElo.get(pid) ?? 1500) + delta2));
                        });

                        displayElo = currentCumElo.get(player.id) ?? 1500;
                    } else {
                        displayElo = 1500 + tournamentDelta;
                    }
                }

                // Ultimo Delta (il delta del giorno più recente)
                let lastDelta = null;
                if (selectedTournamentId) {
                    if (playerTimeline.length > 0) {
                        lastDelta = playerTimeline[0].delta;
                    }
                } else {
                    const generalTimeline = buildPlayerEloTimeline(
                        player.id,
                        eloHistory,
                        matches,
                        tournaments,
                        teamMatchdaysCache
                    );
                    if (generalTimeline.length > 0) {
                        lastDelta = generalTimeline[0].delta;
                    }
                }

                let presencePercentage = 100;
                if (selectedTournamentId && tournamentGiornate.length > 0) {
                    presencePercentage = (playerGiornateCount / tournamentGiornate.length) * 100;
                }

                return {
                    ...player,
                    currentElo: displayElo,
                    rank: 0,
                    matchesPlayed,
                    matchesWon,
                    gamesWon,
                    gamesLost,
                    winPercentage,
                    lastDelta,
                    presencePercentage,
                    playerGiornateCount,
                };
            })
            .sort((a, b) => {
                if (selectedTournamentId && presenceThreshold > 0) {
                    const aAboveThreshold = a.presencePercentage >= presenceThreshold;
                    const bAboveThreshold = b.presencePercentage >= presenceThreshold;
                    
                    if (aAboveThreshold && !bAboveThreshold) return -1;
                    if (!aAboveThreshold && bAboveThreshold) return 1;
                }
                return b.currentElo - a.currentElo;
            })
            .map((player, index) => ({ ...player, rank: index + 1 }));
    }, [players, matches, eloHistory, loading, selectedTournamentId, presenceThreshold, tournamentGiornate, tournaments]);

    const handleToggleExpand = (playerId: string) => {
        setExpandedPlayerId(prevId => (prevId === playerId ? null : playerId));
    };

    const completedTournaments = useMemo(() => {
        const tournamentMap = new Map<string, Tournament>();
        const tourneysWithResults = new Set<string>();

        // Collect tournament names/series keys that have ELO variations
        eloHistory.forEach(h => {
            if (h.sourceLabel && h.sourceLabel.trim()) {
                tourneysWithResults.add(h.sourceLabel.trim().toLowerCase());
            }
        });

        // Collect tournament names/series keys from completed matches
        matches.forEach(m => {
            if (m.winner && m.tournamentId) {
                const t = tournaments.find(tourney => tourney.id === m.tournamentId);
                if (t) {
                    if (t.name) tourneysWithResults.add(t.name.trim().toLowerCase());
                    if (t.giornataName) tourneysWithResults.add(t.giornataName.trim().toLowerCase());
                }
            }
        });

        tournaments
            .filter(t => {
                const isTeam = isTeamRoot(t);
                const seriesKey = isTeam ? t.name : (t.giornataName || t.name);
                if (!seriesKey) return false;
                
                const normKey = seriesKey.trim().toLowerCase();
                if (tourneysWithResults.has(normKey)) return true;

                // For root team tournaments, check if any matchday has ELO entries or results
                if (isTeam) {
                    const childIds = new Set(tournaments.filter(c => c.teamTournamentRootId === t.id).map(c => c.id));
                    const hasEloForChild = eloHistory.some(h => childIds.has(h.eventId));
                    const hasMatchForChild = matches.some(m => m.tournamentId && childIds.has(m.tournamentId) && Boolean(m.winner));
                    if (hasEloForChild || hasMatchForChild) return true;
                }

                return false;
            })
            .forEach(t => {
                const seriesKey = isTeamRoot(t) ? t.name : (t.giornataName || t.name);
                if (!tournamentMap.has(seriesKey)) {
                    tournamentMap.set(seriesKey, t);
                }
            });
        return Array.from(tournamentMap.values());
    }, [tournaments, eloHistory, matches]);

    const getMedalIcon = (index: number) => {
        switch (index) {
            case 0: return <SFIcon name="medal.fill" size={20} color="var(--ios-systemYellow)" />;
            case 1: return <SFIcon name="medal.fill" size={20} color="var(--ios-systemGray)" />;
            case 2: return <SFIcon name="medal.fill" size={20} color="var(--ios-systemOrange)" />;
            default: return <span className="text-[15px] font-bold text-ios-label-secondary">{index + 1}.</span>;
        }
    };

    const getTrendIcon = (delta: number | null) => {
        if (delta === null || delta === 0) return <SFIcon name="minus" size={14} color="var(--ios-systemGray)" />;
        if (delta > 0) return <SFIcon name="arrow.up" size={14} color="var(--ios-systemGreen)" />;
        return <SFIcon name="arrow.down" size={14} color="var(--ios-systemRed)" />;
    };

    const presenceOptions = [0, 50, 60, 70, 80, 90];
    const presenceLabels = ['Tutti', '50%', '60%', '70%', '80%', '90%'];

    return (
        <div className="px-0 py-2 space-y-6">
            
            {/* Header / Actions */}
            <div className="flex justify-between items-center mb-1">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">Classifica ELO</h2>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">Ranking ufficiale dei giocatori di Padel</p>
                </div>
                <HIGButton 
                    variant="gray"
                    onClick={() => printRanking(
                        rankingData, 
                        eloHistory, 
                        matches, 
                        tournaments,
                        selectedTournamentId,
                        presenceThreshold,
                        tournamentGiornate,
                        selectedTeamTournamentMatchdayIds,
                        teamMatchdaysCache
                    )}
                    disabled={loading || rankingData.length === 0}
                    className="!rounded-2xl border border-slate-200/60 dark:border-white/10"
                >
                    <SFIcon name="printer" size={18} />
                </HIGButton>
            </div>

            {/* Filters */}
            <Card title="Filtri Torneo">
                <div className="flex items-center gap-3 bg-slate-50/70 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-white/10">
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        <SFIcon name="trophy.fill" size={18} color="var(--ios-systemOrange)" />
                    </div>
                    <select
                        value={selectedTournamentId || ''}
                        onChange={(e) => {
                            setSelectedTournamentId(e.target.value || null);
                            setPresenceThreshold(0);
                        }}
                        className="flex-1 bg-transparent text-slate-900 dark:text-white font-bold text-sm focus:outline-none cursor-pointer"
                    >
                        <option value="" className="bg-white dark:bg-slate-900">Classifica Generale (Tutti i tornei)</option>
                        {completedTournaments.map(tournament => {
                            const isTeamTourney = tournament.type === TournamentType.TorneoASquadre && !tournament.teamTournamentRootId;
                            const key = isTeamTourney ? tournament.name : (tournament.giornataName || tournament.name);
                            return (
                                <option key={key} value={key} className="bg-white dark:bg-slate-900">
                                    {key}
                                </option>
                            );
                        })}
                    </select>
                    <SFIcon name="chevron.up.chevron.down" size={14} color="var(--ios-label-tertiary)" />
                </div>
            </Card>

            {selectedTournamentId && tournamentGiornate.length > 1 && (
                <div className="mb-2">
                    <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 font-bold px-1">
                        Presenza Minima ({tournamentGiornate.length} giornate)
                    </div>
                    <HIGSegmentedControl 
                        segments={presenceLabels}
                        selectedIndex={presenceOptions.indexOf(presenceThreshold)}
                        onChange={(idx) => setPresenceThreshold(presenceOptions[idx])}
                    />
                </div>
            )}

            {/* PODIO 3D (Se ci sono almeno 3 giocatori) */}
            {rankingData.length >= 3 && !selectedTournamentId && (
                <div className="grid grid-cols-3 gap-2 pt-2 items-end">
                    {/* 2° Posto */}
                    <div className="flex flex-col items-center cursor-pointer" onClick={() => setProfilePlayer(rankingData[1])} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setProfilePlayer(rankingData[1]); } }} role="button" tabIndex={0}>
                        <div className="w-12 h-12 rounded-full border-2 border-slate-300 bg-slate-100 dark:bg-slate-800 dark:border-slate-500 flex items-center justify-center text-lg font-black shadow-md mb-2">
                            🥈
                        </div>
                        <div className="w-full bg-slate-200/80 dark:bg-slate-800/80 backdrop-blur-xl border border-slate-300 dark:border-white/10 rounded-t-2xl p-3 text-center h-28 flex flex-col justify-between">
                            <p className="text-xs font-bold truncate text-slate-900 dark:text-white">{rankingData[1].name}</p>
                            <span className="text-sm font-extrabold text-sky-600 dark:text-sky-400 bg-sky-500/10 py-0.5 px-2 rounded-full border border-sky-500/20">{rankingData[1].currentElo.toFixed(0)}</span>
                        </div>
                    </div>
                    {/* 1° Posto */}
                    <div className="flex flex-col items-center cursor-pointer" onClick={() => setProfilePlayer(rankingData[0])} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setProfilePlayer(rankingData[0]); } }} role="button" tabIndex={0}>
                        <div className="w-14 h-14 rounded-full border-2 border-amber-400 bg-amber-100 dark:bg-amber-950 dark:border-amber-400 flex items-center justify-center text-2xl font-black shadow-xl mb-2 animate-bounce">
                            🥇
                        </div>
                        <div className="w-full bg-gradient-to-b from-amber-500/20 to-sky-500/10 backdrop-blur-xl border border-amber-400/40 rounded-t-2xl p-3 text-center h-36 flex flex-col justify-between shadow-lg">
                            <p className="text-xs font-black truncate text-amber-600 dark:text-amber-300">{rankingData[0].name}</p>
                            <span className="text-base font-black text-amber-600 dark:text-amber-400 bg-amber-500/20 py-1 px-2.5 rounded-full border border-amber-500/30">{rankingData[0].currentElo.toFixed(0)}</span>
                        </div>
                    </div>
                    {/* 3° Posto */}
                    <div className="flex flex-col items-center cursor-pointer" onClick={() => setProfilePlayer(rankingData[2])} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setProfilePlayer(rankingData[2]); } }} role="button" tabIndex={0}>
                        <div className="w-12 h-12 rounded-full border-2 border-amber-700 bg-orange-100 dark:bg-slate-800 dark:border-amber-700 flex items-center justify-center text-lg font-black shadow-md mb-2">
                            🥉
                        </div>
                        <div className="w-full bg-orange-100/60 dark:bg-slate-800/80 backdrop-blur-xl border border-orange-200 dark:border-white/10 rounded-t-2xl p-3 text-center h-24 flex flex-col justify-between">
                            <p className="text-xs font-bold truncate text-slate-900 dark:text-white">{rankingData[2].name}</p>
                            <span className="text-sm font-extrabold text-sky-600 dark:text-sky-400 bg-sky-500/10 py-0.5 px-2 rounded-full border border-sky-500/20">{rankingData[2].currentElo.toFixed(0)}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Ranking List */}
            <Card 
                title={
                    <div className="flex justify-between items-center w-full">
                        <span className="font-bold text-sm tracking-wide text-slate-900 dark:text-white">Posizioni in Classifica</span>
                        <span className="text-[12px] text-slate-500 dark:text-slate-400 font-medium normal-case">
                            {selectedTournamentId && presenceThreshold > 0 
                                ? `Sotto soglia ${presenceThreshold}% in basso`
                                : `Totale: ${rankingData.length}`}
                        </span>
                    </div>
                }
            >
                <div className="divide-y divide-slate-200/60 dark:divide-white/10">
                    {loading && !players.length ? (
                        <div className="py-6 text-center text-slate-400 text-sm">Caricamento classifica...</div>
                    ) : (
                        (showAllPlayers ? rankingData : rankingData.slice(0, 10)).map((player, idx) => {
                            const isExpanded = expandedPlayerId === player.id;
                            
                            const playerHistory = buildPlayerEloTimeline(
                                player.id,
                                eloHistory,
                                matches,
                                tournaments,
                                teamMatchdaysCache,
                                { parentTournamentName: selectedTournamentId }
                            );

                            const prevPlayer = idx > 0 ? rankingData[idx - 1] : null;
                            const showSeparator = selectedTournamentId && presenceThreshold > 0 && 
                                prevPlayer &&
                                prevPlayer.presencePercentage >= presenceThreshold &&
                                player.presencePercentage < presenceThreshold;

                            return (
                                <React.Fragment key={player.id}>
                                    {showSeparator && (
                                        <div className="py-2 my-2 bg-amber-500/10 border border-amber-500/20 flex items-center justify-center gap-2 rounded-xl">
                                            <SFIcon name="arrow.down.to.line" size={12} color="var(--ios-label-secondary)" />
                                            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                                                Sotto Soglia {presenceThreshold}%
                                            </span>
                                        </div>
                                    )}
                                    
                                    <div className="py-3 px-1">
                                        <div className="flex justify-between items-center cursor-pointer hover:bg-slate-100/50 dark:hover:bg-white/5 p-1 rounded-xl transition-colors" onClick={() => handleToggleExpand(player.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleToggleExpand(player.id); } }} role="button" tabIndex={0} aria-expanded={expandedPlayerId === player.id}>
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-7 h-7 flex items-center justify-center shrink-0">
                                                    {getMedalIcon(idx)}
                                                </div>
                                                <span className="font-semibold text-slate-900 dark:text-white text-[15px] truncate">{player.name} {player.surname}</span>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className="font-extrabold text-sky-600 dark:text-sky-400 text-[15px] bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-500/20">{player.currentElo.toFixed(0)}</span>
                                                {getTrendIcon(player.lastDelta)}
                                                <button onClick={(e) => { e.stopPropagation(); setProfilePlayer(player); }} className="text-sky-500 p-1 hover:bg-sky-500/10 rounded-lg transition-colors" aria-label="Info">
                                                    <SFIcon name="info.circle" size={16} />
                                                </button>
                                                <SFIcon name={isExpanded ? "chevron.up" : "chevron.down"} size={12} color="var(--ios-label-tertiary)" />
                                            </div>
                                        </div>

                                        {isExpanded && playerHistory.length > 0 && (
                                            <div className="mt-3 bg-slate-100/70 dark:bg-slate-800/70 p-3.5 rounded-xl border border-slate-200/60 dark:border-white/10 space-y-2 backdrop-blur-md">
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1">Storico Partite ELO</div>
                                                {playerHistory.map(entry => {
                                                    const labelText = formatLabel(entry, !selectedTournamentId);
                                                    const deltaSign = entry.delta >= 0 ? '+' : '';
                                                    return (
                                                        <div key={entry.key} className="flex justify-between items-center text-[13px] py-1 border-b border-slate-200/40 dark:border-white/5 last:border-none">
                                                            <div className="text-slate-800 dark:text-slate-200 font-medium">
                                                                <span>{labelText}</span> 
                                                                <span className="text-slate-400 dark:text-slate-500 ml-1 text-xs">{new Date(entry.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit'})}</span>
                                                            </div>
                                                            <div className={`font-mono font-bold ${entry.delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                                {deltaSign}{entry.delta.toFixed(1)}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </React.Fragment>
                            );
                        })
                    )}
                </div>
            </Card>

            {!showAllPlayers && rankingData.length > 10 && (
                <div className="mt-2">
                    <HIGButton variant="gray" fullWidth onClick={() => setShowAllPlayers(true)} className="!rounded-2xl border border-slate-200/60 dark:border-white/10">
                        Mostra tutti i {rankingData.length} giocatori
                    </HIGButton>
                </div>
            )}

            {rankingData.length === 0 && !loading && (
                <div className="text-center py-8 text-slate-400 text-sm">Nessun giocatore in classifica.</div>
            )}

            <div className="mt-4">
                <RankingChart theme={theme} selectedSeriesKey={selectedTournamentId} />
            </div>

            <PlayerProfileModal 
                player={profilePlayer} 
                onClose={() => setProfilePlayer(null)} 
                theme={theme} 
                selectedSeriesKey={selectedTournamentId}
            />
        </div>
    );
};

export default RankingPage;
