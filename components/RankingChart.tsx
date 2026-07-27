import React, { useState, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import Card from './ui/Card.tsx';
import Button from './ui/Button.tsx';
import { printEloChart } from '../services/printService.ts';
import { ChevronDownIcon, PrintIcon } from './ui/Icons.tsx';

const CustomTooltip: React.FC<any> = ({ active, payload, label, theme }) => {
    if (active && payload && payload.length) {
        return (
            <div className={`p-3 rounded-md shadow-lg ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border border-gray-200 text-gray-700'}`}>
                <p className="label font-bold mb-1">
                    {label === -1 ? 'Start' : (payload[0].payload.sourceLabel || `Event #${label + 1}`)}
                </p>
                {payload.map((pld: any, index: number) => (
                    <div key={index} style={{ color: pld.color }}>
                        {`${pld.name}: ${pld.value.toFixed(2)}`}
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const COLORS = ['#38bdf8', '#818cf8', '#f87171', '#fbbf24', '#4ade80', '#a78bfa', '#f472b6', '#2dd4bf'];

interface RankingChartProps {
    theme: 'light' | 'dark';
    selectedSeriesKey?: string | null; // giornataName || name
}

const CHART_CONTAINER_ID = 'elo-chart-container';

const RankingChart: React.FC<RankingChartProps> = ({ theme, selectedSeriesKey }) => {
    const { players, eloHistory, tournaments } = usePadelStore();
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
    const [isCollapsed, setIsCollapsed] = useState(true);
    const chartDataRef = useRef<any[]>([]);

    const playersWithHistory = useMemo(() =>
        players.filter(p => eloHistory.some(h => h.playerId === p.id)),
        [players, eloHistory]
    );

    const handlePrintChart = async () => {
        const originalSelected = [...selectedPlayerIds];
        try {
            // Select all players with history to compute full chart data
            setSelectedPlayerIds(playersWithHistory.map(p => p.id));

            // Wait for React re-render so chartData (and ref) updates
            await new Promise(resolve => requestAnimationFrame(() => {
                setTimeout(resolve, 250);
            }));

            printEloChart(
                chartDataRef.current,
                playersWithHistory.map(p => p.id),
                players,
            );
        } catch (error) {
            console.error('Error during print:', error);
        } finally {
            setSelectedPlayerIds(originalSelected);
        }
    };

    const handlePlayerSelection = (playerId: string) => {
        setSelectedPlayerIds(prev =>
            prev.includes(playerId)
                ? prev.filter(id => id !== playerId)
                : [...prev, playerId]
        );
    };

    const chartData = useMemo(() => {
        if (selectedPlayerIds.length === 0) return [];
        
        // --- CASE 1: SINGLE TOURNAMENT / SERIES FILTERED ---
        if (selectedSeriesKey) {
            const normSelected = selectedSeriesKey.trim().toLowerCase();
            const targetTournaments = tournaments.filter(t => 
                (t.giornataName && t.giornataName.trim().toLowerCase() === normSelected) ||
                (t.name && t.name.trim().toLowerCase() === normSelected) ||
                (t.parentTournamentName && t.parentTournamentName.trim().toLowerCase() === normSelected)
            );
            const targetTournamentIds = new Set(targetTournaments.map(t => t.id));

            // Initial point = 1500 for all players in this tournament
            const initialPoint: any = { eventIndex: -1, sourceLabel: 'Start (1500)' };
            selectedPlayerIds.forEach(pid => {
                initialPoint[pid] = 1500;
            });

            const data: any[] = [initialPoint];

            // Calculate tournament delta for each selected player
            const tournamentPoint: any = {
                eventIndex: 0,
                sourceLabel: selectedSeriesKey
            };

            const K = 16;
            selectedPlayerIds.forEach(pid => {
                // First check if eloHistory has records for this tournament
                const historyEntries = eloHistory.filter(e => 
                    e.playerId === pid && 
                    (targetTournamentIds.has(e.eventId) || (e.sourceLabel && e.sourceLabel.trim().toLowerCase() === normSelected))
                );

                let totalDelta = 0;
                if (historyEntries.length > 0) {
                    totalDelta = historyEntries.reduce((sum, e) => sum + (e.delta || 0), 0);
                } else {
                    // Fallback to match calculation if eloHistory entries aren't generated yet
                    const playerTournamentMatches = matches.filter(m => 
                        m.tournamentId && targetTournamentIds.has(m.tournamentId) && 
                        (m.team1.includes(pid) || m.team2.includes(pid))
                    );
                    playerTournamentMatches.forEach(m => {
                        if (!m.winner) return;
                        const isTeam1 = m.team1.includes(pid);
                        const score1 = m.winner === 'team1' ? 1 : m.winner === 'team2' ? 0 : 0.5;
                        const expected1 = 0.5;
                        const delta = isTeam1 ? K * (score1 - expected1) : K * ((1 - score1) - expected1);
                        totalDelta += delta;
                    });
                }

                tournamentPoint[pid] = 1500 + totalDelta;
            });

            data.push(tournamentPoint);
            return data;
        }

        // --- CASE 2: GLOBAL VIEW (ALL TOURNAMENTS & MATCHES) ---
        const playerEvents = eloHistory.filter(e => selectedPlayerIds.includes(e.playerId));
        const uniqueDates = [...new Set(playerEvents.map(e => e.date.split('T')[0]))];
        const orderedDates = uniqueDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        
        const data: any[] = [];

        const perPlayerDateFirstEntry = new Map<string, Map<string, typeof eloHistory[number]>>();
        const perPlayerDateDeltaSum = new Map<string, Map<string, number>>();

        selectedPlayerIds.forEach(playerId => {
            const historyForPlayer = eloHistory
                .filter(e => e.playerId === playerId)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const firstMap = new Map<string, typeof eloHistory[number]>();
            const deltaMap = new Map<string, number>();

            historyForPlayer.forEach(entry => {
                const dateStr = entry.date.split('T')[0];
                if (!firstMap.has(dateStr)) firstMap.set(dateStr, entry);
                const prev = deltaMap.get(dateStr) || 0;
                deltaMap.set(dateStr, prev + (entry.delta || 0));
            });

            perPlayerDateFirstEntry.set(playerId, firstMap);
            perPlayerDateDeltaSum.set(playerId, deltaMap);
        });

        const initialPoint: any = { eventIndex: -1, sourceLabel: 'Start' };
        const firstDateStr = orderedDates[0];
        const firstDateTime = firstDateStr ? new Date(firstDateStr).getTime() : 0;

        const playerInitialBase = new Map<string, number>();
        selectedPlayerIds.forEach(playerId => {
            const historyForPlayer = eloHistory
                .filter(e => e.playerId === playerId)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const priorEntry = historyForPlayer
                .filter(e => new Date(e.date.split('T')[0]).getTime() < firstDateTime)
                .slice(-1)[0];

            const firstEntryInDate = perPlayerDateFirstEntry.get(playerId)?.get(firstDateStr || '');

            let base: number;
            if (firstEntryInDate) {
                base = firstEntryInDate.eloBefore;
            } else if (priorEntry) {
                base = priorEntry.eloAfter;
            } else {
                const player = players.find(p => p.id === playerId);
                base = player ? player.initialElo : 1500;
            }
            playerInitialBase.set(playerId, base);
            initialPoint[playerId] = base;
        });
        data.push(initialPoint);

        const cumulativeByPlayer = new Map<string, number>();
        selectedPlayerIds.forEach(pid => cumulativeByPlayer.set(pid, 0));

        orderedDates.forEach((dateStr, index) => {
            let sourceLabel = '';
            const historyEntry = eloHistory.find(e => e.date.split('T')[0] === dateStr);
            if (historyEntry) {
                sourceLabel = historyEntry.sourceLabel || '';
            }

            const point: any = { 
                eventIndex: index,
                sourceLabel: sourceLabel || `Event #${index + 1}`
            };

            selectedPlayerIds.forEach(playerId => {
                const deltaMap = perPlayerDateDeltaSum.get(playerId);
                const deltaForDate = deltaMap ? (deltaMap.get(dateStr) || 0) : 0;
                const cum = (cumulativeByPlayer.get(playerId) || 0) + deltaForDate;
                cumulativeByPlayer.set(playerId, cum);
                point[playerId] = (playerInitialBase.get(playerId) || 0) + cum;
            });

            data.push(point);
        });

        // Diagnostic log: show the built series for current selection
        try {
            const seriesForLog = data.map(d => {
                const obj: any = { idx: d.eventIndex };
                selectedPlayerIds.forEach(pid => { obj[pid] = d[pid]; });
                return obj;
            });
            // eslint-disable-next-line no-console
            console.table(seriesForLog);
            // eslint-disable-next-line no-console
            console.debug('selectedSeriesKey:', selectedSeriesKey, 'events:', orderedEventIds);
        } catch {}

        return data;
    }, [selectedPlayerIds, players, eloHistory, tournaments, selectedSeriesKey]);

    // Keep ref in sync with latest chartData for print
    chartDataRef.current = chartData;

    const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));
    
    const gridStrokeColor = theme === 'dark' ? '#4b5563' : '#e5e7eb';
    const axisStrokeColor = theme === 'dark' ? '#9ca3af' : '#6b7280';

    return (
        <Card title={
            <div
                className="flex items-center justify-between gap-3 cursor-pointer"
                onClick={() => setIsCollapsed(prev => !prev)}
                role="button"
                aria-expanded={!isCollapsed}
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setIsCollapsed(prev => !prev);
                    }
                }}
            >
                <div className="flex items-center gap-2">
                    <span>ELO History</span>
                    <ChevronDownIcon className={`h-5 w-5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
                </div>
                <Button
                    onClick={(e) => {
                        e.stopPropagation();
                        handlePrintChart();
                    }}
                    size="sm"
                    variant="secondary"
                    disabled={playersWithHistory.length === 0}
                >
                    <span className="flex items-center gap-1"><PrintIcon /> Stampa Grafico ELO</span>
                </Button>
            </div>
        } className="mt-8">
            {!isCollapsed && (
            <div id={CHART_CONTAINER_ID}>
                <div className="mb-4 player-select-wrapper no-print">
                    <h4 className="font-semibold mb-2">Seleziona Grafico Giocatore:</h4>
                    <div className="flex flex-wrap gap-2">
                        {sortedPlayers.map(player => (
                            <label key={player.id} className="flex items-center space-x-2 cursor-pointer bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-600">
                                <input
                                    type="checkbox"
                                    checked={selectedPlayerIds.includes(player.id)}
                                    onChange={() => handlePlayerSelection(player.id)}
                                    className="form-checkbox h-4 w-4 rounded text-sky-500 bg-gray-200 dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-sky-500"
                                />
                                <span>{player.name} {player.surname}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {selectedPlayerIds.length > 0 && chartData.length > 1 ? (
                    <>
                        <div style={{ width: '100%', height: 400 }}>
                            <ResponsiveContainer>
                                <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={gridStrokeColor} />
                                    <XAxis
                                        dataKey="eventIndex"
                                        tickFormatter={(tick) => tick >= 0 ? `E${tick + 1}` : 'Start'}
                                        stroke={axisStrokeColor}
                                        allowDecimals={false}
                                    />
                                    <YAxis 
                                        type="number" 
                                        domain={['dataMin - 20', 'dataMax + 20']} 
                                        stroke={axisStrokeColor}
                                        tickFormatter={(tick) => Number(tick).toFixed(2)}
                                    />
                                    <Tooltip content={<CustomTooltip theme={theme} />} />
                                    <Legend
                                        verticalAlign="bottom"
                                        wrapperStyle={{ paddingTop: '20px' }}
                                    />
                                    {selectedPlayerIds.map((id, index) => {
                                        const player = players.find(p => p.id === id);
                                        if (!player) return null;
                                        return (
                                            <Line
                                                key={id}
                                                type="monotone"
                                                dataKey={id}
                                                name={`${player.name} ${player.surname}`}
                                                stroke={COLORS[index % COLORS.length]}
                                                strokeWidth={2}
                                                dot={{ r: 2 }}
                                                activeDot={{ r: 6 }}
                                                isAnimationActive={true}
                                            />
                                        );
                                    })}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </>
                ) : (
                    <div className="h-96 flex items-center justify-center text-gray-500">
                        {selectedPlayerIds.length === 0 
                            ? "Seleziona uno o più giocatori per visualizzare la progressione ELO."
                            : "No ELO history available for the selected players."
                        }
                    </div>
                )}
            </div>
            )}
        </Card>
    );
};

export default RankingChart;
