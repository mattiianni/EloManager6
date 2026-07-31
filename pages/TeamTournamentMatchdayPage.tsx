import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import { TeamTournamentConfig, TeamTournamentMatchday, TeamTournamentTeam, TournamentType, SetScore, TeamTournamentPlayerEntry, TeamTournamentFixture } from '../types.ts';
import Card from '../components/ui/Card.tsx';
import Button from '../components/ui/Button.tsx';
import MatchScoreInput from '../components/ui/MatchScoreInput.tsx';
import { ArrowLeftIcon, PencilIcon } from '../components/ui/Icons.tsx';
import { printTeamTournamentMatchdayReport } from '../services/printService.ts';
import { requestHIGConfirmation } from '../utils/higDialogService.ts';

type Page = 'Dashboard' | 'Ranking' | 'Players' | 'Matches' | 'Draw' | 'Tournaments' | 'Statistiche' | 'Admin' | 'TeamMatchday';

interface TeamTournamentMatchdayPageProps {
    setActivePage: (page: Page) => void;
    rootTournamentId: string | null;
    tournamentDayId: string | null; // child tournaments.id
    fixtureId?: string | null;
    onNavigateToTeamTournamentSummary: (rootTournamentId: string) => void;
    clearNavigationState: () => void;
}

type ViewMode = 'create' | 'results';

const findRoundInfo = (config: TeamTournamentConfig | null, team1: number | null, team2: number | null) => {
    if (!config?.schedule || config.schedule.kind !== 'round_robin' || !team1 || !team2) return null;
    for (const day of config.schedule.days) {
        for (const m of day.matches) {
            const same = (m.team1Number === team1 && m.team2Number === team2) || (m.team1Number === team2 && m.team2Number === team1);
            if (same) {
                return { dayNumber: day.dayNumber, totalDays: config.schedule.days.length };
            }
        }
    }
    return null;
};

const normalizeDateForInput = (iso: string) => {
    try {
        return new Date(iso).toISOString().split('T')[0];
    } catch {
        return '';
    }
};

const fixturePhaseLabel = (phase: TeamTournamentFixture['phase'], slot: number) => {
    if (phase === 'round_of_32') return `${slot}° Trentaduesimo`;
    if (phase === 'round_of_16') return `${slot}° Ottavo di Finale`;
    if (phase === 'quarterfinal') return `${slot}° Quarto di Finale`;
    if (phase === 'semifinal') return `${slot}^ Semifinale`;
    if (phase === 'final_3_4') return 'Finale 3° e 4° Posto';
    if (phase === 'final_1_2') return 'Finale 1° e 2° Posto';
    return phase;
};

const eliminationRequiredFixtures = (fixtures: TeamTournamentFixture[]) =>
    fixtures
        .filter(f => !f.isBye)
        .map(f => ({ phase: f.phase, slot: f.slot }));

