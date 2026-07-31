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

import Button from '../components/ui/Button.tsx';

interface DashboardPageProps {
    onNavigateToTournaments: (tournamentId: string) => void;
    onOpenDrawLauncher?: () => void;
    onNavigateToPage?: (page: 'Dashboard' | 'Ranking' | 'Players' | 'Matches' | 'Draw' | 'Tournaments' | 'Statistiche') => void;
}

const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigateToTournaments, onOpenDrawLauncher, onNavigateToPage }) => {
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
        return { activePlayers, totalMatches, completedTournaments };
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
        { 
            label: 'Giocatori', 
            value: stats.activePlayers, 
            icon: 'person.2.fill',
            bgGradient: 'from-indigo-500/10 via-transparent to-purple-600/5',
            borderColor: 'hover:border-indigo-500/80 dark:hover:border-indigo-400/80 hover:shadow-indigo-500/10',
            iconBadge: 'from-indigo-500 to-purple-600 shadow-indigo-500/30',
            targetPage: 'Ranking' as const,
        },
        { 
            label: 'Partite', 
            value: stats.totalMatches, 
            icon: 'sportscourt',
            bgGradient: 'from-sky-500/10 via-transparent to-blue-600/5',
            borderColor: 'hover:border-sky-500/80 dark:hover:border-sky-400/80 hover:shadow-sky-500/10',
            iconBadge: 'from-sky-500 to-blue-600 shadow-sky-500/30',
            targetPage: 'Statistiche' as const,
        },
        { 
            label: 'Giornate', 
            value: stats.completedTournaments, 
            icon: 'calendar',
            bgGradient: 'from-emerald-500/10 via-transparent to-teal-600/5',
            borderColor: 'hover:border-emerald-500/80 dark:hover:border-emerald-400/80 hover:shadow-emerald-500/10',
            iconBadge: 'from-emerald-500 to-teal-600 shadow-emerald-500/30',
            targetPage: 'Statistiche' as const,
        },
    ];

    return (
        <div className="px-0 py-2 space-y-6">
            <div className="flex justify-end items-center gap-3">
                <Button
                    onClick={onOpenDrawLauncher}
                    className="!bg-gradient-to-r !from-sky-500 !to-blue-600 !text-white shadow-md shadow-sky-500/25 !font-bold shrink-0"
                >
                    + Nuovo Torneo / Nuova Giornata
                </Button>
            </div>

            {/* KPI Grid - 3 cards affiancate sia su Mobile che su Desktop */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3.5">
                {kpiItems.map((kpi, idx) => (
                    <div 
                        key={idx} 
                        onClick={() => onNavigateToPage?.(kpi.targetPage)}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onNavigateToPage?.(kpi.targetPage); } }}
                        role="button"
                        tabIndex={0}
                        className={`cursor-pointer group relative flex flex-col justify-between p-2.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-white/70 dark:bg-slate-900/80 bg-gradient-to-br ${kpi.bgGradient} border border-slate-200/70 dark:border-white/10 ${kpi.borderColor} shadow-md hover:shadow-xl backdrop-blur-2xl transition-all duration-300 active:scale-95`}
                    >
                        <div className="flex items-center justify-between gap-1 mb-1 sm:mb-2">
                            <div className={`p-1.5 sm:p-2.5 rounded-xl sm:rounded-2xl bg-gradient-to-br ${kpi.iconBadge} text-white shadow-md shrink-0`}>
                                <SFIcon name={kpi.icon} size={16} color="#FFFFFF" />
                            </div>
                            <span className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{kpi.label}</span>
                        </div>
                        <div className="text-xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white mt-0.5 text-right">{kpi.value}</div>
                    </div>
                ))}
            </div>

            {/* TOP 5 */}
            <Card
                title={
                    <div className="flex justify-between items-center w-full">
                        <span className="font-bold text-sm tracking-wide text-slate-900 dark:text-white">Top 5 Giocatori</span>
                        <button
                            onClick={() => setIsPrintModalOpen(true)}
                            disabled={players.length === 0}
                            className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-700 flex items-center gap-1.5 bg-sky-500/10 hover:bg-sky-500/20 px-3 py-1.5 rounded-full border border-sky-500/20 transition-all"
                        >
                            <SFIcon name="printer" size={13} color="var(--ios-systemBlue)" />
                            Stampa Profilo
                        </button>
                    </div>
                }
            >
                <div className="divide-y divide-slate-200/60 dark:divide-white/10">
                    {top5.length === 0 ? (
                        <div className="py-4 text-center text-slate-400 text-sm">Nessun giocatore registrato</div>
                    ) : (
                        top5.map((p, i) => (
                            <div key={p.id} className="flex justify-between items-center py-3 px-1 cursor-pointer hover:bg-slate-100/50 dark:hover:bg-white/5 rounded-xl transition-colors" onClick={() => setProfilePlayer(p)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setProfilePlayer(p); } }} role="button" tabIndex={0}>
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 flex items-center justify-center shrink-0">
                                        {getMedalIcon(i)}
                                    </div>
                                    <span className="font-semibold text-slate-900 dark:text-white text-[15px]">{p.name} {p.surname}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="font-extrabold text-sky-600 dark:text-sky-400 text-[15px] bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-500/20">{p.currentElo.toFixed(0)}</span>
                                    {getTrendIcon(p.lastDelta)}
                                    <SFIcon name="chevron.right" size={12} color="var(--ios-label-tertiary)" />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>

            {/* ULTIMA GIORNATA */}
            <Card title="Ultima Giornata completata">
                {!lastGiornata ? (
                    <div className="py-4 text-center text-slate-400 text-sm">Nessuna giornata completata</div>
                ) : (
                    <div className="divide-y divide-slate-200/60 dark:divide-white/10">
                        <div className="flex justify-between items-center py-3 px-1 cursor-pointer hover:bg-slate-100/50 dark:hover:bg-white/5 rounded-xl transition-colors" onClick={() => onNavigateToTournaments?.(lastGiornata.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onNavigateToTournaments?.(lastGiornata.id); } }} role="button" tabIndex={0}>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-9 h-9 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-md text-white shrink-0">
                                    <SFIcon name="trophy.fill" size={18} color="white" />
                                </div>
                                <div>
                                    <div className="font-bold text-[15px] text-slate-900 dark:text-white">{lastGiornata.name}</div>
                                    <div className="text-[12px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">{lastGiornata.type} • {new Date(lastGiornata.date).toLocaleDateString('it-IT')}</div>
                                </div>
                            </div>
                            <SFIcon name="chevron.right" size={12} color="var(--ios-label-tertiary)" />
                        </div>
                        {lastGiornata.top3.map((entry, i) => (
                            <div key={i} className="flex items-center gap-3 py-2.5 px-1">
                                <div className="w-7 h-7 flex items-center justify-center shrink-0">
                                    {getMedalIcon(i)}
                                </div>
                                <span className="text-[14px] font-medium text-slate-800 dark:text-slate-200">{entry.label}</span>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* ULTIME PARTITE */}
            <Card title="Ultime Partite">
                {recentMatches.length === 0 ? (
                    <div className="py-4 text-center text-slate-400 text-sm">Nessuna partita registrata</div>
                ) : (
                    <div className="divide-y divide-slate-200/60 dark:divide-white/10">
                        {recentMatches.map((m, i) => (
                            <div key={i} className="flex justify-between items-center py-3 px-1">
                                <div className="min-w-0 pr-3">
                                    <div className={`text-[14px] truncate ${m.winner === 'team1' ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{m.t1}</div>
                                    <div className={`text-[14px] truncate mt-0.5 ${m.winner === 'team2' ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{m.t2}</div>
                                    <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-1">{m.date}</div>
                                </div>
                                <div className="text-right shrink-0 font-mono text-[14px] font-bold flex flex-col gap-0.5 bg-slate-100/70 dark:bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-200/60 dark:border-white/10">
                                    <div className={m.winner === 'team1' ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'}>{m.t1Score}</div>
                                    <div className={m.winner === 'team2' ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'}>{m.t2Score}</div>
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
