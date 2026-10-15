import React, { useState, useMemo, useEffect } from 'react';
import { Player, TournamentType, Match, SetScore, Tournament } from '../types.ts';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import { getAuthToken } from '../hooks/useAuth.tsx';
import Card from './ui/Card.tsx';
import Button from './ui/Button.tsx';
import MatchScoreInput from './ui/MatchScoreInput.tsx';
import { HIGSheet } from './ui/HIGSheet.tsx';
import { PrintIcon } from './ui/Icons.tsx';
import { showHIGAlert } from '../utils/higDialogService.ts';
import { SFIcon } from './ui/SFIcon.tsx';
import { CustomTournamentFlowConfig } from '../types/customTournament.ts';
import { printCustomTournamentBlank, printCustomTournamentComplete } from '../services/printService.ts';
import {
  CustomBoxData,
  BoxStandingItem,
  distributeSinglesIntoBoxes,
  distributePairsIntoBoxes,
  generateAmericanoMatchesForCustomFlow,
  calculateStandingsForBoxes,
  generateSemifinalsMatches,
  generateFinalsMatchesFromBoxes,
  generateFinalsMatchesFromSemifinals,
  computeIndividualStandings,
} from '../utils/customTournamentFlowLogic.ts';

export type { CustomBoxData, BoxStandingItem };

interface CustomTournamentFlowProps {
  pairs: [Player, Player][];
  config?: CustomTournamentFlowConfig;
  tournamentType?: TournamentType;
  onFinish: () => void;
  tournamentDate: string;
  clubName: string;
  tournamentName: string;
  giornataName?: string;
}

type CustomTournamentStep = 'boxes' | 'semifinals' | 'finals' | 'results';

