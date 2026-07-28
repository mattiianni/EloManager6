import React, { useState, useMemo } from 'react';
import { Player, TournamentType, Match, SetScore, Tournament } from '../types.ts';
import { getAuthToken } from '../hooks/useAuth.tsx';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import {
 distributePlayersIntoBoxes,
 createAllBoxMatches,
 calculateAllBoxStandings,
 createFinalsMatches,
 sortPairsByElo,
 isValidPairsCount,
 calculateNumBoxes,
 getAllPlayersFromBoxes,
 BoxData,
 BoxStanding,
 PlayoffType
} from '../services/beatTheBoxService.ts';
import Card from './ui/Card.tsx';
import Button from './ui/Button.tsx';
import MatchScoreInput from './ui/MatchScoreInput.tsx';
import { HIGSheet } from './ui/HIGSheet.tsx';
import BeatTheBoxAnimation from './ui/BeatTheBoxAnimation.tsx';
import { PrintIcon } from './ui/Icons.tsx';
import { printBeatTheBoxBlank, printBeatTheBoxComplete } from '../services/printService.ts';

interface BeatTheBoxFlowProps {
 pairs: [Player, Player][];
 onFinish: () => void;
 tournamentDate: string;
 clubName: string;
 tournamentName: string;
 giornataName?: string; // Nome della serie (per tornei multi-giornata)
}

type BeatTheBoxStep = 'playoff_selection' | 'animating' | 'boxes' | 'semifinals' | 'finals' | 'results';

