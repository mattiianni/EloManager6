import React, { useEffect, useMemo, useState } from 'react';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import { TeamTournamentConfig, TeamTournamentFixture, TeamTournamentMatchday, TeamTournamentTeam, TournamentType } from '../types.ts';
import Card from '../components/ui/Card.tsx';
import Button from '../components/ui/Button.tsx';
import { printTeamTournamentReport } from '../services/printService.ts';
import { calculateTeamTournamentStandings } from '../services/teamTournamentService.ts';
import { calculateTournamentLocalElo } from '../utils/tournamentElo.ts';

type Page = 'Dashboard' | 'Ranking' | 'Players' | 'Matches' | 'Draw' | 'Tournaments' | 'Statistiche' | 'Admin' | 'TeamMatchday' | 'TeamSummary';

interface TeamTournamentSummaryPageProps {
    setActivePage: (page: Page) => void;
    rootTournamentId: string | null;
    clearNavigationState: () => void;
}

const phaseOrder: Record<string, number> = {
    round_of_32: 0,
    round_of_16: 1,
    quarterfinal: 2,
    semifinal: 3,
    final_3_4: 4,
    final_1_2: 5,
};

const TeamTournamentSummaryPage: React.FC<TeamTournamentSummaryPageProps> = ({
    setActivePage,
    rootTournamentId,
    clearNavigationState,
}) => {
    const { tournaments, getTeamTournamentConfig, getTeamTournamentTeams, getTeamTournamentMatchdays, getTeamTournamentFixtures, players } = usePadelStore();

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [config, setConfig] = useState<TeamTournamentConfig | null>(null);
    const [teams, setTeams] = useState<TeamTournamentTeam[]>([]);
    const [matchdays, setMatchdays] = useState<TeamTournamentMatchday[]>([]);
    const [fixtures, setFixtures] = useState<TeamTournamentFixture[]>([]);

    const rootTournament = useMemo(() => {
        if (!rootTournamentId) return null;
        return tournaments.find(t => t.id === rootTournamentId) || null;
    }, [tournaments, rootTournamentId]);

    useEffect(() => {
        if (!rootTournamentId) return;
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const [cfg, tms, mds, fxs] = await Promise.all([
                    getTeamTournamentConfig(rootTournamentId),
                    getTeamTournamentTeams(rootTournamentId),
                    getTeamTournamentMatchdays(rootTournamentId),
                    getTeamTournamentFixtures(rootTournamentId),
                ]);
                if (cancelled) return;
                setConfig(cfg);
                setTeams(tms);
                setMatchdays(mds);
                setFixtures(fxs);
            } catch (e: any) {
                if (!cancelled) setError(e?.message || 'Errore nel caricamento riepilogo torneo.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [rootTournamentId, getTeamTournamentConfig, getTeamTournamentTeams, getTeamTournamentMatchdays, getTeamTournamentFixtures]);

    const teamNameByNumber = useMemo(() => {
        const map = new Map<number, string>();
        teams.forEach(t => map.set(t.teamNumber, t.name));
        return map;
    }, [teams]);

    const rrMatchdays = useMemo(
        () => matchdays.filter(md => (md.phase ?? 'round_robin') === 'round_robin'),
        [matchdays]
    );
    const isEliminationDirect = config?.format === 'ELIMINAZIONE DIRETTA';
    const standingsRR = useMemo(() => (config ? calculateTeamTournamentStandings(teams, matchdays, config.scoringType) : []), [config, teams, matchdays]);

    const fixtureByPhaseSlot = useMemo(() => {
        const m = new Map<string, TeamTournamentFixture>();
        fixtures.forEach(f => m.set(`${f.phase}:${f.slot}`, f));
        return m;
    }, [fixtures]);

    const matchdayByTournamentDayId = useMemo(() => {
        const m = new Map<string, TeamTournamentMatchday>();
        matchdays.forEach(md => m.set(md.tournamentDayId, md));
        return m;
    }, [matchdays]);

    const getWinnerLoser = (md: TeamTournamentMatchday | null) => {
        const s = md?.summary;
        if (!md || md.status !== 'completed' || !s?.winner) return null;
        if (s.winner === 'team1') return { winner: md.team1Number, loser: md.team2Number };
        if (s.winner === 'team2') return { winner: md.team2Number, loser: md.team1Number };
        return null;
    };

    const finalStandings = useMemo(() => {
        if (!config) return standingsRR.map((r, idx) => ({ pos: idx + 1, teamNumber: r.teamNumber, teamName: r.teamName }));
        if (config.format === 'ELIMINAZIONE DIRETTA') {
            const used = new Set<number>();
            const out: Array<{ pos: number; teamNumber: number; teamName: string }> = [];
            const pushTeam = (teamNumber: number | null, pos?: number) => {
                if (!teamNumber || used.has(teamNumber)) return;
                used.add(teamNumber);
                out.push({
                    pos: pos || out.length + 1,
                    teamNumber,
                    teamName: teamNameByNumber.get(teamNumber) || `Squadra ${teamNumber}`,
                });
            };

            const finalFixture = fixtures.find(f => f.phase === 'final_1_2' && f.slot === 1) || null;
            pushTeam(finalFixture?.winnerTeamNumber ?? null, 1);
            pushTeam(finalFixture?.loserTeamNumber ?? null, 2);

            fixtures
                .slice()
                .sort((a, b) => (phaseOrder[b.phase] ?? 0) - (phaseOrder[a.phase] ?? 0) || a.slot - b.slot)
                .forEach(f => {
                    pushTeam(f.loserTeamNumber ?? null);
                });

            teams.forEach(team => pushTeam(team.teamNumber));
            return out.sort((a, b) => a.pos - b.pos).map((row, index) => ({ ...row, pos: index + 1 }));
        }

        const rrOrder = standingsRR.map(r => r.teamNumber);
        const used = new Set<number>();
        const out: Array<{ pos: number; teamNumber: number; teamName: string }> = [];

        const pushTeam = (teamNumber: number | null, pos: number) => {
            if (!teamNumber) return;
            used.add(teamNumber);
            out.push({ pos, teamNumber, teamName: teamNameByNumber.get(teamNumber) || `Squadra ${teamNumber}` });
        };

        const fxFinal12 = fixtureByPhaseSlot.get('final_1_2:1') || null;
        const fxFinal34 = fixtureByPhaseSlot.get('final_3_4:1') || null;
        const mdFinal12 = fxFinal12?.tournamentDayId ? (matchdayByTournamentDayId.get(fxFinal12.tournamentDayId) || null) : null;
        const mdFinal34 = fxFinal34?.tournamentDayId ? (matchdayByTournamentDayId.get(fxFinal34.tournamentDayId) || null) : null;

        const r12 = getWinnerLoser(mdFinal12);
        const r34 = getWinnerLoser(mdFinal34);

        if (r12?.winner) pushTeam(r12.winner, 1);
        if (r12?.loser) pushTeam(r12.loser, 2);
        if (r34?.winner) pushTeam(r34.winner, 3);
        if (r34?.loser) pushTeam(r34.loser, 4);

        // Fill remaining positions using RR order, excluding already placed teams.
        let nextPos = out.length + 1;
        for (const tn of rrOrder) {
            if (used.has(tn)) continue;
            pushTeam(tn, nextPos);
            nextPos += 1;
        }

        // Safety fallback.
        return out.length > 0 ? out.sort((a, b) => a.pos - b.pos) : standingsRR.map((r, idx) => ({ pos: idx + 1, teamNumber: r.teamNumber, teamName: r.teamName }));
    }, [config, standingsRR, fixtureByPhaseSlot, matchdayByTournamentDayId, teamNameByNumber]);

    const playerEloStats = useMemo(() => {
        if (!teams.length || !matchdays.length || !players.length) return [];

        // Map teams to get players and their team
        const playerToTeamMap = new Map<string, string>();
        teams.forEach(t => {
            t.players.forEach(p => {
                if (p.id) playerToTeamMap.set(p.id, t.name);
            });
        });

        // Filter players that belong to any team
        const registeredPlayers = players.filter(p => playerToTeamMap.has(p.id));

        const resolvePlayerId = (entry: { id?: string; name: string; surname: string }) =>
            entry.id || players.find(player =>
                player.name.trim().toLowerCase() === entry.name.trim().toLowerCase()
                && player.surname.trim().toLowerCase() === entry.surname.trim().toLowerCase()
            )?.id || '';
        const localMatches = matchdays.flatMap(matchday => (matchday.subMatches || [])
            .filter(subMatch => !subMatch.cancelled && Array.isArray(subMatch.sets)
                && subMatch.sets.some(set => Number(set.team1 || 0) !== 0 || Number(set.team2 || 0) !== 0))
            .map((subMatch, index) => ({
                id: `${matchday.id}:${subMatch.matchIndex ?? index}`,
                tournamentId: `team-series:${rootTournamentId}`,
                date: matchday.date,
                roundNumber: (Number(matchday.roundNumber) || 0) * 100 + (subMatch.matchIndex ?? index),
                team1: (subMatch.team1Players || []).map(resolvePlayerId).filter(Boolean),
                team2: (subMatch.team2Players || []).map(resolvePlayerId).filter(Boolean),
                winner: subMatch.winner,
            })));
        const localElo = calculateTournamentLocalElo(localMatches);

        const stats = registeredPlayers.map(p => {
            const matchesPlayed = localMatches.filter(match => match.team1.includes(p.id) || match.team2.includes(p.id)).length;
            const deltaVar = localElo.totalDeltas.get(p.id) || 0;
            
            return {
                player: p,
                teamName: playerToTeamMap.get(p.id),
                matchesPlayed,
                eloVar: deltaVar
            };
        });

        // Filter out players with 0 matches if preferred, or keep them. Let's keep them and sort.
        // Sort by variation desc
        return stats.sort((a, b) => b.eloVar - a.eloVar);
    }, [teams, matchdays, players, rootTournamentId]);

    const playoffFixturesSorted = useMemo(() => {
        return fixtures
            .slice()
            .sort((a, b) => (phaseOrder[a.phase] ?? 99) - (phaseOrder[b.phase] ?? 99) || a.slot - b.slot);
    }, [fixtures]);

    const renderFixtureLine = (f: TeamTournamentFixture) => {
        const left = f.team1Number ? (teamNameByNumber.get(f.team1Number) || `Squadra ${f.team1Number}`) : 'Squadra da definire';
        const right = f.team2Number ? (teamNameByNumber.get(f.team2Number) || `Squadra ${f.team2Number}`) : 'Squadra da definire';
        const md = f.tournamentDayId ? (matchdayByTournamentDayId.get(f.tournamentDayId) || null) : null;
        const overall = (md?.status === 'completed' && md?.summary)
            ? (() => {
                const s = md.summary;
                const swap = f.team1Number && f.team2Number && md.team1Number !== f.team1Number;
                const t1w = swap ? s.team2Wins : s.team1Wins;
                const t2w = swap ? s.team1Wins : s.team2Wins;
                return `${t1w}-${t2w}`;
            })()
            : '';
        const label = (() => {
            if (f.phase === 'round_of_32') return `${f.slot}° Trentaduesimo`;
            if (f.phase === 'round_of_16') return `${f.slot}° Ottavo di finale`;
            if (f.phase === 'quarterfinal') return `${f.slot}° Quarto di finale`;
            if (f.phase === 'semifinal') return `${f.slot}^ Semifinale`;
            if (f.phase === 'final_3_4') return 'Finalina 3°-4°';
            if (f.phase === 'final_1_2') return 'Finale 1°-2°';
            return f.phase;
        })();
        const isGrandFinal = f.phase === 'final_1_2';
        return (
            <div
                key={f.id}
                className={`rounded-lg border p-3 ${
                    isGrandFinal
                        ? 'bg-amber-100 border-amber-300 text-gray-900'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}
            >
                <div className="flex items-center justify-between gap-3">
                    <div className={`text-sm font-semibold ${isGrandFinal ? 'text-gray-900' : 'text-gray-900 dark:text-white'}`}>{label}</div>
                    {overall ? (
                        <span className="text-xs font-bold px-3 py-1 rounded-full bg-sky-500 text-white">{overall}</span>
                    ) : null}
                </div>
                <div className={`mt-2 text-center text-base font-semibold ${isGrandFinal ? 'text-gray-900' : 'text-gray-900 dark:text-white'}`}>
                    {left} <span className={`font-normal ${isGrandFinal ? 'text-gray-700' : 'text-gray-500 dark:text-gray-400'}`}>vs</span> {right}
                </div>
                {md?.date ? (
                    <div className={`mt-1 text-center text-xs ${isGrandFinal ? 'text-gray-700' : 'text-gray-500 dark:text-gray-400'}`}>
                        {new Date(md.date).toLocaleDateString('it-IT')}
                    </div>
                ) : null}
            </div>
        );
    };

    if (!rootTournamentId) {
        return (
            <Card>
                <div className="text-gray-700 dark:text-gray-200">Nessun torneo selezionato.</div>
                <div className="mt-4">
                    <Button onClick={() => { clearNavigationState(); setActivePage('Tournaments'); }}>
                        Tornei
                    </Button>
                </div>
            </Card>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-4">
            <Card>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div className="text-2xl font-extrabold text-gray-900 dark:text-white">{rootTournament?.name || 'Torneo a Squadre'}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{rootTournament?.club || ''}</div>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                if (!config) return;
                                printTeamTournamentReport(
                                    { name: rootTournament?.name || 'Torneo a Squadre', club: rootTournament?.club || '', type: TournamentType.TorneoASquadre },
                                    config,
                                    teams,
                                    matchdays,
                                    fixtures
                                );
                            }}
                            className="min-w-0 flex-1 sm:flex-none"
                        >
                            Stampa
                        </Button>
                        <Button onClick={() => { clearNavigationState(); setActivePage('Tournaments'); }} className="min-w-0 flex-1 sm:flex-none">
                            Tornei
                        </Button>
                    </div>
                </div>
            </Card>

            {loading ? (
                <Card>Caricamento...</Card>
            ) : error ? (
                <Card>
                    <div className="text-red-600">{error}</div>
                </Card>
            ) : (
                <>
                    {!isEliminationDirect && (
                    <Card>
                        <div className="text-lg font-bold text-gray-900 dark:text-white">1^ Fase - Round Robin</div>
                        <div className="mt-3 text-base font-semibold text-gray-700 dark:text-gray-200">Classifica Finale</div>
                        <div className="mt-2 overflow-x-auto">
                            <table className="w-full min-w-[340px] table-fixed text-sm">
                                <thead>
                                    <tr className="text-[11px] text-gray-500 dark:text-gray-400">
                                        <th className="w-10 py-1 pr-2 text-center">Pos</th>
                                        <th className="py-1 pr-2 text-left">Squadra</th>
                                        <th className="w-14 py-1 px-1 text-center">{config?.scoringType === 'Differenza Games' ? 'Diff' : 'Pt'}</th>
                                        <th className="w-20 py-1 px-1 text-center">G/V/P</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {standingsRR.map((r, idx) => (
                                        <tr
                                            key={r.teamNumber}
                                            className="border-t border-gray-200 dark:border-gray-700"
                                        >
                                            <td className="py-1 pr-2 text-center text-sm">{idx + 1}</td>
                                            <td className="py-1 pr-2 text-sm font-medium truncate" title={r.teamName}>{r.teamName}</td>
                                            <td className="py-1 px-1 text-center text-sm">{config?.scoringType === 'Differenza Games' ? (r.gamesDiff >= 0 ? `+${r.gamesDiff}` : `${r.gamesDiff}`) : r.points}</td>
                                            <td className="py-1 px-1 text-center text-sm whitespace-nowrap">{r.played}/{r.won}/{r.lost}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                    )}

                    <Card>
                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                            {isEliminationDirect ? 'Tabellone Eliminazione Diretta' : 'Fase Finale'}
                        </div>
                        <div className="mt-3 space-y-3">
                            {playoffFixturesSorted.map(renderFixtureLine)}
                        </div>
                    </Card>

                    <Card>
                        <div className="text-xl font-bold text-gray-900 dark:text-white">Classifica finale</div>
                        <div className="mt-3 space-y-2">
                            {finalStandings.filter(r => r.pos <= 3).map(r => {
                                const team = teams.find(t => t.teamNumber === r.teamNumber) || null;
                                const roster = (team?.players || []).map(p => String(p?.surname || '').trim()).filter(Boolean);
                                const rosterLabel = roster.length > 0
                                    ? roster.map((s, idx) => idx === 0 ? `${s} (C)` : s).join(', ')
                                    : '—';

                                const ord = r.pos === 1 ? '1^' : (r.pos === 2 ? '2^' : '3^');
                                const bg =
                                    r.pos === 1 ? 'bg-amber-100 text-amber-950' :
                                    r.pos === 2 ? 'bg-slate-200 text-slate-950' :
                                    'bg-orange-100 text-orange-950';

                                return (
                                    <div key={r.teamNumber} className={`rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-3 ${bg}`}>
                                        <div className="text-center font-extrabold text-base">
                                            {ord} Classificata: {r.teamName}
                                        </div>
                                        <div className="mt-1 text-center text-sm opacity-90">
                                            {rosterLabel}
                                        </div>
                                    </div>
                                );
                            })}

                            {finalStandings.filter(r => r.pos >= 4).map(r => (
                                <div
                                    key={r.teamNumber}
                                    className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2"
                                >
                                    <div className="font-semibold">{r.pos}.</div>
                                    <div className="flex-1 ml-3">{r.teamName}</div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card>
                        <div className="text-xl font-bold text-gray-900 dark:text-white">Rendimento Individuale ELO</div>
                        <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                        <th className="py-2 pr-2 text-sm font-semibold text-gray-900 dark:text-gray-100">#</th>
                                        <th className="py-2 pr-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Giocatore</th>
                                        <th className="py-2 px-1 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">Team</th>
                                        <th className="py-2 px-1 text-center text-sm font-semibold text-gray-900 dark:text-gray-100" title="Partite (Giornate) Giocate">G</th>
                                        <th className="py-2 pl-2 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">Var. ELO</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {playerEloStats.map((stat, idx) => (
                                        <tr 
                                            key={stat.player.id} 
                                            className="border-t border-gray-200 dark:border-gray-700"
                                        >
                                            <td className="py-2 pr-2 text-sm">{idx + 1}</td>
                                            <td className="py-2 pr-2 text-sm font-medium">
                                                {stat.player.name} {stat.player.surname}
                                            </td>
                                            <td className="py-2 px-1 text-center text-sm truncate max-w-[100px]" title={stat.teamName}>
                                                {stat.teamName}
                                            </td>
                                            <td className="py-2 px-1 text-center text-sm">{stat.matchesPlayed}</td>
                                            <td className={`py-2 pl-2 text-right text-sm font-bold ${stat.eloVar > 0 ? 'text-green-500' : stat.eloVar < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                                                {stat.eloVar > 0 ? '+' : ''}{stat.eloVar.toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                    {playerEloStats.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-4 text-center text-sm text-gray-500">Nessun dato disponibile</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    <Card>
                        <div className="text-lg font-bold text-gray-900 dark:text-white">Elenco partite Round Robin</div>
                        <div className="mt-2 space-y-2">
                            {rrMatchdays
                                .slice()
                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                .map(md => {
                                    const left = teamNameByNumber.get(md.team1Number) || `Squadra ${md.team1Number}`;
                                    const right = teamNameByNumber.get(md.team2Number) || `Squadra ${md.team2Number}`;
                                    const overall = (md.status === 'completed' && md.summary)
                                        ? `${md.summary.team1Wins}-${md.summary.team2Wins}`
                                        : '';
                                    return (
                                        <div key={md.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-xs text-gray-500 dark:text-gray-400">{new Date(md.date).toLocaleDateString('it-IT')}</div>
                                                {overall ? (
                                                    <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-sky-500 text-white">{overall}</span>
                                                ) : null}
                                            </div>
                                            <div className="mt-1 text-sm text-center font-medium text-gray-900 dark:text-white">
                                                {left} <span className="font-normal text-gray-500 dark:text-gray-400">vs</span> {right}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    </Card>
                </>
            )}
        </div>
    );
};

export default TeamTournamentSummaryPage;