export const CustomTournamentFlow: React.FC<CustomTournamentFlowProps> = ({
  pairs,
  config,
  tournamentType,
  onFinish,
  tournamentDate,
  clubName,
  tournamentName,
  giornataName,
}) => {
  const { addMultipleMatches, getPlayerById } = usePadelStore();

  const isSingles = (config?.playerMode || 'singles') === 'singles';
  const phases = config?.phases || ['box', 'semifinali', 'finali'];
  const firstPhase = phases[0] || (isSingles ? 'box' : 'box');
  const isAmericanoMode = isSingles && firstPhase === 'americano';
  const hasSemifinals = phases.includes('semifinali') || phases.includes('semifinals');
  const hasFinals = phases.includes('finali') || phases.includes('finals');
  const hasQuarters = phases.includes('quarti') || phases.includes('quarters');
  const numCampi = config?.numCampi || 2;

  const effectiveTournamentType = tournamentType || (isAmericanoMode ? TournamentType.Americano : TournamentType.TorneoPersonale);
  const formatBadgeName = effectiveTournamentType === TournamentType.BeatTheBox
    ? 'Beat the Box'
    : effectiveTournamentType === TournamentType.Americano
    ? 'Americano'
    : 'Torneo Personale';

  const [step, setStep] = useState<CustomTournamentStep>('boxes');
  const [boxesData, setBoxesData] = useState<CustomBoxData[]>([]);
  const [semifinalMatches, setSemifinalMatches] = useState<Match[]>([]);
  const [finalMatches, setFinalMatches] = useState<Match[]>([]);
  const [showQualifiersModal, setShowQualifiersModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingCalendar, setIsSavingCalendar] = useState(false);
  const [tournamentStartingElos, setTournamentStartingElos] = useState<Map<string, number>>(new Map());

  // Helper: format names
  const formatName = (p?: Player) => (p ? `${p.name} ${p.surname}` : 'TBD');
  const formatShort = (p?: Player) => (p ? `${p.name.charAt(0)}. ${p.surname}` : 'TBD');

  // Fetch starting ELOs from server
  useEffect(() => {
    const fetchStartingElos = async () => {
      try {
        const allPlayerIds = Array.from(new Set(pairs.flatMap(p => [p[0]?.id, p[1]?.id]).filter(Boolean)));
        const token = getAuthToken();
        const response = await fetch('/api/tournaments/starting-elos', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            tournamentName,
            giornataName,
            playerIds: allPlayerIds,
            date: tournamentDate,
          }),
        });

        if (response.ok) {
          const { startingElos } = await response.json();
          const elosMap = new Map(Object.entries(startingElos).map(([id, elo]) => [id, elo as number]));
          setTournamentStartingElos(elosMap);
        }
      } catch (e) {
        console.warn('Failed to fetch starting ELOs:', e);
      }
    };

    if (pairs.length > 0) {
      fetchStartingElos();
    }
  }, [pairs, tournamentName, giornataName, tournamentDate]);

  // Initial distribution into boxes or unified Americano
  useEffect(() => {
    if (isSingles) {
      const uniquePlayerMap = new Map<string, Player>();
      pairs.flatMap(p => [p[0], p[1]]).filter((p): p is Player => Boolean(p)).forEach(p => {
        if (!uniquePlayerMap.has(p.id)) uniquePlayerMap.set(p.id, p);
      });
      const rawPlayers = Array.from(uniquePlayerMap.values());
      if (isAmericanoMode) {
        const americanoData = generateAmericanoMatchesForCustomFlow(
          rawPlayers,
          numCampi,
          tournamentDate,
          tournamentStartingElos
        );
        setBoxesData([americanoData]);
      } else {
        const initialBoxes = distributeSinglesIntoBoxes(
          rawPlayers,
          numCampi,
          tournamentDate,
          tournamentStartingElos
        );
        setBoxesData(initialBoxes);
      }
    } else {
      const initialBoxes = distributePairsIntoBoxes(pairs, numCampi, tournamentDate);
      setBoxesData(initialBoxes);
    }
  }, [pairs, isSingles, isAmericanoMode, numCampi, tournamentDate, tournamentStartingElos]);

  // Update match score helper
  const handleScoreChange = (
    boxIndex: number,
    matchIndex: number,
    sets: SetScore[]
  ) => {
    setBoxesData(prev => {
      const copy = [...prev];
      const box = { ...copy[boxIndex] };
      const matches = [...box.matches];
      const match = { ...matches[matchIndex] };

      const t1 = sets.reduce((s, x) => s + (x.team1 || 0), 0);
      const t2 = sets.reduce((s, x) => s + (x.team2 || 0), 0);
      const hasScore = t1 > 0 || t2 > 0;

      let winner: 'team1' | 'team2' | 'draw' | null = null;
      if (hasScore) {
        winner = t1 === t2 ? 'draw' : t1 > t2 ? 'team1' : 'team2';
      }

      match.sets = sets;
      match.winner = winner;
      matches[matchIndex] = match;
      box.matches = matches;
      copy[boxIndex] = box;
      return copy;
    });
  };

  // Calcolo classifiche Box
  const boxStandings = useMemo(() => {
    return calculateStandingsForBoxes(boxesData, isSingles);
  }, [boxesData, isSingles]);

  // Controlla se tutti i match dei box sono completati
  const areAllBoxMatchesComplete = useMemo(() => {
    if (!boxesData.length) return false;
    return boxesData.every(box =>
      box.matches.length > 0 && box.matches.every(m => m.winner !== null)
    );
  }, [boxesData]);

  // Transizione a Semifinali o Finali
  const handleProceedFromBoxes = () => {
    if (!areAllBoxMatchesComplete) {
      showHIGAlert('Inserisci i risultati di tutte le partite dei Box per procedere.');
      return;
    }

    if (hasSemifinals) {
      generateSemifinals();
      setStep('semifinals');
    } else if (hasFinals) {
      generateFinalsFromBoxes();
      setStep('finals');
    } else {
      setStep('results');
    }
  };

  // Genera semifinali
  const generateSemifinals = () => {
    const matches = generateSemifinalsMatches(boxStandings, isSingles, tournamentDate);
    if (matches.length === 0) {
      showHIGAlert('Impossibile generare le semifinali: partecipanti insufficienti nei box.');
      return;
    }
    setSemifinalMatches(matches);
  };

  // Genera finali direttamente dai box (se no semifinali)
  const generateFinalsFromBoxes = () => {
    const matches = generateFinalsMatchesFromBoxes(boxStandings, isSingles, tournamentDate);
    if (matches.length === 0) {
      showHIGAlert('Impossibile generare le finali: partecipanti insufficienti nei box.');
      return;
    }
    setFinalMatches(matches);
  };

  // Genera finali dopo le semifinali
  const handleProceedFromSemifinals = () => {
    const allSfDone = semifinalMatches.length > 0 && semifinalMatches.every(m => m.winner !== null);
    if (!allSfDone) {
      showHIGAlert('Inserisci i risultati di entrambe le semifinali.');
      return;
    }

    const matches = generateFinalsMatchesFromSemifinals(semifinalMatches, tournamentDate);
    setFinalMatches(matches);
    setStep('finals');
  };

  // Score change per Semifinali
  const handleSfScoreChange = (idx: number, sets: SetScore[]) => {
    setSemifinalMatches(prev => {
      const copy = [...prev];
      const match = { ...copy[idx] };
      const t1 = sets.reduce((s, x) => s + (x.team1 || 0), 0);
      const t2 = sets.reduce((s, x) => s + (x.team2 || 0), 0);
      match.sets = sets;
      match.winner = (t1 > 0 || t2 > 0) ? (t1 === t2 ? 'draw' : t1 > t2 ? 'team1' : 'team2') : null;
      copy[idx] = match;
      return copy;
    });
  };

  // Score change per Finali
  const handleFinalScoreChange = (idx: number, sets: SetScore[]) => {
    setFinalMatches(prev => {
      const copy = [...prev];
      const match = { ...copy[idx] };
      const t1 = sets.reduce((s, x) => s + (x.team1 || 0), 0);
      const t2 = sets.reduce((s, x) => s + (x.team2 || 0), 0);
      match.sets = sets;
      match.winner = (t1 > 0 || t2 > 0) ? (t1 === t2 ? 'draw' : t1 > t2 ? 'team1' : 'team2') : null;
      copy[idx] = match;
      return copy;
    });
  };

  // Salva Calendario (status: 'scheduled') o Torneo in corso
  const handleSaveCalendar = async (exitOnSuccess = true) => {
    if (isSavingCalendar) return;
    setIsSavingCalendar(true);

    try {
      const boxMatches = boxesData.flatMap(b => b.matches);
      const allMatchesList: Omit<Match, 'id'>[] = [
        ...boxMatches,
        ...semifinalMatches,
        ...finalMatches,
      ].map(m => ({
        date: tournamentDate,
        team1: m.team1,
        team2: m.team2,
        sets: m.sets || [{ team1: 0, team2: 0 }],
        winner: m.winner || null,
        phase: m.phase,
        groupNumber: m.groupNumber,
        courtNumber: m.courtNumber,
        roundNumber: m.roundNumber,
      }));

      const tournamentData: Omit<Tournament, 'id'> = {
        name: tournamentName,
        type: effectiveTournamentType,
        date: tournamentDate,
        club: clubName,
        matchIds: [],
        status: 'scheduled',
        giornataName: giornataName || undefined,
        customFlowConfig: config,
        playerMode: config?.playerMode,
        numCampi: config?.numCampi,
      };

      await addMultipleMatches(allMatchesList, tournamentData);
      showHIGAlert('Dati del torneo salvati con successo!');
      if (exitOnSuccess) {
        onFinish();
      }
    } catch (e: any) {
      console.error('Error saving calendar:', e);
      showHIGAlert(e.message || 'Errore nel salvataggio del calendario.');
    } finally {
      setIsSavingCalendar(false);
    }
  };

  // Completa Torneo (status: 'completed')
  const handleCompleteTournament = async () => {
    const allFinalsDone = finalMatches.length > 0 && finalMatches.every(m => m.winner !== null);
    if (!allFinalsDone) {
      showHIGAlert('Inserisci i risultati di tutte le finali prima di completare il torneo.');
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const boxMatches = boxesData.flatMap(b => b.matches);
      const allMatchesList: Omit<Match, 'id'>[] = [
        ...boxMatches,
        ...semifinalMatches,
        ...finalMatches,
      ].map(m => ({
        date: tournamentDate,
        team1: m.team1,
        team2: m.team2,
        sets: m.sets,
        winner: m.winner,
        phase: m.phase,
        groupNumber: m.groupNumber,
        courtNumber: m.courtNumber,
        roundNumber: m.roundNumber,
      }));

      const tournamentData: Omit<Tournament, 'id'> = {
        name: tournamentName,
        type: effectiveTournamentType,
        date: tournamentDate,
        club: clubName,
        matchIds: [],
        status: 'completed',
        giornataName: giornataName || undefined,
        customFlowConfig: config,
        playerMode: config?.playerMode,
        numCampi: config?.numCampi,
      };

      await addMultipleMatches(allMatchesList, tournamentData);
      setStep('results');
    } catch (e: any) {
      console.error('Error completing tournament:', e);
      showHIGAlert(e.message || 'Errore durante il salvataggio del torneo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Stampa Tabellone Vuoto
  const handlePrintBlank = () => {
    const customBoxes = boxesData.map(b => ({
      boxNumber: b.boxNumber,
      players: b.players,
      matches: b.matches,
    }));
    printCustomTournamentBlank(
      {
        name: tournamentName,
        club: clubName,
        date: tournamentDate,
      },
      config || { phases: ['box', 'finali'], playerMode: isSingles ? 'singles' : 'pairs', numCampi },
      customBoxes,
      getPlayerById,
      formatBadgeName
    );
  };

  // Stampa Tabellone Completo
  const handlePrintComplete = () => {
    const tournamentObj: Tournament = {
      id: 'custom-tournament-complete',
      name: tournamentName,
      club: clubName,
      date: tournamentDate,
      type: effectiveTournamentType,
      status: 'completed',
      matchIds: [],
      customFlowConfig: config,
    };

    const customBoxes = boxesData.map(b => ({
      boxNumber: b.boxNumber,
      players: b.players,
      matches: b.matches,
    }));

    const btbStandings = Object.entries(boxStandings).map(([boxNum, stList]) => ({
      boxNumber: Number(boxNum),
      standings: ((stList || []) as BoxStandingItem[]).map(s => ({
        player: s.player || { id: s.id, name: s.displayName, surname: '', currentElo: 1500, initialElo: 1500, position: 'Indifferente' as any },
        points: s.points,
        gamesWon: s.gamesWon,
        gamesLost: s.gamesLost,
        gameDifference: s.diff,
        rank: s.rank,
      })),
    }));

    const allMatches = [
      ...boxesData.flatMap(b => b.matches),
      ...semifinalMatches,
      ...finalMatches,
    ];
    const indStandings = computeIndividualStandings(boxesData, allMatches);

    printCustomTournamentComplete(
      tournamentObj,
      config || { phases: ['box', 'finali'], playerMode: isSingles ? 'singles' : 'pairs', numCampi },
      customBoxes,
      btbStandings,
      semifinalMatches,
      finalMatches,
      indStandings as any,
      getPlayerById
    );
  };

  // -------------------------------------------------------------
  // RENDERING UI
  // -------------------------------------------------------------

  if (step === 'results') {
    const f1 = finalMatches.find(m => m.phase === 'final_1_2');
    const f3 = finalMatches.find(m => m.phase === 'final_3_4');

    const firstTeam = f1?.winner === 'team1' ? f1.team1 : f1?.winner === 'team2' ? f1.team2 : [];
    const secondTeam = f1?.winner === 'team1' ? f1.team2 : f1?.winner === 'team2' ? f1.team1 : [];
    const thirdTeam = f3?.winner === 'team1' ? f3.team1 : f3?.winner === 'team2' ? f3.team2 : [];

    return (
      <Card
        title={
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <SFIcon name="trophy.fill" size={18} className="text-amber-500" />
              <span>Risultati {formatBadgeName}</span>
            </span>
            <Button onClick={handlePrintComplete} variant="ghost" size="sm">
              <span className="flex items-center gap-1.5 font-bold"><PrintIcon /> Stampa PDF Completo</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-6 px-2 py-4">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">{tournamentName || formatBadgeName}</h2>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{clubName} • {tournamentDate}</p>
          </div>

          {/* Podio */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {/* 2° Posto */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-white/10 text-center flex flex-col justify-center items-center order-2 sm:order-1">
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-700 dark:text-slate-300 font-extrabold text-sm mb-2 shadow-xs">
                2°
              </div>
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">2° Classificato</span>
              <p className="font-bold text-slate-900 dark:text-white text-sm">
                {secondTeam.map(id => formatShort(getPlayerById(id))).join(' & ') || '—'}
              </p>
            </div>

            {/* 1° Posto */}
            <div className="p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 text-center flex flex-col justify-center items-center order-1 sm:order-2 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-400 font-black text-base mb-2 shadow-xs">
                1°
              </div>
              <span className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">Campione</span>
              <p className="font-black text-slate-900 dark:text-white text-base">
                {firstTeam.map(id => formatShort(getPlayerById(id))).join(' & ') || '—'}
              </p>
            </div>

            {/* 3° Posto */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-white/10 text-center flex flex-col justify-center items-center order-3">
              <div className="w-10 h-10 rounded-full bg-amber-700/15 border border-amber-700/30 flex items-center justify-center text-amber-700 dark:text-amber-500 font-extrabold text-sm mb-2 shadow-xs">
                3°
              </div>
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">3° Classificato</span>
              <p className="font-bold text-slate-900 dark:text-white text-sm">
                {thirdTeam.map(id => formatShort(getPlayerById(id))).join(' & ') || '—'}
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button onClick={handlePrintComplete} variant="outline" className="flex-1 font-bold">
              <span className="flex items-center justify-center gap-1.5"><PrintIcon /> Stampa Risultati</span>
            </Button>
            <Button onClick={onFinish} className="flex-1 font-bold">
              Chiudi e Torna ai Tornei
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card
        title={
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                  {formatBadgeName}
                </span>
                <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                  {isSingles ? 'Singoli' : 'Coppie Fisse'} • {numCampi} {numCampi === 1 ? 'Campo' : 'Campi'}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                {tournamentName || formatBadgeName}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handlePrintBlank} variant="ghost" size="sm">
                <span className="flex items-center gap-1.5 font-bold"><PrintIcon /> Stampa Vuoto</span>
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-8 px-1 py-2">
          {/* Breadcrumb / Stepper Fasi */}
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-white/5 overflow-x-auto">
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              step === 'boxes' ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}>
              <SFIcon name={isAmericanoMode ? "shuffle" : "shippingbox.fill"} size={13} />
              <span>{isAmericanoMode ? 'Fase Americano' : 'Fase Box'}</span>
            </div>
            {hasSemifinals && (
              <>
                <span className="text-slate-300 dark:text-slate-600">→</span>
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  step === 'semifinals' ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  <SFIcon name="bolt.fill" size={13} />
                  <span>Semifinali</span>
                </div>
              </>
            )}
            {hasFinals && (
              <>
                <span className="text-slate-300 dark:text-slate-600">→</span>
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  step === 'finals' ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  <SFIcon name="trophy.fill" size={13} />
                  <span>Finali</span>
                </div>
              </>
            )}
          </div>

          {/* STEP 1: FASE BOX / AMERICANO */}
          {step === 'boxes' && (
            <div className="space-y-6">
              <div className={isAmericanoMode ? 'grid grid-cols-1 gap-6' : 'grid grid-cols-1 lg:grid-cols-2 gap-6'}>
                {boxesData.map((box, bIdx) => (
                  <div
                    key={box.boxNumber}
                    className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 sm:p-5 border border-slate-200/80 dark:border-white/10 shadow-sm space-y-4"
                  >
                    {/* Header Box / Americano */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold text-lg">
                          <SFIcon name={isAmericanoMode ? "shuffle" : "shippingbox.fill"} size={18} />
                        </div>
                        <div>
                          <h3 className="font-bold text-base text-slate-900 dark:text-white">
                            {isAmericanoMode
                              ? `Torneo Americano (${box.players.length} Giocatori)`
                              : `Box ${box.boxNumber} — Campo ${box.courtNumber}`}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            {isAmericanoMode
                              ? `${box.matches.length} Partite totali su ${numCampi} ${numCampi === 1 ? 'campo' : 'campi'} a rotazione continua`
                              : isSingles
                              ? `${box.players.length} Giocatori • ${box.matches.length} Partite a rotazione`
                              : `${box.pairs?.length || 0} Coppie • Mini Girone`}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Partite */}
                    <div className="space-y-3">
                      {box.matches.map((match, mIdx) => {
                        const t1p1 = getPlayerById(match.team1[0]);
                        const t1p2 = getPlayerById(match.team1[1]);
                        const t2p1 = getPlayerById(match.team2[0]);
                        const t2p2 = getPlayerById(match.team2[1]);

                        const isTeam1Winner = match.winner === 'team1';
                        const isTeam2Winner = match.winner === 'team2';

                        return (
                          <div
                            key={match.id}
                            className="p-3 sm:p-3.5 bg-slate-50/80 dark:bg-slate-900/50 rounded-xl border border-slate-200/60 dark:border-white/5 space-y-2.5 shadow-sm"
                          >
                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between pb-1.5 border-b border-slate-200/50 dark:border-white/5">
                              <span>
                                {match.roundNumber ? `Turno ${match.roundNumber} • ` : ''}Partita {mIdx + 1}
                              </span>
                              <span className="font-semibold text-slate-500 dark:text-slate-400">Campo {match.courtNumber || box.courtNumber}</span>
                            </div>

                            {/* Squadra A vs Squadra B */}
                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1">
                              {/* Squadra A */}
                              <div className={`min-w-0 text-left transition-colors ${
                                isTeam1Winner ? 'text-sky-600 dark:text-sky-400 font-bold' : 'text-slate-800 dark:text-slate-200'
                              }`}>
                                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                                  Squadra A
                                </div>
                                <div className="text-xs sm:text-sm font-semibold truncate leading-snug" title={t1p1 ? `${t1p1.name} ${t1p1.surname}` : ''}>
                                  {t1p1 ? `${t1p1.name} ${t1p1.surname}` : 'TBD'}
                                </div>
                                <div className="text-xs sm:text-sm font-semibold truncate leading-snug" title={t1p2 ? `${t1p2.name} ${t1p2.surname}` : ''}>
                                  {t1p2 ? `${t1p2.name} ${t1p2.surname}` : 'TBD'}
                                </div>
                              </div>

                              {/* VS Badge */}
                              <div className="flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-400 px-2 py-0.5 rounded-full bg-slate-200/60 dark:bg-white/10">
                                  VS
                                </span>
                              </div>

                              {/* Squadra B */}
                              <div className={`min-w-0 text-right transition-colors ${
                                isTeam2Winner ? 'text-sky-600 dark:text-sky-400 font-bold' : 'text-slate-800 dark:text-slate-200'
                              }`}>
                                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                                  Squadra B
                                </div>
                                <div className="text-xs sm:text-sm font-semibold truncate leading-snug" title={t2p1 ? `${t2p1.name} ${t2p1.surname}` : ''}>
                                  {t2p1 ? `${t2p1.name} ${t2p1.surname}` : 'TBD'}
                                </div>
                                <div className="text-xs sm:text-sm font-semibold truncate leading-snug" title={t2p2 ? `${t2p2.name} ${t2p2.surname}` : ''}>
                                  {t2p2 ? `${t2p2.name} ${t2p2.surname}` : 'TBD'}
                                </div>
                              </div>
                            </div>

                            {/* Score Input SOTTO */}
                            <div className="pt-2 flex justify-center border-t border-slate-200/50 dark:border-white/5">
                              <MatchScoreInput
                                sets={match.sets || [{ team1: 0, team2: 0 }]}
                                onSetsChange={(sets) => handleScoreChange(bIdx, mIdx, sets)}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Classifica Box / Americano */}
                    <div className="pt-3 border-t border-slate-100 dark:border-white/5">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                        {isAmericanoMode ? 'Classifica Generale Americano' : `Classifica Box ${box.boxNumber}`}
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-400 border-b border-slate-100 dark:border-white/5 text-[11px]">
                              <th className="text-left py-1 w-8">#</th>
                              <th className="text-left py-1">{isSingles ? 'Giocatore' : 'Coppia'}</th>
                              <th className="text-center py-1 w-10">Pt</th>
                              <th className="text-center py-1 w-12">Diff</th>
                            </tr>
                          </thead>
                          <tbody>
                            {boxStandings[box.boxNumber]?.map((st, sIdx) => {
                              const isQualifying = hasSemifinals ? sIdx < (isAmericanoMode ? 8 : 2) : hasFinals ? sIdx < (isAmericanoMode ? 4 : 2) : sIdx < 2;
                              const boxLetter = String.fromCharCode(64 + box.boxNumber);
                              const badgeCode = `${boxLetter}${sIdx + 1}`;
                              return (
                                <tr
                                  key={st.id}
                                  className={`border-b border-slate-50 dark:border-white/5 last:border-0 ${
                                    isQualifying
                                      ? 'text-slate-900 dark:text-white font-semibold'
                                      : 'text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  <td className="py-1.5 font-bold">
                                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] ${
                                      sIdx === 0 ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' :
                                      sIdx === 1 ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400' :
                                      'text-slate-400'
                                    }`}>
                                      {sIdx + 1}
                                    </span>
                                  </td>
                                  <td className="py-1.5 truncate max-w-[140px]">
                                    {st.displayName}
                                    {isSingles && (hasSemifinals || hasFinals) && (
                                      <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-black ${
                                        isQualifying
                                          ? 'bg-emerald-600 text-white shadow-xs'
                                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                      }`}>
                                        {badgeCode}
                                      </span>
                                    )}
                                  </td>
                                  <td className="text-center py-1.5 font-bold text-sky-600 dark:text-sky-400">{st.points}</td>
                                  <td className="text-center py-1.5 font-medium">{st.diff >= 0 ? `+${st.diff}` : st.diff}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottoni azione sotto i box */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
                <Button
                  onClick={() => handleSaveCalendar(false)}
                  variant="success"
                  disabled={isSavingCalendar}
                  className="w-full sm:w-auto font-bold"
                >
                  {isSavingCalendar ? 'Salvataggio...' : 'Salva Torneo in corso'}
                </Button>

                <Button
                  onClick={handleProceedFromBoxes}
                  disabled={!areAllBoxMatchesComplete}
                  className="w-full sm:flex-1 font-bold"
                >
                  {hasSemifinals ? 'Procedi alle Semifinali →' : hasFinals ? 'Procedi alle Finali →' : 'Avanti →'}
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: SEMIFINALI */}
          {step === 'semifinals' && (
            <div className="space-y-6">
              <div className="p-4 bg-sky-50 dark:bg-sky-950/30 rounded-2xl border border-sky-200/60 dark:border-sky-500/20">
                <h3 className="font-bold text-sky-900 dark:text-sky-200 text-sm mb-1 flex items-center gap-1.5">
                  <SFIcon name="bolt.fill" size={15} className="text-sky-600 dark:text-sky-400" />
                  <span>Semifinali in Contemporanea</span>
                </h3>
                <p className="text-xs text-sky-700 dark:text-sky-300">
                  Le migliori coppie si affrontano su 2 campi. Le vincitrici giocheranno la Finale 1°-2° posto, le perdenti la Finale 3°-4° posto.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {semifinalMatches.map((match, idx) => {
                  const t1p1 = getPlayerById(match.team1[0]);
                  const t1p2 = getPlayerById(match.team1[1]);
                  const t2p1 = getPlayerById(match.team2[0]);
                  const t2p2 = getPlayerById(match.team2[1]);

                  const isTeam1Winner = match.winner === 'team1';
                  const isTeam2Winner = match.winner === 'team2';

                  return (
                    <div
                      key={match.id}
                      className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 sm:p-5 border border-slate-200/80 dark:border-white/10 shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/5">
                        <span className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                          Semifinale {idx + 1}
                        </span>
                        <span className="text-xs font-semibold text-slate-400">Campo {match.courtNumber || idx + 1}</span>
                      </div>

                      {/* Squadra A vs Squadra B */}
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1">
                        <div className={`min-w-0 text-left transition-colors ${isTeam1Winner ? 'text-sky-600 dark:text-sky-400 font-bold' : 'text-slate-800 dark:text-slate-200'}`}>
                          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">Squadra A</div>
                          <div className="text-xs sm:text-sm font-semibold truncate leading-snug" title={t1p1 ? `${t1p1.name} ${t1p1.surname}` : ''}>{t1p1 ? `${t1p1.name} ${t1p1.surname}` : 'TBD'}</div>
                          <div className="text-xs sm:text-sm font-semibold truncate leading-snug" title={t1p2 ? `${t1p2.name} ${t1p2.surname}` : ''}>{t1p2 ? `${t1p2.name} ${t1p2.surname}` : 'TBD'}</div>
                        </div>

                        <div className="flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-400 px-2 py-0.5 rounded-full bg-slate-200/60 dark:bg-white/10">
                            VS
                          </span>
                        </div>

                        <div className={`min-w-0 text-right transition-colors ${isTeam2Winner ? 'text-sky-600 dark:text-sky-400 font-bold' : 'text-slate-800 dark:text-slate-200'}`}>
                          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">Squadra B</div>
                          <div className="text-xs sm:text-sm font-semibold truncate leading-snug" title={t2p1 ? `${t2p1.name} ${t2p1.surname}` : ''}>{t2p1 ? `${t2p1.name} ${t2p1.surname}` : 'TBD'}</div>
                          <div className="text-xs sm:text-sm font-semibold truncate leading-snug" title={t2p2 ? `${t2p2.name} ${t2p2.surname}` : ''}>{t2p2 ? `${t2p2.name} ${t2p2.surname}` : 'TBD'}</div>
                        </div>
                      </div>

                      {/* Score Input SOTTO */}
                      <div className="pt-2 flex justify-center border-t border-slate-200/50 dark:border-white/5">
                        <MatchScoreInput
                          sets={match.sets || [{ team1: 0, team2: 0 }]}
                          onSetsChange={(sets) => handleSfScoreChange(idx, sets)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
                <Button onClick={() => setStep('boxes')} variant="outline" className="w-full sm:w-auto font-bold">
                  ← Torna ai Box
                </Button>
                <Button
                  onClick={() => handleSaveCalendar(false)}
                  variant="success"
                  disabled={isSavingCalendar}
                  className="w-full sm:w-auto font-bold"
                >
                  {isSavingCalendar ? 'Salvataggio...' : 'Salva Torneo in corso'}
                </Button>
                <Button
                  onClick={handleProceedFromSemifinals}
                  disabled={semifinalMatches.some(m => !m.winner)}
                  className="w-full sm:flex-1 font-bold"
                >
                  Procedi alle Finali →
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: FINALI */}
          {step === 'finals' && (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200/60 dark:border-amber-500/20">
                <h3 className="font-bold text-amber-900 dark:text-amber-200 text-sm mb-1 flex items-center gap-1.5">
                  <SFIcon name="trophy.fill" size={15} className="text-amber-500" />
                  <span>Fase Finale</span>
                </h3>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Inserisci i risultati delle finali per completare il torneo e aggiornare le classifiche ELO.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {finalMatches.map((match, idx) => {
                  const t1p1 = getPlayerById(match.team1[0]);
                  const t1p2 = getPlayerById(match.team1[1]);
                  const t2p1 = getPlayerById(match.team2[0]);
                  const t2p2 = getPlayerById(match.team2[1]);

                  const isFirstPlaceMatch = match.phase === 'final_1_2';
                  const isTeam1Winner = match.winner === 'team1';
                  const isTeam2Winner = match.winner === 'team2';

                  return (
                    <div
                      key={match.id}
                      className={`bg-white dark:bg-slate-800 rounded-2xl p-3.5 sm:p-5 border shadow-sm space-y-3 ${
                        isFirstPlaceMatch
                          ? 'border-amber-400/60 dark:border-amber-500/30 ring-1 ring-amber-400/30'
                          : 'border-slate-200/80 dark:border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/5">
                        <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                          isFirstPlaceMatch ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'
                        }`}>
                          {isFirstPlaceMatch ? (
                            <>
                              <span className="w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 font-extrabold text-[10px]">1°</span>
                              <span>Finale 1° / 2° Posto</span>
                            </>
                          ) : (
                            <>
                              <span className="w-5 h-5 rounded-full bg-amber-700/15 border border-amber-700/30 flex items-center justify-center text-amber-700 dark:text-amber-500 font-extrabold text-[10px]">3°</span>
                              <span>Finale 3° / 4° Posto</span>
                            </>
                          )}
                        </span>
                        <span className="text-xs font-semibold text-slate-400">Campo {match.courtNumber || idx + 1}</span>
                      </div>

                      {/* Squadra A vs Squadra B */}
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1">
                        <div className={`min-w-0 text-left transition-colors ${isTeam1Winner ? 'text-amber-600 font-bold' : 'text-slate-800 dark:text-slate-200'}`}>
                          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">Squadra A</div>
                          <div className="text-xs sm:text-sm font-semibold truncate leading-snug" title={t1p1 ? `${t1p1.name} ${t1p1.surname}` : ''}>{t1p1 ? `${t1p1.name} ${t1p1.surname}` : 'TBD'}</div>
                          <div className="text-xs sm:text-sm font-semibold truncate leading-snug" title={t1p2 ? `${t1p2.name} ${t1p2.surname}` : ''}>{t1p2 ? `${t1p2.name} ${t1p2.surname}` : 'TBD'}</div>
                        </div>

                        <div className="flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-400 px-2 py-0.5 rounded-full bg-slate-200/60 dark:bg-white/10">
                            VS
                          </span>
                        </div>

                        <div className={`min-w-0 text-right transition-colors ${isTeam2Winner ? 'text-amber-600 font-bold' : 'text-slate-800 dark:text-slate-200'}`}>
                          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">Squadra B</div>
                          <div className="text-xs sm:text-sm font-semibold truncate leading-snug" title={t2p1 ? `${t2p1.name} ${t2p1.surname}` : ''}>{t2p1 ? `${t2p1.name} ${t2p1.surname}` : 'TBD'}</div>
                          <div className="text-xs sm:text-sm font-semibold truncate leading-snug" title={t2p2 ? `${t2p2.name} ${t2p2.surname}` : ''}>{t2p2 ? `${t2p2.name} ${t2p2.surname}` : 'TBD'}</div>
                        </div>
                      </div>

                      {/* Score Input SOTTO */}
                      <div className="pt-2 flex justify-center border-t border-slate-200/50 dark:border-white/5">
                        <MatchScoreInput
                          sets={match.sets || [{ team1: 0, team2: 0 }]}
                          onSetsChange={(sets) => handleFinalScoreChange(idx, sets)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
                <Button
                  onClick={() => setStep(hasSemifinals ? 'semifinals' : 'boxes')}
                  variant="outline"
                  className="w-full sm:w-auto font-bold"
                >
                  ← Indietro
                </Button>
                <Button
                  onClick={() => handleSaveCalendar(false)}
                  variant="success"
                  disabled={isSavingCalendar}
                  className="w-full sm:w-auto font-bold"
                >
                  {isSavingCalendar ? 'Salvataggio...' : 'Salva Torneo in corso'}
                </Button>
                <Button
                  onClick={handleCompleteTournament}
                  disabled={isSubmitting || finalMatches.some(m => !m.winner)}
                  className="w-full sm:flex-1 font-bold"
                >
                  {isSubmitting ? 'Salvataggio in corso...' : (
                    <span className="flex items-center justify-center gap-1.5">
                      <SFIcon name="trophy.fill" size={16} />
                      <span>Completa Torneo</span>
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </>
  );
};

export default CustomTournamentFlow;
