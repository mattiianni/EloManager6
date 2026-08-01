
import React, { useState, useMemo } from 'react';
import { Player, TournamentType, Match, SetScore, Tournament, TournamentStandingEntry } from '../types.ts';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import { calculateTournamentStandings, calculateFinalStandingsForRoundRobinFinali } from '../services/tournamentService.ts';
import { printTournamentReport, printBlankScoreSheet, printGironiTournament, printBeatTheBoxComplete, printBeatTheBoxBlank, printTorneoLiberoBlank, printTorneoLiberoComplete } from '../services/printService.ts';
import { isValidPairsCount as isBeatTheBoxValid, calculateAllBoxStandings } from '../services/beatTheBoxService.ts';
import Card from './ui/Card.tsx';
import Button from './ui/Button.tsx';
import MatchScoreInput from './ui/MatchScoreInput.tsx';
import { HIGSheet } from './ui/HIGSheet.tsx';
import { PrintIcon } from './ui/Icons.tsx';
import BeatTheBoxFlow from './BeatTheBoxFlow.tsx';
import TpraCreationFlow from './TpraCreationFlow.tsx';
import { getTournamentDisplayName } from '../utils/tournamentLabels.ts';
import { normalizeTournamentRounds } from '../utils/tournamentRounds.ts';
import { MATCH_OUTCOME, outcomeErrorMessage, validateMatchOutcome } from '../utils/matchOutcome.js';
import { showHIGAlert } from '../utils/higDialogService.ts';
import { formatPlayerShortName } from '../utils/format.ts';
import { buildQuarterfinalPairings, GironiPlayoffType, selectGironiQualifiers } from '../utils/gironiPlayoffs.ts';

interface TournamentFlowProps {
 pairs: [Player, Player][];
 onFinish: () => void;
 preselectedTournamentName?: string | null;
 clearPreselectedTournament?: () => void;
 forceExistingTournament?: boolean;
 initialFormat?: TournamentFormat;
}

type Step = 'tournament-selection' | 'setup' | 'americano-info' | 'round-robin-info' | 'torneo-libero-setup' | 'torneo-libero-scoring' | 'gironi-setup' | 'gironi-phase' | 'gironi-standings-intro' | 'gironi-quarterfinals' | 'gironi-semifinals' | 'gironi-finals' | 'scoring' | 'finals' | 'results' | 'tpra-flow';

type TournamentFormat =
 | 'match-singolo'
 | 'torneotto-30'
 | 'round-robin-finali'
 | 'americano'
 | 'torneo-libero'
 | 'gironi-fase-finale'
 | 'beat-the-box'
 | 'eliminazione-diretta';

// Helper function for Beat the Box
const groupMatchesIntoBoxes = (matches: Match[]) => {
 const boxGroups = new Map<number, Match[]>();

 matches.forEach(match => {
 const allPlayerIds = [...match.team1, ...match.team2];

 for (let i = 1; i <= 10; i++) {
 const existingMatches = boxGroups.get(i) || [];
 if (existingMatches.length === 0) {
 boxGroups.set(i, [match]);
 return;
 }

 const existingPlayerIds = new Set(
 existingMatches.flatMap(m => [...m.team1, ...m.team2])
 );

 if (allPlayerIds.every(id => existingPlayerIds.has(id))) {
 existingMatches.push(match);
 return;
 }
 }
 });

 return Array.from(boxGroups.entries()).map(([boxNumber, boxMatches]) => ({
 boxNumber,
 players: [], // Will be populated from matches
 matches: boxMatches
 }));
};

const createTeamIds = (pair: [Player, Player]): [string, string] => [pair[0].id, pair[1].id];

// Generate round-robin matches using Berger Table scheduling for fixed pairs
// Supports custom fields, Home/Away (Andata/Ritorno), and fair rest rotation for odd pairs or limited fields
const generateRoundRobinMatches = (
  pairs: [Player, Player][],
  fields: number = 2,
  homeAway: boolean = false
): Omit<Match, 'id' | 'date' | 'winner' | 'sets'>[] => {
  if (pairs.length < 2) return [];

  const matches: Omit<Match, 'id' | 'date' | 'winner' | 'sets'>[] = [];
  const n = pairs.length;
  const isOdd = n % 2 !== 0;
  const listCount = isOdd ? n + 1 : n;

  const teamList: ([Player, Player] | null)[] = [...pairs];
  if (isOdd) teamList.push(null);

  const numRounds = listCount - 1;
  const totalLegs = homeAway ? 2 : 1;

  for (let leg = 0; leg < totalLegs; leg++) {
    const isReturnLeg = leg === 1;
    const currentTeams = [...teamList];

    for (let r = 0; r < numRounds; r++) {
      const currentRoundNumber = leg * numRounds + (r + 1);
      const half = listCount / 2;

      for (let i = 0; i < half; i++) {
        const teamA = currentTeams[i];
        const teamB = currentTeams[listCount - 1 - i];

        if (teamA && teamB) {
          const t1 = isReturnLeg ? createTeamIds(teamB) : createTeamIds(teamA);
          const t2 = isReturnLeg ? createTeamIds(teamA) : createTeamIds(teamB);

          matches.push({
            team1: t1,
            team2: t2,
            roundNumber: currentRoundNumber,
          });
        }
      }

      // Rotate list keeping element 0 fixed (Berger Circle Method)
      const fixed = currentTeams[0];
      const rest = currentTeams.slice(1);
      const last = rest.pop()!;
      currentTeams.splice(0, currentTeams.length, fixed, last, ...rest);
    }
  }

  return matches;
};

// Helper function to optimize match order and minimize consecutive appearances
const optimizeMatchOrder = (matches: Omit<Match, 'id' | 'date' | 'winner' | 'sets'>[]): Omit<Match, 'id' | 'date' | 'winner' | 'sets'>[] => {
 if (matches.length <= 3) return matches;

 const optimized: Omit<Match, 'id' | 'date' | 'winner' | 'sets'>[] = [];
 const remaining = [...matches];

 // Start with the first match
 optimized.push(remaining.shift()!);

 // Greedily select matches that don't have players from the previous match
 while (remaining.length > 0) {
 let bestMatchIndex = 0;
 let bestScore = -1;

 for (let i = 0; i < remaining.length; i++) {
 const currentMatch = remaining[i];
 const lastMatch = optimized[optimized.length - 1];

 // Calculate score: higher is better (less overlap)
 let score = 0;
 if (!hasPlayerOverlap(currentMatch, lastMatch)) {
 score = 100; // No overlap is ideal
 } else {
 // Count how many players are different
 const overlapCount = countPlayerOverlap(currentMatch, lastMatch);
 score = 100 - (overlapCount * 25); // Penalize overlap
 }

 if (score > bestScore) {
 bestScore = score;
 bestMatchIndex = i;
 }
 }

 optimized.push(remaining.splice(bestMatchIndex, 1)[0]);
 }

 return optimized;
};

// Helper function to check if two matches have player overlap
const hasPlayerOverlap = (match1: Omit<Match, 'id' | 'date' | 'winner' | 'sets'>, match2: Omit<Match, 'id' | 'date' | 'winner' | 'sets'>): boolean => {
 const players1 = [...match1.team1, ...match1.team2];
 const players2 = [...match2.team1, ...match2.team2];

 return players1.some(p1 => players2.includes(p1));
};

// Helper function to count player overlap between two matches
const countPlayerOverlap = (match1: Omit<Match, 'id' | 'date' | 'winner' | 'sets'>, match2: Omit<Match, 'id' | 'date' | 'winner' | 'sets'>): number => {
 const players1 = [...match1.team1, ...match1.team2];
 const players2 = [...match2.team1, ...match2.team2];

 return players1.filter(p1 => players2.includes(p1)).length;
};

// Generate finals matches for top 4 teams
const generateFinalsMatches = (
 top4Standings: TournamentStandingEntry[],
 playoffType: 'finals_only' | 'semifinals' = 'finals_only',
): Omit<Match, 'id' | 'date' | 'winner' | 'sets'>[] => {
 if (top4Standings.length < 4) return [];

 if (playoffType === 'semifinals') {
 return [
 {
 team1: [top4Standings[0].team[0].id, top4Standings[0].team[1].id],
 team2: [top4Standings[3].team[0].id, top4Standings[3].team[1].id],
 phase: 'semifinal',
 },
 {
 team1: [top4Standings[1].team[0].id, top4Standings[1].team[1].id],
 team2: [top4Standings[2].team[0].id, top4Standings[2].team[1].id],
 phase: 'semifinal',
 },
 ];
 }

 const matches: Omit<Match, 'id' | 'date' | 'winner' | 'sets'>[] = [];

 // Finale 1°-2° posto
 matches.push({
 team1: [top4Standings[0].team[0].id, top4Standings[0].team[1].id],
 team2: [top4Standings[1].team[0].id, top4Standings[1].team[1].id],
 phase: 'final_1_2',
 });

 // Finale 3°-4° posto
 matches.push({
 team1: [top4Standings[2].team[0].id, top4Standings[2].team[1].id],
 team2: [top4Standings[3].team[0].id, top4Standings[3].team[1].id],
 phase: 'final_3_4',
 });

 return matches;
};

// Generate Americano matches using Circle Method (1-factorization)
// CORRECT algorithm: each player partners with ALL others exactly once
// Opponents also rotate to maximize variety
const generateAmericanoMatches = (
  pairs: [Player, Player][],
  fields: number,
  rounds: number
): Omit<Match, 'id' | 'date' | 'winner' | 'sets'>[] => {
  const matches: Omit<Match, 'id' | 'date' | 'winner' | 'sets'>[] = [];
  const players = pairs.flat(); // All individual players
  const n = players.length;

  if (n % 2 !== 0) {
    throw new Error('Americano requires an even number of players');
  }

  // Maximum active players per round given available fields
  const maxActivePlayers = Math.min(n, fields * 4);
  const playersPerRound = Math.floor(maxActivePlayers / 4) * 4;
  const benchedPerRound = n - playersPerRound;

  // Track total benched count and played count for fair distribution
  const benchedCounts = new Map<string, number>();
  const partnerHistory = new Map<string, Set<string>>();

  players.forEach(p => {
    benchedCounts.set(p.id, 0);
    partnerHistory.set(p.id, new Set());
  });

  let currentArrangement = [...players];

  const rotate = (arr: Player[]): Player[] => {
    if (arr.length <= 1) return arr;
    const fixed = arr[0];
    const rest = arr.slice(1);
    const last = rest.pop() as Player;
    return [fixed, last, ...rest];
  };

  for (let r = 0; r < rounds; r++) {
    let activePlayers: Player[] = [];

    if (benchedPerRound > 0) {
      // Sort players by benched count ascending (players with least rests get benched first)
      const sortedByBenched = [...currentArrangement].sort((a, b) => {
        const bA = benchedCounts.get(a.id) || 0;
        const bB = benchedCounts.get(b.id) || 0;
        return bA - bB;
      });

      const benchedThisRound = sortedByBenched.slice(0, benchedPerRound);
      benchedThisRound.forEach(p => {
        benchedCounts.set(p.id, (benchedCounts.get(p.id) || 0) + 1);
      });

      const benchedIds = new Set(benchedThisRound.map(p => p.id));
      activePlayers = currentArrangement.filter(p => !benchedIds.has(p.id));
    } else {
      activePlayers = [...currentArrangement];
    }

    // Pair active players for this round
    const numActive = activePlayers.length;
    const roundPairs: [Player, Player][] = [];
    for (let i = 0; i < numActive / 2; i++) {
      const p1 = activePlayers[i];
      const p2 = activePlayers[numActive - 1 - i];
      roundPairs.push([p1, p2]);

      partnerHistory.get(p1.id)?.add(p2.id);
      partnerHistory.get(p2.id)?.add(p1.id);
    }

    // Match pairs together
    let pairsForMatching = [...roundPairs];
    if (r % 2 === 1 && pairsForMatching.length > 2) {
      pairsForMatching = [
        roundPairs[0],
        ...roundPairs.slice(2),
        roundPairs[1]
      ];
    }

    const matchesCount = Math.floor(pairsForMatching.length / 2);
    for (let i = 0; i < matchesCount; i++) {
      const pair1 = pairsForMatching[i * 2];
      const pair2 = pairsForMatching[i * 2 + 1];

      if (pair1 && pair2) {
        matches.push({
          team1: [pair1[0].id, pair1[1].id],
          team2: [pair2[0].id, pair2[1].id],
          roundNumber: r + 1
        });
      }
    }

    currentArrangement = rotate(currentArrangement);
  }

  return matches;
};