const TeamTournamentMatchdayPage: React.FC<TeamTournamentMatchdayPageProps> = ({
    setActivePage,
    rootTournamentId,
    tournamentDayId,
    fixtureId,
    onNavigateToTeamTournamentSummary,
    clearNavigationState,
}) => {
    const {
        tournaments,
        getTeamTournamentConfig,
        getTeamTournamentTeams,
        createTeamTournamentMatchday,
        getTeamTournamentMatchdayByTournamentDayId,
        saveTeamTournamentMatchdayResults,
        getTeamTournamentMatchdays,
        getTeamTournamentFixtures,
    } = usePadelStore();

    const initialMode: ViewMode = tournamentDayId ? 'results' : 'create';
    const [mode, setMode] = useState<ViewMode>(initialMode);
    const [resolvedRootId, setResolvedRootId] = useState<string | null>(rootTournamentId);
    const [matchday, setMatchday] = useState<TeamTournamentMatchday | null>(null);
    const [config, setConfig] = useState<TeamTournamentConfig | null>(null);
    const [teams, setTeams] = useState<TeamTournamentTeam[]>([]);
    const [existingMatchdays, setExistingMatchdays] = useState<TeamTournamentMatchday[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [date, setDate] = useState<string>('');
    const [team1Number, setTeam1Number] = useState<number | null>(null);
    const [team2Number, setTeam2Number] = useState<number | null>(null);
    const [fixture, setFixture] = useState<any | null>(null);
    const [fixtures, setFixtures] = useState<TeamTournamentFixture[]>([]);
    const [selectedFixtureId, setSelectedFixtureId] = useState<string>(fixtureId || '');
    const [isSavingCalendar, setIsSavingCalendar] = useState(false);
    const [isSavingResults, setIsSavingResults] = useState(false);
    const [subMatchSelections, setSubMatchSelections] = useState<Array<{
        team1: [string, string];
        team2: [string, string];
    }>>([]);
    const [editSubMatchSelections, setEditSubMatchSelections] = useState<Array<{
        team1: [string, string];
        team2: [string, string];
    }>>([]);
    const [subMatchSets, setSubMatchSets] = useState<Record<number, SetScore[]>>({});
    const [savedSummary, setSavedSummary] = useState<any | null>(null);
    const [cancelledByIndex, setCancelledByIndex] = useState<Record<number, boolean>>({});
    const [isRefreshingFixtures, setIsRefreshingFixtures] = useState(false);
    const triedFixtureRefreshRef = useRef(false);

    useEffect(() => {
        setResolvedRootId(rootTournamentId);
    }, [rootTournamentId]);

    useEffect(() => {
        setError(null);
        setSavedSummary(null);
        setMatchday(null);
        setConfig(null);
        setTeams([]);
        setTeam1Number(null);
        setTeam2Number(null);
        setFixture(null);
        setFixtures([]);
        setSelectedFixtureId(fixtureId || '');
        setSubMatchSelections([]);
        setSubMatchSets({});
        setCancelledByIndex({});

        if (tournamentDayId) {
            setMode('results');
        } else {
            setMode('create');
        }
    }, [rootTournamentId, tournamentDayId, fixtureId]);

    useEffect(() => {
        if (!tournamentDayId) return;
        let cancelled = false;

        const loadMatchday = async () => {
            setLoading(true);
            setError(null);
            try {
                const md = await getTeamTournamentMatchdayByTournamentDayId(tournamentDayId);
                if (cancelled) return;
                setMatchday(md);
                setResolvedRootId(md.rootTournamentId);
                setDate(normalizeDateForInput(md.date));
                setTeam1Number(md.team1Number);
                setTeam2Number(md.team2Number);

                const setsMap: Record<number, SetScore[]> = {};
                md.subMatches.forEach(sm => {
                    setsMap[sm.matchIndex] = sm.sets || [{ team1: 0, team2: 0 }];
                });
                setSubMatchSets(setsMap);
                setSavedSummary(md.summary || null);
                const cancelledMap: Record<number, boolean> = {};
                md.subMatches.forEach(sm => { cancelledMap[sm.matchIndex] = !!sm.cancelled; });
                setCancelledByIndex(cancelledMap);
            } catch (err: any) {
                if (!cancelled) setError(err.message || 'Errore nel recupero della giornata.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadMatchday();
        return () => { cancelled = true; };
    }, [tournamentDayId, getTeamTournamentMatchdayByTournamentDayId]);

    useEffect(() => {
        if (!resolvedRootId) return;
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const [cfg, tms] = await Promise.all([
                    getTeamTournamentConfig(resolvedRootId),
                    getTeamTournamentTeams(resolvedRootId),
                ]);
                if (cancelled) return;
                setConfig(cfg);
                setTeams(tms);
                let loadedFixtures: TeamTournamentFixture[] = [];
                try {
                    const [mds, fxs] = await Promise.all([
                        !tournamentDayId ? getTeamTournamentMatchdays(resolvedRootId) : Promise.resolve([]),
                        getTeamTournamentFixtures(resolvedRootId),
                    ]);
                    if (cancelled) return;
                    setExistingMatchdays(mds);
                    setFixtures(fxs);
                    loadedFixtures = fxs;
                } catch {
                    if (!cancelled) {
                        setExistingMatchdays([]);
                        setFixtures([]);
                    }
                }

                if (!tournamentDayId) {
                    // Default date = today
                    setDate(new Date().toISOString().split('T')[0]);
                }

                if (!tournamentDayId) {
                    try {
                        const selectedId = fixtureId || selectedFixtureId;
                        const fx = selectedId ? (loadedFixtures.find(f => f.id === selectedId) || null) : null;
                        setFixture(fx);
                        if (fx) {
                            setTeam1Number(fx.team1Number);
                            setTeam2Number(fx.team2Number);
                            setSelectedFixtureId(fx.id);
                        }
                    } catch {
                        if (!cancelled) {
                            setFixture(null);
                            setFixtures([]);
                        }
                    }
                } else {
                    setFixture(null);
                }
            } catch (err: any) {
                if (!cancelled) setError(err.message || 'Errore nel caricamento dati torneo.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [resolvedRootId, getTeamTournamentConfig, getTeamTournamentTeams, getTeamTournamentMatchdays, getTeamTournamentFixtures, tournamentDayId, fixtureId, selectedFixtureId]);

    const rootTournament = useMemo(() => {
        if (!resolvedRootId) return null;
        return tournaments.find(t => t.id === resolvedRootId) || null;
    }, [tournaments, resolvedRootId]);

    const matchesPerDay = config?.matchesPerDay || 3;

    const rosterByTeamNumber = useMemo(() => {
        const map = new Map<number, Array<{ idx: number; entry: TeamTournamentPlayerEntry; label: string }>>();
        teams.forEach(team => {
            const roster = (team.players || [])
                .map((p, idx) => ({ idx, entry: p, label: `${p.name} ${p.surname}`.trim() }))
                .filter(p => p.entry.name.trim() && p.entry.surname.trim());
            map.set(team.teamNumber, roster);
        });
        return map;
    }, [teams]);

    useEffect(() => {
        if (mode !== 'create') return;
        const desired = matchesPerDay;
        setSubMatchSelections(prev => {
            if (prev.length === desired) return prev;
            if (prev.length > desired) return prev.slice(0, desired);
            return [
                ...prev,
                ...Array.from({ length: desired - prev.length }, () => ({
                    team1: ['', ''] as [string, string],
                    team2: ['', ''] as [string, string],
                })),
            ];
        });
    }, [matchesPerDay, mode]);

    // Initialize edit selections from loaded matchday
    useEffect(() => {
        if (mode !== 'results' || !matchday || !rosterByTeamNumber.size) return;
        const roster1 = rosterByTeamNumber.get(matchday.team1Number) || [];
        const roster2 = rosterByTeamNumber.get(matchday.team2Number) || [];
        
        const initialEdits = matchday.subMatches.map(sm => {
            const findIdx = (p: any, roster: typeof roster1) => {
                if (!p || !p.name) return '';
                const item = roster.find(r => r.entry.name === p.name && r.entry.surname === p.surname);
                return item ? String(item.idx) : '';
            };
            return {
                team1: [findIdx(sm.team1Players[0], roster1), findIdx(sm.team1Players[1], roster1)] as [string, string],
                team2: [findIdx(sm.team2Players[0], roster2), findIdx(sm.team2Players[1], roster2)] as [string, string],
            };
        });
        setEditSubMatchSelections(initialEdits);
    }, [mode, matchday, rosterByTeamNumber]);

    const roundInfo = useMemo(() => findRoundInfo(config, team1Number, team2Number), [config, team1Number, team2Number]);

    const playedPairKeys = useMemo(() => {
        const set = new Set<string>();
        existingMatchdays.forEach(md => {
            const a = Math.min(md.team1Number, md.team2Number);
            const b = Math.max(md.team1Number, md.team2Number);
            set.add(`${a}-${b}`);
        });
        return set;
    }, [existingMatchdays]);

    const teamOptions = useMemo(() => {
        return teams.map(t => ({ value: t.teamNumber, label: t.name }));
    }, [teams]);

    const team2Options = useMemo(() => {
        if (!team1Number) return teamOptions;
        return teamOptions.filter(o => {
            if (o.value === team1Number) return false;
            const a = Math.min(team1Number, o.value);
            const b = Math.max(team1Number, o.value);
            return !playedPairKeys.has(`${a}-${b}`);
        });
    }, [team1Number, teamOptions, playedPairKeys]);

    const totalRoundRobin = useMemo(() => {
        if (!config) return 0;
        if (config.schedule?.kind === 'round_robin') {
            return (config.schedule.days || []).reduce((sum, day) => sum + ((day.matches || []).length), 0);
        }
        const teamCount = Number(config.initialTeamCount || 0);
        return teamCount >= 2 ? Math.floor((teamCount * (teamCount - 1)) / 2) : 0;
    }, [config]);

    const completedRoundRobin = useMemo(() => {
        return existingMatchdays
            .filter(md => (md.phase ?? 'round_robin') === 'round_robin')
            .filter(md => md.status === 'completed' && md.summary).length;
    }, [existingMatchdays]);

    const readyPlayoffFixtures = useMemo(() => {
        return fixtures.filter(f => f.status === 'planned' && !!f.team1Number && !!f.team2Number);
    }, [fixtures]);

    const isEliminationDirect = config?.format === 'ELIMINAZIONE DIRETTA';
    const hasConfiguredPlayoffPhase = (isEliminationDirect && fixtures.length > 0) || (!!config?.roundRobinFinalPhase && config?.format === 'ROUND ROBIN');
    const isFinalStageCompleted = useMemo(() => {
        if (!hasConfiguredPlayoffPhase) return false;
        const required: Array<{ phase: TeamTournamentFixture['phase']; slot: number }> = [];
        if (isEliminationDirect) {
            required.push(...eliminationRequiredFixtures(fixtures));
        } else if (config?.roundRobinFinalPhase === 'FINALI') {
            required.push({ phase: 'final_1_2', slot: 1 });
        } else if (config?.roundRobinFinalPhase === 'SEMIFINALI E FINALI') {
            required.push(
                { phase: 'semifinal', slot: 1 },
                { phase: 'semifinal', slot: 2 },
                { phase: 'final_3_4', slot: 1 },
                { phase: 'final_1_2', slot: 1 }
            );
        } else if (config?.roundRobinFinalPhase === 'QUARTI, SEMIFINALI E FINALI') {
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
        return required.length > 0 && required.every(r => fixtures.some(f => f.phase === r.phase && f.slot === r.slot && f.status === 'completed'));
    }, [fixtures, hasConfiguredPlayoffPhase, config?.roundRobinFinalPhase, isEliminationDirect]);

    const isTournamentCompleted = mode === 'create' && ((isEliminationDirect && hasConfiguredPlayoffPhase) || (totalRoundRobin > 0 && completedRoundRobin >= totalRoundRobin && hasConfiguredPlayoffPhase)) && isFinalStageCompleted;
    const isPlayoffCreateFlow = mode === 'create' && (isEliminationDirect || (totalRoundRobin > 0 && completedRoundRobin >= totalRoundRobin)) && hasConfiguredPlayoffPhase && !isFinalStageCompleted;
    const blockedPlayoffFixtures = useMemo(() => {
        if (!isPlayoffCreateFlow) return [];
        return fixtures.filter(f => f.status === 'planned' && (!f.team1Number || !f.team2Number) && !!f.dependsOn);
    }, [fixtures, isPlayoffCreateFlow]);

    const fixtureOptions = useMemo(() => {
        return readyPlayoffFixtures.map(f => {
            const left = f.team1Number ? (teams.find(t => t.teamNumber === f.team1Number)?.name || `Squadra ${f.team1Number}`) : 'Squadra da definire';
            const right = f.team2Number ? (teams.find(t => t.teamNumber === f.team2Number)?.name || `Squadra ${f.team2Number}`) : 'Squadra da definire';
            return {
                value: f.id,
                label: `${fixturePhaseLabel(f.phase, f.slot)} - ${left} vs ${right}`,
            };
        });
    }, [readyPlayoffFixtures, teams]);

    const refreshFixtures = async () => {
        if (!resolvedRootId) return;
        setIsRefreshingFixtures(true);
        try {
            const fxs = await getTeamTournamentFixtures(resolvedRootId);
            setFixtures(fxs);
        } catch {
            // Non-blocking: the user can retry.
        } finally {
            setIsRefreshingFixtures(false);
        }
    };

    // Auto-retry once when we are in playoff flow but options are still empty.
    useEffect(() => {
        if (!isPlayoffCreateFlow) return;
        if (fixtureId) return;
        if (fixtureOptions.length > 0) return;
        if (triedFixtureRefreshRef.current) return;
        triedFixtureRefreshRef.current = true;
        refreshFixtures();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlayoffCreateFlow, fixtureId, fixtureOptions.length, resolvedRootId]);

    useEffect(() => {
        if (!team1Number) return;
        if (!team2Number) return;
        const a = Math.min(team1Number, team2Number);
        const b = Math.max(team1Number, team2Number);
        if (playedPairKeys.has(`${a}-${b}`)) {
            setTeam2Number(null);
        }
    }, [team1Number, team2Number, playedPairKeys]);

    useEffect(() => {
        if (!isPlayoffCreateFlow) return;
        if (fixtureId) return;
        if (selectedFixtureId) return;
        if (readyPlayoffFixtures[0]) {
            setSelectedFixtureId(readyPlayoffFixtures[0].id);
        }
    }, [isPlayoffCreateFlow, fixtureId, selectedFixtureId, readyPlayoffFixtures]);

    useEffect(() => {
        if (!selectedFixtureId || fixtures.length === 0 || tournamentDayId) return;
        const fx = fixtures.find(f => f.id === selectedFixtureId) || null;
        setFixture(fx);
        setTeam1Number(fx?.team1Number ?? null);
        setTeam2Number(fx?.team2Number ?? null);
    }, [selectedFixtureId, fixtures, tournamentDayId]);

    const getRoster = (teamNumber: number | null) => {
        if (!teamNumber) return [];
        return rosterByTeamNumber.get(teamNumber) || [];
    };

    const usedPlayersForTeam = (teamNumber: number | null) => {
        if (!teamNumber) return new Set<string>();
        const used = new Set<string>();
        const selections = mode === 'create' ? subMatchSelections : editSubMatchSelections;
        selections.forEach(sel => {
            const arr = teamNumber === team1Number ? sel.team1 : (teamNumber === team2Number ? sel.team2 : null);
            if (!arr) return;
            arr.forEach(v => { if (v) used.add(v); });
        });
        return used;
    };

    const teamCompletion = useMemo(() => {
        const map = new Map<number, { filled: number; target: number; complete: boolean }>();
        teams.forEach(t => {
            const filled = (t.players || []).filter(p => String(p?.name || '').trim() && String(p?.surname || '').trim()).length;
            const target = Number(t.targetPlayerCount || 0);
            const minRequired = matchesPerDay * 2;
            map.set(t.teamNumber, { filled, target, complete: filled >= minRequired });
        });
        return map;
    }, [teams, matchesPerDay]);

    const selectedTeamsComplete = useMemo(() => {
        const t1 = team1Number ? teamCompletion.get(team1Number) : null;
        const t2 = team2Number ? teamCompletion.get(team2Number) : null;
        if (!t1 || !t2) return false;
        return t1.complete && t2.complete;
    }, [team1Number, team2Number, teamCompletion]);

    const canSaveCalendar = useMemo(() => {
        if (!resolvedRootId) return false;
        if (!date || !team1Number || !team2Number || team1Number === team2Number) return false;
        if (mode !== 'create') return false;
        if (!selectedTeamsComplete) return false;
        if (subMatchSelections.length !== matchesPerDay) return false;

        const t1Used = new Set<string>();
        const t2Used = new Set<string>();
        let playedCount = 0;
        for (const sm of subMatchSelections) {
            const [a, b] = sm.team1;
            const [c, d] = sm.team2;
            const isEmpty = !a && !b && !c && !d;
            if (isEmpty) continue;
            // No partial matches: either all 4 selected or none
            if (!a || !b || !c || !d) return false;
            if (a === b || c === d) return false;
            if (t1Used.has(a) || t1Used.has(b)) return false;
            if (t2Used.has(c) || t2Used.has(d)) return false;
            t1Used.add(a); t1Used.add(b);
            t2Used.add(c); t2Used.add(d);
            playedCount++;
        }
        return playedCount > 0;
    }, [resolvedRootId, date, team1Number, team2Number, mode, subMatchSelections, matchesPerDay, selectedTeamsComplete]);

    const computeLiveWins = () => {
        const mpd = matchday?.matchesPerDay || matchesPerDay;
        const neededWins = mpd === 5 ? 3 : 2;
        let team1Wins = 0;
        let team2Wins = 0;
        for (const sm of (matchday?.subMatches || [])) {
            if (cancelledByIndex[sm.matchIndex]) continue;
            const sets = subMatchSets[sm.matchIndex] || [{ team1: 0, team2: 0 }];
            const allZero = sets.every(s => Number(s.team1 || 0) === 0 && Number(s.team2 || 0) === 0);
            if (allZero) continue;
            const t1 = sets.reduce((sum, s) => sum + Number(s.team1 || 0), 0);
            const t2 = sets.reduce((sum, s) => sum + Number(s.team2 || 0), 0);
            if (t1 === t2) continue;
            if (t1 > t2) team1Wins++;
            if (t2 > t1) team2Wins++;
        }
        const winner = team1Wins >= neededWins ? 'team1' : (team2Wins >= neededWins ? 'team2' : null);
        return { neededWins, team1Wins, team2Wins, winner };
    };

    const handleSaveCalendar = async (goToResults: boolean) => {
        if (!resolvedRootId || !canSaveCalendar) return;
        setIsSavingCalendar(true);
        setError(null);
        try {
            const roster1 = getRoster(team1Number);
            const roster2 = getRoster(team2Number);

            const subMatchesPayload = subMatchSelections.map(sel => ({
                team1Players: sel.team1.filter(Boolean).length === 0
                    ? []
                    : (sel.team1.map(v => roster1.find(p => String(p.idx) === v)?.entry).filter(Boolean) as TeamTournamentPlayerEntry[]),
                team2Players: sel.team2.filter(Boolean).length === 0
                    ? []
                    : (sel.team2.map(v => roster2.find(p => String(p.idx) === v)?.entry).filter(Boolean) as TeamTournamentPlayerEntry[]),
            }));

            const tournamentDay = await createTeamTournamentMatchday(resolvedRootId, {
                date,
                team1Number: team1Number!,
                team2Number: team2Number!,
                subMatches: subMatchesPayload,
                ...(fixture?.id ? { fixtureId: fixture.id } : {}),
            });

            if (goToResults) {
                // Load and switch to results view
                const md = await getTeamTournamentMatchdayByTournamentDayId(tournamentDay.id);
                setMatchday(md);
                setResolvedRootId(md.rootTournamentId);
                setMode('results');
                setSavedSummary(md.summary || null);
                const setsMap: Record<number, SetScore[]> = {};
                md.subMatches.forEach(sm => {
                    setsMap[sm.matchIndex] = sm.sets || [{ team1: 0, team2: 0 }];
                });
                setSubMatchSets(setsMap);
            } else {
                clearNavigationState();
                setActivePage('Tournaments');
            }
        } catch (err: any) {
            setError(err.message || 'Errore nel salvataggio del calendario.');
        } finally {
            setIsSavingCalendar(false);
        }
    };

    const handleSaveResults = async (finalize: boolean) => {
        if (!matchday) return;
        setIsSavingResults(true);
        setError(null);
        try {
            const payload = {
                status: finalize ? 'completed' as const : 'scheduled' as const,
                subMatches: (matchday.subMatches || []).map((sm, index) => {
                    const editSel = editSubMatchSelections[index] || { team1: [], team2: [] };
                    const team1Players = editSel.team1.filter(Boolean).map(v => getRoster(matchday.team1Number).find(p => String(p.idx) === v)?.entry).filter(Boolean) as TeamTournamentPlayerEntry[];
                    const team2Players = editSel.team2.filter(Boolean).map(v => getRoster(matchday.team2Number).find(p => String(p.idx) === v)?.entry).filter(Boolean) as TeamTournamentPlayerEntry[];
                    return {
                        matchIndex: sm.matchIndex,
                        sets: subMatchSets[sm.matchIndex] || [{ team1: 0, team2: 0 }],
                        cancelled: !!cancelledByIndex[sm.matchIndex],
                        team1Players,
                        team2Players
                    };
                }),
            };
            
            // Validate minimum played matches before finalizing
            if (finalize) {
                const uncancelledCount = payload.subMatches.filter(sm => !sm.cancelled).length;
                const mpd = matchday.matchesPerDay;
                const neededWins = mpd === 5 ? 3 : 2;
                if (uncancelledCount < neededWins) {
                    setError(`Devi inserire almeno ${neededWins} partite per poter decretare un vincitore e chiudere la giornata.`);
                    setIsSavingResults(false);
                    return;
                }
            }
            const summary = await saveTeamTournamentMatchdayResults(matchday.id, payload);
            setSavedSummary(summary);

            // Refresh matchday so prints (and UI) immediately reflect saved set scores/summary.
            try {
                const fresh = await getTeamTournamentMatchdayByTournamentDayId(matchday.tournamentDayId);
                setMatchday(fresh);
            } catch {
                // Non-blocking: the save succeeded; printing may still use stale data until next load.
            }

            if (finalize) {
                clearNavigationState();
                setActivePage('Tournaments');
            }
        } catch (err: any) {
            setError(err.message || 'Errore nel salvataggio dei risultati.');
        } finally {
            setIsSavingResults(false);
        }
    };

    const renderCreate = () => (
        <div className="max-w-4xl mx-auto space-y-4">
            {isTournamentCompleted && resolvedRootId ? (
                <Card title="Torneo completato">
                    <div className="space-y-4">
                        <p className="text-gray-600 dark:text-gray-300">
                            La fase finale è stata completata. Puoi visualizzare il riepilogo completo del torneo.
                        </p>
                        <div className="flex justify-between gap-2">
                            <Button
                                variant="secondary"
                                type="button"
                                onClick={() => {
                                    clearNavigationState();
                                    setActivePage('Tournaments');
                                }}
                                className="shrink-0 px-3"
                            >
                                <span className="sm:hidden" aria-hidden="true">
                                    <ArrowLeftIcon className="h-4 w-4" />
                                </span>
                                <span className="hidden sm:inline">Torna a tornei</span>
                            </Button>
                            <Button
                                type="button"
                                onClick={() => onNavigateToTeamTournamentSummary(resolvedRootId)}
                                className="min-w-0 !border-sky-700 !bg-sky-600 hover:!bg-sky-700 !text-white dark:!border-sky-300"
                            >
                                Riepilogo
                            </Button>
                        </div>
                    </div>
                </Card>
            ) : null}

            {isTournamentCompleted ? null : (
            <Card title="Inserisci partita">
                <div className="space-y-4 overflow-x-hidden">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                        <div className="min-w-0 overflow-hidden">
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Data</label>
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="mobile-date-input mt-1 block w-full min-w-0 max-w-full overflow-hidden bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                disabled={isSavingCalendar || loading}
                            />
                        </div>
                        <div className="min-w-0 sm:col-span-2">
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                                {isPlayoffCreateFlow ? 'Partita fase finale' : 'Squadre'}
                            </label>
                            {isPlayoffCreateFlow && (
                                <>
                                    <select
                                        value={selectedFixtureId}
                                        onChange={e => setSelectedFixtureId(e.target.value)}
                                        className="mt-1 mb-2 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                        disabled={!!fixtureId || isSavingCalendar || loading || fixtureOptions.length === 0}
                                    >
                                        <option value="">Seleziona partita</option>
                                        {fixtureOptions.map(option => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                    {fixtureOptions.length === 0 && (
                                        <div className="text-sm text-orange-600 dark:text-orange-300 flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                {(() => {
                                                    const needsSemis = blockedPlayoffFixtures.some(f => f.dependsOn?.from === 'semifinal');
                                                    const needsQuarters = blockedPlayoffFixtures.some(f => f.dependsOn?.from === 'quarterfinal');
                                                    const needsOttavi = blockedPlayoffFixtures.some(f => f.dependsOn?.from === 'round_of_16');
                                                    const needsTrentaduesimi = blockedPlayoffFixtures.some(f => f.dependsOn?.from === 'round_of_32');
                                                    if (needsTrentaduesimi) return "Il turno successivo non e' ancora determinato: completa prima i trentaduesimi.";
                                                    if (needsOttavi) return "Il turno successivo non e' ancora determinato: completa prima gli ottavi.";
                                                    if (needsQuarters) return "La fase finale e' attiva, ma le semifinali non sono ancora determinate: completa prima i quarti.";
                                                    if (needsSemis) return "La fase finale e' attiva, ma le finali non sono ancora determinate: completa prima le semifinali.";
                                                    return "La fase finale e' attiva, ma le partite non sono ancora disponibili. Prova a ricaricare.";
                                                })()}
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={refreshFixtures}
                                                disabled={isRefreshingFixtures || loading}
                                                className="!bg-orange-500 hover:!bg-orange-600 !border-orange-700/50 dark:!border-orange-300/35 !text-white !px-3 !py-1.5 !text-xs disabled:!border-gray-400/40 disabled:!bg-gray-400"
                                            >
                                                {isRefreshingFixtures ? 'Ricarico...' : 'Ricarica'}
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                            {isPlayoffCreateFlow ? (
                                <div className="mt-1 grid grid-cols-[1fr_auto_1fr] gap-2 items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-3">
                                    <div className="text-center sm:text-left font-semibold text-gray-900 dark:text-white">
                                        {team1Number ? (teams.find(t => t.teamNumber === team1Number)?.name || `Squadra ${team1Number}`) : 'Squadra da definire'}
                                    </div>
                                    <div className="text-center font-semibold text-gray-600 dark:text-gray-300">vs</div>
                                    <div className="text-center sm:text-right font-semibold text-gray-900 dark:text-white">
                                        {team2Number ? (teams.find(t => t.teamNumber === team2Number)?.name || `Squadra ${team2Number}`) : 'Squadra da definire'}
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-1 grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                                    <select
                                        value={team1Number ?? ''}
                                        onChange={e => setTeam1Number(e.target.value ? Number(e.target.value) : null)}
                                        className="block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                        disabled={isSavingCalendar || loading || !!fixture}
                                    >
                                        <option value="">Seleziona squadra</option>
                                        {teamOptions.map(o => (
                                            <option key={o.value} value={o.value} disabled={team2Number === o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="text-center font-semibold text-gray-600 dark:text-gray-300">vs</div>
                                    <select
                                        value={team2Number ?? ''}
                                        onChange={e => setTeam2Number(e.target.value ? Number(e.target.value) : null)}
                                        className="block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                        disabled={isSavingCalendar || loading || !!fixture}
                                    >
                                        <option value="">Seleziona squadra</option>
                                        {team2Options.map(o => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {team1Number && team2Number && (
                                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                    {fixture
                                        ? `${fixturePhaseLabel(fixture.phase, fixture.slot)}`
                                        : (roundInfo ? `Questa sfida appartiene alla Giornata ${roundInfo.dayNumber} di ${roundInfo.totalDays}` : 'Impossibile determinare la giornata per questa sfida.')}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3 pt-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Partite in programma ({matchesPerDay})</h3>
                        {team1Number && team2Number && !selectedTeamsComplete && (
                            <div className="rounded-lg bg-orange-50 dark:bg-orange-900 border border-orange-300/55 dark:border-orange-300/18 p-3 text-sm text-orange-800 dark:text-orange-200">
                                Prima di inserire una giornata devi completare le rose delle squadre (tutti i giocatori previsti).
                            </div>
                        )}
                        {subMatchSelections.map((sm, idx) => {
                            const roster1 = getRoster(team1Number);
                            const roster2 = getRoster(team2Number);
                            const used1 = usedPlayersForTeam(team1Number);
                            const used2 = usedPlayersForTeam(team2Number);
                            const localUsed1 = new Set(sm.team1.filter(Boolean));
                            const localUsed2 = new Set(sm.team2.filter(Boolean));
                            return (
                                <div key={idx} className="rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                                    <div className="text-sm font-semibold text-gray-600 dark:text-gray-300 text-center">Partita {idx + 1} di {matchesPerDay}</div>
                                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-center">
                                        <div className="grid grid-cols-2 gap-2">
                                            {[0, 1].map(slot => (
                                                <select
                                                    key={slot}
                                                    value={sm.team1[slot]}
                                                    onChange={e => {
                                                        const v = e.target.value;
                                                        setSubMatchSelections(prev => prev.map((p, i) => {
                                                            if (i !== idx) return p;
                                                            const next: any = { ...p, team1: [...p.team1] };
                                                            next.team1[slot] = v;
                                                            return next;
                                                        }));
                                                    }}
                                                    className="block w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                                    disabled={!team1Number || isSavingCalendar || loading || !selectedTeamsComplete}
                                                >
                                                    <option value="">Giocatore</option>
                                                    {roster1.map(p => {
                                                        const value = String(p.idx);
                                                        const disabled = (used1.has(value) && !localUsed1.has(value)) || (localUsed1.has(value) && sm.team1[slot] !== value);
                                                        return (
                                                            <option key={value} value={value} disabled={disabled}>
                                                                {p.label}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                            ))}
                                        </div>
                                        <div className="text-center font-semibold text-gray-600 dark:text-gray-300">vs</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[0, 1].map(slot => (
                                                <select
                                                    key={slot}
                                                    value={sm.team2[slot]}
                                                    onChange={e => {
                                                        const v = e.target.value;
                                                        setSubMatchSelections(prev => prev.map((p, i) => {
                                                            if (i !== idx) return p;
                                                            const next: any = { ...p, team2: [...p.team2] };
                                                            next.team2[slot] = v;
                                                            return next;
                                                        }));
                                                    }}
                                                    className="block w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                                    disabled={!team2Number || isSavingCalendar || loading || !selectedTeamsComplete}
                                                >
                                                    <option value="">Giocatore</option>
                                                    {roster2.map(p => {
                                                        const value = String(p.idx);
                                                        const disabled = (used2.has(value) && !localUsed2.has(value)) || (localUsed2.has(value) && sm.team2[slot] !== value);
                                                        return (
                                                            <option key={value} value={value} disabled={disabled}>
                                                                {p.label}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

                    <div className="grid grid-cols-[auto_1fr_1fr] gap-2 pt-2 items-stretch">
                        <Button
                            variant="secondary"
                            type="button"
                            onClick={() => {
                                clearNavigationState();
                                setActivePage('Tournaments');
                            }}
                            disabled={isSavingCalendar || loading}
                            className="shrink-0 px-3"
                        >
                            <span className="sm:hidden" aria-hidden="true">
                                <ArrowLeftIcon className="h-4 w-4" />
                            </span>
                            <span className="hidden sm:inline">Torna a tornei</span>
                        </Button>
                        <div className="contents">
                            <Button
                                type="button"
                                onClick={() => handleSaveCalendar(false)}
                                disabled={!canSaveCalendar || isSavingCalendar || loading}
                                className="w-full min-w-0"
                            >
                                {isSavingCalendar ? 'Salvataggio...' : 'Salva calendario'}
                            </Button>
                            <Button
                                type="button"
                                onClick={() => handleSaveCalendar(true)}
                                disabled={!canSaveCalendar || isSavingCalendar || loading}
                                className="w-full min-w-0 !border-orange-600 !bg-orange-500 hover:!bg-orange-600 !text-white dark:!border-orange-300"
                            >
                                Inserisci risultati
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>
            )}
        </div>
    );

    const renderResults = () => {
        if (!matchday) {
            return (
            <div>
                <Card title="Inserisci risultati">
                    <p className="text-gray-500 dark:text-gray-400">Caricamento giornata...</p>
                </Card>
            </div>
            );
        }

        const team1 = teams.find(t => t.teamNumber === matchday.team1Number);
        const team2 = teams.find(t => t.teamNumber === matchday.team2Number);
        const t1Complete = teamCompletion.get(matchday.team1Number)?.complete ?? false;
        const t2Complete = teamCompletion.get(matchday.team2Number)?.complete ?? false;
        const resultsLocked = !(t1Complete && t2Complete);
        const live = computeLiveWins();
        const activeFixture = fixtures.find(f => f.tournamentDayId === matchday.tournamentDayId) || null;

        return (
            <div className="max-w-4xl mx-auto mb-8">
                <Card title="Inserisci risultati">
                    <div className="flex flex-col">
                        <div className="relative p-4 border-b border-[var(--ios-separator)]">
                            <div className="text-center">
                                <div className="text-sm text-gray-500 dark:text-white">
                                    {new Date(matchday.date).toLocaleDateString('it-IT')}
                                </div>
                                <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white flex items-center flex-wrap gap-2">
                                    <span>{(team1?.name || `Squadra ${matchday.team1Number}`)}</span>
                                    <span className="font-normal text-gray-500 dark:text-gray-400 text-base">vs</span>
                                    <span>{(team2?.name || `Squadra ${matchday.team2Number}`)}</span>
                                    {savedSummary && (
                                        <span className="ml-2 bg-ios-blue/10 dark:bg-ios-blue/20 text-ios-blue px-2.5 py-1 rounded-md text-lg font-bold shadow-sm">
                                            {savedSummary.team1Points ?? savedSummary.team1Wins} - {savedSummary.team2Points ?? savedSummary.team2Wins}
                                        </span>
                                    )}
                                </div>
                                {matchday.phase && matchday.phase !== 'round_robin' ? (
                                    <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{fixturePhaseLabel(matchday.phase, activeFixture?.slot || 1)}</div>
                                ) : matchday.roundNumber ? (
                                    <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">Giornata {matchday.roundNumber}{roundInfo?.totalDays ? ` di ${roundInfo.totalDays}` : ''}</div>
                                ) : null}
                                {savedSummary && config?.scoringType === 'Differenza Games' && (
                                    <div className="mt-2 text-sm text-sky-800 dark:text-sky-200 font-medium">
                                        Differenza games: {(Number(savedSummary.gamesDiff) >= 0 ? '+' : '')}{Number(savedSummary.gamesDiff)}
                                    </div>
                                )}
                            </div>
                        </div>

                        {resultsLocked && (
                            <div className="bg-orange-50 dark:bg-orange-900/30 p-4 border-b border-[var(--ios-separator)]">
                                <div className="text-sm text-orange-800 dark:text-orange-200 font-semibold text-center">
                                    Prima di inserire risultati devi completare entrambe le squadre con tutti i giocatori previsti.
                                </div>
                            </div>
                        )}

                        <div className="divide-y divide-[var(--ios-separator)]">
                            {matchday.subMatches.map((sm, idx) => {
                                const isCancelled = cancelledByIndex[sm.matchIndex];
                                const editSel = editSubMatchSelections[idx] || { team1: ['', ''], team2: ['', ''] };
                                
                                if (isCancelled) {
                                    return (
                                        <div key={sm.matchIndex} className="p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                                Partita {sm.matchIndex} cancellata
                                            </span>
                                            <Button
                                                type="button"
                                                onClick={() => {
                                                    setCancelledByIndex(prev => ({ ...prev, [sm.matchIndex]: false }));
                                                    setEditSubMatchSelections(prev => prev.map((p, i) => i === idx ? { team1: ['', ''], team2: ['', ''] } : p));
                                                }}
                                                disabled={isSavingResults || loading || resultsLocked}
                                                className="!bg-orange-500 hover:!bg-orange-600 !border-orange-600 !text-white text-xs py-1.5"
                                            >
                                                + Aggiungi Nuova Partita
                                            </Button>
                                        </div>
                                    );
                                }

                                const roster1 = getRoster(matchday.team1Number);
                                const roster2 = getRoster(matchday.team2Number);
                                const used1 = usedPlayersForTeam(matchday.team1Number);
                                const used2 = usedPlayersForTeam(matchday.team2Number);
                                
                                const localUsed1 = new Set(editSel.team1.filter(Boolean));
                                const localUsed2 = new Set(editSel.team2.filter(Boolean));

                                return (
                                <div key={sm.matchIndex} className="py-4 px-2 space-y-3">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 text-center uppercase tracking-wider font-semibold">
                                        Partita {sm.matchIndex} di {matchday.matchesPerDay}
                                    </div>
                                    <div className="relative grid grid-cols-1 sm:grid-cols-3 items-center gap-4">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (await requestHIGConfirmation('Sei sicuro di voler cancellare questa partita?', {
                                                    title: 'Annulla partita', confirmLabel: 'Annulla partita', destructive: true,
                                                })) {
                                                    setCancelledByIndex(prev => ({ ...prev, [sm.matchIndex]: true }));
                                                    setSubMatchSets(prev => ({ ...prev, [sm.matchIndex]: [{ team1: 0, team2: 0 }] }));
                                                }
                                            }}
                                            disabled={isSavingResults || loading || resultsLocked}
                                            className={`absolute -top-1 -right-1 h-6 w-6 rounded-full text-xs font-bold border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700`}
                                            title="Annulla partita"
                                            aria-label="Annulla partita"
                                        >
                                            X
                                        </button>
                                        
                                        <div className="text-center sm:text-right">
                                            <div className="grid grid-cols-1 gap-1">
                                                {[0, 1].map(slot => (
                                                    <select
                                                        key={slot}
                                                        value={editSel.team1[slot]}
                                                        onChange={e => {
                                                            const v = e.target.value;
                                                            setEditSubMatchSelections(prev => prev.map((p, i) => {
                                                                if (i !== idx) return p;
                                                                const next: any = { ...p, team1: [...p.team1] };
                                                                next.team1[slot] = v;
                                                                return next;
                                                            }));
                                                        }}
                                                        className="block w-full sm:max-w-[150px] sm:ml-auto bg-ios-fill dark:bg-gray-700 border-none rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-ios-blue text-sm"
                                                        disabled={isSavingResults || loading || resultsLocked}
                                                    >
                                                        <option value="">Giocatore</option>
                                                        {roster1.map(p => {
                                                            const value = String(p.idx);
                                                            const disabled = (used1.has(value) && !localUsed1.has(value)) || (localUsed1.has(value) && editSel.team1[slot] !== value);
                                                            return (
                                                                <option key={value} value={value} disabled={disabled}>
                                                                    {p.label}
                                                                </option>
                                                            );
                                                        })}
                                                    </select>
                                                ))}
                                            </div>
                                        </div>
                                    <div className="text-center">
                                        <MatchScoreInput
                                            sets={subMatchSets[sm.matchIndex] || [{ team1: 0, team2: 0 }]}
                                            onSetsChange={(sets) => setSubMatchSets(prev => ({ ...prev, [sm.matchIndex]: sets }))}
                                            disabled={isSavingResults || loading || resultsLocked}
                                        />
                                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 font-medium">vs</div>
                                    </div>
                                        <div className="text-center sm:text-left">
                                            <div className="grid grid-cols-1 gap-1">
                                                {[0, 1].map(slot => (
                                                    <select
                                                        key={slot}
                                                        value={editSel.team2[slot]}
                                                        onChange={e => {
                                                            const v = e.target.value;
                                                            setEditSubMatchSelections(prev => prev.map((p, i) => {
                                                                if (i !== idx) return p;
                                                                const next: any = { ...p, team2: [...p.team2] };
                                                                next.team2[slot] = v;
                                                                return next;
                                                            }));
                                                        }}
                                                        className="block w-full sm:max-w-[150px] sm:mr-auto bg-ios-fill dark:bg-gray-700 border-none rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-ios-blue text-sm"
                                                        disabled={isSavingResults || loading || resultsLocked}
                                                    >
                                                        <option value="">Giocatore</option>
                                                        {roster2.map(p => {
                                                            const value = String(p.idx);
                                                            const disabled = (used2.has(value) && !localUsed2.has(value)) || (localUsed2.has(value) && editSel.team2[slot] !== value);
                                                            return (
                                                                <option key={value} value={value} disabled={disabled}>
                                                                    {p.label}
                                                                </option>
                                                            );
                                                        })}
                                                    </select>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                            })}
                        </div>

                        {error && <p className="text-sm text-red-500 dark:text-red-400 p-4">{error}</p>}

                        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-stretch sm:justify-between border-t border-[var(--ios-separator)]">
                            <Button
                                variant="secondary"
                                type="button"
                                onClick={() => {
                                    clearNavigationState();
                                    setActivePage('Tournaments');
                                }}
                                disabled={isSavingResults || loading}
                                className="shrink-0 px-3 sm:self-auto self-start"
                            >
                                <span className="sm:hidden" aria-hidden="true">
                                    <ArrowLeftIcon className="h-4 w-4" />
                                </span>
                                <span className="hidden sm:inline">Torna a tornei</span>
                            </Button>
                            <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => {
                                        const preOpenedWindow = window.open('', '_blank');
                                        (async () => {
                                            const tournamentInfo = rootTournament || matchday.tournament || { name: 'Torneo a squadre', club: '', type: TournamentType.TorneoASquadre };
                                            const rootId = matchday.rootTournamentId;
                                            const [cfg, allMatchdays, freshMatchday] = await Promise.all([
                                                getTeamTournamentConfig(rootId),
                                                getTeamTournamentMatchdays(rootId),
                                                // Ensure print always uses the latest saved results (sets/summary)
                                                getTeamTournamentMatchdayByTournamentDayId(matchday.tournamentDayId),
                                            ]);
                                            const allFixtures = await getTeamTournamentFixtures(rootId);
                                            printTeamTournamentMatchdayReport(
                                                { name: tournamentInfo.name, club: tournamentInfo.club, type: TournamentType.TorneoASquadre },
                                                cfg as TeamTournamentConfig,
                                                teams,
                                                allMatchdays,
                                                freshMatchday,
                                                allFixtures,
                                                preOpenedWindow
                                            );
                                        })().catch(() => {
                                            preOpenedWindow?.close();
                                        });
                                    }}
                                    disabled={isSavingResults || loading}
                                    className="w-full min-w-0 px-3"
                                >
                                    Stampa
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => handleSaveResults(false)}
                                    disabled={isSavingResults || loading || resultsLocked}
                                    aria-label={isSavingResults ? 'Salvataggio in corso' : 'Salva'}
                                    className="w-full min-w-0 px-3"
                                >
                                    Salva
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => handleSaveResults(true)}
                                    disabled={isSavingResults || loading || resultsLocked}
                                    className="w-full min-w-0 !border-emerald-700/50 !bg-emerald-600 px-3 hover:!bg-emerald-700 !text-white dark:!border-emerald-300/35"
                                >
                                    Chiudi giornata
                                </Button>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        );
    };

    if (!resolvedRootId && !tournamentDayId) {
        return (
            <div>
                <Card title="Torneo a squadre">
                    <p className="text-gray-500 dark:text-gray-400">Nessun torneo selezionato.</p>
                    <div className="pt-4">
                        <Button onClick={() => { clearNavigationState(); setActivePage('Tournaments'); }} variant="secondary">Torna a Tornei</Button>
                    </div>
                </Card>
            </div>
        );
    }

    if (loading && mode === 'create' && teams.length === 0) {
        return (
            <div>
                <Card title="Caricamento...">
                    <p className="text-gray-500 dark:text-gray-400">Sto caricando configurazione e squadre.</p>
                </Card>
            </div>
        );
    }

    // Guard: only configured team tournaments
    if (rootTournament && rootTournament.type === TournamentType.TorneoASquadre && rootTournament.teamTournamentConfigCompleted === false) {
        return (
            <div>
                <Card title="Torneo a squadre">
                    <p className="text-gray-500 dark:text-gray-400">Completa prima la configurazione del torneo a squadre.</p>
                    <div className="pt-4">
                        <Button onClick={() => { clearNavigationState(); setActivePage('Tournaments'); }} variant="secondary">Torna a Tornei</Button>
                    </div>
                </Card>
            </div>
        );
    }

    return mode === 'create' ? renderCreate() : renderResults();
};

export default TeamTournamentMatchdayPage;
