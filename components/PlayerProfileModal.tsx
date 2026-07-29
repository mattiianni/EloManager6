
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import { Player } from '../types.ts';
import { HIGSheet } from './ui/HIGSheet.tsx';
import { XIcon, ArrowUpIcon, ArrowDownIcon, ArrowStableIcon } from './ui/Icons.tsx';
import { printPlayerProfiles } from '../services/printService.ts';
import PlayerAvatar from './ui/PlayerAvatar.tsx';

interface PlayerProfileModalProps {
    player: Player | null;
    onClose: () => void;
    theme?: 'light' | 'dark';
    selectedSeriesKey?: string | null;
}

const CustomTooltip: React.FC<any> = ({ active, payload, label, theme }) => {
    if (active && payload && payload.length) {
        return (
            <div className={`p-3 rounded-md shadow-lg ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border border-gray-200 text-gray-700'}`}>
                <p className="label font-bold mb-1">
                    {label === -1 ? 'Start' : (payload[0].payload.sourceLabel || `Event #${label + 1}`)}
                </p>
                {payload.map((pld: any, index: number) => (
                    <div key={index} style={{ color: pld.color }}>
                        {`ELO: ${pld.value.toFixed(2)}`}
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({ player, onClose, theme: themeProp, selectedSeriesKey }) => {
    const theme = themeProp || (document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    const { players, matches, eloHistory, getPlayerById, tournaments } = usePadelStore();

    // Filter player matches by selectedSeriesKey if present
    const playerMatches = useMemo(() => {
        if (!player) return [];
        let filtered = matches.filter(m => m.team1.includes(player.id) || m.team2.includes(player.id));
        
        if (selectedSeriesKey) {
            const normSelected = selectedSeriesKey.trim().toLowerCase();
            const targetTournaments = tournaments.filter(t => 
                (t.giornataName && t.giornataName.trim().toLowerCase() === normSelected) ||
                (t.name && t.name.trim().toLowerCase() === normSelected) ||
                (t.parentTournamentName && t.parentTournamentName.trim().toLowerCase() === normSelected)
            );
            const targetIds = new Set(targetTournaments.map(t => t.id));
            filtered = filtered.filter(m => m.tournamentId && targetIds.has(m.tournamentId));
        } else {
            filtered = filtered.filter(m => {
                if (!m.tournamentId) return true; // Friendly match
                const tournament = tournaments.find(t => t.id === m.tournamentId);
                return tournament?.status === 'completed';
            });
        }

        return filtered.sort((a, b) => {
            const rA = a.roundNumber || 1;
            const rB = b.roundNumber || 1;
            if (rA !== rB) return rA - rB;
            return new Date(a.date).getTime() - new Date(b.date).getTime();
        });
    }, [player, matches, tournaments, selectedSeriesKey]);

    const stats = useMemo(() => {
        if (!player) return null;

        const playerHistory = eloHistory
            .filter(e => e.playerId === player.id)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const ttMatchesCount = playerHistory.filter(e => e.type === 'team_tournament_matchday').length;
        const total = playerMatches.length;
        
        const wins = playerMatches.filter(m => {
            const isTeam1 = m.team1.includes(player.id);
            return (isTeam1 && m.winner === 'team1') || (!isTeam1 && m.winner === 'team2');
        }).length;

        let gamesWon = 0;
        let gamesLost = 0;
        playerMatches.forEach(m => {
            const isTeam1 = m.team1.includes(player.id);
            m.sets.forEach(set => {
                gamesWon += isTeam1 ? set.team1 : set.team2;
                gamesLost += isTeam1 ? set.team2 : set.team1;
            });
        });

        // Form: based on last 5 individual matches (consistent with "Ultime 5 Partite")
        const last5 = playerMatches.slice(-5);
        const form = last5.map(m => {
            const isTeam1 = m.team1.includes(player.id);
            return (isTeam1 && m.winner === 'team1') || (!isTeam1 && m.winner === 'team2');
        });

        // Best streak (from matches)
        let bestStreak = 0;
        let currentStreak = 0;
        playerMatches.forEach(m => {
            const isTeam1 = m.team1.includes(player.id);
            const won = (isTeam1 && m.winner === 'team1') || (!isTeam1 && m.winner === 'team2');
            if (won) {
                currentStreak++;
                bestStreak = Math.max(bestStreak, currentStreak);
            } else {
                currentStreak = 0;
            }
        });

        // Last delta
        const lastDelta = playerHistory.length > 0 ? playerHistory[playerHistory.length - 1].delta : 0;

        return { total, totalClassic: playerMatches.length, ttMatchesCount, wins, gamesWon, gamesLost, form, bestStreak, lastDelta };
    }, [player, playerMatches, eloHistory]);

    // ELO chart data: turn-by-turn for selected tournament, or historical by date for global
    const eloChartData = useMemo(() => {
        if (!player) return [];

        // --- CASE 1: SINGLE TOURNAMENT FILTERED ---
        if (selectedSeriesKey) {
            const data: { eventIndex: number; elo: number; sourceLabel?: string }[] = [];
            data.push({ eventIndex: -1, elo: 1500, sourceLabel: 'Start (1500)' });

            const K = 16;
            const currentCumElo = new Map<string, number>();
            currentCumElo.set(player.id, 1500);

            playerMatches.forEach((m, idx) => {
                if (!m.winner) return;
                const isTeam1 = m.team1.includes(player.id);
                
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

                // Update ELOs
                m.team1.forEach(pid => currentCumElo.set(pid, (currentCumElo.get(pid) ?? 1500) + delta1));
                m.team2.forEach(pid => currentCumElo.set(pid, (currentCumElo.get(pid) ?? 1500) + delta2));

                const label = m.roundNumber ? `Turno ${m.roundNumber}` : `Match #${idx + 1}`;
                data.push({
                    eventIndex: idx,
                    elo: currentCumElo.get(player.id) ?? 1500,
                    sourceLabel: label
                });
            });

            return data;
        }

        // --- CASE 2: GLOBAL VIEW ---
        const playerHistory = eloHistory
            .filter(e => e.playerId === player.id)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (playerHistory.length === 0) return [];

        const dateFirstEntry = new Map<string, typeof playerHistory[number]>();
        const dateDeltaSum = new Map<string, number>();
        
        playerHistory.forEach(entry => {
            const dateStr = entry.date.split('T')[0];
            if (!dateFirstEntry.has(dateStr)) dateFirstEntry.set(dateStr, entry);
            dateDeltaSum.set(dateStr, (dateDeltaSum.get(dateStr) || 0) + entry.delta);
        });

        const orderedDates = [...dateFirstEntry.keys()].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

        const firstDate = orderedDates[0];
        const firstEntry = dateFirstEntry.get(firstDate);
        const base = firstEntry ? firstEntry.eloBefore : player.initialElo;

        const data: { eventIndex: number; elo: number; sourceLabel?: string }[] = [];
        data.push({ eventIndex: -1, elo: base, sourceLabel: 'Start' });

        let cumulative = 0;
        orderedDates.forEach((dateStr, index) => {
            const deltaForDate = dateDeltaSum.get(dateStr) || 0;
            const firstEntryForDate = dateFirstEntry.get(dateStr);
            cumulative += deltaForDate;

            let label = firstEntryForDate?.sourceLabel && !firstEntryForDate.sourceLabel.startsWith('Date ')
                ? firstEntryForDate.sourceLabel
                : '';

            if (!label && firstEntryForDate?.eventId) {
                const tourney = tournaments.find(t => t.id === firstEntryForDate.eventId);
                if (tourney) label = tourney.giornataName || tourney.name;
            }

            if (!label) {
                const tourneyByDate = tournaments.find(t => t.date.split('T')[0] === dateStr);
                if (tourneyByDate) label = tourneyByDate.giornataName || tourneyByDate.name;
            }

            if (!label) {
                const dateObj = new Date(dateStr);
                label = !isNaN(dateObj.getTime())
                    ? `Giornata del ${dateObj.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}`
                    : `Giornata ${index + 1}`;
            }

            data.push({ 
                eventIndex: index, 
                elo: base + cumulative,
                sourceLabel: label
            });
        });

        return data;
    }, [player, eloHistory, playerMatches, selectedSeriesKey, tournaments]);

    const partners = useMemo(() => {
        if (!player) return [];
        const partnerMap = new Map<string, { total: number; wins: number }>();

        playerMatches.forEach(m => {
            const isTeam1 = m.team1.includes(player.id);
            const team = isTeam1 ? m.team1 : m.team2;
            const partnerId = team.find(id => id !== player.id);
            if (!partnerId) return;

            if (!partnerMap.has(partnerId)) partnerMap.set(partnerId, { total: 0, wins: 0 });
            const s = partnerMap.get(partnerId)!;
            s.total++;
            const won = (isTeam1 && m.winner === 'team1') || (!isTeam1 && m.winner === 'team2');
            if (won) s.wins++;
        });

        return [...partnerMap.entries()]
            .map(([id, s]) => ({ player: getPlayerById(id), ...s }))
            .filter(e => e.player)
            .sort((a, b) => b.total - a.total)
            .slice(0, 3);
    }, [player, playerMatches, getPlayerById]);

    const opponents = useMemo(() => {
        if (!player) return [];
        const opponentMap = new Map<string, { total: number; wins: number }>();

        playerMatches.forEach(m => {
            const isTeam1 = m.team1.includes(player.id);
            const opponentTeam = isTeam1 ? m.team2 : m.team1;
            const won = (isTeam1 && m.winner === 'team1') || (!isTeam1 && m.winner === 'team2');

            opponentTeam.forEach(oppId => {
                if (!opponentMap.has(oppId)) opponentMap.set(oppId, { total: 0, wins: 0 });
                const s = opponentMap.get(oppId)!;
                s.total++;
                if (won) s.wins++;
            });
        });

        return [...opponentMap.entries()]
            .map(([id, s]) => ({ player: getPlayerById(id), ...s }))
            .filter(e => e.player)
            .sort((a, b) => b.total - a.total)
            .slice(0, 3);
    }, [player, playerMatches, getPlayerById]);

    const recentMatches = useMemo(() => {
        if (!player) return [];
        return [...playerMatches].reverse().slice(0, 5).map(m => {
            const isTeam1 = m.team1.includes(player.id);
            const team = isTeam1 ? m.team1 : m.team2;
            const oppTeam = isTeam1 ? m.team2 : m.team1;
            const partnerId = team.find(id => id !== player.id);
            const partner = partnerId ? getPlayerById(partnerId) : null;
            const opp1 = getPlayerById(oppTeam[0]);
            const opp2 = getPlayerById(oppTeam[1]);
            const won = (isTeam1 && m.winner === 'team1') || (!isTeam1 && m.winner === 'team2');
            const myScores = m.sets.map(s => (isTeam1 ? s.team1 : s.team2));
            const oppScores = m.sets.map(s => (isTeam1 ? s.team2 : s.team1));

            return {
                date: new Date(m.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
                partner: partner ? `${partner.name} ${partner.surname[0]}.` : '?',
                opponents: `${opp1 ? `${opp1.name} ${opp1.surname[0]}.` : '?'} & ${opp2 ? `${opp2.name} ${opp2.surname[0]}.` : '?'}`,
                myScores,
                oppScores,
                won,
            };
        });
    }, [player, playerMatches, getPlayerById]);

    if (!player) return null;

    const gridStrokeColor = theme === 'dark' ? '#4b5563' : '#e5e7eb';
    const axisStrokeColor = theme === 'dark' ? '#9ca3af' : '#6b7280';

    return (
        <HIGSheet 
            isOpen={true} 
            onClose={onClose} 
            title={`${player.name} ${player.surname}`} 
            leadingAction={{ label: 'Stampa', onPress: () => printPlayerProfiles([player.id], players, matches, eloHistory, tournaments) }}
            trailingAction={{ label: 'Chiudi', onPress: onClose }}
        >
            <div className="w-full flex flex-col">
                {/* Custom header info */}
                <div className="flex items-center justify-between px-6 py-2.5 border-b border-[var(--ios-separator)]">
                    <div className="flex items-center gap-3">
                        <PlayerAvatar name={player.name} surname={player.surname} id={player.id} size="md" />
                        <span className="text-lg font-bold text-sky-600 dark:text-sky-400">
                            ELO: {player.currentElo.toFixed(2)}
                        </span>
                        {stats && stats.lastDelta > 0 && <ArrowUpIcon className="h-5 w-5 text-green-500" />}
                        {stats && stats.lastDelta < 0 && <ArrowDownIcon className="h-5 w-5 text-red-500" />}
                        {stats && stats.lastDelta === 0 && <ArrowStableIcon className="h-5 w-5 text-gray-400" />}
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500 dark:text-gray-400">{player.position}</span>
                    </div>
                </div>

                {/* Body */}
                <main className="p-4 md:p-6 overflow-y-auto space-y-6">
                    {/* ELO Chart - same style as RankingChart */}
                    {eloChartData.length > 1 && (
                        <div>
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Andamento ELO</h3>
                            <div style={{ width: '100%', height: 250 }}>
                                <ResponsiveContainer>
                                    <LineChart data={eloChartData} margin={{ top: 10, right: 25, left: 15, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={gridStrokeColor} />
                                        <XAxis
                                            dataKey="eventIndex"
                                            tickFormatter={(tick) => tick === -1 ? 'Start' : `E${tick + 1}`}
                                            stroke={axisStrokeColor}
                                        />
                                        <YAxis
                                            type="number"
                                            width={65}
                                            domain={['dataMin - 15', 'dataMax + 15']}
                                            stroke={axisStrokeColor}
                                            tickFormatter={(v) => Math.round(Number(v)).toString()}
                                        />
                                        <Tooltip content={<CustomTooltip theme={theme} chartData={eloChartData} />} />
                                        <Line
                                            type="monotone"
                                            dataKey="elo"
                                            stroke="#38bdf8"
                                            strokeWidth={2}
                                            dot={{ r: 2 }}
                                            activeDot={{ r: 6 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* Stats Grid */}
                    {stats && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
                                <div className="text-xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Partite / Giornate</div>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center" title="Solo tornei classici">
                                <div className="text-xl font-bold text-green-600 dark:text-green-400">{stats.wins} <span className="text-sm font-normal">({stats.totalClassic > 0 ? ((stats.wins / stats.totalClassic) * 100).toFixed(0) : 0}%)</span></div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Vinte (Classici)</div>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center" title="Solo tornei classici">
                                <div className="text-xl font-bold text-gray-900 dark:text-white">{stats.gamesWon} <span className="text-sm font-normal text-gray-500">/ {stats.gamesLost}</span></div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Games V/P (Classici)</div>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                    {stats.form.map((won, i) => (
                                        <span key={i} className={`inline-block w-3.5 h-3.5 rounded-full ${won ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                    ))}
                                    {stats.form.length === 0 && <span className="text-sm text-gray-400">N/A</span>}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Form (ultime 5)</div>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
                                <div className="text-xl font-bold text-orange-500">{stats.bestStreak}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Best Streak</div>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
                                <div className="text-xl font-bold text-sky-600 dark:text-sky-400">{stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(0) : 0}%</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Win Rate</div>
                            </div>
                        </div>
                    )}

                    {/* Partners & Opponents */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Compagni Frequenti</h3>
                            {partners.length === 0 ? (
                                <p className="text-sm text-gray-400">Nessun dato.</p>
                            ) : (
                                <div className="space-y-0">
                                    {partners.map((p, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm border-b border-gray-200 dark:border-gray-800 py-2 last:border-0">
                                            <span className="font-medium text-gray-900 dark:text-white">
                                                {p.player!.name} {p.player!.surname}
                                            </span>
                                            <span className="text-gray-500 dark:text-gray-400">
                                                {p.total} partite, {p.total > 0 ? ((p.wins / p.total) * 100).toFixed(0) : 0}% win
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Avversari Frequenti</h3>
                            {opponents.length === 0 ? (
                                <p className="text-sm text-gray-400">Nessun dato.</p>
                            ) : (
                                <div className="space-y-0">
                                    {opponents.map((o, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm border-b border-gray-200 dark:border-gray-800 py-2 last:border-0">
                                            <span className="font-medium text-gray-900 dark:text-white">
                                                {o.player!.name} {o.player!.surname}
                                            </span>
                                            <span className="text-gray-500 dark:text-gray-400">
                                                {o.total} partite, {o.total > 0 ? ((o.wins / o.total) * 100).toFixed(0) : 0}% win
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Recent Matches */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Ultime 5 Partite</h3>
                        {recentMatches.length === 0 ? (
                            <p className="text-sm text-gray-400">Nessuna partita trovata.</p>
                        ) : (
                            <div className="space-y-1">
                                {recentMatches.map((m, i) => (
                                    <div key={i} className={`py-1.5 px-3 rounded-lg text-sm ${m.won ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono shrink-0 w-10">{m.date}</span>
                                            <span className="text-gray-600 dark:text-gray-300 truncate flex-1">
                                                con <span className="font-medium">{m.partner}</span>
                                            </span>
                                            <div className="flex gap-1">
                                                {m.myScores.map((score, idx) => (
                                                    <span key={idx} className={`shrink-0 w-7 text-center py-0.5 rounded text-xs font-bold text-white ${m.won ? 'bg-green-600' : 'bg-gray-400 dark:bg-gray-600'}`}>{score}</span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="w-10 shrink-0"></span>
                                            <span className="text-gray-600 dark:text-gray-300 truncate flex-1">
                                                vs <span className="font-medium">{m.opponents}</span>
                                            </span>
                                            <div className="flex gap-1">
                                                {m.oppScores.map((score, idx) => (
                                                    <span key={idx} className={`shrink-0 w-7 text-center py-0.5 rounded text-xs font-bold text-white ${!m.won ? 'bg-green-600' : 'bg-gray-400 dark:bg-gray-600'}`}>{score}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </HIGSheet>
    );
};

export default PlayerProfileModal;