const TournamentFlow: React.FC<TournamentFlowProps> = ({ pairs, onFinish, preselectedTournamentName, clearPreselectedTournament, forceExistingTournament = false, initialFormat }) => {
  const { tournaments, addMultipleMatches, getPlayerById } = usePadelStore();
  const [selectedFormat, setSelectedFormat] = useState<TournamentFormat | null>(initialFormat || null);

  const getInitialStep = (): Step => {
    // If an initial format was explicitly passed (e.g. from Torneo Singolo format-first flow)
    if (initialFormat) {
      switch (initialFormat) {
        case 'americano': return 'americano-info';
        case 'round-robin-finali': return 'round-robin-info';
        case 'torneo-libero': return 'torneo-libero-setup';
        case 'gironi-fase-finale': return 'gironi-setup';
        case 'eliminazione-diretta': return 'setup';
        default: return 'setup';
      }
    }

    // For Multi Giornata (where format is chosen AFTER pairs draw), start at 'tournament-selection'!
    return 'tournament-selection';
  };

 const [step, setStep] = useState<Step>(getInitialStep());
 const [tournamentDate, setTournamentDate] = useState(new Date().toISOString().split('T')[0]);
 const [clubName, setClubName] = useState('');
 const [tournamentName, setTournamentName] = useState('');
 const [selectedTournamentName, setSelectedTournamentName] = useState('');
 const [isCreatingNew, setIsCreatingNew] = useState(initialFormat ? true : !forceExistingTournament);

 // Log whenever isCreatingNew changes
 React.useEffect(() => {
 console.log('🔄 isCreatingNew changed to:', isCreatingNew);
 }, [isCreatingNew]);

 React.useEffect(() => {
 if (forceExistingTournament) {
 setIsCreatingNew(false);
 }
 }, [forceExistingTournament]);

 // Handle preselected tournament (auto-select existing tournament for new giornata)
 React.useEffect(() => {
 if (preselectedTournamentName && step === 'setup') {
 console.log('🎯 Auto-selecting existing tournament:', preselectedTournamentName);
 setIsCreatingNew(false); // Use existing tournament mode
 setSelectedTournamentName(preselectedTournamentName);
 // Find and set the tournament type from existing tournaments
 const existingTournament = tournaments.find(t =>
 (t.giornataName || t.name) === preselectedTournamentName
 );
 if (existingTournament) {
 setSavedTournamentType(existingTournament.type);
 setClubName(existingTournament.club);
 }
 }
 }, [preselectedTournamentName, step, tournaments]);

 const [matchScores, setMatchScores] = useState<Record<number, SetScore[]>>({});
 const [finalStandings, setFinalStandings] = useState<TournamentStandingEntry[]>([]);
 const [createdTournament, setCreatedTournament] = useState<Tournament | null>(null);
 const [completedMatches, setCompletedMatches] = useState<Match[]>([]);
 const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [isSavingCalendar, setIsSavingCalendar] = useState(false);
 const [isCalendarSavedModalOpen, setIsCalendarSavedModalOpen] = useState(false);

 // Americano specific states
 const [americanoFields, setAmericanoFields] = useState(2);

 // Round Robin + Finali specific states
 const [roundRobinMatches, setRoundRobinMatches] = useState<Omit<Match, 'id' | 'date' | 'winner' | 'sets'>[]>([]);
 const [roundRobinScores, setRoundRobinScores] = useState<Record<number, SetScore[]>>({});
 const [roundRobinStandings, setRoundRobinStandings] = useState<TournamentStandingEntry[]>([]);
 const [finalsMatches, setFinalsMatches] = useState<Omit<Match, 'id' | 'date' | 'winner' | 'sets'>[]>([]);
 const [roundRobinSemifinalMatches, setRoundRobinSemifinalMatches] = useState<Omit<Match, 'id'>[]>([]);
 const [roundRobinFields, setRoundRobinFields] = useState<number>(2);
 const [roundRobinHomeAway, setRoundRobinHomeAway] = useState<boolean>(false);
 const [roundRobinPlayoffType, setRoundRobinPlayoffType] = useState<'no_finals' | 'finals_only' | 'semifinals'>('semifinals');
 const [resultValidationError, setResultValidationError] = useState<string | null>(null);

 // Torneo Libero specific states
 const [numeroPartite, setNumeroPartite] = useState<number>(1);
 const [nomeTorneoLibero, setNomeTorneoLibero] = useState<string>('');
 const [torneoLiberoMode, setTorneoLiberoMode] = useState<'fixed' | 'rotating'>('fixed');
 const [torneoLiberoMatches, setTorneoLiberoMatches] = useState<Array<{
 team1: string | null;
 team2: string | null;
 team1Player1: string | null;
 team1Player2: string | null;
 team2Player1: string | null;
 team2Player2: string | null;
 scores: SetScore[];
 }>>([]);
 const [finalsScores, setFinalsScores] = useState<Record<number, SetScore[]>>({});
 const [showFinalsModal, setShowFinalsModal] = useState(false);
 const [showFinalsConfirmModal, setShowFinalsConfirmModal] = useState(false);

 // Gironi states
 const [numGironi, setNumGironi] = useState<number>(2);
 const [useSeeds, setUseSeeds] = useState<boolean>(false);
 const [selectedSeeds, setSelectedSeeds] = useState<[Player, Player][]>([]);
 const [gironi, setGironi] = useState<[Player, Player][][]>([]);
 const [gironiMatches, setGironiMatches] = useState<Match[][]>([]);
 const [gironiStandings, setGironiStandings] = useState<any[]>([]);
 const [gironiPlayoffType, setGironiPlayoffType] = useState<GironiPlayoffType>('semifinals');
 const [gironiQuarterfinalsMatches, setGironiQuarterfinalsMatches] = useState<Match[]>([]);
 const [gironiSemifinalsMatches, setGironiSemifinalsMatches] = useState<Match[]>([]);
 const [gironiFinalsMatches, setGironiFinalsMatches] = useState<Match[]>([]);
 const [isTournamentSaved, setIsTournamentSaved] = useState(false);
 const [americanoRounds, setAmericanoRounds] = useState(2);
 const [americanoScoringType, setAmericanoScoringType] = useState<'games-diff' | 'points'>('games-diff');
 const [savedTournamentType, setSavedTournamentType] = useState<string>('');
 const [roundRobinMatchCount, setRoundRobinMatchCount] = useState(0); // Track number of round robin matches for print

 const existingTournamentNames = useMemo(() => {
 // Solo tornei senza giornataName (tornei"serie", non giornate)
 const tournamentSeries = tournaments.filter(t => !t.giornataName && t.type !== TournamentType.TorneoASquadre);
 return Array.from(new Set(tournamentSeries.map(t => t.name)));
 }, [tournaments]);

 // Helper function to determine if current tournament is Round Robin + Finali
 const isRoundRobinFinali = useMemo(() => {
 // Check selected format first (for new tournaments)
 if (selectedFormat === 'round-robin-finali') {
 console.log('✅ isRoundRobinFinali = true (from selectedFormat)');
 return true;
 }
 // Then check saved tournament type (for existing tournaments)
 if (savedTournamentType === 'Round Robin + Finali') {
 console.log('✅ isRoundRobinFinali = true (from savedTournamentType)');
 return true;
 }
 console.log('❌ isRoundRobinFinali = false (selectedFormat:', selectedFormat, ', savedTournamentType:', savedTournamentType, ')');
 return false;
 }, [selectedFormat, savedTournamentType]);

 const tournamentMatches = useMemo(() => {
 if (selectedFormat === 'americano') {
 return generateAmericanoMatches(pairs, americanoFields, americanoRounds);
 }
 return generateRoundRobinMatches(pairs);
 }, [pairs, selectedFormat, americanoFields, americanoRounds]);

 const normalizedTournamentRounds = useMemo(() => normalizeTournamentRounds(
   tournamentMatches,
   selectedFormat === 'americano' ? TournamentType.Americano : TournamentType.TorneOtto,
   { fields: selectedFormat === 'americano' ? americanoFields : 2 },
 ), [tournamentMatches, selectedFormat, americanoFields]);

 const tournamentRoundByMatch = useMemo(() => new Map(
   normalizedTournamentRounds.flatMap(round => round.matches.map(item => [item.match, round] as const)),
 ), [normalizedTournamentRounds]);

    // Determine available tournament formats based on number of pairs
    const getAvailableFormats = (): TournamentFormat[] => {
 const numPairs = pairs.length;

 if (numPairs === 2) {
 // Se ci sono solo 2 coppie, possono solo fare un match singolo "amichevole" (Torneo Libero)
 return ['torneo-libero'];
 }

 if (numPairs === 3) {
 return []; // No buttons for 3 pairs
 } else if (numPairs === 4) {
 return ['torneotto-30', 'round-robin-finali', 'americano', 'torneo-libero', 'beat-the-box', 'eliminazione-diretta'];
 } else if (numPairs === 5) {
 return ['round-robin-finali', 'torneo-libero', 'eliminazione-diretta'];
 } else if (numPairs >= 6 && numPairs % 2 === 0) {
 return ['round-robin-finali', 'americano', 'torneo-libero', 'gironi-fase-finale', 'beat-the-box', 'eliminazione-diretta'];
 } else if (numPairs >= 6) {
 return ['round-robin-finali', 'americano', 'torneo-libero', 'gironi-fase-finale', 'eliminazione-diretta'];
 }

 return [];
 };

 const getFormatDisplayName = (format: TournamentFormat): string => {
 switch (format) {
 case 'torneotto-30': return 'TorneOtto 30\'';
 case 'round-robin-finali': return 'Round Robin + Finali';
 case 'americano': return 'Americano';
 case 'torneo-libero': return 'Torneo Libero';
 case 'gironi-fase-finale': return 'Gironi + Fase Finale';
 case 'beat-the-box': return 'Beat the Box';
 case 'eliminazione-diretta': return 'Eliminazione Diretta';
 default: return '';
 }
 };

 const handleFormatSelection = (format: TournamentFormat) => {
    console.log('🎨 handleFormatSelection called with:', format);

    // Set the selected format
    setSelectedFormat(format);

    // Reset tournament state but keep the format
    setSavedTournamentType('');
    setSelectedTournamentName('');
    setClubName('');
    setTournamentName('');
    setIsCreatingNew(true);

    // Route to format-specific info/setup screen if required:
    if (format === 'americano') {
      setStep('americano-info');
    } else if (format === 'round-robin-finali') {
      setStep('round-robin-info');
    } else if (format === 'torneo-libero') {
      setStep('torneo-libero-setup');
    } else if (format === 'gironi-fase-finale') {
      setStep('gironi-setup');
    } else if (format === 'eliminazione-diretta') {
      setStep('setup');
    } else {
      setStep('setup');
    }
  };

  // Calculate max unique rounds for Americano: (numPlayers - 1), where numPlayers = pairs.length * 2
  const maxAmericanoRounds = pairs.length * 2 - 1;

 const handleAmericanoInfoContinue = () => {
 setStep('setup');
 };

 // Torneo Libero handlers
 const handleTorneoLiberoSetup = () => {
 // Initialize matches array based on numeroPartite
 const matches = Array.from({ length: numeroPartite }, () => ({
 team1: null as string | null,
 team2: null as string | null,
 team1Player1: null as string | null,
 team1Player2: null as string | null,
 team2Player1: null as string | null,
 team2Player2: null as string | null,
 scores: [{ team1: 0, team2: 0 }] as SetScore[]
 }));
 setTorneoLiberoMatches(matches);
 setStep('torneo-libero-scoring');
 };

 const handleTorneoLiberoTeamChange = (matchIndex: number, team: 'team1' | 'team2', teamId: string | null) => {
 setTorneoLiberoMatches(prev => prev.map((match, index) =>
 index === matchIndex ? { ...match, [team]: teamId } : match
 ));
 };

 const handleTorneoLiberoPlayerChange = (
 matchIndex: number,
 field: 'team1Player1' | 'team1Player2' | 'team2Player1' | 'team2Player2',
 playerId: string | null
 ) => {
 setTorneoLiberoMatches(prev => prev.map((match, index) =>
 index === matchIndex ? { ...match, [field]: playerId } : match
 ));
 };

 const handleTorneoLiberoScoresChange = (matchIndex: number, scores: SetScore[]) => {
 setTorneoLiberoMatches(prev => prev.map((match, index) =>
 index === matchIndex ? { ...match, scores } : match
 ));
 };

 const handleGenerateGironi = () => {
 console.log(`🎯 Generating ${numGironi} gironi for ${pairs.length} pairs, useSeeds: ${useSeeds}`);

 if (useSeeds && selectedSeeds.length !== numGironi) {
 showHIGAlert(`Per favore seleziona esattamente ${numGironi} coppie teste di serie`);
 return;
 }

 let pairsToDistribute = [...pairs];
 const newGironi: [Player, Player][][] = Array.from({ length: numGironi }, () => []);

 if (useSeeds) {
 // Prima distribuisci le teste di serie (una per girone)
 selectedSeeds.forEach((seed, idx) => {
 newGironi[idx].push(seed);
 });

 // Poi distribuisci le altre coppie casualmente
 const nonSeeds = pairs.filter(p =>
 !selectedSeeds.some(s => `${s[0].id}-${s[1].id}` === `${p[0].id}-${p[1].id}`)
 ).sort(() => Math.random() - 0.5);

 nonSeeds.forEach((pair, idx) => {
 const gironeIndex = idx % numGironi;
 newGironi[gironeIndex].push(pair);
 });
 } else {
 // Sorteggio casuale senza teste di serie
 pairsToDistribute = pairsToDistribute.sort(() => Math.random() - 0.5);
 pairsToDistribute.forEach((pair, idx) => {
 const gironeIndex = idx % numGironi;
 newGironi[gironeIndex].push(pair);
 });
 }

 setGironi(newGironi);

 // Genera partite round robin per ogni girone
 const allGironiMatches: Match[][] = newGironi.map((gironePairs, groupIndex) =>
 generateRoundRobinMatches(gironePairs).map(match => ({
 ...match,
 sets: [{ team1: 0, team2: 0 }],
 winner: null as 'team1' | 'team2' | null,
 date: tournamentDate,
 phase: 'group',
 groupNumber: groupIndex + 1,
 })) as Match[]
 );

 setGironiMatches(allGironiMatches);
 setStep('setup');
 };

 const handleGironiComplete = () => {
 console.log('🎯 Gironi completati, calcolo classifiche');

 // Calcola classifica per ogni girone
 const standings: any[] = gironi.map((gironePairs, gironeIdx) => {
 const gironeMatches = gironiMatches[gironeIdx];
 const pairStats = new Map<string, { pair: [Player, Player]; punti: number; gamesWon: number; gamesLost: number; matchesPlayed: number }>();

 // Inizializza statistiche
 gironePairs.forEach(pair => {
 const pairKey = `${pair[0].id}-${pair[1].id}`;
 pairStats.set(pairKey, {
 pair,
 punti: 0,
 gamesWon: 0,
 gamesLost: 0,
 matchesPlayed: 0
 });
 });

 // Calcola statistiche dalle partite
 gironeMatches.forEach(match => {
 const team1Key = `${match.team1[0]}-${match.team1[1]}`;
 const team2Key = `${match.team2[0]}-${match.team2[1]}`;

 const team1Games = match.sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = match.sets.reduce((sum, set) => sum + set.team2, 0);

 const team1Stat = pairStats.get(team1Key);
 const team2Stat = pairStats.get(team2Key);

 if (team1Stat) {
 team1Stat.matchesPlayed += 1;
 team1Stat.gamesWon += team1Games;
 team1Stat.gamesLost += team2Games;
 if (team1Games > team2Games) team1Stat.punti += 3;
 }

 if (team2Stat) {
 team2Stat.matchesPlayed += 1;
 team2Stat.gamesWon += team2Games;
 team2Stat.gamesLost += team1Games;
 if (team2Games > team1Games) team2Stat.punti += 3;
 }
 });

 // Ordina per punti e differenza games
 return Array.from(pairStats.values()).sort((a, b) => {
 if (b.punti !== a.punti) return b.punti - a.punti;
 return (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost);
 });
 });

 setGironiStandings(standings);

 const qualifiers: any[] = selectGironiQualifiers<any>(standings, gironiPlayoffType);
 if (qualifiers.length !== (gironiPlayoffType === 'quarterfinals' ? 8 : 4)) {
 setResultValidationError('Non ci sono abbastanza coppie qualificate per la fase conclusiva selezionata.');
 return;
 }

 if (gironiPlayoffType === 'quarterfinals') {
 const quarterfinals = buildQuarterfinalPairings(qualifiers).map(([first, second], index) => ({
 id: `temp-gironi-quarterfinal-${index + 1}`,
 team1: [first.entry.pair[0].id, first.entry.pair[1].id] as [string, string],
 team2: [second.entry.pair[0].id, second.entry.pair[1].id] as [string, string],
 sets: [{ team1: 0, team2: 0 }],
 winner: null,
 phase: 'quarterfinal' as const,
 roundNumber: 1,
 date: tournamentDate,
 }));
 setGironiQuarterfinalsMatches(quarterfinals);
 setGironiSemifinalsMatches([]);
 setStep('gironi-standings-intro');
 return;
 }

 const semifinalisti = qualifiers.map(qualifier => qualifier.entry);

 // Crea le semifinali
 // Semi 1: 1°A vs migliore 2ª (o 2ª seconda)
 // Semi 2: 1°B vs 1°C (o 1°D se 4 gironi)
 const semi1 = {
 team1: [semifinalisti[0].pair[0].id, semifinalisti[0].pair[1].id] as [string, string],
 team2: [semifinalisti[3].pair[0].id, semifinalisti[3].pair[1].id] as [string, string],
 sets: [{ team1: 0, team2: 0 }],
 winner: null as 'team1' | 'team2' | null,
 date: tournamentDate
 };

 const semi2 = {
 team1: [semifinalisti[1].pair[0].id, semifinalisti[1].pair[1].id] as [string, string],
 team2: [semifinalisti[2].pair[0].id, semifinalisti[2].pair[1].id] as [string, string],
 sets: [{ team1: 0, team2: 0 }],
 winner: null as 'team1' | 'team2' | null,
 date: tournamentDate
 };

 setGironiSemifinalsMatches([semi1, semi2]);
 setStep('gironi-standings-intro');
 };

 const handleQuarterfinalsComplete = () => {
 const outcomes = gironiQuarterfinalsMatches.map(match => validateMatchOutcome({
 sets: match.sets,
 tournamentType: TournamentType.GironiFaseFinale,
 phase: 'quarterfinal',
 }));
 const invalidOutcome = outcomes.find(outcome => outcome.status !== MATCH_OUTCOME.VALID_WIN);
 if (invalidOutcome) {
 setResultValidationError(outcomeErrorMessage(invalidOutcome.status) || 'I quarti devono avere un vincitore');
 return;
 }
 const winners = gironiQuarterfinalsMatches.map((match, index) => outcomes[index].winner === 'team1' ? match.team1 : match.team2);
 setGironiSemifinalsMatches([
 { id: 'temp-gironi-semifinal-1', team1: winners[0], team2: winners[1], sets: [{ team1: 0, team2: 0 }], winner: null, phase: 'semifinal', roundNumber: 2, date: tournamentDate },
 { id: 'temp-gironi-semifinal-2', team1: winners[2], team2: winners[3], sets: [{ team1: 0, team2: 0 }], winner: null, phase: 'semifinal', roundNumber: 2, date: tournamentDate },
 ]);
 setResultValidationError(null);
 setStep('gironi-semifinals');
 };

 const handleSemifinalsComplete = () => {
 console.log('🎯 Semifinali completate, creo finali');

 const outcomes = gironiSemifinalsMatches.map(match => validateMatchOutcome({
 sets: match.sets,
 tournamentType: TournamentType.GironiFaseFinale,
 phase: 'semifinal',
 }));
 const invalidOutcome = outcomes.find(outcome => outcome.status !== MATCH_OUTCOME.VALID_WIN);
 if (invalidOutcome) {
 setResultValidationError(outcomeErrorMessage(invalidOutcome.status) || 'Le semifinali devono avere un vincitore');
 return;
 }
 setResultValidationError(null);

 // Calcola vincitori e perdenti delle semifinali
 const semi1 = gironiSemifinalsMatches[0];
 const semi2 = gironiSemifinalsMatches[1];

 const semi1Winner = outcomes[0].winner as 'team1' | 'team2';
 const semi1Loser = semi1Winner === 'team1' ? 'team2' : 'team1';

 const semi2Winner = outcomes[1].winner as 'team1' | 'team2';
 const semi2Loser = semi2Winner === 'team1' ? 'team2' : 'team1';

 // Crea finale 1°-2°
 const finale12 = {
 team1: semi1Winner === 'team1' ? semi1.team1 : semi1.team2,
 team2: semi2Winner === 'team1' ? semi2.team1 : semi2.team2,
 sets: [{ team1: 0, team2: 0 }],
 winner: null as 'team1' | 'team2' | null,
 date: tournamentDate
 };

 // Crea finalina 3°-4°
 const finale34 = {
 team1: semi1Loser === 'team1' ? semi1.team1 : semi1.team2,
 team2: semi2Loser === 'team1' ? semi2.team1 : semi2.team2,
 sets: [{ team1: 0, team2: 0 }],
 winner: null as 'team1' | 'team2' | null,
 date: tournamentDate
 };

 setGironiFinalsMatches([finale34, finale12]); // Prima finalina, poi finale
 setStep('gironi-finals');
 };

 const handleGironiFinalsConfirm = async () => {
 if (!tournamentDate || !clubName) {
 showHIGAlert('Per favore compila tutti i campi richiesti');
 return;
 }

 setIsSubmitting(true);

 try {
 const finalOutcomes = gironiFinalsMatches.map((match, index) => validateMatchOutcome({
 sets: match.sets,
 tournamentType: TournamentType.GironiFaseFinale,
 phase: index === 0 ? 'final_3_4' : 'final_1_2',
 }));
 const invalidFinal = finalOutcomes.find(outcome => outcome.status !== MATCH_OUTCOME.VALID_WIN);
 if (invalidFinal) {
 setResultValidationError(outcomeErrorMessage(invalidFinal.status) || 'Le finali devono avere un vincitore');
 return;
 }
 setResultValidationError(null);
 // Combina tutte le partite: gironi + semifinali + finali
 const allMatches: Omit<Match, 'id'>[] = [];

 // Aggiungi partite dei gironi
 gironiMatches.forEach((groupMatches, groupIndex) => groupMatches.forEach((match, matchIndex) => {
 const team1Games = match.sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = match.sets.reduce((sum, set) => sum + set.team2, 0);
 allMatches.push({
 ...match,
 winner: team1Games === team2Games ? 'draw' : (team1Games > team2Games ? 'team1' : 'team2'),
 phase: 'group',
 groupNumber: groupIndex + 1,
 roundNumber: match.roundNumber || matchIndex + 1,
 date: tournamentDate
 });
 }));

 // Aggiungi quarti quando previsti
 gironiQuarterfinalsMatches.forEach(match => {
 const quarterOutcome = validateMatchOutcome({
 sets: match.sets,
 tournamentType: TournamentType.GironiFaseFinale,
 phase: 'quarterfinal',
 });
 allMatches.push({
 ...match,
 winner: quarterOutcome.winner,
 phase: 'quarterfinal',
 date: tournamentDate,
 });
 });

 // Aggiungi semifinali
 gironiSemifinalsMatches.forEach((match, index) => {
 const semifinalOutcome = validateMatchOutcome({
 sets: match.sets,
 tournamentType: TournamentType.GironiFaseFinale,
 phase: 'semifinal',
 });
 allMatches.push({
 ...match,
 winner: semifinalOutcome.winner,
 phase: 'semifinal',
 date: tournamentDate
 });
 });

 // Aggiungi finali
 gironiFinalsMatches.forEach((match, index) => {
 const team1Games = match.sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = match.sets.reduce((sum, set) => sum + set.team2, 0);
 allMatches.push({
 ...match,
 winner: finalOutcomes[index].winner,
 phase: index === 0 ? 'final_3_4' : 'final_1_2',
 date: tournamentDate
 });
 });

 const finalTournamentName = isCreatingNew ? tournamentName : selectedTournamentName;
 const tournamentData = {
 name: finalTournamentName,
 type: TournamentType.GironiFaseFinale,
 date: tournamentDate,
 club: clubName,
 matchIds: [],
 status: 'completed' as const,
 numGironi: gironi.length,
 gironiPlayoffType,
 };

 await addMultipleMatches(allMatches, tournamentData);

 const completedGironiMatches = allMatches.map((match, index) => ({
 ...match,
 id: `temp-gironi-match-${index}`,
 })) as Match[];
 const tempCreatedTournament = {
 ...tournamentData,
 id: 'temp-gironi-tournament',
 matchIds: completedGironiMatches.map(match => match.id),
 } as Tournament;
 setCreatedTournament(tempCreatedTournament);
 setCompletedMatches(completedGironiMatches);
 setFinalStandings(calculateTournamentStandings(completedGironiMatches, getPlayerById));

 setStep('results');
 setIsSuccessModalOpen(true);
 } catch (error) {
 console.error('Error creating gironi tournament:', error);
 showHIGAlert('Errore durante la creazione del torneo gironi');
 } finally {
 setIsSubmitting(false);
 }
 };

 const handleTorneoLiberoSaveScheduled = async () => {
 if (!nomeTorneoLibero.trim() || !tournamentDate || !clubName) {
 showHIGAlert('Per favore compila tutti i campi richiesti');
 return;
 }

 setIsSubmitting(true);

 try {
 // Convert torneo libero matches to standard match format
 const matchesToCreate = torneoLiberoMatches
 .filter(match => {
 if (torneoLiberoMode === 'fixed') {
 return match.team1 && match.team2;
 } else {
 return match.team1Player1 && match.team1Player2 &&
 match.team2Player1 && match.team2Player2;
 }
 })
 .map(match => {
 let team1Ids: [string, string], team2Ids: [string, string];

 if (torneoLiberoMode === 'fixed') {
 const team1PairIndex = parseInt(match.team1!.replace('pair-', ''));
 const team2PairIndex = parseInt(match.team2!.replace('pair-', ''));
 team1Ids = [pairs[team1PairIndex][0].id, pairs[team1PairIndex][1].id];
 team2Ids = [pairs[team2PairIndex][0].id, pairs[team2PairIndex][1].id];
 } else {
 team1Ids = [match.team1Player1!, match.team1Player2!];
 team2Ids = [match.team2Player1!, match.team2Player2!];
 }

 return {
 team1: team1Ids,
 team2: team2Ids,
 sets: [{ team1: 0, team2: 0 }], // Empty scores for scheduled matches
 winner: null as 'team1' | 'team2' | null,
 date: tournamentDate
 };
 });

 if (matchesToCreate.length === 0) {
 showHIGAlert('Per favore seleziona almeno una partita completa');
 return;
 }

 // Create tournament with type"Torneo Libero" in scheduled status
 const tournamentData = {
 name: nomeTorneoLibero || (isCreatingNew ? tournamentName : selectedTournamentName),
 type: TournamentType.TorneoLibero,
 date: tournamentDate,
 club: clubName,
 matchIds: [],
 status: 'scheduled' as const,
 giornataName: isCreatingNew ? undefined : selectedTournamentName // Nome del torneo padre
 };

 await addMultipleMatches(matchesToCreate, tournamentData);

 setStep('results');
 setIsSuccessModalOpen(true);
 } catch (error) {
 console.error('Error creating torneo libero scheduled:', error);
 showHIGAlert('Errore durante la creazione del torneo libero');
 } finally {
 setIsSubmitting(false);
 }
 };

 const handleTorneoLiberoConfirm = async () => {
 if (!nomeTorneoLibero.trim() || !tournamentDate || !clubName) {
 showHIGAlert('Per favore compila tutti i campi richiesti');
 return;
 }

 setIsSubmitting(true);

 try {
 // Convert torneo libero matches to standard match format
 const matchesToCreate = torneoLiberoMatches
 .filter(match => {
 if (torneoLiberoMode === 'fixed') {
 return match.team1 && match.team2;
 } else {
 return match.team1Player1 && match.team1Player2 &&
 match.team2Player1 && match.team2Player2;
 }
 })
 .map(match => {
 let team1Ids: [string, string], team2Ids: [string, string];

 if (torneoLiberoMode === 'fixed') {
 const team1PairIndex = parseInt(match.team1!.replace('pair-', ''));
 const team2PairIndex = parseInt(match.team2!.replace('pair-', ''));
 team1Ids = [pairs[team1PairIndex][0].id, pairs[team1PairIndex][1].id];
 team2Ids = [pairs[team2PairIndex][0].id, pairs[team2PairIndex][1].id];
 } else {
 team1Ids = [match.team1Player1!, match.team1Player2!];
 team2Ids = [match.team2Player1!, match.team2Player2!];
 }

 // Calculate winner from sets
 const team1Wins = match.scores.filter(set => set.team1 > set.team2).length;
 const team2Wins = match.scores.filter(set => set.team2 > set.team1).length;
 const winner = team1Wins > team2Wins ? 'team1' as const : 'team2' as const;

 return {
 team1: team1Ids,
 team2: team2Ids,
 sets: match.scores,
 winner: winner,
 date: tournamentDate
 };
 });

 if (matchesToCreate.length === 0) {
 showHIGAlert('Per favore seleziona almeno una partita completa');
 return;
 }

 // Create tournament with type"Torneo Libero" and original tournament name
 const tournamentData = {
 name: nomeTorneoLibero || (isCreatingNew ? tournamentName : selectedTournamentName),
 type: TournamentType.TorneoLibero,
 date: tournamentDate,
 club: clubName,
 matchIds: [],
 status: 'completed' as const,
 giornataName: isCreatingNew ? undefined : selectedTournamentName // Nome del torneo padre
 };

 await addMultipleMatches(matchesToCreate, tournamentData);

 setStep('results');
 setIsSuccessModalOpen(true);
 } catch (error) {
 console.error('Error creating torneo libero:', error);
 showHIGAlert('Errore durante la creazione del torneo libero');
 } finally {
 setIsSubmitting(false);
 }
 };

 // Calculate Americano standings
 const calculateAmericanoStandings = (matches: Match[]): TournamentStandingEntry[] => {
 const playerStats = new Map<string, {
 player: Player;
 totalPoints: number;
 totalGamesWon: number;
 totalGamesLost: number;
 matchesPlayed: number;
 }>();

 // Initialize all players
 const allPlayers = pairs.flat();
 console.log(`🎯 Americano: Initializing ${allPlayers.length} players from ${pairs.length} pairs`);

 allPlayers.forEach(player => {
 playerStats.set(player.id, {
 player,
 totalPoints: 0,
 totalGamesWon: 0,
 totalGamesLost: 0,
 matchesPlayed: 0
 });
 });

 // Process each match
 matches.forEach(match => {
 const team1Players = match.team1.map(id => getPlayerById(id)).filter(Boolean) as Player[];
 const team2Players = match.team2.map(id => getPlayerById(id)).filter(Boolean) as Player[];

 if (team1Players.length === 2 && team2Players.length === 2 && match.sets) {
 const team1Games = match.sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = match.sets.reduce((sum, set) => sum + set.team2, 0);

 // Update stats for each player
 [...team1Players, ...team2Players].forEach(player => {
 const stats = playerStats.get(player.id);
 if (stats) {
 stats.matchesPlayed++;

 if (team1Players.includes(player)) {
 // Player is on team1
 stats.totalPoints += team1Games;
 stats.totalGamesWon += team1Games;
 stats.totalGamesLost += team2Games;
 } else {
 // Player is on team2
 stats.totalPoints += team2Games;
 stats.totalGamesWon += team2Games;
 stats.totalGamesLost += team1Games;
 }
 }
 });
 }
 });

 // Convert to standings array
 const standings: TournamentStandingEntry[] = Array.from(playerStats.values()).map(stats => {
 const gameDifference = stats.totalGamesWon - stats.totalGamesLost;

 return {
 teamId: stats.player.id,
 team: [stats.player],
 points: americanoScoringType === 'games-diff' ? gameDifference : stats.totalPoints,
 gamesWon: stats.totalGamesWon,
 gamesLost: stats.totalGamesLost,
 gameDifference,
 matches: stats.matchesPlayed
 };
 });

 console.log(`🎯 Americano: Created ${standings.length} standings entries`);

 // Sort by points (descending)
 return standings.sort((a, b) => b.points - a.points);
 };

 const handleSetsChange = (matchIndex: number, sets: SetScore[]) => {
 setMatchScores(prev => ({ ...prev, [matchIndex]: sets }));
 };

 const handleRoundRobinSetsChange = (matchIndex: number, sets: SetScore[]) => {
 setRoundRobinScores(prev => ({ ...prev, [matchIndex]: sets }));
 };

 const handleFinalsSetsChange = (matchIndex: number, sets: SetScore[]) => {
 setFinalsScores(prev => ({ ...prev, [matchIndex]: sets }));
 };

 const handleProceedToFinals = () => {
 setShowFinalsModal(false);

 // Get top 4 teams from Round Robin standings
 const top4Standings = roundRobinStandings.slice(0, 4);

 // Generate finals matches
 const finals = generateFinalsMatches(top4Standings, roundRobinPlayoffType === 'semifinals' ? 'semifinals' : 'finals_only');
 setFinalsMatches(finals);
 setFinalsScores({});

 setStep('finals');
 };

 const handleRequestFinishFinals = () => {
 // Check if all scores are entered
 if (Object.keys(finalsScores).length !== finalsMatches.length) {
 showHIGAlert('Per favore inserisci i risultati di tutte le partite finali.');
 return;
 }
 const invalidOutcome = finalsMatches
 .map((match, index) => validateMatchOutcome({
 sets: finalsScores[index],
 tournamentType: TournamentType.RoundRobinFinali,
 phase: match.phase,
 }))
 .find(outcome => outcome.status !== MATCH_OUTCOME.VALID_WIN);
 if (invalidOutcome) {
 setResultValidationError(outcomeErrorMessage(invalidOutcome.status) || 'Ogni partita della fase finale deve avere un vincitore');
 return;
 }
 setResultValidationError(null);

 // Check if tournament was already saved
 if (isTournamentSaved) {
 showHIGAlert('Il torneo è già stato salvato! I risultati non possono essere inseriti di nuovo.');
 return;
 }

 // Show confirmation modal
 setShowFinalsConfirmModal(true);
 };

 const handleFinishFinals = async () => {
 // Double check to prevent duplicate submissions
 if (isTournamentSaved) {
 console.log('⚠️ Tournament already saved, preventing duplicate submission');
 return;
 }

 setShowFinalsConfirmModal(false);

 if (roundRobinPlayoffType === 'semifinals' && roundRobinSemifinalMatches.length === 0 && finalsMatches.every(match => match.phase === 'semifinal')) {
 const completedSemifinals = finalsMatches.map((match, index) => ({
 ...match,
 date: new Date(tournamentDate).toISOString(),
 sets: finalsScores[index],
 winner: validateMatchOutcome({ sets: finalsScores[index], phase: 'semifinal' }).winner,
 phase: 'semifinal' as const,
 }));
 const firstWinner = completedSemifinals[0].winner === 'team1' ? completedSemifinals[0].team1 : completedSemifinals[0].team2;
 const firstLoser = completedSemifinals[0].winner === 'team1' ? completedSemifinals[0].team2 : completedSemifinals[0].team1;
 const secondWinner = completedSemifinals[1].winner === 'team1' ? completedSemifinals[1].team1 : completedSemifinals[1].team2;
 const secondLoser = completedSemifinals[1].winner === 'team1' ? completedSemifinals[1].team2 : completedSemifinals[1].team1;
 setRoundRobinSemifinalMatches(completedSemifinals);
 setFinalsMatches([
 { team1: firstWinner, team2: secondWinner, phase: 'final_1_2' },
 { team1: firstLoser, team2: secondLoser, phase: 'final_3_4' },
 ]);
 setFinalsScores({});
 setResultValidationError(null);
 return;
 }
 setIsSubmitting(true);
 setIsTournamentSaved(true);

 try {
 const finalName = isCreatingNew ? tournamentName : selectedTournamentName;

 // Combine Round Robin and Finals matches
 const allMatches = [...roundRobinMatches, ...roundRobinSemifinalMatches, ...finalsMatches];

 // Reindex finals scores to avoid overwriting round robin scores
 const reindexedFinalsScores: Record<number, SetScore[]> = {};
 Object.keys(finalsScores).forEach(key => {
 const newIndex = roundRobinMatches.length + roundRobinSemifinalMatches.length + parseInt(key);
 reindexedFinalsScores[newIndex] = finalsScores[parseInt(key)];
 });
 const semifinalScores = Object.fromEntries(roundRobinSemifinalMatches.map((match, index) => [roundRobinMatches.length + index, match.sets]));
 const allScores = { ...roundRobinScores, ...semifinalScores, ...reindexedFinalsScores };

 console.log('🎯 Round Robin matches:', roundRobinMatches.length);
 console.log('🎯 Finals matches:', finalsMatches.length);
 console.log('🎯 Total matches:', allMatches.length);
 console.log('🎯 Round Robin scores keys:', Object.keys(roundRobinScores));
 console.log('🎯 Finals scores keys (reindexed):', Object.keys(reindexedFinalsScores));

 const newTournamentData: Omit<Tournament, 'id'> = {
 name: finalName,
 type: TournamentType.RoundRobinFinali,
 date: new Date(tournamentDate).toISOString(),
 club: clubName,
 matchIds: [],
 status: 'completed'
 ,roundRobinPlayoffType,
 roundRobinFields,
 roundRobinHomeAway: roundRobinHomeAway,
 };

 const finalMatches: Omit<Match, 'id'>[] = allMatches.map((match, index) => {
 const sets = allScores[index] || [{ team1: 0, team2: 0 }];
 const team1Games = sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum, set) => sum + set.team2, 0);
 return {
 ...match,
 date: new Date(tournamentDate).toISOString(),
 sets,
 winner: validateMatchOutcome({
 sets,
 tournamentType: TournamentType.RoundRobinFinali,
 phase: match.phase || 'round_robin',
 }).winner,
 phase: match.phase || 'round_robin',
 };
 });

 // This single call to the store now handles creating the tournament, matches, and recalculating all ELOs on the backend.
 await addMultipleMatches(finalMatches, newTournamentData);

 // Mark tournament as saved to prevent duplicate submissions
 setIsTournamentSaved(true);

 // For display purposes, we can calculate standings on the client with the data we have.
 const tempCompletedMatches = finalMatches.map((m, i) => ({
 ...m,
 id: `temp_${i}`,
 })) as Match[];

 // Calculate final standings based on finals results, not points!
 const standings = calculateFinalStandingsForRoundRobinFinali(
 tempCompletedMatches,
 roundRobinMatches.length,
 getPlayerById
 );
 setFinalStandings(standings);

 const createdTournament: Tournament = {
 id: 'temp',
 name: finalName,
 type: TournamentType.RoundRobinFinali,
 date: new Date(tournamentDate).toISOString(),
 club: clubName,
 matchIds: [],
 status: 'completed'
 };

 setCreatedTournament(createdTournament);
 setCompletedMatches(tempCompletedMatches);

 // Redirect to results step and show success modal
 setStep('results');
 setIsSuccessModalOpen(true);

 } catch (error) {
 console.error('Error creating tournament:', error);
 showHIGAlert('Errore nella creazione del torneo. Riprova.');
 setIsTournamentSaved(false); // Reset flag on error
 } finally {
 setIsSubmitting(false);
 }
 };

 const handleStartScoring = () => {
 console.log('🚀 handleStartScoring called');
 console.log('🎯 selectedFormat:', selectedFormat);
 console.log('🎯 isRoundRobinFinali:', isRoundRobinFinali);
 console.log('🎯 savedTournamentType:', savedTournamentType);

  const finalName = (isCreatingNew ? tournamentName : selectedTournamentName) || tournamentName || '';
  const finalClub = clubName.trim();
  if (finalName.trim() === '' || finalClub === '') {
    showHIGAlert('Inserisci nome del torneo e circolo.');
    return;
  }
  // For Torneo Libero, go to torneo-libero-setup
 if (selectedFormat === 'torneo-libero') {
 setStep('torneo-libero-setup');
 return;
 }
    // Gironi + Fase Finale: le opzioni e gli accoppiamenti sono già stati
    // configurati prima della schermata nome.
    if (selectedFormat === 'gironi-fase-finale') {
        if (!gironiMatches || gironiMatches.length === 0) {
            showHIGAlert('Configura prima i gironi.');
            setStep('gironi-setup');
            return;
        }
        setStep('gironi-phase');
        return;
    }

    // For TPRA Eliminazione Diretta, go to tpra-flow
    if (selectedFormat === 'eliminazione-diretta') {
        setStep('tpra-flow');
        return;
    }

 // For Beat the Box, render dedicated flow
 if (selectedFormat === 'beat-the-box') {
 // Verifica validità numero coppie
 if (!isBeatTheBoxValid(pairs.length)) {
 showHIGAlert('⚠️ Beat the Box richiede un numero PARI di coppie (4, 6, 8, 10, 12...)');
 setStep('tournament-selection');
 return;
 }
 // Il componente BeatTheBoxFlow verrà renderizzato separatamente
 if (selectedFormat === 'gironi-fase-finale') {
    if (!gironiMatches || gironiMatches.length === 0) {
      handleGenerateGironi();
    }
    setStep('gironi-phase');
    return;
  }

 setStep('scoring'); // Usa 'scoring' come trigger
 return;
 }

 // For Round Robin + Finali, generate Round Robin matches
 if (isRoundRobinFinali) {
 console.log('🎯 Generating Round Robin matches for', pairs.length, 'pairs');
 const matches = generateRoundRobinMatches(pairs);
 console.log('🎯 Generated', matches.length, 'Round Robin matches');
 setRoundRobinMatches(matches);
 setRoundRobinScores({});
 setRoundRobinMatchCount(matches.length); // Store count for printing
 } else {
 console.log('🎯 NOT generating Round Robin matches (isRoundRobinFinali is false)');
 }

 setStep('scoring');
 };

 const handleFinishScoring = async () => {
 // Prevent multiple simultaneous calls
 if (isSubmitting) {
 console.log('⚠️ Already submitting, ignoring duplicate call');
 return;
 }

 console.log('🎯 handleFinishScoring - isRoundRobinFinali:', isRoundRobinFinali);
 console.log('🎯 selectedFormat:', selectedFormat);
 console.log('🎯 savedTournamentType:', savedTournamentType);

 // For Round Robin + Finali, handle Round Robin completion
 if (isRoundRobinFinali) {
 setIsSubmitting(true); // Lock to prevent re-entry
 console.log('🎯 Entering Round Robin + Finali flow');
 console.log('🎯 roundRobinScores:', roundRobinScores);
 console.log('🎯 roundRobinMatches.length:', roundRobinMatches.length);
 console.log('🎯 roundRobinScores keys length:', Object.keys(roundRobinScores).length);

 if (Object.keys(roundRobinScores).length !== roundRobinMatches.length) {
 console.log('⚠️ Not all scores entered!');
 showHIGAlert('Inserisci i risultati di tutte le partite del Round Robin.');
 return;
 }

 console.log('✅ All scores entered, calculating standings...');

 try {
 // Calculate Round Robin standings
 const roundRobinCompletedMatches = roundRobinMatches.map((match, index) => {
 const sets = roundRobinScores[index] || [{ team1: 0, team2: 0 }];
 const team1Games = sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum, set) => sum + set.team2, 0);
 return {
 ...match,
 id: `temp_rr_${index}`,
 date: new Date(tournamentDate).toISOString(),
 sets,
 winner: team1Games === team2Games ? 'draw' : (team1Games > team2Games ? 'team1' : 'team2'),
 };
 }) as Match[];

 console.log('🎯 Round Robin completed matches:', roundRobinCompletedMatches);

 const standings = calculateTournamentStandings(roundRobinCompletedMatches, getPlayerById);
 console.log('🎯 Standings calculated:', standings);

 setRoundRobinStandings(standings);
 if (roundRobinPlayoffType === 'no_finals') {
 const finalName = isCreatingNew ? tournamentName : selectedTournamentName;
 const tournamentData: Omit<Tournament, 'id'> = {
 name: finalName,
 type: TournamentType.RoundRobinFinali,
 date: new Date(tournamentDate).toISOString(),
 club: clubName,
 matchIds: [],
 status: 'completed',
 roundRobinPlayoffType,
 roundRobinFields,
 roundRobinHomeAway,
 };
 const ordinaryMatches = roundRobinCompletedMatches.map(match => ({ ...match, phase: 'round_robin' as const }));
 await addMultipleMatches(ordinaryMatches, tournamentData);
 const createdTournament = { ...tournamentData, id: 'temp' } as Tournament;
 setCreatedTournament(createdTournament);
 setCompletedMatches(ordinaryMatches);
 setFinalStandings(standings);
 setStep('results');
 setIsSuccessModalOpen(true);
 setIsSubmitting(false);
 return;
 }
 console.log('🎯 Standings set, showing finals modal...');

 // Show modal to proceed to finals
 setShowFinalsModal(true);
 console.log('🎯 showFinalsModal set to true');
 setIsSubmitting(false); // Unlock
 return;
 } catch (error) {
 console.error('❌ Error in Round Robin flow:', error);
 showHIGAlert('Errore durante il calcolo della classifica: ' + error);
 setIsSubmitting(false); // Unlock on error
 return;
 }
 }

 // For other formats, continue with existing logic
 if (Object.keys(matchScores).length !== tournamentMatches.length) {
 showHIGAlert('Inserisci i risultati di tutte le partite.');
 return;
 }

 console.log('🎯 Non-RoundRobin tournament - completing tournament');
 console.log('🎯 selectedFormat:', selectedFormat);

 setIsSubmitting(true);
 try {
 const finalName = isCreatingNew ? tournamentName : selectedTournamentName;

 const tournamentType = selectedFormat === 'americano' ? TournamentType.Americano :
 selectedFormat === 'round-robin-finali' ? TournamentType.RoundRobinFinali :
 TournamentType.TorneOtto;

 console.log('🎯 Tournament type being saved:', tournamentType);

 const newTournamentData: Omit<Tournament, 'id'> = {
 name: finalName,
 type: tournamentType,
 date: new Date(tournamentDate).toISOString(),
 club: clubName,
 matchIds: [],
 status: 'completed'
 };

 const finalMatches: Omit<Match, 'id'>[] = tournamentMatches.map((match, index) => {
 const sets = matchScores[index] || [{ team1: 0, team2: 0 }];
 const team1Games = sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum, set) => sum + set.team2, 0);
 return {
 ...match,
 date: new Date(tournamentDate).toISOString(),
 sets,
 winner: team1Games === team2Games ? 'draw' : (team1Games > team2Games ? 'team1' : 'team2'),
 };
 });

 // This single call to the store now handles creating the tournament, matches, and recalculating all ELOs on the backend.
 await addMultipleMatches(finalMatches, newTournamentData);

 // For display purposes, we can calculate standings on the client with the data we have.
 // In a real-world scenario, you might get the final standings back from the API response.
 const tempCompletedMatches = finalMatches.map((m, i) => ({
 ...m,
 id: `temp_${i}`,
 })) as Match[];
 const tempCreatedTournament = {
 ...newTournamentData,
 id: `temp_tournament`
 } as Tournament;


 const standings = selectedFormat === 'americano'
 ? calculateAmericanoStandings(tempCompletedMatches)
 : calculateTournamentStandings(tempCompletedMatches, getPlayerById);
 setFinalStandings(standings);
 setCompletedMatches(tempCompletedMatches);
 setCreatedTournament(tempCreatedTournament);

 setStep('results');
 } catch (error) {
 console.error("Failed to save tournament matches", error);
 showHIGAlert("Si è verificato un errore durante il salvataggio del torneo. Riprova.");
 } finally {
 setIsSubmitting(false);
 }
 };

 const handleFinishAndClose = () => {
 setIsSuccessModalOpen(true);
 };

 const handleSaveCalendar = async () => {
 // Prevent multiple saves
 if (isSavingCalendar) {
 console.log("Already saving calendar, ignoring duplicate request");
 return;
 }

 const finalName = (isCreatingNew ? tournamentName : selectedTournamentName) || tournamentName || preselectedTournamentName || '';
 const finalClub = clubName.trim();
 if (finalName.trim() === '' || finalClub.trim() === '') {
 showHIGAlert('Inserisci il nome del torneo e il nome del circolo.');
 return;
 }

 console.log("🗓️ Starting calendar save process...");
 console.log("🎯 selectedFormat:", selectedFormat);
 console.log("🎯 isRoundRobinFinali:", isRoundRobinFinali);
 setIsSavingCalendar(true);

 try {
 const tournamentType = selectedFormat === 'americano' ? TournamentType.Americano :
 selectedFormat === 'round-robin-finali' ? TournamentType.RoundRobinFinali :
 TournamentType.TorneOtto;

 console.log("🎯 Calculated tournament type:", tournamentType);

 const newTournamentData: Omit<Tournament, 'id'> = {
 name: finalName,
 type: tournamentType,
 date: new Date(tournamentDate).toISOString(),
 club: clubName,
 matchIds: [],
 status: 'scheduled',
 americanoFields: selectedFormat === 'americano' ? americanoFields : undefined,
 americanoScoringType: selectedFormat === 'americano' ? americanoScoringType : undefined
 };

 const matchesToSave = isRoundRobinFinali ? roundRobinMatches : tournamentMatches;
 const scoresToSave = isRoundRobinFinali ? roundRobinScores : matchScores;

 const scheduledMatches: Omit<Match, 'id'>[] = matchesToSave.map((match, index) => {
    const scores = scoresToSave[index] || [{ team1: 0, team2: 0 }];
    const team1Games = scores.reduce((sum, s) => sum + (s.team1 || 0), 0);
    const team2Games = scores.reduce((sum, s) => sum + (s.team2 || 0), 0);
    const hasScores = scores.length > 0 && (team1Games > 0 || team2Games > 0);

    let winner: 'team1' | 'team2' | 'draw' | null = null;
    if (hasScores) {
      const team1Wins = scores.filter(s => s.team1 > s.team2).length;
      const team2Wins = scores.filter(s => s.team2 > s.team1).length;
      if (team1Wins > team2Wins) winner = 'team1';
      else if (team2Wins > team1Wins) winner = 'team2';
      else if (team1Games > team2Games) winner = 'team1';
      else if (team2Games > team1Games) winner = 'team2';
      else winner = 'draw';
    }

    return {
      ...match,
      date: new Date(tournamentDate).toISOString(),
      sets: scores,
      winner: winner,
    };
  });

 console.log(`📝 Saving tournament: ${finalName} with ${scheduledMatches.length} matches`);

 // Save tournament and matches with status 'scheduled'
 const result = await addMultipleMatches(scheduledMatches, newTournamentData);
 console.log("📝 addMultipleMatches result:", result);

 console.log("✅ Tournament saved successfully, showing confirmation modal");
 console.log("🔔 Setting isCalendarSavedModalOpen to true");
 setIsCalendarSavedModalOpen(true);
 console.log("🔔 isCalendarSavedModalOpen set to true");
 } catch (error) {
 console.error("❌ Failed to save tournament calendar:", error);
 showHIGAlert("Si è verificato un errore durante il salvataggio del calendario. Riprova.");
 } finally {
 setIsSavingCalendar(false);
 }
 };

 const handleSaveCalendarGironi = async () => {
 if (isSavingCalendar) return;

 const finalName = isCreatingNew ? tournamentName : selectedTournamentName;
 if (finalName.trim() === '' || clubName.trim() === '') {
 showHIGAlert('Inserisci nome torneo e circolo.');
 return;
 }

 setIsSavingCalendar(true);

 try {
 const newTournamentData: Omit<Tournament, 'id'> = {
 name: finalName,
 type: TournamentType.GironiFaseFinale,
 date: new Date(tournamentDate).toISOString(),
 club: clubName,
 matchIds: [],
 status: 'scheduled',
 numGironi: gironi.length,
 gironiPlayoffType,
 };

  // Create matches - preserving scores if user typed any
  const scheduledMatches: Omit<Match, 'id'>[] = [];
  gironiMatches.forEach((groupMatches, gIndex) => {
    groupMatches.forEach((match, mIndex) => {
       const scores = (match as any).sets && (match as any).sets.length > 0 ? (match as any).sets : [{ team1: 0, team2: 0 }];
      const team1Games = scores.reduce((sum, s) => sum + (s.team1 || 0), 0);
      const team2Games = scores.reduce((sum, s) => sum + (s.team2 || 0), 0);
      const hasScores = scores.length > 0 && (team1Games > 0 || team2Games > 0);

      let winner: 'team1' | 'team2' | 'draw' | null = null;
      if (hasScores) {
        const team1Wins = scores.filter(s => s.team1 > s.team2).length;
        const team2Wins = scores.filter(s => s.team2 > s.team1).length;
        if (team1Wins > team2Wins) winner = 'team1';
        else if (team2Wins > team1Wins) winner = 'team2';
        else if (team1Games > team2Games) winner = 'team1';
        else if (team2Games > team1Games) winner = 'team2';
        else winner = 'draw';
      }

      scheduledMatches.push({
        ...match,
        date: new Date(tournamentDate).toISOString(),
        sets: scores,
        winner: winner,
        phase: 'group',
        groupNumber: gIndex + 1,
        roundNumber: match.roundNumber || mIndex + 1
      });
    });
  });

 await addMultipleMatches(scheduledMatches, newTournamentData);
 setIsCalendarSavedModalOpen(true);
 } catch (error) {
 console.error("Failed to save calendar:", error);
 showHIGAlert("Errore nel salvataggio.");
 } finally {
 setIsSavingCalendar(false);
 }
 };

 const handlePrintGironiBlank = () => {
 const finalTournamentName = isCreatingNew ? tournamentName : selectedTournamentName;
 const emptyTournament: Tournament = {
 id: 'temp',
 name: finalTournamentName,
 type: TournamentType.GironiFaseFinale,
 date: tournamentDate,
 club: clubName,
 matchIds: [],
 status: 'scheduled',
 numGironi: gironi.length,
 gironiPlayoffType,
 };

 printGironiTournament(
 emptyTournament,
 gironiMatches.flat(),
 (id: string) => {
 const allPlayers = pairs.flat();
 return allPlayers.find(p => p.id === id);
 }
 );
 };

 const handlePrintBlank = () => {
    const finalName = isCreatingNew ? tournamentName : selectedTournamentName;
    const tournamentDetails: Tournament = {
      id: 'scheduled-temp',
      name: finalName || 'Nuovo Torneo',
      club: clubName || 'Circolo Padel',
      date: tournamentDate || new Date().toISOString().split('T')[0],
      type: selectedFormat === 'americano' ? TournamentType.Americano :
            selectedFormat === 'round-robin-finali' ? TournamentType.RoundRobinFinali :
            TournamentType.TorneOtto,
      matchIds: [],
      status: 'scheduled'
    };

    // Create a local getPlayerById that works with both pairs and database
    const localGetPlayerById = (id: string): Player | undefined => {
      const allPlayers = pairs.flat();
      const playerFromPairs = allPlayers.find(p => p.id === id);
      if (playerFromPairs) return playerFromPairs;
      return getPlayerById(id);
    };

    // For Round Robin + Finali, use Round Robin matches for printing
    const matchesToPrint = isRoundRobinFinali ? roundRobinMatches : tournamentMatches;

    printTournamentReport(
      tournamentDetails,
      [], // empty standings for blank tabellone
      matchesToPrint,
      localGetPlayerById,
      selectedFormat === 'americano' ? americanoFields : undefined,
      selectedFormat === 'americano' ? americanoScoringType : undefined,
      roundRobinMatches.length,
      finalName,
      roundRobinFields
    );
  };

 const handlePrintTorneoLiberoBlank = () => {
 const finalName = isCreatingNew ? tournamentName : selectedTournamentName;
 const tournamentDetails = {
 name: nomeTorneoLibero || finalName,
 club: clubName,
 date: tournamentDate,
 };

 printTorneoLiberoBlank(tournamentDetails, numeroPartite);
 };

 const handleSelectExistingTournament = (name: string) => {
 console.log('📋 handleSelectExistingTournament called with:', name);
 console.log('📋 isCreatingNew:', isCreatingNew);
 console.log('📋 Current selectedFormat:', selectedFormat);

 // CRITICAL: Ignore ALL calls if we're in"New" mode
 if (isCreatingNew) {
 console.log('⚠️ BLOCKED: Ignoring tournament selection because isCreatingNew is true');
 return;
 }

 setSelectedTournamentName(name);
 if (name) {
 const existingTournament = tournaments.find(t => t.name === name && t.type !== TournamentType.TorneoASquadre);
 console.log('📋 Found existing tournament:', existingTournament);
 if (existingTournament) {
 // Set club name from existing tournament
 setClubName(existingTournament.club);

 // Check if this is a scheduled (unfinished) tournament
 // If so, we need to restore the original format to continue where we left off
 if (existingTournament.status === 'scheduled') {
 console.log('📋 Scheduled tournament detected - restoring original format:', existingTournament.type);
 setSavedTournamentType(existingTournament.type);

 // Also set selectedFormat to match the tournament type
 if (existingTournament.type === TournamentType.RoundRobinFinali) {
 setSelectedFormat('round-robin-finali');
 console.log('📋 Set selectedFormat to: round-robin-finali');
 } else if (existingTournament.type === TournamentType.Americano) {
 setSelectedFormat('americano');
 console.log('📋 Set selectedFormat to: americano');
 } else if (existingTournament.type === TournamentType.TorneOtto) {
 setSelectedFormat('torneotto-30');
 console.log('📋 Set selectedFormat to: torneotto-30');
 }
 } else {
 // For completed tournaments, keep the selectedFormat chosen by the user
 // (they're adding a NEW match day to an existing tournament)
 console.log('📋 Completed tournament - keeping selectedFormat as:', selectedFormat);
 console.log('📋 Adding new match day type:', selectedFormat, 'to tournament:', existingTournament.name);
 }
 }
 } else {
 console.log('📋 Clearing tournament selection');
 setClubName('');
 setSavedTournamentType('');
 }
 };

 const getTeamPlayers = (teamIds: [string, string]): [Player, Player] | null => {
 const p1 = getPlayerById(teamIds[0]);
 const p2 = getPlayerById(teamIds[1]);
 if (p1 && p2) return [p1, p2];
 return null;
 };

 if (step === 'tournament-selection') {
 const availableFormats = getAvailableFormats();

 // If no formats available (3 pairs), show message and return to draw
 if (availableFormats.length === 0) {
 return (
 <Card title="Sorteggio Completato">
 <div className="text-center space-y-4 px-4">
 <p className="text-gray-600 dark:text-gray-400">
 Coppie sorteggiate: <strong>{pairs.length}</strong>
 </p>
 <p className="text-gray-500 dark:text-gray-500">
 Con {pairs.length} coppie non sono disponibili formati di torneo automatici.
 </p>
 <Button onClick={onFinish} variant="outline">Torna al Sorteggio</Button>
 </div>
 </Card>
 );
 }

 return (
 <Card title="Seleziona Formato Torneo">
 <div className="space-y-4 px-4">
 <p className="text-sm text-gray-600 dark:text-gray-400">
 Coppie sorteggiate: <strong>{pairs.length}</strong>
 </p>
 <div className="grid grid-cols-1 gap-3">
 {availableFormats.map((format) => (
 <Button
 key={format}
 onClick={() => handleFormatSelection(format)}
 className="w-full justify-center py-3"
 >
 {getFormatDisplayName(format)}
 </Button>
 ))}
 </div>
 </div>
 </Card>
 );
 }

 if (step === 'americano-info') {
 return (
 <Card title="Info Torneo Americano">
 <div className="space-y-6 px-4">
 <div className="flex items-center gap-2">
 <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
 Formato Selezionato: Americano
 </span>
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
 Numero di campi disponibili
 </label>
 <div className="flex items-center flex-wrap gap-2">
 {[2, 3, 4, 5, 6].map(num => (
 <Button
 key={num}
 type="button"
 variant={americanoFields === num ? "primary" : "secondary"}
 size="sm"
 onClick={() => setAmericanoFields(num)}
 className="!px-4"
 >
 {num}
 </Button>
 ))}
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
 Numero di turni (max: {maxAmericanoRounds})
 </label>
 <div className="relative">
 <div className="overflow-x-auto max-w-full pb-2 pt-1 flex items-center gap-2 flex-nowrap md:flex-wrap">
 {Array.from({ length: maxAmericanoRounds - 1 }, (_, i) => i + 2).map(num => (
 <Button
 key={num}
 type="button"
 variant={americanoRounds === num ? "primary" : "secondary"}
 size="sm"
 onClick={() => setAmericanoRounds(num)}
 className="!px-4 shrink-0"
 >
 {num}
 </Button>
 ))}
 </div>
 <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-white dark:from-gray-900 to-transparent md:hidden" />
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
 Tipo di calcolo punteggio
 </label>
 <div className="flex gap-2">
 <Button
 type="button"
 variant={americanoScoringType === 'games-diff' ? "primary" : "secondary"}
 size="sm"
 onClick={() => setAmericanoScoringType('games-diff')}
 className="flex-1"
 >
 Differenza Games
 </Button>
 <Button
 type="button"
 variant={americanoScoringType === 'points' ? "primary" : "secondary"}
 size="sm"
 onClick={() => setAmericanoScoringType('points')}
 className="flex-1"
 >
 Punti
 </Button>
 </div>
 </div>

 <div className="flex gap-3 mt-6">
  <Button
  onClick={() => {
    if (initialFormat) {
      onFinish();
    } else {
      setStep('tournament-selection');
    }
  }}
  variant="outline"
  className="flex-1"
  >
  Indietro
  </Button>
 <Button
 onClick={handleAmericanoInfoContinue}
 className="flex-1"
 >
 Procedi
 </Button>
 </div>
 {resultValidationError && <p role="alert" className="mt-3 text-sm font-semibold text-red-600 dark:text-red-300">{resultValidationError}</p>}
 </div>
 </Card>
 );
 }

  if (step === 'round-robin-info') {
    return (
      <Card title="Info Round Robin + Finali">
        <div className="space-y-6 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
              Formato Selezionato: Round Robin + Finali
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Numero di campi disponibili
            </label>
            <div className="flex items-center flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6].map(num => (
                <Button
                  key={num}
                  type="button"
                  variant={roundRobinFields === num ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setRoundRobinFields(num)}
                  className="!px-4"
                >
                  {num} {num === 1 ? 'Campo' : 'Campi'}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Formula di svolgimento
            </label>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
              <div>
                <span className="font-semibold text-sm text-gray-900 dark:text-white block">Andata e Ritorno</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 block">Raddoppia il numero delle giornate di campionato</span>
              </div>
              <input
                type="checkbox"
                checked={roundRobinHomeAway}
                onChange={(e) => setRoundRobinHomeAway(e.target.checked)}
                className="w-5 h-5 text-sky-600 rounded focus:ring-sky-500 cursor-pointer"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Scelta Fase Conclusiva
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                className={`border-2 rounded-xl p-4 cursor-pointer text-left ${
                  roundRobinPlayoffType === 'no_finals'
                    ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
                onClick={() => setRoundRobinPlayoffType('no_finals')}
                aria-pressed={roundRobinPlayoffType === 'no_finals'}
              >
                <h4 className="font-bold text-base mb-1">Solo Girone</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Classifica diretta senza playoff finale.
                </p>
              </button>

              <button
                type="button"
                className={`border-2 rounded-xl p-4 cursor-pointer text-left ${
                  roundRobinPlayoffType === 'finals_only'
                    ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
                onClick={() => setRoundRobinPlayoffType('finals_only')}
                aria-pressed={roundRobinPlayoffType === 'finals_only'}
              >
                <h4 className="font-bold text-base mb-1">Solo Finale</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Finale secca 1° vs 2° classificata.
                </p>
              </button>

              <button
                type="button"
                className={`border-2 rounded-xl p-4 cursor-pointer text-left ${
                  roundRobinPlayoffType === 'semifinals'
                    ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
                onClick={() => setRoundRobinPlayoffType('semifinals')}
                aria-pressed={roundRobinPlayoffType === 'semifinals'}
              >
                <h4 className="font-bold text-base mb-1">Semifinali + Finali</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  1° vs 4° e 2° vs 3° prima della finale.
                </p>
              </button>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep('tournament-selection')}
              className="flex-1"
            >
              Indietro
            </Button>
            <Button
              type="button"
              onClick={() => {
                setStep('setup');
              }}
              className="flex-1"
            >
              Avanti - Nome Torneo
            </Button>
          </div>
        </div>
      </Card>
    );
  }

 if (step === 'gironi-setup') {
 // Determina opzioni di gironi disponibili in base al numero di coppie
 const gironiOptions = [];
 if (pairs.length >= 6) gironiOptions.push(2);
 if (pairs.length >= 9) gironiOptions.push(3);
 if (pairs.length >= 12) gironiOptions.push(4);

 return (
 <Card title="Setup Gironi + Fase Finale">
 <div className="space-y-6 px-4">
 <div className="flex items-center gap-2">
 <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
 Formato Selezionato: Gironi + Fase Finale
 </span>
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
 Numero di gironi
 </label>
 <div className="flex gap-3">
 {gironiOptions.map(num => (
 <Button
 key={num}
 onClick={() => setNumGironi(num)}
 variant={numGironi === num ? 'primary' : 'outline'}
 className="flex-1"
 >
 {num} Gironi
 </Button>
 ))}
 </div>
 </div>

 {pairs.length >= 8 && (
 <div>
 <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
 Scelta Fase Conclusiva
 </label>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 <button
 type="button"
 className={`border-2 rounded-xl p-4 cursor-pointer text-left ${gironiPlayoffType === 'semifinals' ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30' : 'border-gray-200 dark:border-gray-700'}`}
 onClick={() => setGironiPlayoffType('semifinals')}
 aria-pressed={gironiPlayoffType === 'semifinals'}
 >
 <h4 className="font-bold text-base mb-1">Semifinali e Finali</h4>
 <p className="text-xs text-gray-500 dark:text-gray-400">Quattro coppie accedono direttamente alle semifinali.</p>
 </button>
 <button
 type="button"
 className={`border-2 rounded-xl p-4 cursor-pointer text-left ${gironiPlayoffType === 'quarterfinals' ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30' : 'border-gray-200 dark:border-gray-700'}`}
 onClick={() => setGironiPlayoffType('quarterfinals')}
 aria-pressed={gironiPlayoffType === 'quarterfinals'}
 >
 <h4 className="font-bold text-base mb-1">Quarti, Semifinali e Finali</h4>
 <p className="text-xs text-gray-500 dark:text-gray-400">Otto coppie accedono al tabellone a eliminazione.</p>
 </button>
 </div>
 </div>
 )}

 <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg space-y-4">
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 checked={useSeeds}
 onChange={(e) => {
 setUseSeeds(e.target.checked);
 if (!e.target.checked) setSelectedSeeds([]);
 }}
 className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-sky-600 focus:ring-sky-500"
 />
 <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
 Coppie Teste di Serie (le coppie più forti non giocano nello stesso girone)
 </span>
 </label>

 {useSeeds && (
 <div className="pl-6 space-y-2 px-4">
 <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
 Seleziona {numGironi} coppie teste di serie:
 </p>
 {pairs.map((pair, idx) => {
 const pairKey = `${pair[0].id}-${pair[1].id}`;
 const isSelected = selectedSeeds.some(s => `${s[0].id}-${s[1].id}` === pairKey);
 const avgElo = (pair[0].currentElo + pair[1].currentElo) / 2;

 return (
 <label key={idx} className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-2 rounded">
 <input
 type="checkbox"
 checked={isSelected}
 onChange={(e) => {
 if (e.target.checked) {
 if (selectedSeeds.length < numGironi) {
 setSelectedSeeds([...selectedSeeds, pair]);
 }
 } else {
 setSelectedSeeds(selectedSeeds.filter(s => `${s[0].id}-${s[1].id}` !== pairKey));
 }
 }}
 disabled={!isSelected && selectedSeeds.length >= numGironi}
 className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-sky-600 focus:ring-sky-500"
 />
 <span className="text-sm">
 {pair[0].name} {pair[0].surname} / {pair[1].name} {pair[1].surname}
 <span className="text-xs text-gray-500 ml-2">(ELO medio: {avgElo.toFixed(2)})</span>
 </span>
 </label>
 );
 })}
 </div>
 )}
 </div>

 <div className="flex gap-3 mt-6">
 <Button
 onClick={() => setStep('setup')}
 variant="outline"
 className="flex-1"
 >
 Indietro
 </Button>
 <Button
 onClick={() => {
 // Genera gironi e passa alla scelta nome o aggancio torneo
 handleGenerateGironi();
 }}
 className="flex-1"
 disabled={useSeeds && selectedSeeds.length !== numGironi}
 >
  Avanti - Impostazioni Torneo
 </Button>
 </div>
 {resultValidationError && <p role="alert" className="mt-3 text-sm font-semibold text-red-600 dark:text-red-300">{resultValidationError}</p>}
 </div>
 </Card>
 );
 }

 if (step === 'gironi-phase') {
 return (
 <>
 <Card title={
 <div className="flex justify-between items-center">
 <span>Fase Gironi - Round Robin</span>
 <Button onClick={handlePrintGironiBlank} variant="ghost" size="sm">
 <span className="flex items-center gap-1"><PrintIcon /> Stampa Tabellone Vuoto</span>
 </Button>
 </div>
 }>
 <div className="space-y-6 px-4">
 {gironi.map((gironePairs, gironeIdx) => {
 const gironeName = String.fromCharCode(65 + gironeIdx); // A, B, C, D
 const gironeMatches = gironiMatches[gironeIdx] || [];

 return (
 <div key={gironeIdx} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
 <h3 className="font-semibold text-lg mb-4">Girone {gironeName}</h3>

 <div className="mb-4 space-y-2 px-4">
 <p className="text-sm text-gray-600 dark:text-gray-400">Coppie:</p>
 {gironePairs.map((pair, idx) => (
 <div key={idx} className="text-sm">
 • {pair[0].name} {pair[0].surname} / {pair[1].name} {pair[1].surname}
 </div>
 ))}
 </div>

 <div className="space-y-3 px-4">
 {gironeMatches.map((match, matchIdx) => {
 const team1Pair = pairs.find(p =>
 (p[0].id === match.team1[0] && p[1].id === match.team1[1]) ||
 (p[0].id === match.team1[1] && p[1].id === match.team1[0])
 );
 const team2Pair = pairs.find(p =>
 (p[0].id === match.team2[0] && p[1].id === match.team2[1]) ||
 (p[0].id === match.team2[1] && p[1].id === match.team2[0])
 );

 if (!team1Pair || !team2Pair) return null;

 return (
 <div key={matchIdx} className="bg-white dark:bg-gray-800 p-3 rounded">
 <div className="grid grid-cols-3 items-center gap-4">
 <div className="text-sm">
 {team1Pair[0].name} {team1Pair[0].surname}<br/>
 {team1Pair[1].name} {team1Pair[1].surname}
 </div>

 <div>
 <MatchScoreInput
 sets={match.sets}
 onSetsChange={(sets) => {
 const newMatches = [...gironiMatches];
 newMatches[gironeIdx][matchIdx] = {
 ...match,
 sets
 };
 setGironiMatches(newMatches);
 }}
 />
 </div>

 <div className="text-sm text-right">
 {team2Pair[0].name} {team2Pair[0].surname}<br/>
 {team2Pair[1].name} {team2Pair[1].surname}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 </div>
 );
 })}

 <div className="flex gap-3 mt-6">
 <Button
 onClick={() => setStep('gironi-setup')}
 variant="outline"
 className="flex-1"
 >
 Indietro
 </Button>
 <Button
 onClick={handleSaveCalendarGironi}
 disabled={isSavingCalendar}
 variant="success"
 className="flex-1"
 >
 {isSavingCalendar ?"Salvataggio..." :"Salva Calendario"}
 </Button>
 <Button
 onClick={() => {
 // TODO: Procedi alle semifinali
 handleGironiComplete();
 }}
 className="flex-1"
 >
 Procedi {gironiPlayoffType === 'quarterfinals' ? 'ai Quarti' : 'alle Semifinali'}
 </Button>
 </div>
 </div>
 </Card>

 {/* Calendar Saved Modal */}
 {isCalendarSavedModalOpen && (
 <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
 <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
 <div className="mt-3 text-center">
 <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
 <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
 </svg>
 </div>
 <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100 mt-4">
 Calendario Salvato!
 </h3>
 <div className="mt-2 px-7 py-3">
 <p className="text-sm text-gray-500 dark:text-gray-400">
 Il calendario del torneo è stato salvato con successo. Puoi tornare in un secondo momento per inserire i risultati.
 </p>
 </div>
 <div className="items-center px-4 py-3">
 <Button
 onClick={() => {
 setIsCalendarSavedModalOpen(false);
 onFinish();
 }}
 className="w-full"
 >
 Chiudi
 </Button>
 </div>
 </div>
 </div>
 </div>
 )}
 </>
 );
 }


 if (step === 'gironi-standings-intro') {
 const gironiEntryKey = (entry: any) =>
 entry?.pair ? [entry.pair[0].id, entry.pair[1].id].sort().join('-') : '';
 const qualifiers: any[] = selectGironiQualifiers<any>(gironiStandings, gironiPlayoffType);
 const qualifiedEntries = qualifiers.map(qualifier => qualifier.entry);
 const qualifiedKeys = new Set(qualifiedEntries.map(gironiEntryKey));

 return (
 <Card title="Classifiche Gironi">
 <div className="space-y-6 px-4">
 <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-ios-blue">
 <h3 className="font-semibold text-ios-blue dark:text-ios-blue mb-2">Fase Gironi Completata!</h3>
 <p className="text-sm text-ios-blue dark:text-ios-blue">
 Ecco le classifiche finali dei gironi. Le squadre qualificate per {gironiPlayoffType === 'quarterfinals' ? 'i quarti' : 'le semifinali'} sono evidenziate in verde.
 </p>
 </div>

 {gironiStandings.map((standing, gironeIdx) => {
 const gironeName = String.fromCharCode(65 + gironeIdx); // A, B, C, D

 return (
 <div key={gironeIdx} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
 <h3 className="font-semibold text-lg mb-3 text-gray-800 dark:text-gray-200">Girone {gironeName}</h3>

 <div className="overflow-x-auto">
 <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
 <thead className="bg-gray-100 dark:bg-gray-800">
 <tr>
 <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pos</th>
 <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Squadra</th>
 <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Punti</th>
 <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">GW</th>
 <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">GL</th>
 <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Diff</th>
 </tr>
 </thead>
 <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
 {standing.map((entry: any, idx: number) => {
 const isQualified = qualifiedKeys.has(gironiEntryKey(entry));

 return (
 <tr key={idx} className={isQualified ?"bg-green-50 dark:bg-green-900/30" :""}>
 <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
 {idx + 1}°
 </td>
 <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">
 {entry.pair[0].name} {entry.pair[0].surname} & {entry.pair[1].name} {entry.pair[1].surname}
 </td>
 <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white font-semibold">
 {entry.punti}
 </td>
 <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
 {entry.gamesWon}
 </td>
 <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
 {entry.gamesLost}
 </td>
 <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">
 {entry.gamesWon - entry.gamesLost > 0 ? '+' : ''}{entry.gamesWon - entry.gamesLost}
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </div>
 );
 })}

 <div className="mt-6 p-3 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-800">
 <h4 className="font-semibold text-green-900 dark:text-green-200 mb-2">Qualificati {gironiPlayoffType === 'quarterfinals' ? 'ai Quarti' : 'alle Semifinali'}:</h4>
 <ul className="text-sm text-green-800 dark:text-green-300 space-y-1 px-4">
 {qualifiers.map((qualifier: any) => (
 <li key={`${qualifier.groupIndex}-${gironiEntryKey(qualifier.entry)}`}>
 <strong>{qualifier.groupRank}° Girone {String.fromCharCode(65 + qualifier.groupIndex)}:</strong> {qualifier.entry.pair[0].name} {qualifier.entry.pair[0].surname} & {qualifier.entry.pair[1].name} {qualifier.entry.pair[1].surname}
 </li>
 ))}
 </ul>
 </div>

 <div className="flex gap-3 mt-6">
 <Button
 onClick={() => setStep('gironi-phase')}
 variant="outline"
 className="flex-1"
 >
 Indietro
 </Button>
 <Button
 onClick={() => setStep(gironiPlayoffType === 'quarterfinals' ? 'gironi-quarterfinals' : 'gironi-semifinals')}
 className="flex-1"
 >
 Procedi {gironiPlayoffType === 'quarterfinals' ? 'ai Quarti' : 'alle Semifinali'} →
 </Button>
 </div>
 </div>
 </Card>
 );
 }

 if (step === 'gironi-quarterfinals') {
 return (
 <Card title="Quarti di Finale">
 <div className="space-y-6 px-4">
 {gironiQuarterfinalsMatches.map((match, idx) => {
 const team1Pair = pairs.find(pair => pair.some(player => player.id === match.team1[0]));
 const team2Pair = pairs.find(pair => pair.some(player => player.id === match.team2[0]));
 if (!team1Pair || !team2Pair) return null;
 return (
 <div key={match.id || idx} className="bg-sky-50 dark:bg-sky-900/20 p-4 rounded-lg border border-sky-300 dark:border-sky-700">
 <h4 className="font-semibold mb-3 text-sky-800 dark:text-sky-300">Quarto {idx + 1}</h4>
 <div className="grid grid-cols-3 items-center gap-4">
 <div className="text-sm">{team1Pair[0].name} {team1Pair[0].surname}<br/>{team1Pair[1].name} {team1Pair[1].surname}</div>
 <MatchScoreInput
 sets={match.sets}
 onSetsChange={(sets) => setGironiQuarterfinalsMatches(current => current.map((item, index) => index === idx ? { ...item, sets } : item))}
 />
 <div className="text-sm text-right">{team2Pair[0].name} {team2Pair[0].surname}<br/>{team2Pair[1].name} {team2Pair[1].surname}</div>
 </div>
 </div>
 );
 })}
 {resultValidationError && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-300">{resultValidationError}</p>}
 <div className="flex gap-3 mt-6">
 <Button onClick={() => setStep('gironi-standings-intro')} variant="outline" className="flex-1">Indietro</Button>
 <Button onClick={handleQuarterfinalsComplete} className="flex-1">Conferma Quarti e Passa alle Semifinali</Button>
 </div>
 </div>
 </Card>
 );
 }

 if (step === 'gironi-semifinals') {
 return (
 <Card title="Semifinali">
 <div className="space-y-6 px-4">
 {gironiSemifinalsMatches.map((match, idx) => {
 const team1Pair = pairs.find(p =>
 (p[0].id === match.team1[0] && p[1].id === match.team1[1]) ||
 (p[0].id === match.team1[1] && p[1].id === match.team1[0])
 );
 const team2Pair = pairs.find(p =>
 (p[0].id === match.team2[0] && p[1].id === match.team2[1]) ||
 (p[0].id === match.team2[1] && p[1].id === match.team2[0])
 );

 if (!team1Pair || !team2Pair) return null;

 return (
 <div key={idx} className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border-2 border-ios-blue">
 <h4 className="font-semibold mb-3 text-ios-blue dark:text-ios-blue">Semifinale {idx + 1}</h4>
 <div className="grid grid-cols-3 items-center gap-4">
 <div className="text-sm">
 {team1Pair[0].name} {team1Pair[0].surname}<br/>
 {team1Pair[1].name} {team1Pair[1].surname}
 </div>

 <div>
 <MatchScoreInput
 sets={match.sets}
 onSetsChange={(sets) => {
 const newMatches = [...gironiSemifinalsMatches];
 newMatches[idx] = { ...match, sets };
 setGironiSemifinalsMatches(newMatches);
 }}
 />
 </div>

 <div className="text-sm text-right">
 {team2Pair[0].name} {team2Pair[0].surname}<br/>
 {team2Pair[1].name} {team2Pair[1].surname}
 </div>
 </div>
 </div>
 );
 })}

 <div className="flex gap-3 mt-6">
 <Button
 onClick={() => setStep(gironiPlayoffType === 'quarterfinals' ? 'gironi-quarterfinals' : 'gironi-phase')}
 variant="outline"
 className="flex-1"
 >
 Indietro
 </Button>
 <Button
 onClick={() => {
 handleSemifinalsComplete();
 }}
 className="flex-1"
 >
 Conferma Semifinali e Passa alle Finali
 </Button>
 </div>
 </div>
 </Card>
 );
 }

 if (step === 'gironi-finals') {
 return (
 <Card title="Finali">
 <div className="space-y-6 px-4">
 {gironiFinalsMatches.map((match, idx) => {
 const isFinale = idx === 1; // Index 1 = finale 1°-2°
 const title = isFinale ?"Finale 1°-2° Posto" :"Finalina 3°-4° Posto";

 const team1Pair = pairs.find(p =>
 (p[0].id === match.team1[0] && p[1].id === match.team1[1]) ||
 (p[0].id === match.team1[1] && p[1].id === match.team1[0])
 );
 const team2Pair = pairs.find(p =>
 (p[0].id === match.team2[0] && p[1].id === match.team2[1]) ||
 (p[0].id === match.team2[1] && p[1].id === match.team2[0])
 );

 if (!team1Pair || !team2Pair) return null;

 const bgColor = isFinale
 ?"bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800"
 :"bg-green-100 dark:bg-green-900/30 border-2 border-green-300 dark:border-green-700";
 const titleColor = isFinale
 ?"text-green-900 dark:text-green-300"
 :"text-green-800 dark:text-green-400";

 const matchKey = `final-${match.team1.join('-')}-vs-${match.team2.join('-')}`;

 return (
 <div key={matchKey} className={`${bgColor} p-4 rounded-lg`}>
 <h4 className={`font-semibold mb-3 ${titleColor}`}>{title}</h4>
 <div className="grid grid-cols-3 items-center gap-4">
 <div className="text-sm">
 {team1Pair[0].name} {team1Pair[0].surname}<br/>
 {team1Pair[1].name} {team1Pair[1].surname}
 </div>

 <div>
 <MatchScoreInput
 sets={match.sets}
 onSetsChange={(sets) => {
 const newMatches = [...gironiFinalsMatches];
 newMatches[idx] = { ...match, sets };
 setGironiFinalsMatches(newMatches);
 }}
 />
 </div>

 <div className="text-sm text-right">
 {team2Pair[0].name} {team2Pair[0].surname}<br/>
 {team2Pair[1].name} {team2Pair[1].surname}
 </div>
 </div>
 </div>
 );
 })}

 <div className="flex gap-3 mt-6">
 <Button
 onClick={() => setStep('gironi-semifinals')}
 variant="outline"
 className="flex-1"
 >
 Indietro
 </Button>
 <Button
 onClick={() => {
 handleGironiFinalsConfirm();
 }}
 className="flex-1"
 disabled={isSubmitting}
 >
 {isSubmitting ? 'Salvataggio...' : 'Conferma Risultati'}
 </Button>
 </div>
 </div>
 </Card>
 );
 }

 if (step === 'torneo-libero-setup') {
 return (
 <Card title="Setup Torneo Libero">
 <div className="space-y-6 px-4">
 <div>
 <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
 Numero di partite da giocare
 </label>
 <input
 type="number"
 min="1"
 max="20"
 value={numeroPartite}
 onChange={(e) => setNumeroPartite(parseInt(e.target.value) || 1)}
 className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
 Nome del torneo libero
 </label>
 <input
 type="text"
 value={nomeTorneoLibero}
 onChange={(e) => setNomeTorneoLibero(e.target.value)}
 placeholder="es. Giornata Speciale, Sfida Serale..."
 className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
 Modalità Coppie
 </label>
 <div className="flex gap-4">
 <label className="flex items-center cursor-pointer">
 <input
 type="radio"
 value="fixed"
 checked={torneoLiberoMode === 'fixed'}
 onChange={() => setTorneoLiberoMode('fixed')}
 className="mr-2"
 />
 <span>Coppie Fisse</span>
 <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(usa coppie sorteggiate)</span>
 </label>
 <label className="flex items-center cursor-pointer">
 <input
 type="radio"
 value="rotating"
 checked={torneoLiberoMode === 'rotating'}
 onChange={() => setTorneoLiberoMode('rotating')}
 className="mr-2"
 />
 <span>Coppie a Girare</span>
 <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(scegli giocatori singoli)</span>
 </label>
 </div>
 </div>

 <div className="flex gap-3 mt-6">
 <Button
 onClick={() => setStep('setup')}
 variant="outline"
 className="flex-1"
 >
 Indietro
 </Button>
 <Button
 onClick={handleTorneoLiberoSetup}
 className="flex-1"
 disabled={numeroPartite < 1 || !nomeTorneoLibero.trim()}
 >
 Crea {numeroPartite} Partit{numeroPartite === 1 ? 'a' : 'e'}
 </Button>
 </div>
 </div>
 </Card>
 );
 }

 if (step === 'setup') {
 return (
 <Card title={`Nuova Giornata: ${getFormatDisplayName(selectedFormat!)}`}>
 <div className="space-y-4 w-full overflow-x-hidden px-4">
 {preselectedTournamentName && (
 <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3">
 <p className="text-sm text-green-800 dark:text-green-200 break-words">
 ✅ Nuova giornata per: <strong>{preselectedTournamentName}</strong>
 </p>
 </div>
 )}
 {!preselectedTournamentName && !initialFormat && (
 <div className="w-full">
 <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Tournament</label>
 <div className="mt-1 flex w-full rounded-md shadow-sm">
 <button onClick={() => { setIsCreatingNew(true); setClubName(''); setSelectedTournamentName(''); setSavedTournamentType(''); }} className={`flex-1 px-4 py-2 rounded-l-md text-sm font-medium focus:outline-none ${isCreatingNew ? 'bg-sky-600 text-white' : 'bg-gray-200 dark:bg-gray-600'}`}>Nuovo</button>
 <button onClick={() => { setIsCreatingNew(false); }} disabled={existingTournamentNames.length === 0} className={`flex-1 px-4 py-2 rounded-r-md text-sm font-medium focus:outline-none ${!isCreatingNew ? 'bg-sky-600 text-white' : 'bg-gray-200 dark:bg-gray-600'} disabled:opacity-50`}>Esistente</button>
 </div>
 </div>
 )}

 {(isCreatingNew || initialFormat) && !preselectedTournamentName ? (
 <div className="w-full">
 <label htmlFor="tournamentName" className="block text-sm font-medium text-gray-500 dark:text-gray-400">Nome Torneo</label>
 <input
 type="text"
 id="tournamentName"
 value={tournamentName}
 onChange={e => setTournamentName(e.target.value)}
 placeholder="es. TorneOtto Inverno 2025"
 className="mt-1 block w-full min-w-0 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-sm"
 />
 </div>
 ) : !preselectedTournamentName ? (
 <div className="w-full">
 <label htmlFor="selectTournament" className="block text-sm font-medium text-gray-500 dark:text-gray-400">Seleziona Torneo Esistente</label>
 <select
 id="selectTournament"
 value={selectedTournamentName}
 onChange={e => handleSelectExistingTournament(e.target.value)}
 className="mt-1 block w-full min-w-0 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-sm"
 >
 <option value="">Seleziona un torneo</option>
 {existingTournamentNames.map(name => <option key={name} value={name}>{name}</option>)}
 </select>
 </div>
 ) : null}
 <div className="w-full min-w-0 overflow-hidden">
 <label htmlFor="tournamentDate" className="block text-sm font-medium text-gray-500 dark:text-gray-400">Data Giornata</label>
 <input
 type="date"
 id="tournamentDate"
 value={tournamentDate}
 onChange={e => setTournamentDate(e.target.value)}
 className="mobile-date-input mt-1 block w-full min-w-0 max-w-full overflow-hidden bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-sm"
 />
 </div>
 <div className="w-full">
 <label htmlFor="clubName" className="block text-sm font-medium text-gray-500 dark:text-gray-400">Circolo</label>
 <input
 type="text"
 id="clubName"
 value={clubName}
 onChange={e => setClubName(e.target.value)}
 placeholder="es. Padel Club Milano"
 className="mt-1 block w-full min-w-0 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-sm"
 />
 <div className="flex gap-3 pt-2">
 <Button
 variant="outline"
 onClick={() => {
 if (selectedFormat === 'americano') {
 setStep('americano-info');
 } else if (selectedFormat === 'round-robin-finali') {
 setStep('round-robin-info');
 } else if (selectedFormat === 'torneo-libero') {
 setStep('torneo-libero-setup');
 } else if (selectedFormat === 'gironi-fase-finale') {
 setStep('gironi-setup');
 } else if (selectedFormat === 'eliminazione-diretta') {
 setStep('tpra-flow');
 } else if (initialFormat) {
 onFinish();
 } else {
 setStep('tournament-selection');
 }
 }}
 className="flex-1"
 >
 Indietro
 </Button>
 <Button onClick={handleStartScoring} className="flex-1">
 Inizia Partite
 </Button>
 </div>
 </div>
 </div>
 </Card>
 );
 }

 if (step === 'torneo-libero-scoring') {
 // Create pairs list for dropdown
 const pairsList = pairs.map((pair, index) => ({
 id: `pair-${index}`,
 name: `${pair[0].name} ${pair[0].surname} / ${pair[1].name} ${pair[1].surname}`
 }));

 return (
 <>
 <Card title={
 <div className="flex justify-between items-center">
 <span>Torneo Libero: {nomeTorneoLibero}</span>
 <Button onClick={handlePrintTorneoLiberoBlank} variant="ghost" size="sm">
 <span className="flex items-center gap-1"><PrintIcon /> Stampa Tabellone Vuoto</span>
 </Button>
 </div>
 }>
 <div className="space-y-6 px-4">
 {torneoLiberoMatches.map((match, index) => (
 <div key={index} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
 <h3 className="font-semibold mb-4">Partita {index + 1} di {numeroPartite}</h3>

 <div className="grid grid-cols-3 items-center gap-4">
 {torneoLiberoMode === 'fixed' ? (
 // MODALITÀ COPPIE FISSE (esistente)
 <>
 <div>
 <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
 Squadra A
 </label>
 <select
 value={match.team1 || ''}
 onChange={(e) => handleTorneoLiberoTeamChange(index, 'team1', e.target.value || null)}
 className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500"
 >
 <option value="">Seleziona squadra</option>
 {pairsList
 .filter(pair => pair.id !== match.team2)
 .map(pair => (
 <option key={pair.id} value={pair.id}>
 {pair.name}
 </option>
 ))
 }
 </select>
 </div>

 <div>
 <MatchScoreInput
 sets={match.scores}
 onSetsChange={(sets) => handleTorneoLiberoScoresChange(index, sets)}
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
 Squadra B
 </label>
 <select
 value={match.team2 || ''}
 onChange={(e) => handleTorneoLiberoTeamChange(index, 'team2', e.target.value || null)}
 className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500"
 >
 <option value="">Seleziona squadra</option>
 {pairsList
 .filter(pair => pair.id !== match.team1)
 .map(pair => (
 <option key={pair.id} value={pair.id}>
 {pair.name}
 </option>
 ))
 }
 </select>
 </div>
 </>
 ) : (
 // MODALITÀ COPPIE A GIRARE (nuovo)
 <>
 <div>
 <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
 Squadra A
 </label>
 <div className="grid grid-cols-2 gap-2">
 <select
 value={match.team1Player1 || ''}
 onChange={(e) => handleTorneoLiberoPlayerChange(index, 'team1Player1', e.target.value || null)}
 className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3"
 >
 <option value="">Giocatore 1</option>
 {pairs.flat()
 .filter(p => p.id !== match.team1Player2 &&
 p.id !== match.team2Player1 &&
 p.id !== match.team2Player2)
 .map(player => (
 <option key={player.id} value={player.id}>
 {player.name} {player.surname}
 </option>
 ))
 }
 </select>
 <select
 value={match.team1Player2 || ''}
 onChange={(e) => handleTorneoLiberoPlayerChange(index, 'team1Player2', e.target.value || null)}
 className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3"
 >
 <option value="">Giocatore 2</option>
 {pairs.flat()
 .filter(p => p.id !== match.team1Player1 &&
 p.id !== match.team2Player1 &&
 p.id !== match.team2Player2)
 .map(player => (
 <option key={player.id} value={player.id}>
 {player.name} {player.surname}
 </option>
 ))
 }
 </select>
 </div>
 </div>

 <div>
 <MatchScoreInput
 sets={match.scores}
 onSetsChange={(sets) => handleTorneoLiberoScoresChange(index, sets)}
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
 Squadra B
 </label>
 <div className="grid grid-cols-2 gap-2">
 <select
 value={match.team2Player1 || ''}
 onChange={(e) => handleTorneoLiberoPlayerChange(index, 'team2Player1', e.target.value || null)}
 className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3"
 >
 <option value="">Giocatore 1</option>
 {pairs.flat()
 .filter(p => p.id !== match.team1Player1 &&
 p.id !== match.team1Player2 &&
 p.id !== match.team2Player2)
 .map(player => (
 <option key={player.id} value={player.id}>
 {player.name} {player.surname}
 </option>
 ))
 }
 </select>
 <select
 value={match.team2Player2 || ''}
 onChange={(e) => handleTorneoLiberoPlayerChange(index, 'team2Player2', e.target.value || null)}
 className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3"
 >
 <option value="">Giocatore 2</option>
 {pairs.flat()
 .filter(p => p.id !== match.team1Player1 &&
 p.id !== match.team1Player2 &&
 p.id !== match.team2Player1)
 .map(player => (
 <option key={player.id} value={player.id}>
 {player.name} {player.surname}
 </option>
 ))
 }
 </select>
 </div>
 </div>
 </>
 )}
 </div>
 </div>
 ))}
 </div>

 <div className="flex gap-3 mt-6">
 <Button
 onClick={() => setStep('torneo-libero-setup')}
 variant="outline"
 className="flex-1"
 >
 Indietro
 </Button>
 <Button
 onClick={handleTorneoLiberoSaveScheduled}
 variant="success"
 className="flex-1"
 disabled={!torneoLiberoMatches.every(match => {
 if (torneoLiberoMode === 'fixed') {
 return match.team1 && match.team2;
 } else {
 return match.team1Player1 && match.team1Player2 &&
 match.team2Player1 && match.team2Player2;
 }
 }) || isSubmitting}
 >
 {isSubmitting ? 'Salvataggio...' : 'Salva Tabellone'}
 </Button>
 <Button
 onClick={handleTorneoLiberoConfirm}
 className="flex-1"
 disabled={!torneoLiberoMatches.every(match => {
 if (torneoLiberoMode === 'fixed') {
 return match.team1 && match.team2;
 } else {
 return match.team1Player1 && match.team1Player2 &&
 match.team2Player1 && match.team2Player2;
 }
 }) || isSubmitting}
 >
 {isSubmitting ? 'Salvataggio...' : 'Conferma Risultati'}
 </Button>
 </div>
 </Card>
 </>
 );
 }

 if (step === 'tpra-flow') {
 return (
 <TpraCreationFlow
 pairs={pairs}
 onFinish={onFinish}
 tournamentDate={tournamentDate}
 clubName={clubName}
tournamentName={tournamentName}
 />
 );
 }

 if (step === 'scoring') {
    // Render Beat the Box dedicated flow
    if (selectedFormat === 'beat-the-box') {
      return (
        <BeatTheBoxFlow
          pairs={pairs}
          onFinish={onFinish}
          tournamentDate={tournamentDate}
          clubName={clubName}
          tournamentName={isCreatingNew ? tournamentName : selectedTournamentName}
          giornataName={undefined}
        />
      );
    }

    return (
      <>
        <Card title={
          <div className="flex justify-between items-center">
            <span>Inserisci Risultati - {getFormatDisplayName(selectedFormat!)}</span>
            <Button onClick={handlePrintBlank} variant="ghost" size="sm">
              <span className="flex items-center gap-1"><PrintIcon /> Stampa Tabellone Vuoto</span>
            </Button>
          </div>
        }>
          {isRoundRobinFinali ? (
            <div>
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-ios-blue/20">
                <h3 className="font-semibold text-ios-blue dark:text-ios-blue">Round Robin - Fase a Gironi</h3>
                <p className="text-sm text-ios-blue dark:text-ios-blue">Inserisci i risultati di tutte le partite suddivise per giornate. In ciascuna giornata viene indicato il campo e l'eventuale riposo.</p>
              </div>
              <div className="space-y-6 px-4">
                {(() => {
                  const roundsMap = new Map<number, { match: typeof roundRobinMatches[0]; originalIndex: number }[]>();
                  roundRobinMatches.forEach((match, index) => {
                    const r = match.roundNumber || 1;
                    if (!roundsMap.has(r)) roundsMap.set(r, []);
                    roundsMap.get(r)!.push({ match, originalIndex: index });
                  });

                  const totalRounds = roundsMap.size;
                  const isHomeAway = roundRobinHomeAway;

                  const allTeamsMap = new Map<string, [Player, Player]>();
                  roundRobinMatches.forEach(m => {
                    const t1 = getTeamPlayers(m.team1);
                    const t2 = getTeamPlayers(m.team2);
                    if (t1) allTeamsMap.set(m.team1.join(','), t1);
                    if (t2) allTeamsMap.set(m.team2.join(','), t2);
                  });

                  return Array.from(roundsMap.entries()).sort((a, b) => a[0] - b[0]).map(([roundNum, roundItems]) => {
                    let roundLabel = `Giornata ${roundNum} di ${totalRounds}`;
                    if (isHomeAway && totalRounds > 1 && totalRounds % 2 === 0) {
                      const half = totalRounds / 2;
                      if (roundNum <= half) {
                        roundLabel = `${roundNum}ª Giornata di Andata`;
                      } else {
                        roundLabel = `${roundNum - half}ª Giornata di Ritorno`;
                      }
                    }

                    const activeTeamKeys = new Set<string>();
                    roundItems.forEach(({ match }) => {
                      activeTeamKeys.add(match.team1.join(','));
                      activeTeamKeys.add(match.team2.join(','));
                    });

                    const restingTeams: [Player, Player][] = [];
                    allTeamsMap.forEach((pair, key) => {
                      if (!activeTeamKeys.has(key)) {
                        restingTeams.push(pair);
                      }
                    });

                    return (
                      <div key={roundNum} className="space-y-3 rounded-2xl border border-slate-200/60 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 dark:border-white/10 pb-2">
                          <h4 className="font-bold text-base text-gray-900 dark:text-white">{roundLabel}</h4>
                          {restingTeams.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800">
                                ☕ Riposo: {restingTeams.map(t => `${formatPlayerShortName(t[0])} & ${formatPlayerShortName(t[1])}`).join(' | ')}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          {roundItems.map(({ match, originalIndex }, idx) => {
                            const team1 = getTeamPlayers(match.team1);
                            const team2 = getTeamPlayers(match.team2);
                            if (!team1 || !team2) return null;
                            const maxCourts = roundRobinFields || 2;
                            const courtNum = (idx % maxCourts) + 1;

                            return (
                              <div key={originalIndex} className="bg-white dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/60 dark:border-white/10 shadow-sm space-y-2">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 flex items-center justify-between">
                                  <span>Campo {courtNum}</span>
                                </div>
                                <div className="grid grid-cols-3 items-center gap-2">
                                  <div className="text-right">
                                    <p className="font-semibold text-sm">{formatPlayerShortName(team1[0])} & {formatPlayerShortName(team1[1])}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">ELO: {((team1[0].currentElo + team1[1].currentElo)/2).toFixed(2)}</p>
                                  </div>
                                  <MatchScoreInput
                                    sets={roundRobinScores[originalIndex] || [{team1: 0, team2: 0}]}
                                    onSetsChange={(sets) => handleRoundRobinSetsChange(originalIndex, sets)}
                                  />
                                  <div>
                                    <p className="font-semibold text-sm">{formatPlayerShortName(team2[0])} & {formatPlayerShortName(team2[1])}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">ELO: {((team2[0].currentElo + team2[1].currentElo)/2).toFixed(2)}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ) : (
 <div className="space-y-6 px-4">
 {tournamentMatches.map((match, index) => {
 const team1 = getTeamPlayers(match.team1);
 const team2 = getTeamPlayers(match.team2);
 if (!team1 || !team2) return null;
 const round = tournamentRoundByMatch.get(match)?.roundNumber || match.roundNumber || Math.floor(index / 2) + 1;
 const previousRound = index > 0
 ? (tournamentMatches[index - 1].roundNumber || Math.floor((index - 1) / 2) + 1)
 : null;
 const startsNewRound = selectedFormat === 'torneotto-30' && round !== previousRound;

 return (
 <React.Fragment key={index}>
 {startsNewRound && (
 <div className="mt-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-bold text-slate-800 dark:text-slate-200">
 Turno {round}
 </div>
 )}
 <div className="grid grid-cols-3 items-center gap-2 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
 <div className="text-right">
 <p className="font-semibold">{formatPlayerShortName(team1[0])} & {formatPlayerShortName(team1[1])}</p>
 <p className="text-xs text-gray-500 dark:text-gray-400">ELO: {((team1[0].currentElo + team1[1].currentElo)/2).toFixed(2)}</p>
 </div>
 <MatchScoreInput
 sets={matchScores[index] || [{team1: 0, team2: 0}]}
 onSetsChange={(sets) => handleSetsChange(index, sets)}
 />
 <div>
 <p className="font-semibold">{formatPlayerShortName(team2[0])} & {formatPlayerShortName(team2[1])}</p>
 <p className="text-xs text-gray-500 dark:text-gray-400">ELO: {((team2[0].currentElo + team2[1].currentElo)/2).toFixed(2)}</p>
 </div>
 </div>
 </React.Fragment>
 );
 })}
 </div>
 )}
 <div className="flex gap-3 mt-6">
 <Button
 onClick={handleSaveCalendar}
 disabled={isSavingCalendar}
 variant="success"
 className="flex-1"
 >
 {isSavingCalendar ?"Salvataggio..." :"Salva Calendario"}
 </Button>
 <Button
 onClick={handleFinishScoring}
 className="flex-1"
 disabled={isSubmitting}
 >
 {isSubmitting ? 'Calcolo...' : (isRoundRobinFinali ? 'Calcola Classifica' : 'Calcola Risultati')}
 </Button>
 </div>
 </Card>

 {isCalendarSavedModalOpen && (
 <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
 <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
 <div className="mt-3 text-center">
 <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
 <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
 </svg>
 </div>
 <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100 mt-4">
 Calendario Salvato!
 </h3>
 <div className="mt-2 px-7 py-3">
 <p className="text-sm text-gray-500 dark:text-gray-400">
 Il calendario del torneo è stato salvato con successo. Puoi tornare in un secondo momento per inserire i risultati.
 </p>
 </div>
 <div className="items-center px-4 py-3">
 <Button
 onClick={() => {
 setIsCalendarSavedModalOpen(false);
 onFinish();
 }}
 className="w-full"
 >
 Chiudi
 </Button>
 </div>
 </div>
 </div>
 </div>
 )}

 {/* Finals Modal - shown when Round Robin is complete */}
 <HIGSheet isOpen={showFinalsModal} onClose={() => setShowFinalsModal(false)} title="Round Robin Completato!">
 <div className="space-y-4 px-4">
 <div className="p-4 bg-green-50 dark:bg-green-900 rounded-lg">
 <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">Classifica Round Robin</h3>
 <div className="space-y-2 px-4">
 {roundRobinStandings.slice(0, 4).map((standing, index) => (
 <div key={index} className="flex justify-between items-center p-2 bg-white dark:bg-gray-800 rounded">
 <span className="font-medium">
 {index + 1}° - {formatPlayerShortName(standing.team[0])} & {formatPlayerShortName(standing.team[1])}
 </span>
 <span className="text-sm text-gray-600 dark:text-gray-400">
 {standing.points} punti
 </span>
 </div>
 ))}
 </div>
 </div>
 <p className="text-gray-600 dark:text-gray-400">
 Le prime 4 squadre sono qualificate per le finali. Vuoi procedere con le partite finali?
 </p>
 <div className="flex gap-3 pt-4">
 <Button
 onClick={() => setShowFinalsModal(false)}
 variant="secondary"
 className="flex-1"
 >
 Annulla
 </Button>
 <Button
 onClick={handleProceedToFinals}
 className="flex-1"
 >
 Procedi alle Finali
 </Button>
 </div>
 </div>
 </HIGSheet>
 </>
 )
 }

 if (step === 'finals') {
 return (
 <>
 <Card title="Finali - Round Robin + Finali">
 <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900 rounded-lg">
 <h3 className="font-semibold text-emerald-800 dark:text-emerald-200">Fase Finale</h3>
 <p className="text-sm text-emerald-700 dark:text-emerald-300">Inserisci i risultati delle finali per determinare la classifica finale.</p>
 </div>

 {/* Show Round Robin standings */}
 <div className="mb-6">
 <h4 className="font-semibold mb-3 text-gray-700 dark:text-gray-300">Classifica Round Robin</h4>
 <div className="overflow-x-auto">
 <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
 <thead className="bg-gray-50 dark:bg-gray-800">
 <tr>
 <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pos</th>
 <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Squadra</th>
 <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Punti</th>
 <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">GW</th>
 <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">GL</th>
 <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Diff</th>
 </tr>
 </thead>
 <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
 {roundRobinStandings.map((standing, index) => (
 <tr key={index} className={index < 4 ?"bg-green-50 dark:bg-green-900" :""}>
 <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
 {index + 1}
 </td>
 <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">
 {formatPlayerShortName(standing.team[0])} & {formatPlayerShortName(standing.team[1])}
 </td>
 <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">
 {standing.points}
 </td>
 <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">
 {standing.gamesWon}
 </td>
 <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">
 {standing.gamesLost}
 </td>
 <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">
 {standing.gameDifference}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Le prime 4 squadre (evidenziate in verde) sono qualificate per le finali.</p>
 </div>

 {/* Finals matches */}
 <div className="space-y-6 px-4">
 <h4 className="font-semibold text-gray-700 dark:text-gray-300">Partite Finali</h4>
 {finalsMatches.map((match, index) => {
 const team1 = getTeamPlayers(match.team1);
 const team2 = getTeamPlayers(match.team2);
 if (!team1 || !team2) return null;

 const isFinalePrimoSecondo = index === 0;

 return (
 <div key={index} className={`grid grid-cols-3 items-center gap-2 p-3 rounded-lg ${isFinalePrimoSecondo ? 'bg-emerald-50 dark:bg-emerald-900 border-2 border-emerald-400 dark:border-emerald-600' : 'bg-sky-50 dark:bg-sky-900 border-2 border-sky-400 dark:border-sky-600'}`}>
 <div className="text-right">
 <p className="font-semibold">{formatPlayerShortName(team1[0])} & {formatPlayerShortName(team1[1])}</p>
 <p className="text-xs text-gray-500 dark:text-gray-400">ELO: {((team1[0].currentElo + team1[1].currentElo)/2).toFixed(2)}</p>
 </div>
 <div className="text-center">
 <MatchScoreInput
 sets={finalsScores[index] || [{team1: 0, team2: 0}]}
 onSetsChange={(sets) => handleFinalsSetsChange(index, sets)}
 />
 <p className={`text-xs font-medium mt-1 ${isFinalePrimoSecondo ? 'text-emerald-700 dark:text-emerald-300' : 'text-sky-700 dark:text-sky-300'}`}>
 {isFinalePrimoSecondo ? 'Finale 1°-2°' : 'Finale 3°-4°'}
 </p>
 </div>
 <div>
 <p className="font-semibold">{formatPlayerShortName(team2[0])} & {formatPlayerShortName(team2[1])}</p>
 <p className="text-xs text-gray-500 dark:text-gray-400">ELO: {((team2[0].currentElo + team2[1].currentElo)/2).toFixed(2)}</p>
 </div>
 </div>
 );
 })}
 </div>

 <div className="flex gap-3 mt-6">
 <Button
 onClick={() => setStep('scoring')}
 variant="outline"
 className="flex-1"
 disabled={isSubmitting || isTournamentSaved}
 >
 Indietro
 </Button>
 <Button
 onClick={handleRequestFinishFinals}
 className="flex-1"
 disabled={isSubmitting || isTournamentSaved}
 >
 {isSubmitting ? 'Finalizzando...' : isTournamentSaved ? 'Torneo Salvato' : 'Finalizza Torneo'}
 </Button>
 </div>
 </Card>

 {/* Confirmation Modal for Finals */}
 <HIGSheet isOpen={showFinalsConfirmModal} onClose={() => setShowFinalsConfirmModal(false)} title="Conferma Finalizzazione Torneo">
 <div className="space-y-4 px-4">
 <div className="p-4 bg-amber-50 dark:bg-amber-900 rounded-lg">
 <p className="text-amber-800 dark:text-amber-200">
 ⚠️ Stai per finalizzare il torneo e salvare tutti i risultati.
 </p>
 </div>
 <p className="text-gray-600 dark:text-gray-400">
 Questa azione salverà permanentemente:
 </p>
 <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-1 px-4">
 <li>Tutti i risultati del Round Robin ({roundRobinMatches.length} partite)</li>
 <li>Tutti i risultati delle Finali ({finalsMatches.length} partite)</li>
 <li>Aggiornamento degli ELO di tutti i giocatori</li>
 </ul>
 <p className="text-sm text-gray-500 dark:text-gray-500 italic">
 I risultati non potranno essere modificati dopo il salvataggio.
 </p>
 <div className="flex gap-3 pt-4">
 <Button
 onClick={() => setShowFinalsConfirmModal(false)}
 variant="secondary"
 className="flex-1"
 >
 Annulla
 </Button>
 <Button
 onClick={handleFinishFinals}
 className="flex-1"
 disabled={isSubmitting}
 >
 {isSubmitting ? 'Salvando...' : 'Completa torneo'}
 </Button>
 </div>
 </div>
 </HIGSheet>
 </>
 )
 }

 if (step === 'results') {
 return (
 <>
 <Card title={`Risultati Torneo - ${getFormatDisplayName(selectedFormat!)}`}>
 <div className="overflow-x-auto">
 <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
 <thead className="text-xs text-gray-700 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-700">
 <tr>
 <th scope="col" className="px-4 py-3">Pos</th>
 <th scope="col" className="px-4 py-3">Team</th>
 <th scope="col" className="px-4 py-3">Pts</th>
 <th scope="col" className="px-4 py-3">Games Vinti</th>
 <th scope="col" className="px-4 py-3">Games Persi</th>
 <th scope="col" className="px-4 py-3">Diff</th>
 </tr>
 </thead>
 <tbody>
 {finalStandings.map((entry, index) => (
 <tr key={entry.teamId} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
 <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{index + 1}</td>
 <td className="px-4 py-3">{formatPlayerShortName(entry.team[0])} & {formatPlayerShortName(entry.team[1])}</td>
 <td className="px-4 py-3">{entry.points}</td>
 <td className="px-4 py-3">{entry.gamesWon}</td>
 <td className="px-4 py-3">{entry.gamesLost}</td>
 <td className={`px-4 py-3 font-bold ${entry.gameDifference >= 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{entry.gameDifference}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
 <Button onClick={() => {
 if (!createdTournament) return;
 const tournamentsForLabel = tournaments.some(t => t.id === createdTournament.id)
 ? tournaments
 : [...tournaments, createdTournament];
 const displayName = getTournamentDisplayName(createdTournament, tournamentsForLabel);

 if (createdTournament.type === TournamentType.BeatTheBox) {
 // For Beat the Box, we need to process the data differently
 // This is a completed tournament, so print complete report
 const boxes = groupMatchesIntoBoxes(completedMatches);
 const boxStandings = calculateAllBoxStandings(completedMatches, boxes);
 const semifinalMatches: Match[] = [];
 const finalMatches: Match[] = [];
 const individualStandings: { player: Player; eloChange: number; rank: number; gamesWon: number; gamesLost: number; winPercentage: number }[] = [];

 printBeatTheBoxComplete(
 createdTournament,
 boxes,
 boxStandings,
 semifinalMatches,
 finalMatches,
 individualStandings,
 getPlayerById,
 displayName
 );
 } else if (createdTournament.type === TournamentType.TorneoLibero) {
 // For Torneo Libero, use the dedicated print function
 printTorneoLiberoComplete(
 createdTournament,
 completedMatches,
 pairs,
 torneoLiberoMode,
 getPlayerById,
 displayName
 );
 } else if (createdTournament.type === TournamentType.GironiFaseFinale) {
 printGironiTournament(
 createdTournament,
 completedMatches,
 getPlayerById,
 displayName
 );
 } else {
 printTournamentReport(
 createdTournament,
 finalStandings,
 completedMatches,
 getPlayerById,
 selectedFormat === 'americano' ? americanoFields : undefined,
 selectedFormat === 'americano' ? americanoScoringType : undefined,
 isRoundRobinFinali ? roundRobinMatchCount : undefined,
 displayName,
 isRoundRobinFinali ? roundRobinFields : undefined
 );
 }
 }} variant="secondary" className="w-full sm:w-auto">Stampa Report</Button>
 <Button onClick={handleFinishAndClose} className="w-full sm:w-auto">Chiudi</Button>
 </div>
 </Card>

 <HIGSheet isOpen={isSuccessModalOpen} onClose={onFinish} title="Torneo Salvato con Successo! 🎉">
 <div className="space-y-3 px-4">
 <div className="p-3 bg-green-50 dark:bg-green-900 rounded-lg">
 <p className="text-green-800 dark:text-green-200 font-medium">
 ✅ Il torneo e tutti i risultati sono stati salvati correttamente.
 </p>
 </div>
 <p className="text-gray-600 dark:text-gray-400">
 Tutti i rating ELO dei giocatori sono stati ricalcolati dal server.
 </p>
 </div>
 <div className="flex justify-end pt-4 mt-4 px-4">
 <Button onClick={onFinish}>Chiudi</Button>
 </div>
 </HIGSheet>

 {/* Calendar Saved Modal */}
 {isCalendarSavedModalOpen && (
 <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
 <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
 <div className="mt-3 text-center">
 <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
 <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
 </svg>
 </div>
 <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100 mt-4">
 Calendario Salvato!
 </h3>
 <div className="mt-2 px-7 py-3">
 <p className="text-sm text-gray-500 dark:text-gray-400">
 Il calendario del torneo è stato salvato con successo. Puoi tornare in un secondo momento per inserire i risultati.
 </p>
 </div>
 <div className="items-center px-4 py-3">
 <Button
 onClick={() => {
 setIsCalendarSavedModalOpen(false);
 onFinish();
 }}
 className="w-full"
 >
 Chiudi
 </Button>
 </div>
 </div>
 </div>
 </div>
 )}
 </>
 )
 }

 return null;
};

export default TournamentFlow;
