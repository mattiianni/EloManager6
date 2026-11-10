import React, { useState, useMemo } from 'react';
import { Player, TournamentType, Match, Tournament } from '../types.ts';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import Card from './ui/Card.tsx';
import Button from './ui/Button.tsx';
import MatchScoreInput from './ui/MatchScoreInput.tsx';
import { PrintIcon } from './ui/Icons.tsx';
import { SFIcon } from './ui/SFIcon.tsx';
import { showHIGAlert } from '../utils/higDialogService.ts';
import { formatPlayerShortName } from '../utils/format.ts';
import {
    calculateMexicanStandings,
    generateFirstRoundMexicanMatches,
    generateNextMexicanRoundMatches,
    printMexicanTournamentReport,
    MexicanDrawMode
} from '../formats/messicano';

interface MexicanTournamentFlowProps {
    players: Player[];
    onFinish: () => void;
    tournamentDate: string;
    clubName: string;
    tournamentName: string;
    giornataName?: string;
    fieldsCount: number;
    roundsCount: number;
    scoringType: 'games-diff' | 'points';
    drawMode: MexicanDrawMode;
}

export const MexicanTournamentFlow: React.FC<MexicanTournamentFlowProps> = ({
    players,
    onFinish,
    tournamentDate,
    clubName,
    tournamentName,
    giornataName,
    fieldsCount,
    roundsCount,
    scoringType,
    drawMode,
}) => {
    const { addMultipleMatches, getPlayerById } = usePadelStore();

    // Deduplica e valida i giocatori
    const uniquePlayers = useMemo(() => {
        const map = new Map<string, Player>();
        players.forEach(p => {
            if (p && p.id && !map.has(p.id)) {
                map.set(p.id, p);
            }
        });
        return Array.from(map.values());
    }, [players]);

    const totalRounds = Math.max(2, Math.min(roundsCount, uniquePlayers.length - 1));
    const effectiveFields = Math.max(2, Math.min(fieldsCount, Math.floor(uniquePlayers.length / 4)));

    // Inizializza i match del Round 1
    const [allMatches, setAllMatches] = useState<Match[]>(() => {
        return generateFirstRoundMexicanMatches(uniquePlayers, drawMode, tournamentDate);
    });

    const [currentRound, setCurrentRound] = useState<number>(1);
    const [selectedTabRound, setSelectedTabRound] = useState<number>(1);
    const [step, setStep] = useState<'rounds' | 'results'>('rounds');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [isSavingCalendar, setIsSavingCalendar] = useState<boolean>(false);
    const [savedTournamentId, setSavedTournamentId] = useState<string | null>(null);

    // Partite raggruppate per turno
    const matchesByRound = useMemo(() => {
        const map = new Map<number, Match[]>();
        for (let r = 1; r <= totalRounds; r++) {
            map.set(r, []);
        }
        allMatches.forEach(m => {
            const r = m.roundNumber || 1;
            if (!map.has(r)) map.set(r, []);
            map.get(r)!.push(m);
        });
        return map;
    }, [allMatches, totalRounds]);

    // Classifica calcolata in tempo reale su tutti i match che hanno punteggio
    const liveStandings = useMemo(() => {
        return calculateMexicanStandings(allMatches, uniquePlayers, scoringType);
    }, [allMatches, uniquePlayers, scoringType]);

    // Verifica se tutte le partite del turno corrente sono state giocate
    const currentRoundMatches = matchesByRound.get(currentRound) || [];
    const isCurrentRoundComplete = currentRoundMatches.length > 0 && currentRoundMatches.every(m => {
        const hasScore = m.sets && m.sets.length > 0 && m.sets.some(s => (s.team1 || 0) > 0 || (s.team2 || 0) > 0);
        return hasScore || m.winner !== null;
    });

    // Aggiornamento punteggio per una partita
    const handleScoreChange = (matchId: string, sets: { team1: number; team2: number }[]) => {
        setAllMatches(prev => prev.map(m => {
            if (m.id !== matchId) return m;

            const team1Games = sets.reduce((sum, s) => sum + (s.team1 || 0), 0);
            const team2Games = sets.reduce((sum, s) => sum + (s.team2 || 0), 0);
            const hasScore = sets.some(s => (s.team1 || 0) > 0 || (s.team2 || 0) > 0);

            let winner: 'team1' | 'team2' | 'draw' | null = null;
            if (hasScore) {
                if (team1Games > team2Games) winner = 'team1';
                else if (team2Games > team1Games) winner = 'team2';
                else winner = 'draw';
            }

            return {
                ...m,
                sets,
                winner
            };
        }));
    };

    // Avanzamento al turno successivo JIT
    const handleAdvanceRound = () => {
        if (!isCurrentRoundComplete) {
            showHIGAlert(`Completa tutte le partite del Turno ${currentRound} prima di generare il Turno ${currentRound + 1}.`);
            return;
        }

        const nextRoundNumber = currentRound + 1;
        if (nextRoundNumber > totalRounds) {
            showHIGAlert('Tutti i turni sono stati completati!');
            return;
        }

        // Se il turno successivo non è ancora stato generato, crealo JIT
        const existingNextRound = matchesByRound.get(nextRoundNumber) || [];
        if (existingNextRound.length === 0) {
            const nextRoundMatches = generateNextMexicanRoundMatches(
                allMatches,
                uniquePlayers,
                nextRoundNumber,
                tournamentDate,
                scoringType
            );
            setAllMatches(prev => [...prev, ...nextRoundMatches]);
        }

        setCurrentRound(nextRoundNumber);
        setSelectedTabRound(nextRoundNumber);
    };

    // Salvataggio Torneo in Corso (status: 'scheduled')
    const handleSaveScheduled = async () => {
        if (isSavingCalendar) return;
        setIsSavingCalendar(true);

        try {
            const tournamentData: Omit<Tournament, 'id'> = {
                name: tournamentName,
                type: TournamentType.Mexican,
                date: new Date(tournamentDate).toISOString(),
                club: clubName,
                matchIds: [],
                status: 'scheduled',
                giornataName: giornataName || undefined,
                mexicanFields: effectiveFields,
                mexicanRounds: totalRounds,
                mexicanScoringType: scoringType,
                playerMode: 'singles',
                numCampi: effectiveFields
            };

            const matchesToSave = allMatches.map(m => ({
                date: new Date(tournamentDate).toISOString(),
                team1: m.team1,
                team2: m.team2,
                sets: m.sets || [{ team1: 0, team2: 0 }],
                winner: m.winner,
                phase: m.phase || 'group',
                courtNumber: m.courtNumber,
                roundNumber: m.roundNumber
            }));

            await addMultipleMatches(matchesToSave, tournamentData);
            showHIGAlert('Torneo salvato come "In Programma". Potrai riprenderlo in qualsiasi momento.');
        } catch (e: any) {
            console.error('Errore durante il salvataggio in programma:', e);
            showHIGAlert('Errore durante il salvataggio del torneo.');
        } finally {
            setIsSavingCalendar(false);
        }
    };

    // Completamento Torneo (status: 'completed')
    const handleCompleteTournament = async () => {
        if (!isCurrentRoundComplete || currentRound < totalRounds) {
            showHIGAlert('Inserisci i risultati di tutte le partite dell\'ultimo turno prima di completare il torneo.');
            return;
        }

        if (isSubmitting) return;
        setIsSubmitting(true);

        try {
            const tournamentData: Omit<Tournament, 'id'> = {
                name: tournamentName,
                type: TournamentType.Mexican,
                date: new Date(tournamentDate).toISOString(),
                club: clubName,
                matchIds: [],
                status: 'completed',
                giornataName: giornataName || undefined,
                mexicanFields: effectiveFields,
                mexicanRounds: totalRounds,
                mexicanScoringType: scoringType,
                playerMode: 'singles',
                numCampi: effectiveFields
            };

            const finalMatchesList: Omit<Match, 'id'>[] = allMatches.map(m => ({
                date: new Date(tournamentDate).toISOString(),
                team1: m.team1,
                team2: m.team2,
                sets: m.sets || [{ team1: 0, team2: 0 }],
                winner: m.winner,
                phase: m.phase || 'group',
                courtNumber: m.courtNumber,
                roundNumber: m.roundNumber
            }));

            await addMultipleMatches(finalMatchesList, tournamentData);
            setStep('results');
        } catch (e: any) {
            console.error('Errore completamento torneo messicano:', e);
            showHIGAlert('Errore durante il salvataggio finale del torneo.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePrintBlank = () => {
        const dummyTourn: Tournament = {
            id: savedTournamentId || 'temp-mexican',
            name: tournamentName,
            type: TournamentType.Mexican,
            date: tournamentDate,
            club: clubName,
            matchIds: [],
            status: 'scheduled',
            mexicanFields: effectiveFields,
            mexicanRounds: totalRounds,
            mexicanScoringType: scoringType,
        };
        printMexicanTournamentReport(dummyTourn, allMatches, getPlayerById, tournamentName, true);
    };

    const handlePrintComplete = () => {
        const dummyTourn: Tournament = {
            id: savedTournamentId || 'temp-mexican',
            name: tournamentName,
            type: TournamentType.Mexican,
            date: tournamentDate,
            club: clubName,
            matchIds: [],
            status: 'completed',
            mexicanFields: effectiveFields,
            mexicanRounds: totalRounds,
            mexicanScoringType: scoringType,
        };
        printMexicanTournamentReport(dummyTourn, allMatches, getPlayerById, tournamentName, false);
    };

    // -------------------------------------------------------------
    // RENDERING STEP: RESULTS
    // -------------------------------------------------------------
    if (step === 'results') {
        const top3 = liveStandings.slice(0, 3);

        return (
            <div className="mx-auto max-w-3xl space-y-6">
                <Card title={
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <SFIcon name="trophy.fill" size={20} className="text-amber-500" />
                            <span>Podio Torneo Messicano</span>
                        </span>
                        <Button onClick={handlePrintComplete} variant="ghost" size="sm">
                            <span className="flex items-center gap-1"><PrintIcon /> Stampa Classifica</span>
                        </Button>
                    </div>
                }>
                    <div className="space-y-6 px-2">
                        {/* Podio visuale */}
                        <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end pt-4 pb-2">
                            {/* 2° Posto */}
                            <div className="flex flex-col items-center">
                                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center font-black text-slate-600 dark:text-slate-300 shadow-sm text-lg sm:text-xl">
                                    2°
                                </div>
                                <div className="mt-2 text-center">
                                    <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white break-words [overflow-wrap:anywhere]">
                                        {top3[1] ? formatPlayerShortName(top3[1].player) : '—'}
                                    </p>
                                    <p className="text-[10px] sm:text-xs text-slate-500">
                                        {top3[1] ? `${top3[1].points} pt` : ''}
                                    </p>
                                </div>
                            </div>

                            {/* 1° Posto (Top) */}
                            <div className="flex flex-col items-center -mt-4">
                                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-600 flex items-center justify-center font-black text-amber-600 dark:text-amber-400 shadow-lg text-2xl sm:text-3xl">
                                    1°
                                </div>
                                <div className="mt-2 text-center">
                                    <p className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white break-words [overflow-wrap:anywhere] max-w-[120px] sm:max-w-[160px]">
                                        {top3[0] ? formatPlayerShortName(top3[0].player) : '—'}
                                    </p>
                                    <p className="text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400">
                                        {top3[0] ? `${top3[0].points} pt` : ''}
                                    </p>
                                </div>
                            </div>

                            {/* 3° Posto */}
                            <div className="flex flex-col items-center">
                                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/40 border-2 border-orange-300 dark:border-orange-700 flex items-center justify-center font-black text-orange-600 dark:text-orange-400 shadow-sm text-lg sm:text-xl">
                                    3°
                                </div>
                                <div className="mt-2 text-center">
                                    <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white break-words [overflow-wrap:anywhere]">
                                        {top3[2] ? formatPlayerShortName(top3[2].player) : '—'}
                                    </p>
                                    <p className="text-[10px] sm:text-xs text-slate-500">
                                        {top3[2] ? `${top3[2].points} pt` : ''}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Classifica Completa */}
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                            <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10 text-xs sm:text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-800/60">
                                    <tr>
                                        <th className="px-3 py-2 text-center font-bold text-slate-500 dark:text-slate-400">Pos</th>
                                        <th className="px-3 py-2 text-left font-bold text-slate-500 dark:text-slate-400">Giocatore</th>
                                        <th className="px-3 py-2 text-center font-bold text-sky-600 dark:text-sky-400">Punti</th>
                                        <th className="px-3 py-2 text-center font-bold text-slate-500 dark:text-slate-400">GV</th>
                                        <th className="px-3 py-2 text-center font-bold text-slate-500 dark:text-slate-400">GS</th>
                                        <th className="px-3 py-2 text-center font-bold text-slate-500 dark:text-slate-400">Diff</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-slate-900">
                                    {liveStandings.map(st => (
                                        <tr key={st.player.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                            <td className="px-3 py-2 text-center font-extrabold text-slate-700 dark:text-slate-300">
                                                {st.rank === 1 ? (
                                                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-300 dark:border-amber-700">1°</span>
                                                ) : st.rank === 2 ? (
                                                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-black bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-600">2°</span>
                                                ) : st.rank === 3 ? (
                                                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-black bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300 border border-orange-300 dark:border-orange-700">3°</span>
                                                ) : (
                                                    <span>{st.rank}°</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">
                                                {st.player.name} {st.player.surname}
                                            </td>
                                            <td className="px-3 py-2 text-center font-black text-sky-600 dark:text-sky-400">
                                                {st.points}
                                            </td>
                                            <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-300">{st.gamesWon}</td>
                                            <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-300">{st.gamesLost}</td>
                                            <td className="px-3 py-2 text-center font-bold text-slate-700 dark:text-slate-300">
                                                {st.gameDifference >= 0 ? `+${st.gameDifference}` : st.gameDifference}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Bottoni di chiusura */}
                        <div className="pt-2 flex flex-col sm:flex-row gap-3">
                            <Button onClick={onFinish} className="w-full font-bold !bg-[#0055D4] text-white">
                                Chiudi e Torna ai Tornei
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>
        );
    }

    // -------------------------------------------------------------
    // RENDERING STEP: ROUNDS IN CORSO
    // -------------------------------------------------------------
    const activeTabMatches = matchesByRound.get(selectedTabRound) || [];
    const isFutureTab = selectedTabRound > currentRound;

    return (
        <div className="mx-auto max-w-3xl space-y-5">
            <Card title={
                <div className="flex items-center justify-between">
                    <div>
                        <span className="font-bold">Torneo Messicano (JIT)</span>
                        <div className="text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                            Turno in corso: {currentRound} di {totalRounds} • {effectiveFields} Campi
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Button onClick={handlePrintBlank} variant="ghost" size="sm">
                            <span className="flex items-center gap-1"><PrintIcon /> Stampa Vuoto</span>
                        </Button>
                        <Button onClick={handlePrintComplete} variant="ghost" size="sm">
                            <span className="flex items-center gap-1"><PrintIcon /> Stampa</span>
                        </Button>
                    </div>
                </div>
            }>
                <div className="space-y-6">
                    {/* Badge informativo sul calcolo dinamico */}
                    <div className="p-3 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 rounded-xl flex items-start gap-2.5">
                        <SFIcon name="info.circle.fill" size={18} className="text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-sky-900 dark:text-sky-200 leading-relaxed">
                            <strong>Formula Messicano (JIT):</strong> Al termine di ogni turno, i giocatori vengono ordinati per classifica provvisoria (Punti &gt; ELO) e raggruppati sui campi. <em>Chi vince sale verso i campi Top (Campo 1), chi perde scende.</em>
                        </div>
                    </div>

                    {/* Round Tabs */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {Array.from({ length: totalRounds }, (_, i) => i + 1).map(rNum => {
                            const isCurrent = rNum === currentRound;
                            const isPast = rNum < currentRound;
                            const isSelected = rNum === selectedTabRound;

                            return (
                                <button
                                    key={rNum}
                                    type="button"
                                    onClick={() => setSelectedTabRound(rNum)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                                        isSelected
                                            ? 'bg-[#0055D4] text-white shadow-sm'
                                            : isPast
                                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                                            : isCurrent
                                            ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-700'
                                            : 'bg-slate-50 dark:bg-white/5 text-slate-400 dark:text-slate-500'
                                    }`}
                                >
                                    <span>Turno {rNum}</span>
                                    {isPast && <SFIcon name="checkmark" size={11} className="text-emerald-500" />}
                                    {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />}
                                </button>
                            );
                        })}
                    </div>

                    {/* Partite del Turno Selezionato */}
                    <div className="space-y-4">
                        {isFutureTab ? (
                            // Placeholder per i turni futuri
                            <div className="space-y-3">
                                <div className="text-center py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    Turno {selectedTabRound} non ancora generato. I campi verranno calcolati JIT al completamento del Turno {currentRound}.
                                </div>
                                {Array.from({ length: effectiveFields }, (_, cIdx) => {
                                    const cNum = cIdx + 1;
                                    const topP1 = (cNum - 1) * 4 + 1;
                                    const topP2 = (cNum - 1) * 4 + 2;
                                    const topP3 = (cNum - 1) * 4 + 3;
                                    const topP4 = (cNum - 1) * 4 + 4;

                                    return (
                                        <div key={cNum} className="p-3.5 bg-slate-50/80 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                                            <div className="text-center pb-2 border-b border-slate-200 dark:border-slate-700/60 mb-2.5">
                                                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                                                    Campo {cNum} {cNum === 1 ? '• Top Court' : cNum === effectiveFields ? '• Flop Court' : '• Mid Court'}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center text-xs text-slate-500">
                                                <div className="space-y-1">
                                                    <div className="font-semibold text-slate-700 dark:text-slate-300">[{topP1}° Classificato]</div>
                                                    <div className="font-semibold text-slate-700 dark:text-slate-300">[{topP4}° Classificato]</div>
                                                </div>
                                                <div className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-black text-slate-500">
                                                    VS
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="font-semibold text-slate-700 dark:text-slate-300">[{topP2}° Classificato]</div>
                                                    <div className="font-semibold text-slate-700 dark:text-slate-300">[{topP3}° Classificato]</div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            // Partite reali
                            activeTabMatches.map(match => {
                                const t1p1 = getPlayerById(match.team1[0]);
                                const t1p2 = getPlayerById(match.team1[1]);
                                const t2p1 = getPlayerById(match.team2[0]);
                                const t2p2 = getPlayerById(match.team2[1]);

                                const isTeam1Winner = match.winner === 'team1';
                                const isTeam2Winner = match.winner === 'team2';
                                const cNum = match.courtNumber || 1;

                                return (
                                    <div
                                        key={match.id}
                                        className="bg-white dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-sm space-y-2.5"
                                    >
                                        {/* Header Campo */}
                                        <div className="text-center pb-1.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                Campo {cNum} {cNum === 1 ? '• Top' : cNum === effectiveFields ? '• Flop' : ''}
                                            </span>
                                            <span className="text-[10px] font-medium text-slate-400">
                                                Partita 1 set
                                            </span>
                                        </div>

                                        {/* Giocatori su 2 righe per mobile */}
                                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                            {/* Squadra A */}
                                            <div className={`min-w-0 text-left ${isTeam1Winner ? 'text-sky-600 dark:text-sky-400 font-bold' : 'text-slate-800 dark:text-slate-200'}`}>
                                                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                                                    Squadra A
                                                </div>
                                                <div className="text-xs sm:text-sm font-semibold break-words [overflow-wrap:anywhere] leading-snug">
                                                    {t1p1 ? formatPlayerShortName(t1p1) : 'TBD'}
                                                </div>
                                                <div className="text-xs sm:text-sm font-semibold break-words [overflow-wrap:anywhere] leading-snug">
                                                    {t1p2 ? formatPlayerShortName(t1p2) : 'TBD'}
                                                </div>
                                            </div>

                                            {/* VS Badge */}
                                            <div className="flex items-center justify-center shrink-0">
                                                <span className="text-[10px] font-black uppercase text-slate-400 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10">
                                                    VS
                                                </span>
                                            </div>

                                            {/* Squadra B */}
                                            <div className={`min-w-0 text-right ${isTeam2Winner ? 'text-sky-600 dark:text-sky-400 font-bold' : 'text-slate-800 dark:text-slate-200'}`}>
                                                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                                                    Squadra B
                                                </div>
                                                <div className="text-xs sm:text-sm font-semibold break-words [overflow-wrap:anywhere] leading-snug">
                                                    {t2p1 ? formatPlayerShortName(t2p1) : 'TBD'}
                                                </div>
                                                <div className="text-xs sm:text-sm font-semibold break-words [overflow-wrap:anywhere] leading-snug">
                                                    {t2p2 ? formatPlayerShortName(t2p2) : 'TBD'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Input Punteggio */}
                                        <div className="pt-2 flex justify-center border-t border-slate-100 dark:border-white/5">
                                            <MatchScoreInput
                                                sets={match.sets || [{ team1: 0, team2: 0 }]}
                                                onSetsChange={(sets) => handleScoreChange(match.id, sets)}
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Classifica Provvisoria in Tempo Reale */}
                    <div className="pt-4 border-t border-slate-100 dark:border-white/10">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                <SFIcon name="chart.bar.fill" size={14} className="text-[#0055D4]" />
                                <span>Classifica Provvisoria (aggiornata in tempo reale)</span>
                            </span>
                            <span className="text-[11px] text-slate-400">
                                {scoringType === 'points' ? 'Conteggio a Punti/Game' : 'Differenza Games'}
                            </span>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                            <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10 text-xs">
                                <thead className="bg-slate-50 dark:bg-slate-800/60">
                                    <tr>
                                        <th className="px-2.5 py-1.5 text-center font-bold text-slate-500">Pos</th>
                                        <th className="px-2.5 py-1.5 text-left font-bold text-slate-500">Giocatore</th>
                                        <th className="px-2.5 py-1.5 text-center font-bold text-sky-600">Punti</th>
                                        <th className="px-2.5 py-1.5 text-center font-bold text-slate-500">GV</th>
                                        <th className="px-2.5 py-1.5 text-center font-bold text-slate-500">GS</th>
                                        <th className="px-2.5 py-1.5 text-center font-bold text-slate-500">Diff</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-slate-900">
                                    {liveStandings.map(st => (
                                        <tr key={st.player.id}>
                                            <td className="px-2.5 py-1.5 text-center font-bold text-slate-700 dark:text-slate-300">
                                                {st.rank}°
                                            </td>
                                            <td className="px-2.5 py-1.5 font-semibold text-slate-900 dark:text-white break-words max-w-[150px]">
                                                {formatPlayerShortName(st.player)}
                                            </td>
                                            <td className="px-2.5 py-1.5 text-center font-black text-sky-600 dark:text-sky-400">
                                                {st.points}
                                            </td>
                                            <td className="px-2.5 py-1.5 text-center text-slate-600 dark:text-slate-300">{st.gamesWon}</td>
                                            <td className="px-2.5 py-1.5 text-center text-slate-600 dark:text-slate-300">{st.gamesLost}</td>
                                            <td className="px-2.5 py-1.5 text-center font-bold text-slate-700 dark:text-slate-300">
                                                {st.gameDifference >= 0 ? `+${st.gameDifference}` : st.gameDifference}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Bottoni Azione Inferiori */}
                    <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
                        <Button
                            onClick={handleSaveScheduled}
                            variant="success"
                            disabled={isSavingCalendar}
                            className="w-full sm:w-auto font-bold"
                        >
                            {isSavingCalendar ? 'Salvataggio...' : 'Salva Torneo in corso'}
                        </Button>

                        {currentRound < totalRounds ? (
                            <Button
                                onClick={handleAdvanceRound}
                                disabled={!isCurrentRoundComplete}
                                className="w-full sm:flex-1 font-bold !bg-[#0055D4] text-white"
                            >
                                <span className="flex items-center justify-center gap-1.5">
                                    <span>Avanza al Turno {currentRound + 1} (JIT)</span>
                                    <SFIcon name="arrow.right" size={14} />
                                </span>
                            </Button>
                        ) : (
                            <Button
                                onClick={handleCompleteTournament}
                                disabled={isSubmitting || !isCurrentRoundComplete}
                                className="w-full sm:flex-1 font-bold !bg-emerald-600 hover:!bg-emerald-700 text-white"
                            >
                                {isSubmitting ? 'Salvataggio finale...' : (
                                    <span className="flex items-center justify-center gap-1.5">
                                        <SFIcon name="trophy.fill" size={16} />
                                        <span>Completa Torneo Messicano</span>
                                    </span>
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default MexicanTournamentFlow;
