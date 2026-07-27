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

const RankingPage: React.FC<RankingPageProps> = ({ theme }) => {
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
        
        const isTeamTournament = tournaments.some(t => t.name === selectedTournamentId && t.type === TournamentType.TorneoASquadre && !t.teamTournamentRootId);
        if (isTeamTournament) {
            const rootTournament = tournaments.find(t => t.name === selectedTournamentId && t.type === TournamentType.TorneoASquadre && !t.teamTournamentRootId);
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
        const isTeamTournament = tournaments.some(t => t.name === selectedTournamentId && t.type === TournamentType.TorneoASquadre && !t.teamTournamentRootId);
        if (isTeamTournament) {
            const rootId = tournaments.find(t => t.name === selectedTournamentId && t.type === TournamentType.TorneoASquadre && !t.teamTournamentRootId)?.id;
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
            const isTeamTournament = tournaments.some(t => t.name === selectedTournamentId && t.type === TournamentType.TorneoASquadre && !t.teamTournamentRootId);
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
                
                const isTeamTournament = selectedTournamentId && tournaments.some(t => t.name === selectedTournamentId && t.type === TournamentType.TorneoASquadre && !t.teamTournamentRootId);
                
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
                        playerMatches.forEach(m => {
                            if (!m.winner) return;
                            const isTeam1 = m.team1.includes(player.id);
                            const score1 = m.winner === 'team1' ? 1 : m.winner === 'team2' ? 0 : 0.5;
                            const expected1 = 0.5; // default equal expectation for single tournament on the fly
                            const delta = isTeam1 ? K * (score1 - expected1) : K * ((1 - score1) - expected1);
                            tournamentDelta += delta;
                        });
                    }
                    displayElo = 1500 + tournamentDelta;
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
        tournaments
            .filter(t => {
                if (t.type === TournamentType.TorneoASquadre && !t.teamTournamentRootId) {
                    return true; // Always show root team tournaments
                }
                return t.status === 'completed' && t.type !== TournamentType.TorneoASquadre;
            })
            .forEach(t => {
                const seriesKey = (t.type === TournamentType.TorneoASquadre && !t.teamTournamentRootId) ? t.name : (t.giornataName || t.name);
                if (!tournamentMap.has(seriesKey)) {
                    tournamentMap.set(seriesKey, t);
                }
            });
        return Array.from(tournamentMap.values());
    }, [tournaments]);

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
        <div className="px-0 py-4 space-y-5">
            
            {/* Header / Actions */}
            <div className="flex justify-between items-center mb-1">
                <h2 className="text-[1.62rem] font-black leading-none tracking-tight text-sky-500 dark:text-sky-300 sm:text-[1.78rem] md:text-[2.25rem]">Classifica</h2>
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
                >
                    <SFIcon name="printer" size={18} />
                </HIGButton>
            </div>

            {/* Filters */}
            <Card title="Filtri">
                <div className="flex items-center bg-transparent">
                    <SFIcon name="trophy.fill" size={18} color="var(--ios-systemOrange)" className="mr-3" />
                    <select
                        value={selectedTournamentId || ''}
                        onChange={(e) => {
                            setSelectedTournamentId(e.target.value || null);
                            setPresenceThreshold(0);
                        }}
                        className="flex-1 bg-transparent text-ios-label focus:outline-none sf-body appearance-none font-sans"
                    >
                        <option value="">Generale</option>
                        {completedTournaments.map(tournament => {
                            const isTeamTourney = tournament.type === TournamentType.TorneoASquadre && !tournament.teamTournamentRootId;
                            const key = isTeamTourney ? tournament.name : (tournament.giornataName || tournament.name);
                            return (
                                <option key={key} value={key}>
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
                    <div className="text-xs text-ios-label-secondary uppercase tracking-wider mb-2 font-semibold px-1">
                        Presenza Minima ({tournamentGiornate.length} giornate)
                    </div>
                    <HIGSegmentedControl 
                        segments={presenceLabels}
                        selectedIndex={presenceOptions.indexOf(presenceThreshold)}
                        onChange={(idx) => setPresenceThreshold(presenceOptions[idx])}
                    />
                </div>
            )}

            {/* Ranking List */}
            <Card 
                title={
                    <div className="flex justify-between items-center w-full">
                        <span>Giocatori</span>
                        <span className="text-[12px] text-ios-label-secondary font-normal normal-case">
                            {selectedTournamentId && presenceThreshold > 0 
                                ? `Sotto soglia ${presenceThreshold}% in basso`
                                : `Totale: ${rankingData.length}`}
                        </span>
                    </div>
                }
            >
                <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {loading && !players.length ? (
                        <div className="py-6 text-center text-ios-label-secondary">Caricamento...</div>
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
                                        <div className="py-2 my-2 bg-ios-fill flex items-center justify-center gap-2 rounded">
                                            <SFIcon name="arrow.down.to.line" size={12} color="var(--ios-label-secondary)" />
                                            <span className="text-[11px] font-bold text-ios-label-secondary uppercase tracking-wider">
                                                Sotto Soglia {presenceThreshold}%
                                            </span>
                                        </div>
                                    )}
                                    
                                    <div className="py-3 first:pt-0 last:pb-0">
                                        <div className="flex justify-between items-center cursor-pointer" onClick={() => handleToggleExpand(player.id)}>
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-6 h-6 flex items-center justify-center shrink-0">
                                                    {getMedalIcon(idx)}
                                                </div>
                                                <span className="font-medium text-ios-label text-[15px] truncate">{player.name} {player.surname}</span>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className="font-semibold text-ios-blue text-[15px]">{player.currentElo.toFixed(0)}</span>
                                                {getTrendIcon(player.lastDelta)}
                                                <button onClick={(e) => { e.stopPropagation(); setProfilePlayer(player); }} className="text-ios-green p-1" aria-label="Info">
                                                    <SFIcon name="info.circle" size={16} />
                                                </button>
                                                <SFIcon name={isExpanded ? "chevron.up" : "chevron.down"} size={12} color="var(--ios-label-tertiary)" />
                                            </div>
                                        </div>

                                        {isExpanded && playerHistory.length > 0 && (
                                            <div className="mt-3 bg-ios-fill p-3 rounded-lg space-y-1.5">
                                                <div className="text-[11px] text-ios-label-secondary font-bold uppercase tracking-wider mb-2">Storico ELO</div>
                                                {playerHistory.map(entry => {
                                                    const labelText = formatLabel(entry, !selectedTournamentId);
                                                    const deltaSign = entry.delta >= 0 ? '+' : '';
                                                    return (
                                                        <div key={entry.key} className="flex justify-between items-center text-[13px]">
                                                            <div className="text-ios-label">
                                                                <span>{labelText}</span> 
                                                                <span className="text-ios-label-secondary ml-1">{new Date(entry.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit'})}</span>
                                                            </div>
                                                            <div className={`font-mono font-semibold ${entry.delta >= 0 ? 'text-ios-green' : 'text-ios-red'}`}>
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
                    <HIGButton variant="gray" fullWidth onClick={() => setShowAllPlayers(true)}>
                        Mostra tutti i {rankingData.length} giocatori
                    </HIGButton>
                </div>
            )}

            {rankingData.length === 0 && !loading && (
                <div className="text-center py-8 text-ios-label-secondary">Nessun giocatore in classifica.</div>
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