const BeatTheBoxFlow: React.FC<BeatTheBoxFlowProps> = ({
 pairs,
 onFinish,
 tournamentDate,
 clubName,
 tournamentName,
 giornataName,
}) => {
 const { addMultipleMatches, getPlayerById } = usePadelStore();
 
 const [step, setStep] = useState<BeatTheBoxStep>((pairs.length >= 6) ? 'playoff_selection' : 'animating');
 const [playoffType, setPlayoffType] = useState<PlayoffType>(pairs.length >= 6 ? 'semifinals' : 'finals_only');
 const [boxesData, setBoxesData] = useState<BoxData[]>([]);
 const [allMatches, setAllMatches] = useState<Match[]>([]);
 const [boxStandings, setBoxStandings] = useState<BoxStanding[]>([]);
 const [semifinalMatches, setSemifinalMatches] = useState<Match[]>([]);
 const [finalMatches, setFinalMatches] = useState<Match[]>([]);
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [showSuccessModal, setShowSuccessModal] = useState(false);
 const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
 const [showCompleteSuccess, setShowCompleteSuccess] = useState(false);
 const [completionError, setCompletionError] = useState<string | null>(null);
 const [isSavingCalendar, setIsSavingCalendar] = useState(false);
 const [showBoxStandingsModal, setShowBoxStandingsModal] = useState(false);
 const [showSaveCalendarConfirm, setShowSaveCalendarConfirm] = useState(false);
 const [tournamentStartingElos, setTournamentStartingElos] = useState<Map<string, number>>(new Map());
 
 const numBoxes = calculateNumBoxes(pairs.length);
 const numPairs = pairs.length;

	// Helper: client-side ELO change approximation (per tournament) for UI display
	// Usa gli ELO CORRETTI del torneo (da tournamentStartingElos)
	const computeIndividualEloChanges = React.useCallback((matchesForCalc: Match[]) => {
		const K = 16; // Beat the Box K-factor
		const deltas = new Map<string, number>();
		
		// Traccia gli ELO durante il torneo (partendo dagli ELO del torneo)
		const tournamentElos = new Map<string, number>();
		
		// Inizializza con gli ELO di partenza del torneo (recuperati dal backend)
		boxesData.forEach(box => {
			box.players.forEach(p => {
				const startingElo = tournamentStartingElos.get(p.id) || 1500;
				tournamentElos.set(p.id, startingElo);
				console.log(`🎯 Inizializzazione ELO per ${p.name} ${p.surname}: ${startingElo} (${tournamentStartingElos.has(p.id) ? 'da backend' : 'default'})`);
			});
		});
		
		// Processa ogni match in ordine, aggiornando gli ELO del torneo
		matchesForCalc.forEach((m, idx) => {
			if (!m.winner || m.winner === 'draw') return;
			
			const t1p1 = getPlayerById(m.team1[0]);
			const t1p2 = getPlayerById(m.team1[1]);
			const t2p1 = getPlayerById(m.team2[0]);
			const t2p2 = getPlayerById(m.team2[1]);
			
			if (!t1p1 || !t1p2 || !t2p1 || !t2p2) return;
			
			const t1e1 = tournamentElos.get(m.team1[0]) || t1p1.currentElo;
			const t1e2 = tournamentElos.get(m.team1[1]) || t1p2.currentElo;
			const t2e1 = tournamentElos.get(m.team2[0]) || t2p1.currentElo;
			const t2e2 = tournamentElos.get(m.team2[1]) || t2p2.currentElo;
			
			const team1Avg = (t1e1 + t1e2) / 2;
			const team2Avg = (t2e1 + t2e2) / 2;
			
			const expected1 = 1 / (1 + Math.pow(10, (team2Avg - team1Avg) / 400));
			const score1 = m.winner === 'team1' ? 1 : 0;
			const delta1 = K * (score1 - expected1);
			const delta2 = -delta1;
			
			console.log(`🎯 Match ${idx+1}: Team1Avg=${team1Avg.toFixed(1)}, Team2Avg=${team2Avg.toFixed(1)}, Expected1=${expected1.toFixed(3)}, Delta1=${delta1.toFixed(2)}, Winner=${m.winner}`);
			
			// Aggiorna ELO del torneo
			[m.team1[0], m.team1[1]].forEach(id => {
				const oldElo = tournamentElos.get(id)!;
				const newElo = oldElo + delta1;
				tournamentElos.set(id, newElo);
				deltas.set(id, (deltas.get(id) || 0) + delta1);
			});
			[m.team2[0], m.team2[1]].forEach(id => {
				const oldElo = tournamentElos.get(id)!;
				const newElo = oldElo + delta2;
				tournamentElos.set(id, newElo);
				deltas.set(id, (deltas.get(id) || 0) + delta2);
			});
		});
		
		console.log(`🎯 Delta finali:`, Array.from(deltas.entries()).map(([id, delta]) => {
			const p = getPlayerById(id);
			return `${p?.name} ${p?.surname}: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`;
		}));
		
		return deltas;
	}, [getPlayerById, boxesData, tournamentStartingElos]);

	const individualStandingsUI = React.useMemo(() => {
		console.log('🔵 Calcolo individualStandingsUI...');
		console.log('🔵 allMatches.length:', allMatches.length);
		console.log('🔵 semifinalMatches.length:', semifinalMatches.length);
		console.log('🔵 finalMatches.length:', finalMatches.length);
		
		// USA allMatches (popolato dopo Calcola Qualificati) invece di boxesData.matches
		const matchesForCalc: Match[] = [
			...allMatches, // Questi hanno i set E i winner!
			...semifinalMatches,
			...finalMatches,
		];
		
		console.log('🔵 Total matchesForCalc:', matchesForCalc.length);
		console.log('🔵 Match con winner:', matchesForCalc.filter(m => m.winner).length);
		
		const deltas = computeIndividualEloChanges(matchesForCalc);
		
		// Calcola games W/L per ogni giocatore
		const playerStats = new Map<string, { gamesWon: number; gamesLost: number }>();
		
		matchesForCalc.forEach(m => {
			if (!m.winner || m.winner === 'draw') return;
			const sets = m.sets || [];
			sets.forEach(set => {
				// Team1 players
				m.team1.forEach(pid => {
					const stats = playerStats.get(pid) || { gamesWon: 0, gamesLost: 0 };
					stats.gamesWon += set.team1;
					stats.gamesLost += set.team2;
					playerStats.set(pid, stats);
				});
				// Team2 players
				m.team2.forEach(pid => {
					const stats = playerStats.get(pid) || { gamesWon: 0, gamesLost: 0 };
					stats.gamesWon += set.team2;
					stats.gamesLost += set.team1;
					playerStats.set(pid, stats);
				});
			});
		});
		
		const allPlayers: Player[] = boxesData.length ? boxesData.flatMap(b => b.players) : [];
		const uniquePlayersMap = new Map<string, Player>();
		allPlayers.forEach(p => uniquePlayersMap.set(p.id, p));
		return Array.from(uniquePlayersMap.values())
			.map(p => {
				const stats = playerStats.get(p.id) || { gamesWon: 0, gamesLost: 0 };
				const winPercentage = (stats.gamesWon + stats.gamesLost) > 0 
					? (stats.gamesWon / (stats.gamesWon + stats.gamesLost)) * 100 
					: 0;
				return { 
					player: p, 
					eloChange: deltas.get(p.id) || 0, 
					gamesWon: stats.gamesWon,
					gamesLost: stats.gamesLost,
					winPercentage,
					rank: 0 
				};
			})
			.sort((a, b) => b.eloChange - a.eloChange)
			.map((e, idx) => ({ ...e, rank: idx + 1 }));
	}, [allMatches, semifinalMatches, finalMatches, tournamentDate, computeIndividualEloChanges, boxesData]);
 
 // Funzione per stampare il tabellone vuoto
 const handlePrintBlank = () => {
 const tournamentDetails = {
 name: tournamentName,
 type: TournamentType.BeatTheBox,
 date: tournamentDate,
 club: clubName,
 };
 printBeatTheBoxBlank(tournamentDetails, boxesData, getPlayerById);
 };
 
 // Recupera ELO di partenza dal backend
 React.useEffect(() => {
 const fetchStartingElos = async () => {
 try {
 const allPlayerIds = pairs.flatMap(([p1, p2]) => [p1.id, p2.id]);
 
 console.log('🔍 Richiedo ELO di partenza al backend...', {
 tournamentName,
 giornataName,
 playerIds: allPlayerIds.length,
 date: tournamentDate
 });
 
 const token = getAuthToken();
 const response = await fetch('/api/tournaments/starting-elos', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
 },
 body: JSON.stringify({
 tournamentName,
 giornataName,
 playerIds: allPlayerIds,
 date: tournamentDate
 })
 });
 
 if (!response.ok) {
 throw new Error('Failed to fetch starting ELOs');
 }
 
 const { startingElos } = await response.json();
 const elosMap = new Map(Object.entries(startingElos).map(([id, elo]) => [id, elo as number]));
 setTournamentStartingElos(elosMap);
 
 console.log('✅ ELO di partenza ricevuti:', Object.keys(startingElos).length);
 Object.entries(startingElos).forEach(([id, elo]) => {
 const player = pairs.flat().find(p => p.id === id);
 if (player) {
 console.log(` ${player.name} ${player.surname}: ${elo}`);
 }
 });
 } catch (error) {
 console.error('❌ Errore nel recuperare ELO di partenza:', error);
 // Fallback: usa tutti 1500
 const fallbackElos = new Map<string, number>();
 pairs.flatMap(([p1, p2]) => [p1.id, p2.id]).forEach(id => fallbackElos.set(id, 1500));
 setTournamentStartingElos(fallbackElos);
 }
 };
 
 if (pairs.length > 0) {
 fetchStartingElos();
 }
 }, [pairs, tournamentName, giornataName, tournamentDate]);
 
 // Inizializza i box dopo l'animazione E dopo aver ricevuto gli ELO
 React.useEffect(() => {
 if (step === 'animating' && tournamentStartingElos.size > 0) {
 setTimeout(() => {
 // Ordina coppie per ELO
 const sortedPairs = sortPairsByElo(pairs);
 
 // Distribuzione nei box
 const boxes = distributePlayersIntoBoxes(sortedPairs);
 
 // Crea partite per ogni box
 const boxesWithMatches = createAllBoxMatches(boxes, tournamentDate);
 
 setBoxesData(boxesWithMatches);
 setStep('boxes');
 }, 3000); // Durata animazione
 }
 }, [step, pairs, tournamentDate, tournamentStartingElos]);
 
 // Conferma salvataggio calendario
 const handleConfirmSaveCalendar = () => {
 console.log('🔵 handleConfirmSaveCalendar chiamato');
 setShowSaveCalendarConfirm(true);
 };
 
 // Funzione per salvare calendario senza risultati
 const handleSaveCalendar = async () => {
 // Chiudi conferma e proteggi contro doppi click
 setShowSaveCalendarConfirm(false);
 if (isSavingCalendar) return;
 
 setIsSavingCalendar(true);
 
 try {
 // Crea tutti i match con risultati (se inseriti) e calcola winner
 const allBoxMatches: Omit<Match, 'id'>[] = boxesData.flatMap(box =>
 box.matches.map(match => {
 const sets = (match as any).sets || [];
 const team1Games = sets.reduce((sum: number, s: any) => sum + (s.team1 || 0), 0);
 const team2Games = sets.reduce((sum: number, s: any) => sum + (s.team2 || 0), 0);
 const hasScores = sets.length > 0 && (team1Games > 0 || team2Games > 0);
 return {
 ...match,
 date: tournamentDate,
 sets,
 winner: hasScores ? (team1Games === team2Games ? 'draw' : (team1Games > team2Games ? 'team1' : 'team2')) : null,
 };
 })
 );
 
    const tournamentData: Omit<Tournament, 'id'> = {
        name: tournamentName,
        type: TournamentType.BeatTheBox,
        date: tournamentDate,
        club: clubName,
        matchIds: [],
        status: 'scheduled',
        giornataName: giornataName || undefined,
        playoffType: playoffType,
    };
 
 await addMultipleMatches(allBoxMatches, tournamentData);
 
 console.log('✅ Calendario salvato con successo');
 setShowSuccessModal(true);
 } catch (error) {
 console.error('❌ Errore nel salvare il calendario:', error);
 alert('Errore nel salvare il calendario');
 } finally {
 setIsSavingCalendar(false);
 }
 };
 
 // Procedi al calcolo qualificati
 const handleCalculateQualified = () => {
 console.log('🔵 handleCalculateQualified chiamato');
 console.log('🔵 boxesData:', boxesData);
 
 // Converti boxesData matches in Match[] completi
 const allMatchesComplete: Match[] = boxesData.flatMap((box, boxIdx) =>
 box.matches.map((match, matchIdx) => {
 const globalMatchIdx = boxIdx * 3 + matchIdx;
 const sets = (match as any).sets || [];
 
 // Calcola winner
 let winner: 'team1' | 'team2' | 'draw' | null = null;
 if (sets.length > 0) {
 const team1Games = sets.reduce((sum: number, set: SetScore) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum: number, set: SetScore) => sum + set.team2, 0);
 
 if (team1Games > team2Games) {
 winner = 'team1';
 } else if (team2Games > team1Games) {
 winner = 'team2';
 } else {
 winner = 'draw';
 }
 }
 
 return {
 id: `temp-${globalMatchIdx}`,
 date: tournamentDate,
 ...match,
 sets,
 winner,
 tournamentId: 'temp',
 } as Match;
 })
 );
 
 console.log('🔵 allMatchesComplete:', allMatchesComplete);
 setAllMatches(allMatchesComplete);
 
 // Calcola classifiche dei box (usa match normalizzati con winner coerente)
 const normalizedMatches = allMatchesComplete.map(m => {
 if (m.winner) return m;
 const team1Games = (m.sets || []).reduce((sum, s) => sum + (s.team1 || 0), 0);
 const team2Games = (m.sets || []).reduce((sum, s) => sum + (s.team2 || 0), 0);
 const winner = team1Games === team2Games ? 'draw' : (team1Games > team2Games ? 'team1' : 'team2');
 return { ...m, winner } as Match;
 });
 const standings = calculateAllBoxStandings(normalizedMatches, boxesData);
 console.log('🔵 standings:', standings);
 setBoxStandings(standings);
 console.log('🔵 Aprendo modal classifiche box');
 setShowBoxStandingsModal(true);
 };

 // Live standings per box (durante inserimento) - usate per popup
 const liveBoxStandings: BoxStanding[] = React.useMemo(() => {
 if (!boxesData.length) return [];
 const tempMatches: Match[] = boxesData.flatMap((box, boxIdx) =>
 box.matches.map((m, matchIdx) => {
 const sets = (m as any).sets || [];
 const team1Games = sets.reduce((sum: number, s: SetScore) => sum + s.team1, 0);
 const team2Games = sets.reduce((sum: number, s: SetScore) => sum + s.team2, 0);
 let winner: 'team1' | 'team2' | 'draw' | null = null;
 if (sets.length > 0) {
 winner = team1Games === team2Games ? 'draw' : (team1Games > team2Games ? 'team1' : 'team2');
 }
 return {
 id: `temp-${boxIdx}-${matchIdx}`,
 date: tournamentDate,
 team1: m.team1 as [string, string],
 team2: m.team2 as [string, string],
 sets: sets,
 winner,
 tournamentId: 'temp'
 } as Match;
 })
 );
 return calculateAllBoxStandings(tempMatches, boxesData);
 }, [boxesData, tournamentDate]);
 
 // Da semifinali a finali
 const handleSemifinalsComplete = () => {
 // Verifica che tutte le semifinali abbiano un vincitore
 const allComplete = semifinalMatches.every(m => m.winner);
 if (!allComplete) {
 alert('⚠️ Inserisci i risultati di tutte le semifinali');
 return;
 }
 
 // Crea le finali basandosi sui risultati delle semifinali
 const sf1Winner = semifinalMatches[0].winner as 'team1' | 'team2';
 const sf2Winner = semifinalMatches[1]?.winner as 'team1' | 'team2';
 
 const { finals } = createFinalsMatches(
 numBoxes,
 boxStandings,
 tournamentDate,
 { sf1Winner, sf2Winner },
 playoffType
 );
 
 setFinalMatches(finals.map((m, i) => ({
 ...m,
 id: `final-${i}`,
 date: tournamentDate,
 tournamentId: 'temp',
 } as Match)));
 
 setStep('finals');
 };
 
 // Completa torneo e salva
 const handleComplete = async () => {
 // Verifica che tutte le finali abbiano un vincitore
 const allComplete = finalMatches.every(m => m.winner);
 if (!allComplete) {
 alert('⚠️ Inserisci i risultati di tutte le finali');
 return;
 }
 
 // Chiudi il modal di conferma
 setShowCompleteConfirm(false);
 setIsSubmitting(true);
 setCompletionError(null);
 
 try {
 // Combina tutti i match: box + semifinali + finali
 // USA allMatches invece di boxesData.matches perché contiene i winner corretti!
 const allMatchesForSave: Omit<Match, 'id'>[] = [
 ...allMatches.map(m => ({ ...m, date: tournamentDate })),
 ...semifinalMatches.map(m => ({ ...m, date: tournamentDate })),
 ...finalMatches.map(m => ({ ...m, date: tournamentDate })),
 ];
 
 const tournamentData: Omit<Tournament, 'id'> = {
 name: tournamentName,
 type: TournamentType.BeatTheBox,
 date: tournamentDate,
 club: clubName,
 matchIds: [],
 status: 'completed',
 giornataName: giornataName || undefined,
 // Gli ELO vengono salvati automaticamente in elo_history dal server
 };
 
 console.log('🔄 Salvando torneo Beat the Box completo...');
 await addMultipleMatches(allMatchesForSave, tournamentData);
 console.log('✅ Torneo salvato con successo');
 
 // Mostra riepilogo risultati
 setShowCompleteSuccess(true);
 setStep('results');
 } catch (error) {
 console.error('❌ Errore nel completare il torneo:', error);
 setCompletionError('Errore nel completare il torneo. Riprova.');
 alert('Errore nel completare il torneo. Riprova.');
 } finally {
 setIsSubmitting(false);
 }
 };
 
 // Render modali (funzione helper - definita prima dei render)
 const renderModals = () => (
 <>
 {/* Modal di CONFERMA salvataggio calendario */}
 <HIGSheet
 isOpen={showSaveCalendarConfirm}
 onClose={() => setShowSaveCalendarConfirm(false)}
 title="Salva Calendario"
 >
 <div className="space-y-3 px-4">
 <p className="text-sm text-gray-600 dark:text-gray-300">
 Vuoi salvare il calendario senza risultati? Potrai inserire i risultati in un secondo momento dalla pagina Tornei.
 </p>
 <div className="flex gap-3 pt-2">
 <Button variant="secondary" onClick={() => setShowSaveCalendarConfirm(false)} className="flex-1">
 Annulla
 </Button>
 <Button onClick={handleSaveCalendar} disabled={isSavingCalendar} className="flex-1">
 {isSavingCalendar ? 'Salvataggio...' : 'Conferma e Salva'}
 </Button>
 </div>
 </div>
 </HIGSheet>

 {/* Modal SUCCESS salvataggio calendario */}
 <HIGSheet
 isOpen={showSuccessModal}
 onClose={() => {
 setShowSuccessModal(false);
 onFinish();
 }}
 title="Calendario Salvato"
 >
 <div className="text-center px-4 pb-4">
 <div className="mb-4">
 <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
 <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
 </svg>
 </div>
 <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
 Calendario salvato con successo!
 </h3>
 <p className="text-gray-600 dark:text-gray-400">
 Il torneo"Beat the Box" è stato salvato e può essere recuperato dalla pagina Tornei.
 </p>
 </div>
 <Button
 onClick={() => {
 setShowSuccessModal(false);
 onFinish();
 }}
 className="w-full"
 >
 OK
 </Button>
 </div>
 </HIGSheet>

 {/* Conferma completamento torneo */}
 <HIGSheet
 isOpen={showCompleteConfirm}
 onClose={() => !isSubmitting && setShowCompleteConfirm(false)}
 title="Confermi il completamento del torneo?"
 >
 <div className="space-y-3 px-4">
 <p className="text-sm text-gray-600 dark:text-gray-300">Verranno salvate tutte le partite e aggiornati gli ELO.</p>
 {completionError && (
 <p className="text-sm text-red-600 dark:text-red-400">{completionError}</p>
 )}
 <div className="flex gap-3 pt-2">
 <Button variant="secondary" onClick={() => setShowCompleteConfirm(false)} disabled={isSubmitting} className="flex-1">Annulla</Button>
 <Button onClick={handleComplete} disabled={isSubmitting} className="flex-1">
 {isSubmitting ? 'Salvataggio...' : 'Conferma e Salva'}
 </Button>
 </div>
 </div>
 </HIGSheet>

 {/* Success completamento - chiude automaticamente */}
 <HIGSheet
 isOpen={showCompleteSuccess}
 onClose={() => {
 setShowCompleteSuccess(false);
 onFinish();
 }}
 title="Torneo Completato"
 >
 <div className="text-center space-y-3 px-4">
 <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
 <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
 </svg>
 </div>
 <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
 Torneo completato con successo!
 </h3>
 <p className="text-sm text-gray-600 dark:text-gray-300">
 Gli ELO sono stati aggiornati. Visualizza i risultati completi qui sotto.
 </p>
 <div className="flex gap-3">
 <Button onClick={() => {
 setShowCompleteSuccess(false);
 }} className="flex-1">
 Vedi Risultati
 </Button>
 </div>
 </div>
 </HIGSheet>

 {/* Popup Classifiche Box (intermedio) */}
 <HIGSheet
 isOpen={showBoxStandingsModal}
 onClose={() => setShowBoxStandingsModal(false)}
 title="📦 Classifiche Box Completate"
 >
 <div className="space-y-4 px-4">
 {boxStandings.map((box) => (
 <div key={box.boxNumber} className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-ios-blue/20">
 <h4 className="font-semibold text-ios-blue dark:text-ios-blue mb-3">Box {box.boxNumber}</h4>
 <div className="space-y-2 px-4">
 {box.standings.map((s: any, idx: number) => (
 <div key={s.player.id} className={`flex justify-between items-center p-2 rounded ${
 idx < 2 
 ? 'bg-green-100 dark:bg-green-900 border border-green-400/50 dark:border-green-300/20' 
 : 'bg-white dark:bg-gray-800'
 }`}>
 <span className="font-medium">
 {idx + 1}° - {s.player.name} {s.player.surname}
 </span>
 <span className="text-sm text-gray-600 dark:text-gray-400">
 {s.points} punti ({s.gameDifference >= 0 ? '+' : ''}{s.gameDifference})
 </span>
 </div>
 ))}
 </div>
 </div>
 ))}
 <p className="text-gray-600 dark:text-gray-400 text-center">
 Vuoi procedere con le {playoffType === 'semifinals' ? 'semifinali' : 'finali'}?
 </p>
 <div className="flex gap-3 pt-4">
 <Button variant="secondary" onClick={() => setShowBoxStandingsModal(false)} className="flex-1">Annulla</Button>
 <Button className="flex-1" onClick={() => {
 setShowBoxStandingsModal(false);
 if (playoffType === 'semifinals') {
 const { semifinals } = createFinalsMatches(numBoxes, boxStandings, tournamentDate, undefined, playoffType);
 if (semifinals) {
 setSemifinalMatches(semifinals.map((m, i) => ({
 ...m,
 id: `sf-${i}`,
 date: tournamentDate,
 tournamentId: 'temp',
 } as Match)));
 setStep('semifinals');
 }
 } else {
 const { finals } = createFinalsMatches(numBoxes, boxStandings, tournamentDate, undefined, playoffType);
 setFinalMatches(finals.map((m, i) => ({
 ...m,
 id: `final-${i}`,
 date: tournamentDate,
 tournamentId: 'temp',
 } as Match)));
 setStep('finals');
 }
 }}>
 Procedi
 </Button>
 </div>
 </div>
 </HIGSheet>
 </>
 );
 
 // Rendering fasi
 
 if (step === 'playoff_selection') {
 return (
 <Card title="Scelta Fase Conclusiva">
 <div className="space-y-6 px-4 py-4 text-center">
 <p className="text-gray-600 dark:text-gray-400 mb-6">
 Scegli il formato della fase finale del torneo Beat the Box.
 </p>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div 
 className="border-2 rounded-xl p-6 cursor-pointer hover:border-ios-blue hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all border-gray-200 dark:border-gray-700"
 onClick={() => {
 setPlayoffType('finals_only');
 setStep('animating');
 }}
 >
 <h3 className="text-xl font-bold mb-2">Solo Finali</h3>
 <p className="text-sm text-gray-500 dark:text-gray-400">
 Dopo i gironi si giocano direttamente le finali (più veloce).
 </p>
 </div>
 <div 
 className="border-2 rounded-xl p-6 cursor-pointer hover:border-ios-blue hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all border-gray-200 dark:border-gray-700"
 onClick={() => {
 setPlayoffType('semifinals');
 setStep('animating');
 }}
 >
 <h3 className="text-xl font-bold mb-2">Semifinali + Finali</h3>
 <p className="text-sm text-gray-500 dark:text-gray-400">
 Le migliori coppie si affrontano prima in semifinale (formato completo).
 </p>
 </div>
 </div>
 </div>
 </Card>
 );
 }

 if (step === 'animating') {
 return <BeatTheBoxAnimation />;
 }
 
 if (step === 'boxes') {
 return (
 <>
 <Card title={
 <div className="flex justify-between items-center">
 <span>Beat the Box - Fase Box ({numBoxes} Box)</span>
 <Button 
 onClick={handlePrintBlank} 
 variant="ghost" 
 size="sm"
 >
 <span className="flex items-center gap-1"><PrintIcon /> Stampa Tabellone Vuoto</span>
 </Button>
 </div>
 }>
 <div className="space-y-8 px-4">
 {boxesData.map((box, boxIdx) => (
 <div key={boxIdx} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
 <div className="flex items-center gap-2 mb-4">
 <div className="text-2xl">📦</div>
 <h3 className="font-semibold text-lg">
 Box {box.boxNumber} - Campo {box.boxNumber}
 </h3>
 </div>
 
 <div className="mb-4 space-y-1 px-4">
 <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Giocatori:</p>
 {box.players.map((player, idx) => (
 <div key={idx} className="text-sm">
 • {player.name} {player.surname}
 <span className="text-xs text-gray-500 ml-1">(ELO: {player.currentElo.toFixed(2)})</span>
 </div>
 ))}
 </div>
 
 <div className="space-y-3 px-4">
 {box.matches.map((match, matchIdx) => {
 const t1p1 = getPlayerById(match.team1[0]);
 const t1p2 = getPlayerById(match.team1[1]);
 const t2p1 = getPlayerById(match.team2[0]);
 const t2p2 = getPlayerById(match.team2[1]);
 
 if (!t1p1 || !t1p2 || !t2p1 || !t2p2) return null;
 
 return (
 <div key={matchIdx} className="bg-white dark:bg-gray-800 p-3 rounded">
 <div className="grid grid-cols-3 items-center gap-4">
 <div className="text-sm">
 {t1p1.name} {t1p1.surname}<br/>
 {t1p2.name} {t1p2.surname}
 </div>
 
 <div>
 <MatchScoreInput
 sets={match.sets || []}
 onSetsChange={(sets) => {
 setBoxesData(prev => prev.map((box, bi) =>
 bi === boxIdx
 ? {
 ...box,
 matches: box.matches.map((m, mi) =>
 mi === matchIdx ? { ...m, sets } : m
 )
 }
 : box
 ));
 }}
 />
 </div>
 
 <div className="text-sm text-right">
 {t2p1.name} {t2p1.surname}<br/>
 {t2p2.name} {t2p2.surname}
 </div>
 </div>
 </div>
 );
 })}
 </div>

 {/* Rimosso live standings inline: verranno mostrati nel popup dedicato */}
 </div>
 ))}
 
 <div className="flex gap-3 mt-6">
 <Button
 onClick={onFinish}
 variant="outline"
 className="flex-1"
 >
 Annulla
 </Button>
 <Button
 onClick={handleConfirmSaveCalendar}
 disabled={isSavingCalendar}
 variant="secondary"
 className="flex-1 bg-green-100 hover:bg-green-200 text-green-800 border-green-500/45 dark:border-green-300/30"
 >
 Salva Calendario
 </Button>
 <Button
 onClick={handleCalculateQualified}
 className="flex-1"
 >
 Calcola Qualificati
 </Button>
 </div>
 </div>
 </Card>
 {renderModals()}
 </>
 );
 }
 
 if (step === 'semifinals') {
 return (
 <>
 <Card title="Beat the Box - Semifinali">
 <div className="space-y-6 px-4">
 <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-6 border border-ios-blue/20">
 <h3 className="font-semibold text-lg mb-2">🏆 Qualificati alle Semifinali</h3>
 <p className="text-sm text-gray-600 dark:text-gray-300">
 I primi 2 classificati di ogni box si sfidano nelle semifinali
 </p>
 </div>
 
 {semifinalMatches.map((match, idx) => {
 const t1p1 = getPlayerById(match.team1[0]);
 const t1p2 = getPlayerById(match.team1[1]);
 const t2p1 = getPlayerById(match.team2[0]);
 const t2p2 = getPlayerById(match.team2[1]);
 
 if (!t1p1 || !t1p2 || !t2p1 || !t2p2) return null;
 
 return (
 <div key={idx} className="bg-green-50 dark:bg-green-900/20 border border-green-300/50 dark:border-green-300/16 p-4 rounded-lg shadow-sm">
 <div className="text-center mb-3">
 <h4 className="font-bold text-lg text-green-900 dark:text-green-300">
 Semifinale {idx + 1}
 </h4>
 </div>
 
 <div className="grid grid-cols-3 items-center gap-4">
 <div className="text-sm font-medium">
 {t1p1.name} {t1p1.surname}<br/>
 {t1p2.name} {t1p2.surname}
 </div>
 
 <div>
 <MatchScoreInput
 sets={match.sets || []}
 onSetsChange={(sets) => {
 const newMatches = [...semifinalMatches];
 
 // Calcola winner
 const team1Games = sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum, set) => sum + set.team2, 0);
 const winner = team1Games > team2Games ? 'team1' : team2Games > team1Games ? 'team2' : 'draw';
 
 newMatches[idx] = {
 ...match,
 sets,
 winner,
 };
 setSemifinalMatches(newMatches);
 }}
 />
 </div>
 
 <div className="text-sm font-medium text-right">
 {t2p1.name} {t2p1.surname}<br/>
 {t2p2.name} {t2p2.surname}
 </div>
 </div>
 </div>
 );
 })}
 
 <div className="flex gap-3 mt-6">
 <Button
 onClick={() => setStep('boxes')}
 variant="outline"
 className="flex-1"
 >
 Indietro
 </Button>
 <Button
 onClick={handleSemifinalsComplete}
 className="flex-1"
 >
 Procedi
 </Button>
 </div>
 </div>
 </Card>
 {renderModals()}
 </>
 );
 }
 
 if (step === 'finals') {
 const hasConsolazione = numBoxes === 3; // Solo con 6 coppie
 
 return (
 <>
 <Card title="Beat the Box - Finali">
 <div className="space-y-6 px-4">
 <div className="bg-yellow-50 dark:bg-yellow-900 p-4 rounded-lg mb-6">
 <h3 className="font-semibold text-lg mb-2">🏆 Finali</h3>
 <p className="text-sm text-gray-600 dark:text-gray-300">
 Ultimi match per determinare la classifica finale
 </p>
 </div>
 
 {finalMatches.map((match, idx) => {
 const t1p1 = getPlayerById(match.team1[0]);
 const t1p2 = getPlayerById(match.team1[1]);
 const t2p1 = getPlayerById(match.team2[0]);
 const t2p2 = getPlayerById(match.team2[1]);
 
 if (!t1p1 || !t1p2 || !t2p1 || !t2p2) return null;
 
 let matchTitle = '';
 let bgColor = 'bg-green-100 dark:bg-green-900/30 border border-green-400/50 dark:border-green-300/20';
 let titleColor = 'text-green-800 dark:text-green-400';
 
 if (idx === 0) {
 matchTitle = 'Finale 1° - 2° Posto';
 bgColor = 'bg-green-50 dark:bg-green-900/20 border border-green-300/50 dark:border-green-300/16';
 titleColor = 'text-green-900 dark:text-green-300';
 } else if (idx === 1) {
 matchTitle = 'Finalina 3° - 4° Posto';
 bgColor = 'bg-green-100 dark:bg-green-900/30 border border-green-400/50 dark:border-green-300/20';
 titleColor = 'text-green-800 dark:text-green-400';
 } else if (hasConsolazione && idx === 2) {
 matchTitle = 'Partita Consolazione';
 bgColor = 'bg-green-100 dark:bg-green-900/30 border border-green-400/50 dark:border-green-300/20';
 titleColor = 'text-green-800 dark:text-green-400';
 }
 
 return (
 <div key={idx} className={`${bgColor} p-4 rounded-lg shadow-sm`}>
 <div className="text-center mb-3">
 <h4 className={`font-bold text-lg ${titleColor}`}>
 {matchTitle}
 </h4>
 </div>
 
 <div className="grid grid-cols-3 items-center gap-4">
 <div className="text-sm font-medium">
 {t1p1.name} {t1p1.surname}<br/>
 {t1p2.name} {t1p2.surname}
 </div>
 
 <div>
 <MatchScoreInput
 sets={match.sets || []}
 onSetsChange={(sets) => {
 const newMatches = [...finalMatches];
 
 // Calcola winner
 const team1Games = sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum, set) => sum + set.team2, 0);
 const winner = team1Games > team2Games ? 'team1' : team2Games > team1Games ? 'team2' : 'draw';
 
 newMatches[idx] = {
 ...match,
 sets,
 winner,
 };
 setFinalMatches(newMatches);
 }}
 />
 </div>
 
 <div className="text-sm font-medium text-right">
 {t2p1.name} {t2p1.surname}<br/>
 {t2p2.name} {t2p2.surname}
 </div>
 </div>
 </div>
 );
 })}
 
 {/* Anteprima Classifica Squadre Finale */}
 {finalMatches.length > 0 && (
 <div className="mt-4">
 <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">🏆 Classifica Squadre Finale</h4>
 <div className="overflow-x-auto">
 <table className="min-w-full text-sm">
 <thead>
 <tr className="text-left text-gray-500 dark:text-gray-400">
 <th className="py-1 pr-2">Pos</th>
 <th className="py-1 pr-2">Coppia</th>
 </tr>
 </thead>
 <tbody>
 {(() => {
 const rows: Array<{ pos: number; team: string }> = [];
 const getTeamLabel = (team: [string, string]) => {
 const p1 = getPlayerById(team[0]);
 const p2 = getPlayerById(team[1]);
 return p1 && p2 ? `${p1.name} ${p1.surname} / ${p2.name} ${p2.surname}` : '';
 };
 if (finalMatches[0] && finalMatches[0].winner) {
 const winTeam = finalMatches[0].winner === 'team1' ? finalMatches[0].team1 : finalMatches[0].team2;
 const loseTeam = finalMatches[0].winner === 'team1' ? finalMatches[0].team2 : finalMatches[0].team1;
 rows.push({ pos: 1, team: getTeamLabel(winTeam) });
 rows.push({ pos: 2, team: getTeamLabel(loseTeam) });
 }
 if (finalMatches[1] && finalMatches[1].winner) {
 const winTeam = finalMatches[1].winner === 'team1' ? finalMatches[1].team1 : finalMatches[1].team2;
 const loseTeam = finalMatches[1].winner === 'team1' ? finalMatches[1].team2 : finalMatches[1].team1;
 rows.push({ pos: 3, team: getTeamLabel(winTeam) });
 rows.push({ pos: 4, team: getTeamLabel(loseTeam) });
 }
 return rows.map(r => (
 <tr key={r.pos}>
 <td className="py-1 pr-2 font-semibold">{r.pos}°</td>
 <td className="py-1 pr-2">{r.team}</td>
 </tr>
 ));
 })()}
 </tbody>
 </table>
 </div>
 </div>
 )}

 <div className="flex gap-3 mt-6">
 <Button
 onClick={() => numBoxes >= 4 ? setStep('semifinals') : setStep('boxes')}
 variant="outline"
 className="flex-1"
 >
 Indietro
 </Button>
 <Button
 onClick={() => setShowCompleteConfirm(true)}
 className="flex-1"
 disabled={isSubmitting}
 >
 {isSubmitting ? 'Salvataggio...' : '✅ Completa Torneo'}
 </Button>
 </div>
 </div>
 </Card>
 {renderModals()}
 </>
 );
 }
 
 if (step === 'results') {
 return (
 <>
 <Card title="Beat the Box - Risultati">
 <div className="space-y-6 px-4">
 <div className="p-3 bg-green-50 dark:bg-green-900 rounded">
 <h3 className="font-semibold text-green-800 dark:text-green-200">Torneo completato!</h3>
 <p className="text-sm text-green-700 dark:text-green-300">Di seguito il riepilogo finale.</p>
 </div>
 
 {/* Riepilogo Classifiche Box */}
 {liveBoxStandings.map(b => (
 <div key={b.boxNumber}>
 <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">Classifica Box {b.boxNumber}</h4>
 <div className="overflow-x-auto">
 <table className="min-w-full text-sm">
 <thead>
 <tr className="text-left text-gray-500 dark:text-gray-400">
 <th className="py-1 pr-2">Pos</th>
 <th className="py-1 pr-2">Giocatore</th>
 <th className="py-1 pr-2 text-center">Pt</th>
 <th className="py-1 pr-2 text-center">Diff</th>
 </tr>
 </thead>
 <tbody>
 {b.standings.map((s, idx) => (
 <tr key={s.player.id} className={idx < 2 ?"bg-green-50 dark:bg-green-900/20" :""}>
 <td className="py-1 pr-2">{idx + 1}</td>
 <td className="py-1 pr-2">{s.player.name} {s.player.surname}</td>
 <td className="py-1 pr-2 text-center">{s.points}</td>
 <td className="py-1 pr-2 text-center">{s.gameDifference >= 0 ? '+' : ''}{s.gameDifference}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 ))}

 {/* Classifica Squadre Finale */}
 {finalMatches.length > 0 && (
 <div>
 <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">🏆 Classifica Squadre Finale</h4>
 <div className="overflow-x-auto">
 <table className="min-w-full text-sm">
 <thead>
 <tr className="text-left text-gray-500 dark:text-gray-400">
 <th className="py-1 pr-2">Pos</th>
 <th className="py-1 pr-2">Coppia</th>
 </tr>
 </thead>
 <tbody>
 {(() => {
 const rows: Array<{ pos: number; team: string }> = [];
 const getTeamLabel = (team: [string, string]) => {
 const p1 = getPlayerById(team[0]);
 const p2 = getPlayerById(team[1]);
 return p1 && p2 ? `${p1.name} ${p1.surname} / ${p2.name} ${p2.surname}` : '';
 };
 if (finalMatches[0] && finalMatches[0].winner) {
 const winTeam = finalMatches[0].winner === 'team1' ? finalMatches[0].team1 : finalMatches[0].team2;
 const loseTeam = finalMatches[0].winner === 'team1' ? finalMatches[0].team2 : finalMatches[0].team1;
 rows.push({ pos: 1, team: getTeamLabel(winTeam) });
 rows.push({ pos: 2, team: getTeamLabel(loseTeam) });
 }
 if (finalMatches[1] && finalMatches[1].winner) {
 const winTeam = finalMatches[1].winner === 'team1' ? finalMatches[1].team1 : finalMatches[1].team2;
 const loseTeam = finalMatches[1].winner === 'team1' ? finalMatches[1].team2 : finalMatches[1].team1;
 rows.push({ pos: 3, team: getTeamLabel(winTeam) });
 rows.push({ pos: 4, team: getTeamLabel(loseTeam) });
 }
 return rows.map(r => (
 <tr key={r.pos}>
 <td className="py-1 pr-2 font-semibold">{r.pos}°</td>
 <td className="py-1 pr-2">{r.team}</td>
 </tr>
 ));
 })()}
 </tbody>
 </table>
 </div>
 </div>
 )}

					{/* Classifica Individuale (Var. ELO) */}
					<div>
						<h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">📈 Classifica Individuale (Var. ELO)</h4>
						<div className="overflow-x-auto">
							<table className="min-w-full text-sm">
								<thead>
									<tr className="text-left text-gray-500 dark:text-gray-400">
										<th className="py-1 pr-2 text-center">Pos</th>
										<th className="py-1 pr-2">Giocatore</th>
										<th className="py-1 pr-2 text-center">Δ ELO</th>
									</tr>
								</thead>
								<tbody>
									{individualStandingsUI.map(e => (
										<tr key={e.player.id}>
											<td className="py-1 pr-2 text-center">{e.rank}</td>
											<td className="py-1 pr-2">{e.player.name} {e.player.surname}</td>
											<td className="py-1 pr-2 text-center" style={{ color: e.eloChange >= 0 ? '#059669' : '#dc2626', fontWeight: 600 }}>
												{e.eloChange >= 0 ? '+' : ''}{e.eloChange.toFixed(1)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>

					<div className="flex gap-3 pt-4">
						<Button 
							onClick={() => {
								console.log('🖨️ ======= PREPARAZIONE STAMPA BEAT THE BOX =======');
								console.log('🖨️ allMatches.length:', allMatches.length);
								console.log('🖨️ semifinalMatches.length:', semifinalMatches.length);
								console.log('🖨️ finalMatches.length:', finalMatches.length);
								
								// 🔍 VERIFICA boxesData.players PRIMA della stampa
								console.log('🔍 Verifica boxesData.players:');
								boxesData.forEach((b, idx) => {
									console.log(` Box ${b.boxNumber}:`, {
										playersCount: b.players.length,
										playerIds: b.players.map(p => p.id),
										playerNames: b.players.map(p => `${p.name} ${p.surname}`)
									});
								});
								
								// Verifica duplicati in boxesData
								const allPlayersInBoxesData = boxesData.flatMap(b => b.players.map(p => p.id));
								const uniquePlayersInBoxesData = [...new Set(allPlayersInBoxesData)];
								console.log('📊 Total player IDs in boxesData:', allPlayersInBoxesData.length);
								console.log('📊 Unique player IDs in boxesData:', uniquePlayersInBoxesData.length);
								if (allPlayersInBoxesData.length !== uniquePlayersInBoxesData.length) {
									console.error('❌ DUPLICATI TROVATI in boxesData.players PRIMA della stampa!');
								}
								
								console.log('🖨️ individualStandingsUI.length:', individualStandingsUI.length);
								console.log('🖨️ individualStandingsUI IDs:', individualStandingsUI.map(s => s.player.id));
								
								// Prepara dati per stampa completa usando TUTTI i match salvati
								const tournament: Tournament = {
									id: 'temp',
									name: tournamentName,
									type: TournamentType.BeatTheBox,
									date: tournamentDate,
									club: clubName,
									matchIds: [],
									status: 'completed'
								};
								
								// Costruisci boxes usando allMatches (che hanno i set corretti)
								const numMatchesPerBox = 3;
								const boxes = boxesData.map((b, idx) => ({
									boxNumber: b.boxNumber,
									players: b.players,
									matches: allMatches.slice(idx * numMatchesPerBox, (idx + 1) * numMatchesPerBox)
								}));
								
								console.log('🖨️ Boxes preparati per stampa:', boxes.map(b => ({
									boxNum: b.boxNumber,
									playersCount: b.players.length,
									matchesCount: b.matches.length
								})));
								
								printBeatTheBoxComplete(tournament, boxes as any, boxStandings as any, semifinalMatches, finalMatches, individualStandingsUI as any, getPlayerById);
							}}
							variant="secondary"
							className="flex-1"
						>
							Stampa Report
						</Button>
						<Button onClick={onFinish} className="flex-1">Chiudi</Button>
					</div>
 </div>
 </Card>
 {renderModals()}
 </>
 );
 }
 
 // Nessuno step attivo, non dovrebbe mai succedere
 return null;
};

export default BeatTheBoxFlow;
