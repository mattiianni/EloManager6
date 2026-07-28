import React, { useMemo, useState } from 'react';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import { SFIcon } from '../components/ui/SFIcon.tsx';
import PlayerProfileModal from '../components/PlayerProfileModal.tsx';
import { Player, TournamentType } from '../types.ts';
import { groupMatchesByPlayerSets } from '../services/beatTheBoxService.ts';
import { printPlayerProfiles } from '../services/printService.ts';
import PlayerPrintModal from '../components/PlayerPrintModal.tsx';
import Card from '../components/ui/Card.tsx';
import { formatPlayerName } from '../utils/format.ts';

interface DashboardPageProps {
    onNavigateToTournaments: (tournamentId: string) => void;
}

const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigateToTournaments }) => {
    const { players, matches, tournaments, eloHistory, getPlayerById } = usePadelStore();
    const [profilePlayer, setProfilePlayer] = useState<Player | null>(null);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

    const stats = useMemo(() => {
        const activePlayers = players.length;
        const totalMatches = matches.length;
        const completedTournaments = tournaments.filter(t => {
            if (t.status !== 'completed') return false;
            if (t.teamTournamentRootId && t.teamTournamentRootId === t.id) return false;
            return true;
        }).length;
        let avgElo = 0;
        if (players.length > 0) {
            const sorted = [...players].sort((a, b) => b.currentElo - a.currentElo);
            const top50Count = Math.max(1, Math.floor(sorted.length / 2));
            const top50 = sorted.slice(0, top50Count);
            avgElo = top50.reduce((sum, p) => sum + p.currentElo, 0) / top50Count;
        }
        return { activePlayers, totalMatches, completedTournaments, avgElo };
    }, [players, matches, tournaments]);

    const top5 = useMemo(() => {
        const sorted = [...players].sort((a, b) => b.currentElo - a.currentElo).slice(0, 5);
        return sorted.map(p => {
            const playerHistory = eloHistory
                .filter(e => e.playerId === p.id)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const lastDelta = playerHistory.length > 0 ? playerHistory[0].delta : 0;
            return { ...p, lastDelta };
        });
    }, [players, eloHistory]);

    const lastGiornata = useMemo(() => {
        const completed = tournaments
            .filter(t => t.status === 'completed')
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        if (completed.length === 0) return null;

        const tournament = completed[0];
        const tournamentMatches = matches.filter(m => m.tournamentId === tournament.id);

        let top3: { label: string }[] = [];

        if (tournament.type === TournamentType.BeatTheBox) {
            const { phaseMatches } = groupMatchesByPlayerSets(tournamentMatches);
            const numBoxes = groupMatchesByPlayerSets(tournamentMatches).boxes.size;
            let finalMatches: typeof tournamentMatches = [];
            if (numBoxes >= 4 && phaseMatches.length >= 2) {
                finalMatches = phaseMatches.slice(2);
            } else {
                finalMatches = phaseMatches;
            }
            const standings: { team: string[] }[] = [];
            if (finalMatches.length > 0 && finalMatches[0].winner) {
                const fm = finalMatches[0];
                standings.push({ team: fm.winner === 'team1' ? [...fm.team1] : [...fm.team2] });
                standings.push({ team: fm.winner === 'team1' ? [...fm.team2] : [...fm.team1] });
            }
            if (finalMatches.length > 1 && finalMatches[1].winner) {
                const fm = finalMatches[1];
                standings.push({ team: fm.winner === 'team1' ? [...fm.team1] : [...fm.team2] });
            }
            top3 = standings.map(s =>
                ({ label: s.team.map(id => { const p = getPlayerById(id); return p ? formatPlayerName(p) : '?'; }).join(' & ') })
            );
        } else {
            const uniquePlayers = Array.from(new Set(tournamentMatches.flatMap(m => [...m.team1, ...m.team2])));
            const topByWins = uniquePlayers
                .map(id => {
                    const p = getPlayerById(id);
                    const wins = tournamentMatches.filter(m =>
                        (m.winner === 'team1' && m.team1.includes(id)) ||
                        (m.winner === 'team2' && m.team2.includes(id))
                    ).length;
                    return { id, name: p ? formatPlayerName(p) : '?', wins };
                })
                .sort((a, b) => b.wins - a.wins)
                .slice(0, 3);
            top3 = topByWins.map(p => ({ label: `${p.name} (${p.wins} vittorie)` }));
        }

        return { ...tournament, top3 };
    }, [tournaments, matches, getPlayerById]);

    const recentMatches = useMemo(() => {
        const sorted = [...matches]
            .filter(m => m.winner && m.winner !== 'draw')
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5);
        return sorted.map(m => {
            const t1 = m.team1.map(id => { const p = getPlayerById(id); return p ? formatPlayerName(p) : '?'; }).join(' & ');
            const t2 = m.team2.map(id => { const p = getPlayerById(id); return p ? formatPlayerName(p) : '?'; }).join(' & ');
            const t1Score = m.sets.map(s => s.team1).join(' ');
            const t2Score = m.sets.map(s => s.team2).join(' ');
            const date = new Date(m.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
            return { date, t1, t2, t1Score, t2Score, winner: m.winner };
        });
    }, [matches, getPlayerById]);

    const getMedalIcon = (index: number) => {
        switch (index) {
            case 0: return <SFIcon name="medal.fill" size={20} color="var(--ios-systemYellow)" />;
            case 1: return <SFIcon name="medal.fill" size={20} color="var(--ios-systemGray)" />;
            case 2: return <SFIcon name="medal.fill" size={20} color="var(--ios-systemOrange)" />;
            default: return <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ios-secondaryLabel)' }}>{index + 1}.</span>;
        }
    };

    const getTrendIcon = (delta: number) => {
        if (delta > 0) return <SFIcon name="arrow.up" size={13} color="var(--ios-systemGreen)" />;
        if (delta < 0) return <SFIcon name="arrow.down" size={13} color="var(--ios-systemRed)" />;
        return <SFIcon name="minus" size={13} color="var(--ios-systemGray)" />;
    };

    const kpiItems = [
        { label: 'Giocatori', value: stats.activePlayers, icon: 'person.2.fill', color: 'var(--ios-systemBlue)' },
        { label: 'Partite', value: stats.totalMatches, icon: 'sportscourt', color: 'var(--ios-systemGreen)' },
        { label: 'Giornate', value: stats.completedTournaments, icon: 'calendar', color: 'var(--ios-systemOrange)' },
        { label: 'Media ELO', value: stats.avgElo.toFixed(0), icon: 'chart.bar.fill', color: 'var(--ios-systemIndigo)' },
    ];

    return (
        <div className="px-0 py-4 space-y-5">
            {/* KPI Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                {kpiItems.map((kpi, idx) => (
                    <div key={idx} style={{
                        background: 'var(--ios-secondarySystemGroupedBackground)',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <SFIcon name={kpi.icon} size={15} color={kpi.color} />
                            <span style={{
                                font: '600 11px/14px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
                                color: 'var(--ios-secondaryLabel)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                            }}>{kpi.label}</span>
                        </div>
                        <div style={{
                            font: '700 24px/28px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
                            color: 'var(--ios-label)',
                        }}>{kpi.value}</div>
                    </div>
                ))}
            </div>

            {/* TOP 5 */}
            <Card
                title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Top 5 Giocatori</span>
                        <button
                            onClick={() => setIsPrintModalOpen(true)}
                            disabled={players.length === 0}
                            style={{
                                color: 'var(--ios-systemBlue)',
                                font: '400 13px/18px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
                                textTransform: 'none',
                                letterSpacing: 0,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                            }}
                        >
                            <SFIcon name="printer" size={13} color="var(--ios-systemBlue)" />
                            Stampa
                        </button>
                    </div>
                }
            >
                <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {top5.length === 0 ? (
                        <div className="py-2 text-center text-ios-label-secondary">Nessun giocatore registrato</div>
                    ) : (
                        top5.map((p, i) => (
                            <div key={p.id} className="flex justify-between items-center py-2.5 cursor-pointer first:pt-0 last:pb-0" onClick={() => setProfilePlayer(p)}>
                                <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 flex items-center justify-center shrink-0">
                                        {getMedalIcon(i)}
                                    </div>
                                    <span className="font-medium text-ios-label text-[15px]">{p.name} {p.surname}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="font-semibold text-ios-blue text-[15px]">{p.currentElo.toFixed(0)}</span>
                                    {getTrendIcon(p.lastDelta)}
                                    <SFIcon name="chevron.right" size={12} color="var(--ios-label-tertiary)" />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>

            {/* ULTIMA GIORNATA */}
            <Card title="Ultima Giornata">
                {!lastGiornata ? (
                    <div className="py-2 text-center text-ios-label-secondary">Nessuna giornata completata</div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-white/5">
                        <div className="flex justify-between items-center py-2.5 cursor-pointer first:pt-0" onClick={() => onNavigateToTournaments?.(lastGiornata.id)}>
                            <div className="flex items-center gap-3">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', background: 'var(--ios-systemOrange)', borderRadius: '6px' }} className="shrink-0">
                                    <SFIcon name="trophy.fill" size={16} color="white" />
                                </div>
                                <div>
                                    <div className="font-semibold text-[15px]">{lastGiornata.name}</div>
                                    <div className="text-[12px] text-ios-label-secondary mt-0.5">{lastGiornata.type} • {new Date(lastGiornata.date).toLocaleDateString('it-IT')}</div>
                                </div>
                            </div>
                            <SFIcon name="chevron.right" size={12} color="var(--ios-label-tertiary)" />
                        </div>
                        {lastGiornata.top3.map((entry, i) => (
                            <div key={i} className="flex items-center gap-3 py-2.5 last:pb-0">
                                <div className="w-6 h-6 flex items-center justify-center shrink-0">
                                    {getMedalIcon(i)}
                                </div>
                                <span className="text-[14px] text-ios-label">{entry.label}</span>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* ULTIME PARTITE */}
            <Card title="Ultime Partite">
                {recentMatches.length === 0 ? (
                    <div className="py-2 text-center text-ios-label-secondary">Nessuna partita registrata</div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-white/5">
                        {recentMatches.map((m, i) => (
                            <div key={i} className="flex justify-between items-center py-3 first:pt-0 last:pb-0">
                                <div className="min-w-0 pr-3">
                                    <div className={`text-[14px] truncate ${m.winner === 'team1' ? 'font-semibold text-ios-label' : 'text-ios-label-secondary'}`}>{m.t1}</div>
                                    <div className={`text-[14px] truncate mt-0.5 ${m.winner === 'team2' ? 'font-semibold text-ios-label' : 'text-ios-label-secondary'}`}>{m.t2}</div>
                                    <div className="text-[11px] text-ios-label-secondary mt-1">{m.date}</div>
                                </div>
                                <div className="text-right shrink-0 font-mono text-[14px] font-semibold flex flex-col gap-0.5 leading-none">
                                    <div className={m.winner === 'team1' ? 'text-ios-label' : 'text-ios-label-secondary'}>{m.t1Score}</div>
                                    <div className={m.winner === 'team2' ? 'text-ios-label' : 'text-ios-label-secondary'}>{m.t2Score}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <PlayerProfileModal player={profilePlayer} onClose={() => setProfilePlayer(null)} />
            <PlayerPrintModal
                isOpen={isPrintModalOpen}
                onClose={() => setIsPrintModalOpen(false)}
                players={players}
                onPrintAll={() => {
                    printPlayerProfiles(players.map(p => p.id), players, matches, eloHistory, tournaments);
                }}
                onPrintSelected={(selectedIds) => {
                    printPlayerProfiles(selectedIds, players, matches, eloHistory, tournaments);
                }}
            />
        </div>
    );
};

export default DashboardPage;
