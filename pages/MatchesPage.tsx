
import React, { useState, useMemo, useEffect } from 'react';
import { getAuthToken } from '../hooks/useAuth.tsx';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import { Player, SetScore, Tournament, Match, TournamentType, TournamentStandingEntry } from '../types.ts';
import Card from '../components/ui/Card.tsx';
import Button from '../components/ui/Button.tsx';
import { HIGSheet } from '../components/ui/HIGSheet';
import { HIGAlert } from '../components/ui/HIGAlert';
import MatchScoreInput from '../components/ui/MatchScoreInput.tsx';
import { normalizeTournamentRounds } from '../utils/tournamentRounds.ts';
import { TrashIcon, ChevronDownIcon, PencilIcon, PrintIcon } from '../components/ui/Icons.tsx';
import { printTournamentReport, printTorneoLiberoComplete, printBeatTheBoxBlank, printBeatTheBoxComplete, printGironiTournament } from '../services/printService.ts';
import { calculateTournamentStandings, calculateFinalStandingsForRoundRobinFinali } from '../services/tournamentService.ts';
import { getTournamentDisplayName } from '../utils/tournamentLabels.ts';
import { formatPlayerName } from '../utils/format.ts';
import { showHIGAlert } from '../utils/higDialogService.ts';
import { 
 calculateAllBoxStandings, 
 createFinalsMatches as createBeatBoxFinalsMatches,
 calculateNumBoxes,
 BoxStanding,
 groupMatchesByPlayerSets
} from '../services/beatTheBoxService.ts';

// Helper: build fetch headers with auth token
const authHeaders = (): Record<string, string> => {
 const token = getAuthToken();
 return {
 'Content-Type': 'application/json',
 ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
 };
};

const PlayerSelect: React.FC<{
 players: Player[];
 selectedPlayers: string[];
 value: string;
 onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
 disabled?: boolean;
}> = ({ players, selectedPlayers, value, onChange, disabled }) => (
 <select
 value={value}
 onChange={onChange}
 className="block w-full bg-slate-50/70 dark:bg-slate-800/80 border border-slate-200/60 dark:border-white/10 rounded-xl shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-sm font-medium transition-all"
 disabled={disabled}
 >
 <option value="" className="bg-white dark:bg-slate-900">Seleziona Giocatore</option>
 {players.map(p => (
 <option key={p.id} value={p.id} disabled={selectedPlayers.includes(p.id) && p.id !== value} className="bg-white dark:bg-slate-900">
 {p.name} {p.surname}
 </option>
 ))}
 </select>
);

const HistorySkeleton: React.FC = () => (
 <div className="space-y-4 animate-pulse">
 <div className="h-12 rounded-lg bg-gray-200 dark:bg-gray-700"></div>
 <div className="h-12 rounded-lg bg-gray-200 dark:bg-gray-700"></div>
 <div className="h-12 rounded-lg bg-gray-200 dark:bg-gray-700"></div>
 </div>
);

const processBeatTheBoxData = (matches: Match[], getPlayerById: (id: string) => Player | undefined) => {
 // Use player-set grouping (order-independent) to separate box matches from phase matches
 const { boxes: groupedBoxes, phaseMatches: rawPhaseMatches } = groupMatchesByPlayerSets(matches);
 
 // Deduplicate phase matches to fix old DBs with duplicated finals
 const seenPhaseMatches = new Set<string>();
 const remainingMatches = rawPhaseMatches.filter(m => {
     const signature = [...m.team1].sort().join(',') + '|' + [...m.team2].sort().join(',');
     const signatureReverse = [...m.team2].sort().join(',') + '|' + [...m.team1].sort().join(',');
     if (seenPhaseMatches.has(signature) || seenPhaseMatches.has(signatureReverse)) return false;
     seenPhaseMatches.add(signature);
     return true;
 });
 
 const numBoxes = groupedBoxes.size;
 const boxMatches = Array.from(groupedBoxes.values()).flat();
 
 // SE I MATCH NON HANNO WINNER (torneo vecchio o bug), calcolali dai set
 const boxMatchesWithWinner = boxMatches.map(match => {
 if (match.winner) return match; // Ha già il winner, ok
 
 // Calcola winner dai set
 const sets = match.sets || [];
 if (sets.length === 0) return match; // Nessun set, lascia null
 
 const team1Games = sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum, set) => sum + set.team2, 0);
 
 const winner = team1Games === team2Games ? 'draw' : (team1Games > team2Games ? 'team1' : 'team2');
 
 return { ...match, winner } as Match;
 });
 
 // Separate semifinals and finals topologically to handle out-of-order DB rows
 let semifinalMatches: Match[] = [];
 let finalMatches: Match[] = [];

 if (remainingMatches.length >= 4) {
     const allPlayerOccurrences = new Map<string, number>();
     remainingMatches.forEach(m => {
         m.team1.concat(m.team2).forEach(p => {
             allPlayerOccurrences.set(p, (allPlayerOccurrences.get(p) || 0) + 1);
         });
     });
     
     let consolazioneMatch: Match | null = null;
     const mainMatches: Match[] = [];
     
     remainingMatches.forEach(m => {
         // Partita Consolazione players only appear once across all phase matches
         const isConsolazione = m.team1.concat(m.team2).every(p => allPlayerOccurrences.get(p) === 1);
         if (isConsolazione) {
             consolazioneMatch = m;
         } else {
             mainMatches.push(m);
         }
     });

     if (mainMatches.length === 4) {
         let foundSemis = false;
         for (let i = 0; i < 4; i++) {
             for (let j = i + 1; j < 4; j++) {
                 const s1 = mainMatches[i];
                 const s2 = mainMatches[j];
                 
                 if (!s1.winner || !s2.winner || s1.winner === 'draw' || s2.winner === 'draw') continue;

                 const w1 = s1.winner === 'team1' ? s1.team1 : s1.team2;
                 const w2 = s2.winner === 'team1' ? s2.team1 : s2.team2;
                 const l1 = s1.winner === 'team1' ? s1.team2 : s1.team1;
                 const l2 = s2.winner === 'team1' ? s2.team2 : s2.team1;

                 const isMatchBetween = (m: Match, tA: string[], tB: string[]) => {
                     const m1 = [...m.team1].sort().join(',');
                     const m2 = [...m.team2].sort().join(',');
                     const a = [...tA].sort().join(',');
                     const b = [...tB].sort().join(',');
                     return (m1 === a && m2 === b) || (m1 === b && m2 === a);
                 };

                 const otherMatches = mainMatches.filter(m => m !== s1 && m !== s2);
                 const finale12 = otherMatches.find(m => isMatchBetween(m, w1, w2));
                 const finale34 = otherMatches.find(m => isMatchBetween(m, l1, l2));

                 if (finale12 && finale34) {
                     semifinalMatches = [s1, s2];
                     finalMatches = [finale12, finale34];
                     foundSemis = true;
                     break;
                 }
             }
             if (foundSemis) break;
         }

         if (!foundSemis) {
             semifinalMatches = mainMatches.slice(0, 2);
             finalMatches = mainMatches.slice(2);
         }
     } else {
         semifinalMatches = remainingMatches.slice(0, 2);
         finalMatches = remainingMatches.slice(2);
     }

     if (consolazioneMatch && finalMatches.length === 2) {
         finalMatches.push(consolazioneMatch);
     }
 } else {
     finalMatches = remainingMatches;
 }
 
 // Create boxes from player-set grouping (already grouped correctly)
 const boxes: { boxNumber: number; players: Player[]; matches: Match[] }[] = [];
 groupedBoxes.forEach((bMatches, boxNum) => {
 // Apply winner fix to box matches
 const bMatchesWithWinner = bMatches.map(m => {
 if (m.winner) return m;
 const sets = m.sets || [];
 if (sets.length === 0) return m;
 const t1 = sets.reduce((sum, set) => sum + set.team1, 0);
 const t2 = sets.reduce((sum, set) => sum + set.team2, 0);
 return { ...m, winner: t1 === t2 ? 'draw' : (t1 > t2 ? 'team1' : 'team2') } as Match;
 });
 const playerIdsSet = new Set<string>();
 bMatchesWithWinner.forEach(m => {
 m.team1.forEach(id => playerIdsSet.add(id));
 m.team2.forEach(id => playerIdsSet.add(id));
 });
 boxes.push({
 boxNumber: boxNum,
 players: Array.from(playerIdsSet).map(id => getPlayerById(id)).filter((p): p is Player => p !== undefined),
 matches: bMatchesWithWinner
 });
 });
 
 // Calcola le classifiche usando calculateAllBoxStandings
 // IMPORTANTE: usa boxMatchesWithWinner che ha i winner corretti
 const boxStandings = calculateAllBoxStandings(boxMatchesWithWinner, boxes);
 
 // Calculate games won/lost for each player (per fallback se non c'è elo_history)
 const playerStats = new Map<string, { gamesWon: number; gamesLost: number }>();
 
 matches.forEach(m => {
 if (!m.winner || m.winner === 'draw') return;
 const sets = m.sets || [];
 sets.forEach(set => {
 m.team1.forEach(pid => {
 const stats = playerStats.get(pid) || { gamesWon: 0, gamesLost: 0 };
 stats.gamesWon += set.team1;
 stats.gamesLost += set.team2;
 playerStats.set(pid, stats);
 });
 m.team2.forEach(pid => {
 const stats = playerStats.get(pid) || { gamesWon: 0, gamesLost: 0 };
 stats.gamesWon += set.team2;
 stats.gamesLost += set.team1;
 playerStats.set(pid, stats);
 });
 });
 });
 
 // Crea classifica individuale basata su statistiche (Games W/L e % vittorie)
 const individualStandings: { player: Player; eloChange: number; gamesWon: number; gamesLost: number; winPercentage: number; rank: number }[] = [];
 
 boxes.forEach(box => {
 box.players.forEach(player => {
 const stats = playerStats.get(player.id) || { gamesWon: 0, gamesLost: 0 };
 const winPercentage = (stats.gamesWon + stats.gamesLost) > 0
 ? (stats.gamesWon / (stats.gamesWon + stats.gamesLost)) * 100
 : 0;
 
 individualStandings.push({
 player,
 eloChange: 0, // Non più usato, ma manteniamo per compatibilità
 gamesWon: stats.gamesWon,
 gamesLost: stats.gamesLost,
 winPercentage,
 rank: 0
 });
 });
 });
 
 // Ordina per % vittorie decrescente, poi per gamesWon
 individualStandings.sort((a, b) => {
 if (b.winPercentage !== a.winPercentage) {
 return b.winPercentage - a.winPercentage;
 }
 return b.gamesWon - a.gamesWon;
 });
 individualStandings.forEach((entry, idx) => {
 entry.rank = idx + 1;
 });
 
 return { boxes, boxStandings, semifinalMatches, finalMatches, individualStandings };
};

interface MatchesPageProps {
 tournamentToOpen?: string | null;
 setTournamentToOpen?: (id: string | null) => void;
 onNavigateToTeamTournamentMatchdayResults?: (tournamentDayId: string) => void;
 setActivePage?: (page: string) => void;
}

const MatchesPage: React.FC<MatchesPageProps> = ({ tournamentToOpen, setTournamentToOpen, onNavigateToTeamTournamentMatchdayResults, setActivePage }) => {
 const { players, matches, tournaments, eloHistory, addMatch, deleteMatch, getPlayerById, deleteTournament, updateTournamentMatches, cascadeResetTournament, loading, fetchData } = usePadelStore();
 const [team1Player1, setTeam1Player1] = useState('');
 const [team1Player2, setTeam1Player2] = useState('');
 const [team2Player1, setTeam2Player1] = useState('');
 const [team2Player2, setTeam2Player2] = useState('');
 const [sets, setSets] = useState<SetScore[]>([{ team1: 0, team2: 0 }]);
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [isMatchFormOpen, setIsMatchFormOpen] = useState<boolean>(false);
 
 const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
 const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
 const [editScores, setEditScores] = useState<Record<string, SetScore[]>>({});
 const [deleteAlert, setDeleteAlert] = useState<{
     isOpen: boolean;
     tournamentId: string | null;
     isDeleting?: boolean;
     progressPercent?: number;
     loadingText?: string;
 }>({ isOpen: false, tournamentId: null, isDeleting: false, progressPercent: 0, loadingText: '' });

 const [deleteMatchAlert, setDeleteMatchAlert] = useState<{
     isOpen: boolean;
     matchId: string | null;
     isDeleting?: boolean;
     progressPercent?: number;
     loadingText?: string;
 }>({ isOpen: false, matchId: null, isDeleting: false, progressPercent: 0, loadingText: '' });
 
 // Round Robin + Finali specific states
 const [showFinalsStandingsModal, setShowFinalsStandingsModal] = useState(false);
 const [roundRobinStandings, setRoundRobinStandings] = useState<TournamentStandingEntry[]>([]);
 const [isInFinalsPhase, setIsInFinalsPhase] = useState(false);
 const [finalsMatches, setFinalsMatches] = useState<Match[]>([]);
 const [finalsScores, setFinalsScores] = useState<Record<string, SetScore[]>>({});
 
 // Beat the Box specific states
 const [showBeatBoxStandingsModal, setShowBeatBoxStandingsModal] = useState(false);
 const [beatBoxStandings, setBeatBoxStandings] = useState<any[]>([]);
 const [isInBeatBoxFinalsPhase, setIsInBeatBoxFinalsPhase] = useState(false);
 const [beatBoxSemifinalMatches, setBeatBoxSemifinalMatches] = useState<Match[]>([]);
 const [beatBoxFinalMatches, setBeatBoxFinalMatches] = useState<Match[]>([]);
 const [beatBoxNumBoxes, setBeatBoxNumBoxes] = useState<number>(0);
 const [isInBeatBoxSemifinalsPhase, setIsInBeatBoxSemifinalsPhase] = useState(false);
 const [showBeatBoxCompleteConfirm, setShowBeatBoxCompleteConfirm] = useState(false);
 const [showBeatBoxCompleteSuccess, setShowBeatBoxCompleteSuccess] = useState(false);
 const [beatBoxFinalStandings, setBeatBoxFinalStandings] = useState<{ player: Player; eloChange: number; rank: number; gamesWon: number; gamesLost: number; winPercentage: number }[]>([]);
 const [beatBoxAllMatches, setBeatBoxAllMatches] = useState<Match[]>([]);
 
 // Keep a reference to the tournament during finals flow
 const [finalsFlowTournament, setFinalsFlowTournament] = useState<Tournament | null>(null);
 
 // Gironi + Fase Finale specific states
 const [showGironiStandingsModal, setShowGironiStandingsModal] = useState(false);
 const [gironiStandings, setGironiStandings] = useState<any[]>([]);
 const [isInGironiSemifinalsPhase, setIsInGironiSemifinalsPhase] = useState(false);
 const [gironiSemifinalMatches, setGironiSemifinalMatches] = useState<Match[]>([]);
 const [isInGironiFinalsPhase, setIsInGironiFinalsPhase] = useState(false);
 const [gironiFinalMatches, setGironiFinalMatches] = useState<Match[]>([]);
 const [showGironiCompleteConfirm, setShowGironiCompleteConfirm] = useState(false);
 const [showGironiCompleteSuccess, setShowGironiCompleteSuccess] = useState(false);

    // Nuovi stati per conferme e successi (Salvataggio Parziale e Conferma Chiusura Fasi)
    const [showSaveSuccess, setShowSaveSuccess] = useState(false);
    const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
    const [proceedConfirmData, setProceedConfirmData] = useState<{ isOpen: boolean; title: string; message: string; actionText: string; onConfirm: () => void }>({ isOpen: false, title: "", message: "", actionText: "", onConfirm: () => {} });

 useEffect(() => {
 if (editingTournament) {
 const tournamentMatches = matches.filter(m => m.tournamentId === editingTournament.id);
 console.log(`🔍 [useEffect editScores] Tournament: ${editingTournament.name}, Matches: ${tournamentMatches.length}`);

 const initialScores = tournamentMatches.reduce((acc, match) => {
 acc[match.id] = match.sets;
 console.log(` Match ${match.id.substring(0, 8)}: sets =`, JSON.stringify(match.sets));
 return acc;
 }, {} as Record<string, SetScore[]>);

 setEditScores(initialScores);
 }
 }, [editingTournament, matches]);
 
 // Auto-open tournament modal when navigating from Tournaments page
 useEffect(() => {
 if (tournamentToOpen && tournaments.length > 0) {
 const tournament = tournaments.find(t => t.id === tournamentToOpen);
 if (tournament) {
 // Expand the tournament name group
 setExpandedItems(prev => {
 const newSet = new Set(prev);
         newSet.add(`name_${tournament.name}`);
         newSet.add(`day_${tournament.id}`);
         return newSet;
         });

         // Use smart open handler (handles resume for multi-phase tournaments)
         handleOpenTournament(tournament);
         }
         if (setTournamentToOpen) {
             setTournamentToOpen(null);
         }
         }
         }, [tournamentToOpen, tournaments, setTournamentToOpen, matches, getPlayerById]);
 
 // Debug effect for finals phase
 useEffect(() => {
     console.log(`🔍 isInFinalsPhase changed to:`, isInFinalsPhase);
     console.log(`🔍 editingTournament:`, editingTournament?.name);
     console.log(`🔍 finalsFlowTournament:`, finalsFlowTournament?.name);
     console.log(`🔍 Modal should be:`, isInFinalsPhase && !!(finalsFlowTournament || editingTournament) ? 'OPEN' : 'CLOSED');
 }, [isInFinalsPhase, editingTournament, finalsFlowTournament]);
 
 // Auto-scroll to first incomplete match when opening modal
 useEffect(() => {
     if (editingTournament) {
         const timer = setTimeout(() => {
             const tournamentMatches = matches.filter(m => m.tournamentId === editingTournament.id);
             const firstUnfilled = tournamentMatches.find(m => !m.winner || !m.sets || m.sets.length === 0 || (m.sets.length === 1 && m.sets[0].team1 === 0 && m.sets[0].team2 === 0));
             if (firstUnfilled) {
                 const el = document.getElementById(`match-card-${firstUnfilled.id}`);
                 if (el) {
                     el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                     el.classList.add('ring-2', 'ring-orange-500', 'bg-orange-50/40', 'dark:bg-orange-950/20');
                     setTimeout(() => {
                         el.classList.remove('ring-2', 'ring-orange-500', 'bg-orange-50/40', 'dark:bg-orange-950/20');
                     }, 3000);
                 }
             }
         }, 250);
         return () => clearTimeout(timer);
     }
 }, [editingTournament, matches]);
 
 const selectedPlayers = [team1Player1, team1Player2, team2Player1, team2Player2].filter(Boolean);
 const sortedPlayers = [...players].sort((a,b) => a.name.localeCompare(b.name));
 
 const resetForm = () => {
 setTeam1Player1('');
 setTeam1Player2('');
 setTeam2Player1('');
 setTeam2Player2('');
 setSets([{ team1: 0, team2: 0 }]);
 };

 // Generate finals matches for top 4 teams
 const generateFinalsMatches = (top4Standings: TournamentStandingEntry[], tournamentOverride?: Tournament): Match[] => {
 if (top4Standings.length < 4) return [];
 const t = tournamentOverride || editingTournament;

 const generateMatchId = () => `temp_final_${Date.now()}_${Math.random()}`;

 return [
 // Finale 1°-2° posto
 {
 id: generateMatchId(),
 date: t?.date || new Date().toISOString(),
 team1: [top4Standings[0].team[0].id, top4Standings[0].team[1].id] as [string, string],
 team2: [top4Standings[1].team[0].id, top4Standings[1].team[1].id] as [string, string],
 sets: [{ team1: 0, team2: 0 }],
 winner: null,
 tournamentId: t?.id
 },
 // Finale 3°-4° posto
 {
 id: generateMatchId(),
 date: t?.date || new Date().toISOString(),
 team1: [top4Standings[2].team[0].id, top4Standings[2].team[1].id] as [string, string],
 team2: [top4Standings[3].team[0].id, top4Standings[3].team[1].id] as [string, string],
 sets: [{ team1: 0, team2: 0 }],
 winner: null,
 tournamentId: t?.id
 }
 ];
 };
 
 const calculateAmericanoStandings = (matches: Match[], scoringType?: 'games-diff' | 'points'): TournamentStandingEntry[] => {
 console.log(`🎯 MatchesPage Americano: Starting calculation with ${matches.length} matches`);
 
 const playerStats = new Map<string, {
 player: Player;
 totalPoints: number;
 totalGamesWon: number;
 totalGamesLost: number;
 matchesPlayed: number;
 }>();

 // Get all unique players from matches (these are the draw players)
 const allPlayers = new Set<string>();
 matches.forEach(match => {
 [...match.team1, ...match.team2].forEach(playerId => allPlayers.add(playerId));
 });

 console.log(`🎯 MatchesPage Americano: Found ${allPlayers.size} unique players in ${matches.length} matches`);

 // Initialize all players (only those who were in the draw)
 allPlayers.forEach(playerId => {
 const player = getPlayerById(playerId);
 if (player) {
 playerStats.set(playerId, {
 player,
 totalPoints: 0,
 totalGamesWon: 0,
 totalGamesLost: 0,
 matchesPlayed: 0
 });
 }
 });

 // Process each match
 matches.forEach(match => {
 const team1Players = match.team1.map(id => getPlayerById(id)).filter(Boolean) as Player[];
 const team2Players = match.team2.map(id => getPlayerById(id)).filter(Boolean) as Player[];
 
 if (team1Players.length === 2 && team2Players.length === 2 && match.sets) {
 const team1Games = match.sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = match.sets.reduce((sum, set) => sum + set.team2, 0);
 
 [...team1Players, ...team2Players].forEach(player => {
 const stats = playerStats.get(player.id);
 if (stats) {
 stats.matchesPlayed++;
 
 if (team1Players.includes(player)) {
 stats.totalPoints += team1Games;
 stats.totalGamesWon += team1Games;
 stats.totalGamesLost += team2Games;
 } else {
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
 const points = scoringType === 'points' ? stats.totalGamesWon : gameDifference;
 
 return {
 teamId: stats.player.id,
 team: [stats.player],
 points,
 gamesWon: stats.totalGamesWon,
 gamesLost: stats.totalGamesLost,
 gameDifference,
 matches: stats.matchesPlayed
 };
 });

 console.log(`🎯 MatchesPage Americano: Created ${standings.length} standings entries`);
 
 return standings.sort((a, b) => {
 if (b.points !== a.points) return b.points - a.points;
 return b.gamesWon - a.gamesWon;
 });
 };

 // Gironi + Fase Finale functions
 const calculateGironiStandings = (allMatches: Match[]): any[] => {
 // Union-Find per raggruppare le coppie che si sono scontrate nello stesso girone
 const pairKey = (team: string[]) => [...team].sort().join('||');
 const parent = new Map<string, string>();
 const find = (x: string): string => {
 if (!parent.has(x)) parent.set(x, x);
 if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
 return parent.get(x)!;
 };
 const union = (a: string, b: string) => { parent.set(find(a), find(b)); };

 // Collega coppie che hanno giocato tra loro
 allMatches.forEach(m => union(pairKey(m.team1), pairKey(m.team2)));

 // Raggruppa match per girone (connected component)
 const gironiMap = new Map<string, Match[]>();
 allMatches.forEach(m => {
 const root = find(pairKey(m.team1));
 if (!gironiMap.has(root)) gironiMap.set(root, []);
 gironiMap.get(root)!.push(m);
 });

 // Calcola classifica per ogni girone
 const gironiStandings: any[] = [];
 let gironeIdx = 0;

 gironiMap.forEach((gironeMatches) => {
 // Estrai coppie uniche
 const pairKeys = new Set<string>();
 gironeMatches.forEach(m => {
 pairKeys.add(pairKey(m.team1));
 pairKeys.add(pairKey(m.team2));
 });

 const pairStats = new Map<string, any>();
 pairKeys.forEach(key => {
 const playerIds = key.split('||');
 const p1 = getPlayerById(playerIds[0]);
 const p2 = getPlayerById(playerIds[1]);
 if (p1 && p2) {
 pairStats.set(key, { pair: [p1, p2], punti: 0, gamesWon: 0, gamesLost: 0 });
 }
 });

 gironeMatches.forEach(match => {
 const key1 = pairKey(match.team1);
 const key2 = pairKey(match.team2);
 const team1Games = match.sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = match.sets.reduce((sum, set) => sum + set.team2, 0);

 const team1Stat = pairStats.get(key1);
 const team2Stat = pairStats.get(key2);

 if (team1Stat) {
 team1Stat.gamesWon += team1Games;
 team1Stat.gamesLost += team2Games;
 if (team1Games > team2Games) team1Stat.punti += 3;
 }
 if (team2Stat) {
 team2Stat.gamesWon += team2Games;
 team2Stat.gamesLost += team1Games;
 if (team2Games > team1Games) team2Stat.punti += 3;
 }
 });

 const standings = Array.from(pairStats.values()).sort((a, b) => {
 if (b.punti !== a.punti) return b.punti - a.punti;
 return (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost);
 });

 gironiStandings.push({
 gironeName: String.fromCharCode(65 + gironeIdx),
 standings
 });
 gironeIdx++;
 });

 return gironiStandings;
 };

 const generateGironiSemifinalMatches = (gironiStandings: any[], tournamentOverride?: Tournament): Match[] => {
 const t = tournamentOverride || editingTournament;
 // Qualifica alle semifinali: primi di ogni girone + migliori seconde
 const primi = gironiStandings.map(g => g.standings[0]);
 const seconde = gironiStandings.map(g => g.standings[1]).filter(Boolean);

 const numSecondeNeeded = 4 - primi.length;
 const miglioriSeconde = seconde.sort((a, b) => {
 if (b.punti !== a.punti) return b.punti - a.punti;
 return (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost);
 }).slice(0, numSecondeNeeded);

 const semifinalisti = [...primi, ...miglioriSeconde];

 // Genera semifinali
 const semifinals: Match[] = [];
 const generateMatchId = () => `temp_semifinal_${Date.now()}_${Math.random()}`;

 if (semifinalisti.length >= 4) {
 semifinals.push({
 id: generateMatchId(),
 date: t?.date || new Date().toISOString(),
 team1: [semifinalisti[0].pair[0].id, semifinalisti[0].pair[1].id] as [string, string],
 team2: [semifinalisti[3].pair[0].id, semifinalisti[3].pair[1].id] as [string, string],
 sets: [{ team1: 0, team2: 0 }],
 winner: null,
 tournamentId: t?.id
 });

 semifinals.push({
 id: generateMatchId(),
 date: t?.date || new Date().toISOString(),
 team1: [semifinalisti[1].pair[0].id, semifinalisti[1].pair[1].id] as [string, string],
 team2: [semifinalisti[2].pair[0].id, semifinalisti[2].pair[1].id] as [string, string],
 sets: [{ team1: 0, team2: 0 }],
 winner: null,
 tournamentId: t?.id
 });
 }

 return semifinals;
 };

 const handlePrintTournament = (tournament: Tournament) => {
 try {
 console.log(`🎯 MatchesPage: Printing tournament ${tournament.name} of type ${tournament.type}`);
 const tournamentMatches = matches.filter(m => m.tournamentId === tournament.id);
 console.log(`🎯 MatchesPage: Found ${tournamentMatches.length} matches for tournament`);
 
 let standings: TournamentStandingEntry[];
 if (tournament.type === TournamentType.Americano) {
 console.log(`🎯 MatchesPage: Using Americano calculation`);
 standings = calculateAmericanoStandings(tournamentMatches, editingTournament?.americanoScoringType);
 } else if (tournament.type === TournamentType.RoundRobinFinali && tournamentMatches.length > 2) {
 console.log(`🎯 MatchesPage: Using Round Robin + Finali calculation`);
 const roundRobinMatchCount = tournamentMatches.length - 2;
 standings = calculateFinalStandingsForRoundRobinFinali(tournamentMatches, roundRobinMatchCount, getPlayerById as any);
 } else {
 console.log(`🎯 MatchesPage: Using standard calculation`);
 standings = calculateTournamentStandings(tournamentMatches, getPlayerById as any);
 }
 
 // For Americano tournaments, we need to get the americanoFields parameter
 // Use the actual americanoFields from the tournament data
 const americanoFields = tournament.type === TournamentType.Americano ? tournament.americanoFields : undefined;
 
 // For Round Robin + Finali tournaments, calculate the number of round robin matches
 // (Total matches - 2 finals matches)
 const roundRobinMatchCount = tournament.type === TournamentType.RoundRobinFinali && tournamentMatches.length > 2
 ? tournamentMatches.length - 2
 : undefined;
 
 // Handle Beat the Box tournaments
 if (tournament.type === TournamentType.BeatTheBox) {
 if (tournament.status === 'scheduled') {
 // Print blank score sheet for scheduled tournaments
 // FILTRA SOLO I BOX MATCHES (escludi semifinali e finali)
 
 // Conta giocatori unici per determinare il numero di box
 const uniquePlayerIds = new Set<string>();
 // Use player-set grouping (order-independent)
 const { boxes: groupedPrintBoxes } = groupMatchesByPlayerSets(tournamentMatches);
 const boxes: { boxNumber: number; players: Player[]; matches: Match[] }[] = [];
 groupedPrintBoxes.forEach((bMatches, boxNum) => {
 const playerIdsSet = new Set<string>();
 bMatches.forEach(m => {
 m.team1.forEach(id => playerIdsSet.add(id));
 m.team2.forEach(id => playerIdsSet.add(id));
 });
 boxes.push({
 boxNumber: boxNum,
 players: Array.from(playerIdsSet).map(id => getPlayerById(id)).filter((p): p is Player => p !== undefined),
 matches: bMatches
 });
 });
 
 printBeatTheBoxBlank(tournament, boxes, getPlayerById as any);
 } else {
 // Print complete report for completed tournaments
 const { boxes, boxStandings, semifinalMatches, finalMatches, individualStandings } = processBeatTheBoxData(tournamentMatches, getPlayerById as any);
 
 // USA SEMPRE I DATI RICALCOLATI (stesso algoritmo dell'UI)
 printBeatTheBoxComplete(tournament, boxes, boxStandings, semifinalMatches, finalMatches, individualStandings, getPlayerById, getTournamentDisplayName(tournament, tournaments));
 }
 return;
 }
 
 // Handle Torneo Libero tournaments
 if (tournament.type === TournamentType.TorneoLibero) {
 const pairMap = new Map<string, [Player, Player]>();
 tournamentMatches.forEach(match => {
 const p1a = getPlayerById(match.team1[0]);
 const p1b = getPlayerById(match.team1[1]);
 const p2a = getPlayerById(match.team2[0]);
 const p2b = getPlayerById(match.team2[1]);
 
 if (p1a && p1b) {
 const key = [match.team1[0], match.team1[1]].sort().join('-');
 if (!pairMap.has(key)) pairMap.set(key, [p1a, p1b]);
 }
 if (p2a && p2b) {
 const key = [match.team2[0], match.team2[1]].sort().join('-');
 if (!pairMap.has(key)) pairMap.set(key, [p2a, p2b]);
 }
 });
 
 const pairs = Array.from(pairMap.values());
 const playerPairCount = new Map<string, number>();
 pairs.forEach(pair => {
 pair.forEach(player => {
 playerPairCount.set(player.id, (playerPairCount.get(player.id) || 0) + 1);
 });
 });
 
 const isRotating = Array.from(playerPairCount.values()).some(count => count > 1);
 const mode: 'fixed' | 'rotating' = isRotating ? 'rotating' : 'fixed';
 
 printTorneoLiberoComplete(tournament, tournamentMatches, pairs, mode, getPlayerById, getTournamentDisplayName(tournament, tournaments));
 return;
 }
 
 // Handle Gironi + Fase Finale tournaments
 if (tournament.type === TournamentType.GironiFaseFinale) {
 printGironiTournament(tournament, tournamentMatches, getPlayerById, getTournamentDisplayName(tournament, tournaments));
 return;
 }
 
 printTournamentReport(tournament, standings, tournamentMatches, getPlayerById, americanoFields, tournament.americanoScoringType, roundRobinMatchCount, getTournamentDisplayName(tournament, tournaments));
 } catch (error) {
 console.error('❌ Error in handlePrintTournament:', error);
 showHIGAlert('Errore durante la stampa del torneo: ' + error.message);
 }
 };

 // Smart open handler: detects multi-phase tournament state and resumes from the right point
 const handleOpenTournament = async (tournament: Tournament) => {
 if (tournament.type === TournamentType.TorneoASquadre) {
 const isTeamMatchday =
 !!tournament.teamTournamentRootId ||
 !!tournament.giornataName ||
 !!tournament.teamTournamentTeam1Number ||
 !!tournament.teamTournamentTeam2Number;

 if (isTeamMatchday && onNavigateToTeamTournamentMatchdayResults) {
 onNavigateToTeamTournamentMatchdayResults(tournament.id);
 return;
 }
 showHIGAlert('Per i tornei a squadre la modifica risultati va aperta dalla giornata dedicata.');
 return;
 }

 const isBeatTheBox = tournament.type === TournamentType.BeatTheBox;
 const isGironiFaseFinale = tournament.type === TournamentType.GironiFaseFinale;
 const isRoundRobinFinali = tournament.type === TournamentType.RoundRobinFinali;
 const isMultiPhase = isBeatTheBox || isGironiFaseFinale || isRoundRobinFinali;

 // Non-multi-fase: apri sempre il modale semplice
 if (!isMultiPhase) {
 setEditingTournament(tournament);
 return;
 }

 // Multi-fase completato: cascade reset (cancella semifinali/finali, reverte ELO),
 // poi apri editing con solo le partite dei gironi/box
 if (tournament.status === 'completed') {
 const tournamentMatches = matches.filter(m => m.tournamentId === tournament.id);
 let phaseMatchIds: string[] = [];

 if (isBeatTheBox) {
 const { phaseMatches } = groupMatchesByPlayerSets(tournamentMatches);
 phaseMatchIds = phaseMatches.map(m => m.id);
 } else if (isGironiFaseFinale) {
 // Ultime 4 partite = 2 semifinali + 2 finali (ordinate per created_at)
 if (tournamentMatches.length > 4) {
 phaseMatchIds = tournamentMatches.slice(-4).map(m => m.id);
 }
 } else if (isRoundRobinFinali) {
 // Ultime 2 partite = finali
 if (tournamentMatches.length > 2) {
 phaseMatchIds = tournamentMatches.slice(-2).map(m => m.id);
 }
 }

 if (phaseMatchIds.length > 0) {
 try {
 await cascadeResetTournament(tournament.id, phaseMatchIds);
 // fetchData() viene chiamato internamente (skipRefresh=false)
 // Dopo: status='scheduled', solo partite gironi rimaste
 setEditingTournament({ ...tournament, status: 'scheduled' as const });
 } catch (error) {
 console.error('Cascade reset failed:', error);
 showHIGAlert('Errore nel reset del torneo. Riprova.');
 }
 return;
 }

 setEditingTournament(tournament);
 return;
 }

 // Check if already in a flow
 const alreadyInFlow = showBeatBoxStandingsModal || isInBeatBoxFinalsPhase ||
 isInBeatBoxSemifinalsPhase || !!finalsFlowTournament ||
 showGironiStandingsModal || isInGironiSemifinalsPhase || isInGironiFinalsPhase ||
 showFinalsStandingsModal || isInFinalsPhase;

 if (alreadyInFlow) {
 setEditingTournament(tournament);
 return;
 }

 const tournamentMatches = matches.filter(m => m.tournamentId === tournament.id);
 const { boxes } = groupMatchesByPlayerSets(tournamentMatches);
 const initialPhaseMatches = boxes.size > 0 ? Array.from(boxes.values()).flat() : tournamentMatches;

 // Controlla se le partite della fase iniziale (box/gironi) sono tutte completate
 const initialPhaseCompleted = initialPhaseMatches.length > 0 &&
 initialPhaseMatches.every(m => m.winner && m.sets.length > 0 &&
 !(m.sets.length === 1 && m.sets[0].team1 === 0 && m.sets[0].team2 === 0));

 if (!initialPhaseCompleted) {
 setEditingTournament(tournament);
 return;
 }

 // ===== BEAT THE BOX RESUME =====
 if (isBeatTheBox) {
 const { boxes, phaseMatches: existingFinalsMatches } = groupMatchesByPlayerSets(tournamentMatches);
 const boxMatchesAll = Array.from(boxes.values()).flat();

 const numBoxes = boxes.size;
 setBeatBoxNumBoxes(numBoxes);

 // Create boxesData
 const boxesData: { boxNumber: number; players: any[]; matches: any[] }[] = [];
 boxes.forEach((boxMatches, boxNum) => {
 const allPlayers = new Set<string>();
 boxMatches.forEach(m => {
 m.team1.forEach(id => allPlayers.add(id));
 m.team2.forEach(id => allPlayers.add(id));
 });
 boxesData.push({
 boxNumber: boxNum,
 players: Array.from(allPlayers).map(id => getPlayerById(id)!).filter(Boolean),
 matches: boxMatches
 });
 });

 const standings = calculateAllBoxStandings(boxMatchesAll, boxesData);
 setBeatBoxStandings(standings);
 setFinalsFlowTournament(tournament);

 if (existingFinalsMatches.length === 0) {
 // No finals yet - generate and show standings modal
 const { semifinals, finals } = createBeatBoxFinalsMatches(numBoxes, standings, tournament.date, undefined, (tournament.playoffType as any) || 'semifinals');
 if (semifinals && semifinals.length > 0) {
 setBeatBoxSemifinalMatches(semifinals.map((m, i) => ({
 ...m, id: `temp-sf-${i}`, tournamentId: tournament.id
 } as Match)));
 setBeatBoxFinalMatches([]);
 } else {
 setBeatBoxFinalMatches(finals.map((m, i) => ({
 ...m, id: `temp-final-${i}`, tournamentId: tournament.id
 } as Match)));
 setBeatBoxSemifinalMatches([]);
 }
 setShowBeatBoxStandingsModal(true);
 } else {
 // Finals/Semifinals exist in DB, populate state & resume from appropriate phase
 const is4OrMoreBoxes = numBoxes >= 4;
 const totalExpectedFinalMatches = is4OrMoreBoxes ? 6 : (numBoxes === 3 ? 3 : 2);

 const hasAllExpectedFinalMatches = existingFinalsMatches.length >= totalExpectedFinalMatches;
 const allFinalsCompleted = hasAllExpectedFinalMatches && existingFinalsMatches.every(m => m.winner && m.sets.length > 0);

 if (allFinalsCompleted && tournament.status === 'completed') {
 setEditingTournament(tournament);
 } else if (is4OrMoreBoxes && existingFinalsMatches.length >= 2) {
 const semiMatches = existingFinalsMatches.slice(0, 2);
 const finalMatchesInDb = existingFinalsMatches.slice(2);
 const allSemisCompleted = semiMatches.every(m => m.winner && m.sets.length > 0);

 setBeatBoxSemifinalMatches(semiMatches);

 if (allSemisCompleted) {
 if (finalMatchesInDb.length > 0) {
 setBeatBoxFinalMatches(finalMatchesInDb);
 } else {
 const sfResults = {
 sf1Winner: semiMatches[0].winner as 'team1' | 'team2',
 sf2Winner: semiMatches[1].winner as 'team1' | 'team2',
 };
 const { finals } = createBeatBoxFinalsMatches(
 numBoxes,
 standings,
 tournament.date,
 sfResults,
 (tournament.playoffType as any) || 'semifinals'
 );
 setBeatBoxFinalMatches(finals.map((m, i) => ({
 ...m,
 id: `temp-final-${i}`,
 tournamentId: tournament.id
 } as Match)));
 }
 setIsInBeatBoxFinalsPhase(true);
 } else {
 setIsInBeatBoxSemifinalsPhase(true);
 }
 } else {
 setBeatBoxFinalMatches(existingFinalsMatches);
 setIsInBeatBoxFinalsPhase(true);
 }
 }
 return;
 }
 
 // ===== GIRONI + FASE FINALE RESUME =====
 if (isGironiFaseFinale) {
 setFinalsFlowTournament(tournament);
 const standings = calculateGironiStandings(tournamentMatches);
 setGironiStandings(standings);
 
 const gironiMatchCount = tournamentMatches.length > 4 ? tournamentMatches.length - 4 : tournamentMatches.length;
 const phaseMatchesInDb = tournamentMatches.slice(gironiMatchCount);
 
 if (phaseMatchesInDb.length >= 2) {
 const semiInDb = phaseMatchesInDb.slice(0, 2);
 const finalInDb = phaseMatchesInDb.slice(2);
 const allSemisCompleted = semiInDb.every(m => m.winner && m.sets.length > 0);
 
 setGironiSemifinalMatches(semiInDb);
 
 if (allSemisCompleted) {
 if (finalInDb.length > 0) {
 setGironiFinalMatches(finalInDb);
 } else {
 const generatedFinals = generateGironiFinalMatches(semiInDb, tournament);
 setGironiFinalMatches(generatedFinals);
 }
 setIsInGironiFinalsPhase(true);
 } else {
 setIsInGironiSemifinalsPhase(true);
 }
 } else {
 const semifinals = generateGironiSemifinalMatches(standings, tournament);
 setGironiSemifinalMatches(semifinals);
 setGironiFinalMatches([]);
 setShowGironiStandingsModal(true);
 }
 return;
 }
 
 // ===== ROUND ROBIN + FINALI RESUME =====
 if (isRoundRobinFinali) {
 setFinalsFlowTournament(tournament);
 const standings = calculateTournamentStandings(tournamentMatches, getPlayerById as any);
 setRoundRobinStandings(standings);
 
 const rrMatchCount = tournamentMatches.length > 2 ? tournamentMatches.length - 2 : tournamentMatches.length;
 const finalsInDb = tournamentMatches.slice(rrMatchCount);
 
 if (finalsInDb.length > 0) {
 setFinalsMatches(finalsInDb);
 setIsInFinalsPhase(true);
 } else {
 const top4 = standings.slice(0, 4);
 const finals = generateFinalsMatches(top4, tournament);
 setFinalsMatches(finals);
 setFinalsScores({});
 setShowFinalsStandingsModal(true);
 }
 return;
 }
 
 // Fallback
 setEditingTournament(tournament);
 };

 const handleDeleteTournament = (tournamentId: string) => {
 setDeleteAlert({ isOpen: true, tournamentId, isDeleting: false, progressPercent: 0, loadingText: '' });
 };

 const handleConfirmDeleteTournament = async (cascade: boolean) => {
 setDeleteAlert(prev => ({
 ...prev,
 isDeleting: true,
 progressPercent: 15,
 loadingText: cascade ? "Eliminazione torneo e giocatori..." : "Eliminazione torneo in corso..."
 }));

 try {
 const interval = setInterval(() => {
 setDeleteAlert(prev => {
 if (prev.progressPercent && prev.progressPercent < 85) {
 return { ...prev, progressPercent: prev.progressPercent + 20 };
 }
 return prev;
 });
 }, 100);

 if (deleteAlert.tournamentId) {
 await deleteTournament(deleteAlert.tournamentId, cascade);
 }

 clearInterval(interval);
 setDeleteAlert(prev => ({ ...prev, progressPercent: 100, loadingText: "Completato!" }));

 setTimeout(() => {
 setDeleteAlert({ isOpen: false, tournamentId: null, isDeleting: false, progressPercent: 0, loadingText: '' });
 setShowDeleteSuccess(true);
 }, 300);
 } catch (error) {
 console.error("Errore eliminazione torneo:", error);
 setDeleteAlert({ isOpen: false, tournamentId: null, isDeleting: false, progressPercent: 0, loadingText: '' });
 }
 };

 const handleRequestDeleteMatch = (matchId: string) => {
 setDeleteMatchAlert({ isOpen: true, matchId, isDeleting: false, progressPercent: 0, loadingText: '' });
 };

 const handleConfirmDeleteMatch = async () => {
 if (!deleteMatchAlert.matchId) return;
 setDeleteMatchAlert(prev => ({
 ...prev,
 isDeleting: true,
 progressPercent: 15,
 loadingText: "Eliminazione partita in corso..."
 }));

 try {
 const interval = setInterval(() => {
 setDeleteMatchAlert(prev => {
 if (prev.progressPercent && prev.progressPercent < 85) {
 return { ...prev, progressPercent: prev.progressPercent + 25 };
 }
 return prev;
 });
 }, 100);

 await deleteMatch(deleteMatchAlert.matchId);

 clearInterval(interval);
 setDeleteMatchAlert(prev => ({ ...prev, progressPercent: 100, loadingText: "Completato!" }));

 setTimeout(() => {
 setDeleteMatchAlert({ isOpen: false, matchId: null, isDeleting: false, progressPercent: 0, loadingText: '' });
 }, 300);
 } catch (error) {
 console.error("Errore eliminazione partita:", error);
 setDeleteMatchAlert({ isOpen: false, matchId: null, isDeleting: false, progressPercent: 0, loadingText: '' });
 }
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (selectedPlayers.length !== 4) {
 showHIGAlert('Per favore, seleziona 4 giocatori distinti.');
 return;
 }

 const team1Games = sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum, set) => sum + set.team2, 0);

 // I pareggi sono permessi anche nei match amichevoli

 setIsSubmitting(true);
 try {
 await addMatch({
 date: new Date().toISOString(),
 team1: [team1Player1, team1Player2],
 team2: [team2Player1, team2Player2],
 sets,
 winner: team1Games === team2Games ? 'draw' : (team1Games > team2Games ? 'team1' : 'team2'),
 });
 resetForm();
 } catch (error) {
 console.error("Failed to add match:", error);
 } finally {
 setIsSubmitting(false);
 }
 };

 const submitEditScores = async (e?: React.FormEvent | null, onlySave: boolean = false) => {
 if (e) e.preventDefault();
 if (!editingTournament) return;

 const isRoundRobinFinali = editingTournament.type === TournamentType.RoundRobinFinali;
 const isBeatTheBox = editingTournament.type === TournamentType.BeatTheBox;
 const isGironiFaseFinale = editingTournament.type === TournamentType.GironiFaseFinale;
 const isMultiPhase = isRoundRobinFinali || isBeatTheBox || isGironiFaseFinale;

 // ====== CASCADE UPDATE: Detect phase matches in completed multi-phase tournaments ======
 const allTournamentMatches = matches.filter(m => m.tournamentId === editingTournament.id);
 let phaseMatchIds: string[] = [];

 if (isMultiPhase && editingTournament.status === 'completed') {
 if (isBeatTheBox) {
 // Beat the Box: use player-set grouping (order-independent)
 const { phaseMatches } = groupMatchesByPlayerSets(allTournamentMatches);
 phaseMatchIds = phaseMatches.map(m => m.id);
 } else if (isGironiFaseFinale && allTournamentMatches.length > 4) {
 // Gironi: ultime 4 partite = 2 semifinali + 2 finali (ordinate per created_at)
 phaseMatchIds = allTournamentMatches.slice(-4).map(m => m.id);
 } else if (isRoundRobinFinali && allTournamentMatches.length > 2) {
 // RR+Finali: finals are last 2 matches (relies on created_at ordering from DB)
 phaseMatchIds = allTournamentMatches.slice(allTournamentMatches.length - 2).map(m => m.id);
 }
 }

 const cascadeTriggered = phaseMatchIds.length > 0;
 const phaseMatchIdSet = new Set(phaseMatchIds);

 // Cascade reset also for simple completed tournaments (to recalculate ELO)
 const simpleCompletedCascade = !isMultiPhase && editingTournament.status === 'completed';

 // Build match updates - exclude phase matches if cascade is triggered (they will be regenerated)
 const matchUpdates = Object.keys(editScores)
 .filter(matchId => !phaseMatchIdSet.has(matchId))
 .map((matchId) => ({
 matchId,
 sets: editScores[matchId],
 }));

 setIsSubmitting(true);
 try {
 console.log(`💾 [submitEditScores] Saving ${matchUpdates.length} match updates:`, matchUpdates.map(u => ({
 id: u.matchId.substring(0, 8),
 sets: u.sets
 })));
 await updateTournamentMatches(matchUpdates, true);

 // Se l'utente ha richiesto solo un salvataggio parziale (es. durante la fase a gironi/box/ecc)
 if (onlySave) {
     await fetchData(); // Assicura che i match siano aggiornati localmente
     setEditingTournament(null);
     setShowSaveSuccess(true);
     return; // Interrompe il flusso senza generare le fasi successive
 }

 // ====== CAPTURE INITIAL PHASE MATCHES BEFORE CASCADE ======
 // These matches won't be deleted, so we can safely use them later
 let initialPhaseMatches: Match[] = [];
 if (cascadeTriggered) {
 initialPhaseMatches = matches
 .filter(m => m.tournamentId === editingTournament.id && !phaseMatchIdSet.has(m.id))
 .map(match => {
 const sets = editScores[match.id] || match.sets;
 const team1Games = sets.reduce((sum: number, set: SetScore) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum: number, set: SetScore) => sum + set.team2, 0);
 return {
 ...match,
 sets,
 winner: team1Games === team2Games ? 'draw' : (team1Games > team2Games ? 'team1' : 'team2')
 } as Match;
 });
 console.log(`📋 Captured ${initialPhaseMatches.length} initial phase matches before cascade`);
 }

 // ====== PERFORM CASCADE RESET ======
 if (cascadeTriggered || simpleCompletedCascade) {
 console.log(`🔄 Cascade reset: ${cascadeTriggered ? `deleting ${phaseMatchIds.length} phase matches` : 'reverting ELO'} for tournament ${editingTournament.id}`);
 await cascadeResetTournament(editingTournament.id, phaseMatchIds, true);
 console.log(`✅ Cascade reset completed - tournament status reset to scheduled`);
 }

 // For phase generation, use effective status (scheduled after cascade)
 const effectiveStatus = (cascadeTriggered || simpleCompletedCascade) ? 'scheduled' : editingTournament.status;
 
 // BEAT THE BOX: Gestione fase box → finali
 if (effectiveStatus === 'scheduled' && isBeatTheBox && !isInBeatBoxFinalsPhase && !isInBeatBoxSemifinalsPhase) {
 console.log(`📦 Beat the Box: Box phase completed, calculating standings...`);

 // Save tournament reference (with effective status for cascade)
 setFinalsFlowTournament(cascadeTriggered ? { ...editingTournament, status: 'scheduled' } : editingTournament);

 // Use pre-captured initial phase matches if cascade was triggered
 // Otherwise, calculate from current state
 const tournamentMatches = cascadeTriggered
 ? initialPhaseMatches
 : matches.filter(m => m.tournamentId === editingTournament.id && !phaseMatchIdSet.has(m.id)).map(match => {
 const sets = editScores[match.id] || match.sets;
 const team1Games = sets.reduce((sum: number, set: SetScore) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum: number, set: SetScore) => sum + set.team2, 0);
 return {
 ...match,
 sets,
 winner: team1Games === team2Games ? 'draw' : (team1Games > team2Games ? 'team1' : 'team2')
 } as Match;
 });
 
 // Use player-set grouping (order-independent)
 const { boxes: groupedBoxes } = groupMatchesByPlayerSets(tournamentMatches);
 const numBoxes = groupedBoxes.size;
 setBeatBoxNumBoxes(numBoxes);

 // Crea boxesData dal raggruppamento per giocatori
 const boxesData: { boxNumber: number; players: any[]; matches: any[] }[] = [];
 const allBoxMatches: Match[] = [];
 groupedBoxes.forEach((boxMatches, boxNum) => {
 allBoxMatches.push(...boxMatches);
 const allPlayers = new Set<string>();
 boxMatches.forEach(m => {
 m.team1.forEach(id => allPlayers.add(id));
 m.team2.forEach(id => allPlayers.add(id));
 });
 boxesData.push({
 boxNumber: boxNum,
 players: Array.from(allPlayers).map(id => getPlayerById(id)!).filter(Boolean),
 matches: boxMatches,
 });
 });

 // Calcola classifiche box
 const standings = calculateAllBoxStandings(allBoxMatches, boxesData);
 setBeatBoxStandings(standings);
 
 // Genera finali/semifinali
 const { semifinals, finals } = createBeatBoxFinalsMatches(
     numBoxes,
     standings,
     editingTournament.date,
     undefined, // semifinalResults
     (editingTournament.playoffType as any) || 'semifinals'
 );
 
 if (semifinals && semifinals.length > 0) {
 // 8+ coppie: genera semifinali
 setBeatBoxSemifinalMatches(semifinals.map((m, i) => ({
 ...m,
 id: `temp-sf-${i}`,
 tournamentId: editingTournament.id,
 } as Match)));
 setBeatBoxFinalMatches([]);
 } else {
 // 4-6 coppie: genera finali direttamente
 setBeatBoxFinalMatches(finals.map((m, i) => ({
 ...m,
 id: `temp-final-${i}`,
 tournamentId: editingTournament.id,
 } as Match)));
 setBeatBoxSemifinalMatches([]);
 }
 
 // Mostra modale classifiche
 setShowBeatBoxStandingsModal(true);
 setIsSubmitting(false);
 return;
 }
 
 // If tournament is scheduled (or cascade-reset) and is Round Robin + Finali, calculate standings and prepare finals
 if (effectiveStatus === 'scheduled' && isRoundRobinFinali && !isInFinalsPhase) {
 console.log(`🎯 Round Robin phase completed, calculating standings...`);

 // Save tournament reference for finals flow (with effective status for cascade)
 const effectiveTournament = cascadeTriggered ? { ...editingTournament, status: 'scheduled' as const } : editingTournament;
 setFinalsFlowTournament(effectiveTournament);
 console.log(`🔒 Saved finalsFlowTournament:`, editingTournament.name);

 // Use pre-captured initial phase matches if cascade was triggered
 const tournamentMatches = cascadeTriggered
 ? initialPhaseMatches
 : matches.filter(m => m.tournamentId === editingTournament.id && !phaseMatchIdSet.has(m.id)).map(match => {
 const sets = editScores[match.id] || match.sets;
 const team1Games = sets.reduce((sum: number, set: SetScore) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum: number, set: SetScore) => sum + set.team2, 0);
 return {
 ...match,
 sets,
 winner: team1Games === team2Games ? 'draw' : (team1Games > team2Games ? 'team1' : 'team2')
 } as Match;
 });
 
 // Calculate standings
 const standings = calculateTournamentStandings(tournamentMatches, getPlayerById as any);
 console.log(`🎯 Calculated standings:`, standings);
 
 setRoundRobinStandings(standings);
 
 // Generate finals matches
 const top4 = standings.slice(0, 4);
 const finals = generateFinalsMatches(top4);
 setFinalsMatches(finals);
 setFinalsScores({});
 
 // Show standings modal
 setShowFinalsStandingsModal(true);
 setIsSubmitting(false);
 return;
 }
 
 // GIRONI + FASE FINALE: Gestione fase gironi → semifinali → finali
 if (effectiveStatus === 'scheduled' && isGironiFaseFinale && !isInGironiSemifinalsPhase && !isInGironiFinalsPhase) {
 console.log(`🏆 Gironi: Gironi phase completed, calculating standings...`);

 // Save tournament reference (with effective status for cascade)
 setFinalsFlowTournament(cascadeTriggered ? { ...editingTournament, status: 'scheduled' } : editingTournament);

 // Use pre-captured initial phase matches if cascade was triggered
 const tournamentMatches = cascadeTriggered
 ? initialPhaseMatches
 : matches.filter(m => m.tournamentId === editingTournament.id && !phaseMatchIdSet.has(m.id)).map(match => {
 const sets = editScores[match.id] || match.sets;
 const team1Games = sets.reduce((sum: number, set: SetScore) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum: number, set: SetScore) => sum + set.team2, 0);
 return {
 ...match,
 sets,
 winner: team1Games === team2Games ? 'draw' : (team1Games > team2Games ? 'team1' : 'team2')
 } as Match;
 });
 
 // Calcola classifiche gironi
 const standings = calculateGironiStandings(tournamentMatches);
 setGironiStandings(standings);
 
 // Genera semifinali
 const semifinals = generateGironiSemifinalMatches(standings);
 if (semifinals.length < 2) {
 console.error('Failed to generate Gironi semifinals - not enough qualified teams');
 showHIGAlert('Errore: impossibile generare le semifinali. Verifica i risultati dei gironi.');
 setIsSubmitting(false);
 return;
 }
 setGironiSemifinalMatches(semifinals);
 setGironiFinalMatches([]);

 // Mostra modale classifiche
 setShowGironiStandingsModal(true);
 setIsSubmitting(false);
 return;
 }
 
 // If tournament is scheduled (or cascade-reset to scheduled), complete it normally
 if (effectiveStatus === 'scheduled') {
 console.log(`🏁 Completing tournament ${editingTournament.id}`);
 
 const response = await fetch('/api/tournaments/complete', {
 method: 'PUT',
 headers: authHeaders(),
 body: JSON.stringify({ tournamentId: editingTournament.id }),
 });
 
 if (!response.ok) {
 throw new Error('Failed to complete tournament');
 }
 
 console.log('✅ Tournament completed successfully');
 showHIGAlert('Torneo completato! I punteggi ELO sono stati aggiornati.');
 }

 await fetchData(); // Single refresh at the end
 setEditingTournament(null);
 setIsInFinalsPhase(false);
 } catch (error) {
 console.error("Failed to update scores:", error);
 showHIGAlert('Errore nell\'aggiornamento dei risultati. Riprova.');
 await fetchData(); // Refresh on error too to sync state
 } finally {
 setIsSubmitting(false);
 }
 };

 const handleProceedToFinalsPhase = () => {
 console.log(`🎯 Proceeding to finals phase...`);
 console.log(`🎯 editingTournament:`, editingTournament);
 console.log(`🎯 finalsFlowTournament:`, finalsFlowTournament);
 console.log(`🎯 finalsMatches:`, finalsMatches);
 setShowFinalsStandingsModal(false);
 
 // Use setTimeout to ensure the standings modal closes before opening finals modal
 setTimeout(() => {
 setIsInFinalsPhase(true);
 console.log(`🎯 isInFinalsPhase set to true`);
 }, 100);
 };
 
 const handleCompleteTournamentWithFinals = async () => {
 const tournament = finalsFlowTournament || editingTournament;
 if (!tournament) {
 console.error('❌ No tournament reference available!');
 return;
 }
 
 console.log(`🏁 Completing Round Robin + Finali tournament ${tournament.id}`);
 
 setIsSubmitting(true);
 try {
 // Save finals matches to database
 const finalsMatchesToSave = finalsMatches.map(match => {
 const sets = finalsScores[match.id] || match.sets;
 const team1Games = sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum, set) => sum + set.team2, 0);
 
 return {
 date: match.date,
 team1: match.team1,
 team2: match.team2,
 sets,
 winner: team1Games === team2Games ? 'draw' : (team1Games > team2Games ? 'team1' : 'team2'),
 tournamentId: tournament.id
 };
 });
 
 // Add finals matches
 for (const match of finalsMatchesToSave) {
 const response = await fetch('/api/matches', {
 method: 'POST',
 headers: authHeaders(),
 body: JSON.stringify(match),
 });
 
 if (!response.ok) {
 throw new Error('Failed to save finals match');
 }
 }
 
 // Complete the tournament
 const completeResponse = await fetch('/api/tournaments/complete', {
 method: 'PUT',
 headers: authHeaders(),
 body: JSON.stringify({ tournamentId: tournament.id }),
 });
 
 if (!completeResponse.ok) {
 throw new Error('Failed to complete tournament');
 }
 
 console.log('✅ Round Robin + Finali tournament completed successfully');
 showHIGAlert('Torneo completato con finali! I punteggi ELO sono stati aggiornati.');
 
 // Reset states
 setEditingTournament(null);
 setFinalsFlowTournament(null);
 setIsInFinalsPhase(false);
 setFinalsMatches([]);
 setFinalsScores({});
 setRoundRobinStandings([]);
 setShowFinalsStandingsModal(false);

 await fetchData();
 } catch (error) {
 console.error("Failed to complete tournament with finals:", error);
 showHIGAlert('Errore nel completamento del torneo. Riprova.');
 await fetchData();
 } finally {
 setIsSubmitting(false);
 }
 };
 
 const handleCompleteBeatBoxTournament = async () => {
 console.log('🔵 handleCompleteBeatBoxTournament chiamato');
 const tournament = finalsFlowTournament;
 console.log('🔵 Tournament:', tournament);
 if (!tournament) {
 console.error('❌ No tournament reference available!');
 showHIGAlert('❌ Errore: riferimento torneo non disponibile');
 return;
 }
 
 setShowBeatBoxCompleteConfirm(false);
 setIsSubmitting(true);
 
 console.log('🔵 Salvando matches...', beatBoxSemifinalMatches.length + beatBoxFinalMatches.length);
 
 try {
 // Salva tutte le partite (semifinali + finali) nel DB
 const allNewMatches = [
 ...beatBoxSemifinalMatches,
 ...beatBoxFinalMatches
 ];
 
 const existing = allNewMatches.filter(m => !m.id.startsWith('temp-'));
 if (existing.length > 0) {
     await updateTournamentMatches(existing.map(m => ({ matchId: m.id, sets: m.sets, winner: m.winner })), true);
 }
 
 const temp = allNewMatches.filter(m => m.id.startsWith('temp-'));
 for (const match of temp) {
 const matchResponse = await fetch('/api/matches', {
 method: 'POST',
 headers: authHeaders(),
 body: JSON.stringify({
 date: match.date,
 team1: match.team1,
 team2: match.team2,
 sets: match.sets,
 winner: match.winner,
 tournamentId: tournament.id,
 }),
 });
 if (!matchResponse.ok) {
 throw new Error('Failed to save match');
 }
 const savedMatch = await matchResponse.json();
 match.id = savedMatch.id;
 }

 // Completa il torneo
 const completeResponse = await fetch('/api/tournaments/complete', {
 method: 'PUT',
 headers: authHeaders(),
 body: JSON.stringify({ tournamentId: tournament.id }),
 });
 
 if (!completeResponse.ok) {
 throw new Error('Failed to complete tournament');
 }
 
 console.log('✅ Beat the Box tournament completed successfully');
 
 // Calcola classifiche finali prima di mostrare il modal
 const allTournamentMatches = matches.filter(m => m.tournamentId === tournament.id);
 const allMatchesWithNewOnes = [
 ...allTournamentMatches,
 ...allNewMatches
 ];
 
 // Calcola variazioni ELO individuali
 const K = 16; // Beat the Box K-factor
 const playerEloChanges = new Map<string, number>();
 const tournamentElos = new Map<string, number>();
 const playerStats = new Map<string, { gamesWon: number; gamesLost: number }>();
 
 // Inizializza ELO per tutti i giocatori coinvolti
 const allPlayerIds = new Set<string>();
 allMatchesWithNewOnes.forEach(m => {
 [...m.team1, ...m.team2].forEach(id => allPlayerIds.add(id));
 });
 
 allPlayerIds.forEach(id => {
 const player = getPlayerById(id);
 if (player) {
 tournamentElos.set(id, player.currentElo);
 }
 });
 
 // Processa tutti i match in ordine
 allMatchesWithNewOnes.forEach(match => {
 if (!match.winner || match.winner === 'draw') return;
 
 const t1p1 = getPlayerById(match.team1[0]);
 const t1p2 = getPlayerById(match.team1[1]);
 const t2p1 = getPlayerById(match.team2[0]);
 const t2p2 = getPlayerById(match.team2[1]);
 
 if (!t1p1 || !t1p2 || !t2p1 || !t2p2) return;
 
 const t1e1 = tournamentElos.get(match.team1[0]) || t1p1.currentElo;
 const t1e2 = tournamentElos.get(match.team1[1]) || t1p2.currentElo;
 const t2e1 = tournamentElos.get(match.team2[0]) || t2p1.currentElo;
 const t2e2 = tournamentElos.get(match.team2[1]) || t2p2.currentElo;
 
 const team1Avg = (t1e1 + t1e2) / 2;
 const team2Avg = (t2e1 + t2e2) / 2;
 
 const expected1 = 1 / (1 + Math.pow(10, (team2Avg - team1Avg) / 400));
 const score1 = match.winner === 'draw' ? 0.5 : (match.winner === 'team1' ? 1 : 0);
 const delta1 = K * (score1 - expected1);
 const delta2 = -delta1;
 
 [match.team1[0], match.team1[1]].forEach(id => {
 const oldElo = tournamentElos.get(id)!;
 tournamentElos.set(id, oldElo + delta1);
 playerEloChanges.set(id, (playerEloChanges.get(id) || 0) + delta1);
 });
 [match.team2[0], match.team2[1]].forEach(id => {
 const oldElo = tournamentElos.get(id)!;
 tournamentElos.set(id, oldElo + delta2);
 playerEloChanges.set(id, (playerEloChanges.get(id) || 0) + delta2);
 });
 
 // Calcola statistiche games
 const sets = match.sets || [];
 sets.forEach(set => {
 match.team1.forEach(pid => {
 const stats = playerStats.get(pid) || { gamesWon: 0, gamesLost: 0 };
 stats.gamesWon += set.team1;
 stats.gamesLost += set.team2;
 playerStats.set(pid, stats);
 });
 match.team2.forEach(pid => {
 const stats = playerStats.get(pid) || { gamesWon: 0, gamesLost: 0 };
 stats.gamesWon += set.team2;
 stats.gamesLost += set.team1;
 playerStats.set(pid, stats);
 });
 });
 });
 
 // Crea la classifica individuale
 const individualStandings = Array.from(playerEloChanges.entries())
 .map(([playerId, eloChange]) => {
 const player = getPlayerById(playerId);
 const stats = playerStats.get(playerId) || { gamesWon: 0, gamesLost: 0 };
 const winPercentage = (stats.gamesWon + stats.gamesLost) > 0
 ? (stats.gamesWon / (stats.gamesWon + stats.gamesLost)) * 100
 : 0;
 return player ? { player, eloChange, gamesWon: stats.gamesWon, gamesLost: stats.gamesLost, winPercentage, rank: 0 } : null;
 })
 .filter((entry): entry is { player: Player; eloChange: number; gamesWon: number; gamesLost: number; winPercentage: number; rank: number } => entry !== null)
 .sort((a, b) => b.eloChange - a.eloChange)
 .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
 
 setBeatBoxFinalStandings(individualStandings);
 setBeatBoxAllMatches(allMatchesWithNewOnes);
 
 // Mostra success con classifiche
 setShowBeatBoxCompleteSuccess(true);
 } catch (error) {
 console.error("Failed to complete Beat the Box tournament:", error);
 showHIGAlert('Errore nel completare il torneo. Riprova.');
 } finally {
 setIsSubmitting(false);
 }
 };

 /**
     * Salva le partite di una fase intermedia (semifinali / finali) nel DB
     * senza chiudere il torneo. Usato dal bottone "Salva" presente in ogni step.
     */
    const savePhaseMatches = async (matchesList: Match[], tId: string, setMatchesList: (m: Match[]) => void) => {
        const allToSave = matchesList.filter(m => m.sets && m.sets.length > 0 && m.sets.some(s => s.team1 > 0 || s.team2 > 0));
        if (allToSave.length === 0) {
            setShowSaveSuccess(true);
            return;
        }
        setIsSubmitting(true);
        try {
            const existing = allToSave.filter(m => !m.id.startsWith('temp-'));
            if (existing.length > 0) {
                await updateTournamentMatches(existing.map(m => ({ matchId: m.id, sets: m.sets, winner: m.winner })), true);
            }
            const temp = allToSave.filter(m => m.id.startsWith('temp-'));
            const newMatchesList = [...matchesList];
            for (const match of temp) {
                const res = await fetch('/api/matches', {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({
                        date: match.date,
                        team1: match.team1,
                        team2: match.team2,
                        sets: match.sets,
                        winner: match.winner,
                        tournamentId: tId,
                    }),
                });
                if (res.ok) {
                    const savedMatch = await res.json();
                    const index = newMatchesList.findIndex(m => m.id === match.id);
                    if (index !== -1) {
                        newMatchesList[index] = { ...newMatchesList[index], id: savedMatch.id };
                    }
                }
            }
            setMatchesList(newMatchesList);
            await fetchData();
            setShowSaveSuccess(true);
        } catch (e) {
            showHIGAlert('Errore nel salvataggio. Riprova.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleExpand = (id: string) => {
 setExpandedItems(prev => {
 const newSet = new Set(prev);
 if (newSet.has(id)) {
 newSet.delete(id);
 } else {
 newSet.add(id);
 }
 return newSet;
 });
 };

 const hasRealResult = (match: Match) =>
 !!match.winner &&
 Array.isArray(match.sets) &&
 match.sets.length > 0 &&
 !(match.sets.length === 1 && match.sets[0].team1 === 0 && match.sets[0].team2 === 0);

 const { individualMatches, tournamentsByName, sortedTournamentNames } = useMemo(() => {
 const individualMatches = matches
 .filter(m => !m.tournamentId)
 .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

 const tournamentsByName: { [key: string]: Tournament[] } = {};
 tournaments
 .filter(t => {
 if (t.status === 'completed') return true;

 // Team tournaments in progress should be handled from their dedicated pages,
 // not from the generic"Risultati" page.
 if (t.type === TournamentType.TorneoASquadre) return false;

 const tournamentMatches = matches.filter(m => m.tournamentId === t.id);
 return tournamentMatches.some(hasRealResult);
 })
 .forEach(t => {
 const groupKey = t.giornataName || t.name;
 if (!tournamentsByName[groupKey]) {
 tournamentsByName[groupKey] = [];
 }
 tournamentsByName[groupKey].push(t);
 });

 Object.values(tournamentsByName).forEach(group => group.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
 
 const sortedTournamentNames = Object.keys(tournamentsByName).sort((a, b) => {
 const dateA = new Date(tournamentsByName[a][0].date).getTime();
 const dateB = new Date(tournamentsByName[b][0].date).getTime();
 return dateB - dateA;
 });

 return { individualMatches, tournamentsByName, sortedTournamentNames };
 }, [matches, tournaments]);


 return (
 <div className="space-y-6">
 <Card title={
 <div className="flex justify-between items-center w-full">
 <span>Inserisci Risultato Singolo</span>
 <Button 
 onClick={() => setIsMatchFormOpen(!isMatchFormOpen)} 
 onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setIsMatchFormOpen(!isMatchFormOpen); } }}
 role="button"
 tabIndex={0}
 aria-expanded={isMatchFormOpen}
 variant="ghost" 
 size="sm"
 className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
 >
 {isMatchFormOpen ? (
 <span className="text-xl font-bold">−</span>
 ) : (
 <span className="text-xl font-bold text-green-600">+</span>
 )}
 </Button>
 </div>
 }>
 {isMatchFormOpen && (
 <form onSubmit={handleSubmit} className="space-y-6">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div className="space-y-2 py-2 border-b border-gray-100 dark:border-gray-800">
 <h4 className="font-semibold text-lg text-gray-900 dark:text-white">Squadra 1</h4>
 <PlayerSelect players={sortedPlayers} selectedPlayers={selectedPlayers} value={team1Player1} onChange={e => setTeam1Player1(e.target.value)} disabled={isSubmitting} />
 <PlayerSelect players={sortedPlayers} selectedPlayers={selectedPlayers} value={team1Player2} onChange={e => setTeam1Player2(e.target.value)} disabled={isSubmitting} />
 </div>
 <div className="space-y-2 py-2 border-b border-gray-100 dark:border-gray-800">
 <h4 className="font-semibold text-lg text-gray-900 dark:text-white">Squadra 2</h4>
 <PlayerSelect players={sortedPlayers} selectedPlayers={selectedPlayers} value={team2Player1} onChange={e => setTeam2Player1(e.target.value)} disabled={isSubmitting} />
 <PlayerSelect players={sortedPlayers} selectedPlayers={selectedPlayers} value={team2Player2} onChange={e => setTeam2Player2(e.target.value)} disabled={isSubmitting} />
 </div>
 </div>
 <div className="text-center">
 <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Score</label>
 <MatchScoreInput sets={sets} onSetsChange={setSets} disabled={isSubmitting} />
 </div>
 <Button type="submit" className="w-full" disabled={isSubmitting || selectedPlayers.length < 4}>
 {isSubmitting ? 'Salvataggio...' : 'Aggiungi Partita'}
 </Button>
 </form>
 )}
 {!isMatchFormOpen && (
 <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
 Clicca sul pulsante + per inserire una partita singola
 </div>
 )}
 </Card>

 <div className="px-3 md:px-4 pt-3 mb-4">
    <div>
        <h2 className="text-[1.62rem] font-black leading-none tracking-tight text-sky-500 dark:text-sky-300 sm:text-[1.78rem] md:text-[2.25rem]">
            Modifica Risultati
        </h2>
        <div className="mt-2 mb-6 text-gray-500 dark:text-gray-400 text-sm font-normal">
            In questa sezione puoi modificare i risultati già inseriti (ricalcola ELO, qualificati e vincitori)
        </div>
    </div>
 </div>
 <div>
 {loading ? <HistorySkeleton /> : (
 <div className="space-y-4">
 {sortedTournamentNames.map(name => {
 const tournamentDays = tournamentsByName[name];
 const isExpanded = expandedItems.has(`name_${name}`);
 return (
 <Card
 key={name}
 bodyClassName="!overflow-visible !rounded-none !border-0 !bg-transparent !shadow-none !backdrop-blur-none [&>div]:!p-0"
 title={
 <div
 className="flex items-center w-full cursor-pointer"
 onClick={() => toggleExpand(`name_${name}`)}
 onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleExpand(`name_${name}`); } }}
 role="button"
 tabIndex={0}
 aria-expanded={expandedItems.has(`name_${name}`)}
 >
 <ChevronDownIcon className={`h-5 w-5 mr-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
 <span className="font-bold text-xl">{name}</span>
 </div>
 }
 >
 {isExpanded && (
 <div className="space-y-3">
 {tournamentDays.map(day => {
 const isDayExpanded = expandedItems.has(`day_${day.id}`);
 const tournamentDayDisplayName = getTournamentDisplayName(day, tournaments);
 return (
 <div key={day.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
 <div className="p-3 flex justify-between items-center cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-700/50" onClick={() => toggleExpand(`day_${day.id}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleExpand(`day_${day.id}`); } }} role="button" tabIndex={0} aria-expanded={expandedItems.has(`day_${day.id}`)}>
 <div className="flex items-center">
 <ChevronDownIcon className={`h-5 w-5 mr-2 transition-transform ${isDayExpanded ? 'rotate-180' : ''}`} />
 <div>
 <p className="font-semibold text-gray-900 dark:text-white">{tournamentDayDisplayName}</p>
 <p className="text-sm text-gray-500 dark:text-gray-400">{day.type} @ {day.club}</p>
 <p className="text-sm text-gray-500 dark:text-gray-400">{new Date(day.date).toLocaleDateString()}</p>
 {(() => {
 if (day.status === 'completed') {
 return <span className="inline-block px-2 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full mt-1">Completato</span>;
 }
 if (day.status !== 'scheduled') return null;
 const isMP = day.type === TournamentType.BeatTheBox ||
 day.type === TournamentType.GironiFaseFinale ||
 day.type === TournamentType.RoundRobinFinali;
 if (!isMP) return (
 <span className="inline-block px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full mt-1">In programma</span>
 );
 const dm = matches.filter(m => m.tournamentId === day.id);
 const allDone = dm.length > 0 && dm.every(m => m.winner && m.sets.length > 0 &&
 !(m.sets.length === 1 && m.sets[0].team1 === 0 && m.sets[0].team2 === 0));
 const anyDone = dm.some(m => m.winner && m.sets.length > 0 &&
 !(m.sets.length === 1 && m.sets[0].team1 === 0 && m.sets[0].team2 === 0));
 if (anyDone) return (
 <span
 onClick={(e) => { e.stopPropagation(); handleOpenTournament(day); }}
 className="inline-block px-2 py-1 text-xs font-medium bg-sky-500 text-white rounded-full mt-1 cursor-pointer hover:bg-ios-blue/80"
 >
 {allDone ? 'Procedi alle Finali' : 'Continua Inserimento'}
 </span>
 );
 return (
 <span className="inline-block px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full mt-1">In programma</span>
 );
 })()}
 </div>
 </div>
 <div className="flex items-center space-x-2" onClick={e => e.stopPropagation()}>
 <Button variant="secondary" size="sm" onClick={() => handleOpenTournament(day)} className="!p-1.5 !bg-green-600 hover:!bg-green-700 !text-white [&_svg]:h-4 [&_svg]:w-4"><PencilIcon /></Button>
 <Button variant="danger" size="sm" onClick={() => handleDeleteTournament(day.id)} className="!p-1.5 [&_svg]:h-4 [&_svg]:w-4"><TrashIcon /></Button>
 </div>
 </div>
 {isDayExpanded && (
 <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
 {matches.filter(m => m.tournamentId === day.id).map((match, index) => {
 const team1 = match.team1.map(p => getPlayerById(p)!);
 const team2 = match.team2.map(p => getPlayerById(p)!);
 const court = day.type === TournamentType.TorneOtto ? `Campo ${(index % 2) + 1}` : null;
 return (
 <div key={match.id} className="flex items-center justify-between text-sm">
 {court && <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 w-16">{court}</span>}
 <div className={`text-right flex-1 ${match.winner === 'team1' ? 'font-bold text-gray-900 dark:text-white' : 'font-normal text-gray-500 dark:text-gray-400'}`}>{formatPlayerName(team1[0])} & {formatPlayerName(team1[1])}</div>
 <span className={`mx-4 font-bold text-lg ${(!match.sets || match.sets.length === 0 || (match.sets.length === 1 && match.sets[0].team1 === 0 && match.sets[0].team2 === 0)) ? 'text-gray-400' : 'text-sky-500'}`}>
 {(!match.sets || match.sets.length === 0 || (match.sets.length === 1 && match.sets[0].team1 === 0 && match.sets[0].team2 === 0)) ? '0-0' : match.sets.map(s => `${s.team1}-${s.team2}`).join(' ')}
 </span>
 <div className={`text-left flex-1 ${match.winner === 'team2' ? 'font-bold text-gray-900 dark:text-white' : 'font-normal text-gray-500 dark:text-gray-400'}`}>{formatPlayerName(team2[0])} & {formatPlayerName(team2[1])}</div>
 </div>
 );
 })}
 </div>
 )}
 </div>
 );
 })}
 </div>
 )}
 </Card>
 );
 })}
 {individualMatches.map(match => {
 const team1 = match.team1.map(p => getPlayerById(p)!);
 const team2 = match.team2.map(p => getPlayerById(p)!);
 const getPlayerDelta = (playerId: string) => eloHistory.find(e => e.type === 'match' && e.eventId === match.id && e.playerId === playerId);

 // Fallback for when player data is not available yet
 if (!team1[0] || !team1[1] || !team2[0] || !team2[1]) {
 return null;
 }

 const deltas = [...team1, ...team2].map(p => getPlayerDelta(p.id)?.delta);
 const eloChange = deltas.find(d => d !== undefined && d > 0) || 0;

 return (
 <div key={match.id} className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg shadow">
 <div className="flex justify-between items-center mb-2">
 <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Partita Amichevole</p>
 <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(match.date).toLocaleString()}</p>
 </div>
 <div className="flex items-center justify-between">
 <div className={`text-right flex-1 ${match.winner === 'team1' ? 'font-bold text-gray-900 dark:text-white' : 'font-normal text-gray-500 dark:text-gray-400'}`}>{formatPlayerName(team1[0])} & {formatPlayerName(team1[1])}</div>
 <span className="mx-4 font-bold text-2xl text-sky-500">
 {match.sets.map(s => `${s.team1}-${s.team2}`).join(' ')}
 </span>
 <div className={`text-left flex-1 ${match.winner === 'team2' ? 'font-bold text-gray-900 dark:text-white' : 'font-normal text-gray-500 dark:text-gray-400'}`}>{formatPlayerName(team2[0])} & {formatPlayerName(team2[1])}</div>
 <Button variant="danger" size="sm" onClick={() => handleRequestDeleteMatch(match.id)} className="!p-2 ml-4"><TrashIcon /></Button>
 </div>
 <div className="text-center text-xs text-gray-500 dark:text-gray-400 mt-2">
 Variazione ELO: <span className={`font-semibold ${eloChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
 {eloChange !== 0 ? `±${eloChange.toFixed(2)}` : 'N/A'}
 </span>
 <span className="italic ml-2">(Nota: variazione ELO mostrata solo per partite storiche)</span>
 </div>
 </div>
 );
 })}

 {!loading && matches.length === 0 && (
 <p className="text-center py-8 text-gray-500">Nessun torneo attivo.</p>
 )}
 </div>
 )}
 </div>

 <HIGSheet 
 isOpen={!!editingTournament && !isInFinalsPhase && !showFinalsStandingsModal && !showBeatBoxStandingsModal && !isInBeatBoxFinalsPhase && !isInBeatBoxSemifinalsPhase && !showGironiStandingsModal && !isInGironiSemifinalsPhase && !isInGironiFinalsPhase} 
 onClose={() => {
 // Only reset if we're not in any flow
 if (!showFinalsStandingsModal && !isInFinalsPhase && !showBeatBoxStandingsModal && !isInBeatBoxFinalsPhase && !isInBeatBoxSemifinalsPhase && !showGironiStandingsModal && !isInGironiSemifinalsPhase && !isInGironiFinalsPhase) {
 setEditingTournament(null);
 setIsInFinalsPhase(false);
 setShowFinalsStandingsModal(false);
 setShowBeatBoxStandingsModal(false);
 setIsInBeatBoxFinalsPhase(false);
 setIsInBeatBoxSemifinalsPhase(false);
 setShowGironiStandingsModal(false);
 setIsInGironiSemifinalsPhase(false);
 setIsInGironiFinalsPhase(false);
 }
 }} 
 title={editingTournament?.status === 'scheduled' ?"Inserisci Risultati" :"Modifica Risultati"}
 >
 <form onSubmit={(e) => submitEditScores(e, false)} className="px-4 pb-4 pt-2">
 {editingTournament?.type === TournamentType.RoundRobinFinali && editingTournament?.status === 'scheduled' && (
 <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
 <h3 className="font-semibold text-gray-900 dark:text-white">Round Robin - Fase a Gironi</h3>
 <p className="text-sm text-gray-600 dark:text-gray-400">Inserisci i risultati di tutte le partite. Le prime 4 squadre passeranno alle finali.</p>
 </div>
 )}
 {editingTournament?.type === TournamentType.BeatTheBox && editingTournament?.status === 'scheduled' && (
 <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
 <h3 className="font-semibold text-gray-900 dark:text-white">📦 Beat the Box - Fase Box</h3>
 <p className="text-sm text-gray-600 dark:text-gray-400">Inserisci i risultati di tutte le partite dei box. I primi 2 di ogni box si qualificheranno per le finali.</p>
 </div>
 )}
 {editingTournament?.type === TournamentType.GironiFaseFinale && editingTournament?.status === 'scheduled' && (
 <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
 <h3 className="font-semibold text-gray-900 dark:text-white">🏆 Gironi + Fase Finale - Fase Gironi</h3>
 <p className="text-sm text-gray-600 dark:text-gray-400">Inserisci i risultati di tutte le partite dei gironi. I primi 2 di ogni girone si qualificheranno per le semifinali.</p>
 </div>
 )}
 <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1">
 {editingTournament && !isInFinalsPhase && (() => {
 const tournamentMatches = matches.filter(m => m.tournamentId === editingTournament.id);
 const hasRenderableClassicMatches = tournamentMatches.some(match => {
 const team1 = match.team1.map(p => getPlayerById(p));
 const team2 = match.team2.map(p => getPlayerById(p));
 return !!team1[0] && !!team1[1] && !!team2[0] && !!team2[1];
 });

 if (tournamentMatches.length === 0 || !hasRenderableClassicMatches) {
 return (
 <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
 Nessuna partita modificabile trovata in questo flusso.
 {editingTournament.type === TournamentType.TorneoASquadre
 ? ' Per il torneo a squadre usa la schermata della giornata dedicata.'
 : ' Riapri il torneo dopo il caricamento dati oppure verifica che i giocatori associati siano ancora presenti.'}
 </div>
 );
 }
 
 // Se è Beat the Box, raggruppa per box
 if (editingTournament.type === TournamentType.BeatTheBox) {
 const boxGroups = new Map<number, Match[]>();
 
 // Raggruppa i match per box (analizzando i giocatori coinvolti)
 tournamentMatches.forEach(match => {
 const allPlayerIds = [...match.team1, ...match.team2];
 let boxNumber = 1;
 
 // Trova il box basandosi sui giocatori coinvolti
 // Ogni box ha 4 giocatori unici
 for (let i = 1; i <= 10; i++) {
 const existingMatches = boxGroups.get(i) || [];
 if (existingMatches.length === 0) {
 boxGroups.set(i, [match]);
 return;
 }
 
 const existingPlayerIds = new Set(
 existingMatches.flatMap(m => [...m.team1, ...m.team2])
 );
 
 // Se tutti i giocatori di questo match sono già in questo box
 if (allPlayerIds.every(id => existingPlayerIds.has(id))) {
 existingMatches.push(match);
 return;
 }
 }
 
 // Se non trovato, aggiungi al primo box disponibile
 if (!Array.from(boxGroups.values()).some(matches => 
 matches.some(m => allPlayerIds.every(id => [...m.team1, ...m.team2].includes(id)))
 )) {
 const firstEmptyBox = Array.from(boxGroups.keys()).find(i => boxGroups.get(i)!.length < 3) || boxGroups.size + 1;
 boxGroups.set(firstEmptyBox, [...(boxGroups.get(firstEmptyBox) || []), match]);
 }
 });
 
 return Array.from(boxGroups.entries()).map(([boxNum, boxMatches]) => (
 <div key={boxNum} className="mb-6">
 <div className="flex items-center gap-2 mb-3">
 <div className="text-xl">📦</div>
 <h4 className="font-semibold text-lg text-gray-800 dark:text-gray-200">
 Box {boxNum} - Campo {boxNum}
 </h4>
 </div>
 <div className="space-y-3">
 {boxMatches.map(match => {
 const team1 = match.team1.map(p => getPlayerById(p)!);
 const team2 = match.team2.map(p => getPlayerById(p)!);
 if (!team1[0] || !team2[0]) return null;

 return (
 <div key={match.id} className="grid grid-cols-3 items-center gap-2 bg-white dark:bg-gray-800 p-3 rounded-lg border">
 <div className="text-right text-sm">
 <p className="font-semibold">{formatPlayerName(team1[0])} & {formatPlayerName(team1[1])}</p>
 <p className="text-xs text-gray-500 dark:text-gray-400">ELO: {((team1[0].currentElo + team1[1].currentElo)/2).toFixed(2)}</p>
 </div>
 <MatchScoreInput
 sets={editScores[match.id] || []}
 onSetsChange={(sets) => setEditScores(prev => ({ ...prev, [match.id]: sets }))}
 disabled={isSubmitting}
 />
 <div className="text-sm">
 <p className="font-semibold">{formatPlayerName(team2[0])} & {formatPlayerName(team2[1])}</p>
 <p className="text-xs text-gray-500 dark:text-gray-400">ELO: {((team2[0].currentElo + team2[1].currentElo)/2).toFixed(2)}</p>
 </div>
 </div>
 )
 })}
 </div>
 </div>
 ));
 }
 
 // Se è Gironi + Fase Finale, raggruppa per girone (Union-Find)
 if (editingTournament.type === TournamentType.GironiFaseFinale) {
 const pairKey = (team: string[]) => [...team].sort().join('||');
 const parent = new Map<string, string>();
 const findRoot = (x: string): string => {
 if (!parent.has(x)) parent.set(x, x);
 if (parent.get(x) !== x) parent.set(x, findRoot(parent.get(x)!));
 return parent.get(x)!;
 };
 tournamentMatches.forEach(m => {
 const k1 = pairKey(m.team1), k2 = pairKey(m.team2);
 if (!parent.has(k1)) parent.set(k1, k1);
 if (!parent.has(k2)) parent.set(k2, k2);
 parent.set(findRoot(k1), findRoot(k2));
 });
 const gironiGrouped = new Map<string, Match[]>();
 tournamentMatches.forEach(m => {
 const root = findRoot(pairKey(m.team1));
 if (!gironiGrouped.has(root)) gironiGrouped.set(root, []);
 gironiGrouped.get(root)!.push(m);
 });

 return Array.from(gironiGrouped.values()).map((gironeMatches, gironeIdx) => {
 const gironeName = String.fromCharCode(65 + gironeIdx); // A, B, C
 
 return (
 <div key={gironeIdx} className="mb-6">
 <div className="flex items-center gap-2 mb-3">
 <div className="text-xl">🏆</div>
 <h4 className="font-semibold text-lg text-gray-800 dark:text-gray-200">
 Girone {gironeName}
 </h4>
 </div>
 <div className="space-y-3">
 {gironeMatches.map(match => {
 const team1 = match.team1.map(p => getPlayerById(p)!);
 const team2 = match.team2.map(p => getPlayerById(p)!);
 if (!team1[0] || !team2[0]) return null;

 return (
 <div key={match.id} className="grid grid-cols-3 items-center gap-2 bg-white dark:bg-gray-800 p-3 rounded-lg border">
 <div className="text-right text-sm">
 <p className="font-semibold">{team1[0].name} & {team1[1].name}</p>
 <p className="text-xs text-gray-500 dark:text-gray-400">ELO: {((team1[0].currentElo + team1[1].currentElo)/2).toFixed(2)}</p>
 </div>
 <MatchScoreInput
 sets={editScores[match.id] || []}
 onSetsChange={(sets) => setEditScores(prev => ({ ...prev, [match.id]: sets }))}
 disabled={isSubmitting}
 />
 <div className="text-sm">
 <p className="font-semibold">{team2[0].name} & {team2[1].name}</p>
 <p className="text-xs text-gray-500 dark:text-gray-400">ELO: {((team2[0].currentElo + team2[1].currentElo)/2).toFixed(2)}</p>
 </div>
 </div>
 )
 })}
 </div>
 </div>
 );
 });
 }
 
 // Per altri tipi di torneo, mostra normalmente
 if (editingTournament?.type === TournamentType.Americano || editingTournament?.type === TournamentType.TorneOtto) {
     const allPlayersIds = new Set(tournamentMatches.flatMap(m => [...(m.team1 || []), ...(m.team2 || [])]));
     const numPlayers = allPlayersIds.size;
     const matchesPerRound = Math.min(editingTournament.americanoFields || 2, Math.floor(numPlayers / 4));
     const normalizedRounds = normalizeTournamentRounds(tournamentMatches, editingTournament.type, {
         fields: matchesPerRound,
         participantIds: Array.from(allPlayersIds),
     });
     const roundsMap = new Map(normalizedRounds.map(round => [
         round.roundNumber,
         round.matches.map(item => item.match),
     ]));
                                                                                    
     const allPlayers = Array.from(allPlayersIds).map(id => getPlayerById(id)).filter(Boolean) as Player[];
     const totalRoundsCount = roundsMap.size;
     const isRoundRobin = editingTournament?.type === TournamentType.RoundRobinFinali;
     const isHomeAway = editingTournament?.roundRobinHomeAway || false;

     return Array.from(roundsMap.entries()).sort((a,b)=>a[0]-b[0]).map(([r, matchesForRound]) => {
         let roundTitle = `Turno ${r}`;
         if (isRoundRobin) {
             if (isHomeAway && totalRoundsCount > 1 && totalRoundsCount % 2 === 0) {
                 const half = totalRoundsCount / 2;
                 if (r <= half) {
                     roundTitle = `${r}ª Giornata di Andata`;
                 } else {
                     roundTitle = `${r - half}ª Giornata di Ritorno`;
                 }
             } else {
                 roundTitle = `Giornata ${r} di ${totalRoundsCount}`;
             }
         }

         const playersInRound = new Set(matchesForRound.flatMap(m => [...(m.team1 || []), ...(m.team2 || [])]));
         const restingPlayers = allPlayers.filter(p => !playersInRound.has(p.id));
         
         return (
             <div key={`round-${r}`} className="mb-6">
                 <div className="flex justify-between items-start mb-3">
                     <h4 className="font-semibold text-gray-800 dark:text-gray-200">{roundTitle}</h4>
                     {restingPlayers.length > 0 && (
                         <div className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 px-2.5 py-1 rounded-md text-right">
                             <span className="font-semibold block">Riposo:</span>
                             {restingPlayers.map(p => (
                                 <div key={p.id}>{p.name} {p.surname}</div>
                             ))}
                         </div>
                     )}
                 </div>
                 <div className="space-y-2">
                     {matchesForRound.map(match => {
                         const team1 = match.team1.map(p => getPlayerById(p)!);
                         const team2 = match.team2.map(p => getPlayerById(p)!);
                         if (!team1[0] || !team2[0]) return null;

                         return (
                             <div key={match.id} id={`match-card-${match.id}`} className="grid grid-cols-3 items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                                 <div className="text-right text-sm">
                                     <p className="font-semibold">{team1[0].name} & {team1[1].name}</p>
                                     <p className="text-xs text-gray-500 dark:text-gray-400">ELO: {((team1[0].currentElo + team1[1].currentElo)/2).toFixed(2)}</p>
                                 </div>
                                 <MatchScoreInput
                                     sets={editScores[match.id] || []}
                                     onSetsChange={(sets) => setEditScores(prev => ({ ...prev, [match.id]: sets }))}
                                     disabled={isSubmitting}
                                 />
                                 <div className="text-sm">
                                     <p className="font-semibold">{team2[0].name} & {team2[1].name}</p>
                                     <p className="text-xs text-gray-500 dark:text-gray-400">ELO: {((team2[0].currentElo + team2[1].currentElo)/2).toFixed(2)}</p>
                                 </div>
                             </div>
                         )
                     })}
                 </div>
             </div>
         );
     });
 } else {
     return tournamentMatches.map(match => {
         const team1 = match.team1.map(p => getPlayerById(p)!);
         const team2 = match.team2.map(p => getPlayerById(p)!);
         if (!team1[0] || !team2[0]) return null;

         return (
             <div key={match.id} className="grid grid-cols-3 items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                 <div className="text-right text-sm">
                     <p className="font-semibold">{team1[0].name} & {team1[1].name}</p>
                     <p className="text-xs text-gray-500 dark:text-gray-400">ELO: {((team1[0].currentElo + team1[1].currentElo)/2).toFixed(2)}</p>
                 </div>
                 <MatchScoreInput
                     sets={editScores[match.id] || []}
                     onSetsChange={(sets) => setEditScores(prev => ({ ...prev, [match.id]: sets }))}
                     disabled={isSubmitting}
                 />
                 <div className="text-sm">
                     <p className="font-semibold">{team2[0].name} & {team2[1].name}</p>
                     <p className="text-xs text-gray-500 dark:text-gray-400">ELO: {((team2[0].currentElo + team2[1].currentElo)/2).toFixed(2)}</p>
                 </div>
             </div>
         )
     });
 }
 })()}
 </div>
 <div className="flex gap-3 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
      <Button type="button" variant="secondary" onClick={() => {
          setEditingTournament(null);
          setIsInFinalsPhase(false);
          setShowGironiStandingsModal(false);
          setIsInGironiSemifinalsPhase(false);
          setIsInGironiFinalsPhase(false);
      }} className="flex-1" disabled={isSubmitting}>Annulla</Button>
      
      {editingTournament?.status === 'scheduled' && (
          <Button type="button" onClick={() => submitEditScores(null, true)} disabled={isSubmitting} className="flex-1">
              {isSubmitting ? 'Salvataggio...' : 'Salva'}
          </Button>
      )}

      <Button type="button" onClick={() => {
          if (editingTournament?.status === 'completed') {
              submitEditScores(null, false);
              return;
          }

          let title = "Conferma";
          let message = "Vuoi procedere?";
          let actionText = "Procedi";
          
          if (editingTournament?.type === TournamentType.RoundRobinFinali) {
              title = "Procedi alle Finali";
              message = "Hai inserito i risultati dei gironi? Vuoi procedere alla fase finale?";
              actionText = "Procedi";
          } else if (editingTournament?.type === TournamentType.BeatTheBox) {
              title = "Procedi alla Fase Finale";
              message = "Confermi di voler procedere ai tabelloni finali?";
              actionText = "Procedi";
          } else if (editingTournament?.type === TournamentType.GironiFaseFinale) {
              title = "Procedi alle Semifinali";
              message = "Hai inserito tutti i risultati dei gironi? Vuoi procedere alle semifinali?";
              actionText = "Procedi";
          } else {
              title = "Completa Torneo";
              message = "Confermi di voler chiudere definitivamente il torneo ed aggiornare l'ELO?";
              actionText = "Completa Torneo";
          }
          
          setProceedConfirmData({
              isOpen: true,
              title,
              message,
              actionText,
              onConfirm: () => submitEditScores(null, false)
          });
      }} disabled={isSubmitting} className={editingTournament?.status === 'scheduled' ? "flex-1 !border-emerald-700/50 !bg-emerald-600 hover:!bg-emerald-700 !text-white dark:!border-emerald-300/35" : "flex-1"}>
          {isSubmitting ? 'Salvataggio...' : (
              editingTournament?.status === 'scheduled' && (
                  editingTournament?.type === TournamentType.RoundRobinFinali ||
                  editingTournament?.type === TournamentType.BeatTheBox ||
                  editingTournament?.type === TournamentType.GironiFaseFinale
              )
                  ? 'Procedi'
                  : editingTournament?.status === 'scheduled' 
                      ? 'Completa Torneo' 
                      : 'Salva'
          )}
      </Button>
  </div>
 </form>
 </HIGSheet>
 
 {/* Modal for Round Robin standings and proceed to finals */}
 <HIGSheet 
 isOpen={showFinalsStandingsModal} 
 onClose={() => setShowFinalsStandingsModal(false)} 
 title="Round Robin Completato!"
 >
 <div className="space-y-4 px-4 pb-6 pt-2">
 <div className="p-4 bg-green-50 dark:bg-green-900 rounded-lg">
 <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">Classifica Round Robin</h3>
 <div className="space-y-2">
 {roundRobinStandings.slice(0, 4).map((standing, index) => (
 <div key={index} className="flex justify-between items-center p-2 bg-white dark:bg-gray-800 rounded">
 <span className="font-medium">
 {index + 1}° - {standing.team[0].name} & {standing.team[1].name}
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
 onClick={() => {
 setShowFinalsStandingsModal(false);
 setEditingTournament(null);
 setIsInFinalsPhase(false);
 }}
 variant="secondary"
 className="flex-1"
 >
 Annulla
 </Button>
 <Button 
 onClick={handleProceedToFinalsPhase}  className="flex-1"
  >
  Procedi
  </Button>
 </div>
 </div>
 </HIGSheet>
 
 {/* Modal for Gironi standings and proceed to semifinals */}
 <HIGSheet 
 isOpen={showGironiStandingsModal} 
 onClose={() => setShowGironiStandingsModal(false)} 
 title="Gironi Completati!"
 >
 <div className="space-y-4 px-4 pb-6 pt-2">
 <div className="p-4 bg-green-50 dark:bg-green-900 rounded-lg">
 <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">Classifiche Gironi</h3>
 <div className="space-y-4">
 {gironiStandings.map((girone, gironeIdx) => (
 <div key={gironeIdx} className="bg-white dark:bg-gray-800 rounded-lg p-3">
 <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Girone {girone.gironeName}</h4>
 <div className="space-y-1">
 {girone.standings.map((standing: any, index: number) => {
 const isQualified = index < 2; // Top 2 qualify for semifinals
 return (
 <div 
 key={index} 
 className={`flex justify-between items-center p-2 rounded ${
 isQualified 
 ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-500' 
 : 'bg-gray-50 dark:bg-gray-700'
 }`}
 >
 <span className={`font-medium ${isQualified ? 'text-green-700 dark:text-green-300 font-bold' : ''}`}>
 {index + 1}° - {standing.pair[0].name} & {standing.pair[1].name}
 {isQualified && <span className="ml-2 text-xs">✓ Qualificato</span>}
 </span>
 <span className="text-sm text-gray-600 dark:text-gray-400">
 {standing.punti} punti
 </span>
 </div>
 );
 })}
 </div>
 </div>
 ))}
 </div>
 </div>
 <p className="text-gray-600 dark:text-gray-400">
 I primi 2 di ogni girone si qualificano per le semifinali. Procedi per continuare con le semifinali.
 </p>
 <div className="flex gap-3 pt-4">
 <Button 
 onClick={() => {
 setShowGironiStandingsModal(false);
 setEditingTournament(null);
 setIsInGironiSemifinalsPhase(false);
 }}
 variant="secondary"
 className="flex-1"
 >
 Annulla
 </Button>
 <Button 
 onClick={() => {
 setShowGironiStandingsModal(false);
 setTimeout(() => {
 setIsInGironiSemifinalsPhase(true);
 }, 100);
 }} 
 className="flex-1"
 >
 Procedi alle Semifinali
 </Button>
 </div>
 </div>
 </HIGSheet>
 
 
 {/* Modal for Finals matches */}
 <HIGSheet 
 isOpen={isInFinalsPhase && !!(finalsFlowTournament || editingTournament)} 
 onClose={() => {
 setIsInFinalsPhase(false);
 setEditingTournament(null);
 setFinalsFlowTournament(null);
 setShowFinalsStandingsModal(false);
 }} 
 title="Finali - Round Robin + Finali"
 >
 <div className="space-y-4 px-4 pb-6 pt-2">
 <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900 rounded-lg">
 <h3 className="font-semibold text-emerald-800 dark:text-emerald-200">Fase Finale</h3>
 <p className="text-sm text-emerald-700 dark:text-emerald-300">
 Inserisci i risultati delle finali per determinare la classifica finale.
 </p>
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
 {standing.team[0].name} & {standing.team[1].name}
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
 
 {/* Finals matches input */}
 <div className="space-y-6">
 <h4 className="font-semibold text-gray-700 dark:text-gray-300">Partite Finali</h4>
 <div className="space-y-4 max-h-[30vh] overflow-y-auto p-1">
 {finalsMatches.map((match, index) => {
 const team1 = match.team1.map(p => getPlayerById(p)!);
 const team2 = match.team2.map(p => getPlayerById(p)!);
 if (!team1[0] || !team2[0]) return null;
 
 const isFinalePrimoSecondo = index === 0;
 
 return (
 <div 
 key={match.id} 
 className={`grid grid-cols-3 items-center gap-2 p-3 rounded-lg ${
 isFinalePrimoSecondo 
 ? 'bg-emerald-50 dark:bg-emerald-900 border-2 border-emerald-400 dark:border-emerald-600' 
 : 'bg-sky-50 dark:bg-sky-900 border-2 border-sky-400 dark:border-sky-600'
 }`}
 >
 <div className="text-right text-sm">
 <p className="font-semibold">{formatPlayerName(team1[0])} & {formatPlayerName(team1[1])}</p>
 <p className="text-xs text-gray-500 dark:text-gray-400">
 ELO: {((team1[0].currentElo + team1[1].currentElo)/2).toFixed(2)}
 </p>
 </div>
 <div className="text-center">
 <MatchScoreInput
 sets={finalsScores[match.id] || [{team1: 0, team2: 0}]}
 onSetsChange={(sets) => setFinalsScores(prev => ({ ...prev, [match.id]: sets }))}
 disabled={isSubmitting}
 />
 <p className={`text-xs font-medium mt-1 ${
 isFinalePrimoSecondo 
 ? 'text-emerald-700 dark:text-emerald-300' 
 : 'text-sky-700 dark:text-sky-300'
 }`}>
 {isFinalePrimoSecondo ? 'Finale 1°-2°' : 'Finale 3°-4°'}
 </p>
 </div>
 <div className="text-sm">
 <p className="font-semibold">{formatPlayerName(team2[0])} & {formatPlayerName(team2[1])}</p>
 <p className="text-xs text-gray-500 dark:text-gray-400">
 ELO: {((team2[0].currentElo + team2[1].currentElo)/2).toFixed(2)}
 </p>
 </div>
 </div>
 );
 })}
 </div>
 </div>
 <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
 <Button 
 onClick={() => {
 setIsInFinalsPhase(false);
 setEditingTournament(null);
 }}
 variant="secondary"
 className="flex-1"
 disabled={isSubmitting}
 >
 Annulla
 </Button>
 <Button
 onClick={() => savePhaseMatches(finalsMatches, (finalsFlowTournament || editingTournament)!.id, setFinalsMatches)}
 disabled={isSubmitting}
 className="flex-1"
 >
 {isSubmitting ? 'Salvataggio...' : 'Salva'}
 </Button>
 <Button 
 onClick={handleCompleteTournamentWithFinals}
 className="flex-1 !border-emerald-700/50 !bg-emerald-600 hover:!bg-emerald-700 !text-white dark:!border-emerald-300/35"
 disabled={isSubmitting || Object.keys(finalsScores).length !== finalsMatches.length}
 >
 {isSubmitting ? 'Finalizzando...' : 'Finalizza Torneo'}
 </Button>
 </div>
 </div>
 </HIGSheet>
 
 {/* Modal for Beat the Box standings and proceed to semifinals/finals */}
 <HIGSheet 
 isOpen={showBeatBoxStandingsModal} 
 onClose={() => setShowBeatBoxStandingsModal(false)} 
 title="📦 Classifiche Box Completate"
 >
 <div className="space-y-4 px-4 pb-6 pt-2">
 {beatBoxStandings.map((boxStanding, boxIdx) => (
 <div key={boxIdx} className="py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
 <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Box {boxStanding.boxNumber}</h4>
 <div className="space-y-2">
 {boxStanding.standings.map((standing: any, index: number) => (
 <div key={index} className={`flex justify-between items-center p-2 rounded ${
 index < 2 
 ? 'bg-green-100 dark:bg-green-900 border-2 border-green-300 dark:border-green-700' 
 : 'bg-white dark:bg-gray-800'
 }`}>
 <span className="font-medium">
 {index + 1}° - {standing.player.name} {standing.player.surname}
 </span>
 <span className="text-sm text-gray-600 dark:text-gray-400">
 {standing.points} punti ({standing.gameDifference >= 0 ? '+' : ''}{standing.gameDifference})
 </span>
 </div>
 ))}
 </div>
 </div>
 ))}
 <p className="text-gray-600 dark:text-gray-400 text-center">
 I primi 2 classificati di ogni box (evidenziati in verde) sono qualificati. Vuoi procedere con le {beatBoxNumBoxes >= 4 ? 'semifinali' : 'finali'}?
 </p>
 <div className="flex gap-3 pt-4">
 <Button 
 onClick={() => {
 setShowBeatBoxStandingsModal(false);
 setEditingTournament(null);
 setFinalsFlowTournament(null);
 setIsInBeatBoxFinalsPhase(false);
 setIsInBeatBoxSemifinalsPhase(false);
 setBeatBoxFinalMatches([]);
 setBeatBoxSemifinalMatches([]);
 setBeatBoxStandings([]);
 setBeatBoxFinalStandings([]);
 setBeatBoxAllMatches([]);
 setShowBeatBoxStandingsModal(false);
 }}
 variant="secondary"
 className="flex-1"
 >
 Annulla
 </Button>
 <Button 
 onClick={() => {
 console.log('✅ Procedi cliccato - finalsFlowTournament:', finalsFlowTournament);
 setShowBeatBoxStandingsModal(false);
 setTimeout(() => {
 if (beatBoxSemifinalMatches.length > 0) {
 setIsInBeatBoxSemifinalsPhase(true);
 } else {
 setIsInBeatBoxFinalsPhase(true);
 }
 }, 100);
 }} 
 className="flex-1"
 >
 Procedi {beatBoxNumBoxes >= 4 ? 'alle Semifinali' : 'alle Finali'}
 </Button>
 </div>
 </div>
 </HIGSheet>
 
 {/* Modal for Beat the Box Semifinals */}
 <HIGSheet 
 isOpen={isInBeatBoxSemifinalsPhase} 
 onClose={() => {
 setIsInBeatBoxSemifinalsPhase(false);
 setShowBeatBoxStandingsModal(true);
 }} 
 title="📦 Beat the Box - Semifinali"
 >
 <div className="space-y-4 px-4 pb-6 pt-2">
 <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900 rounded-lg">
 <h3 className="font-semibold text-purple-800 dark:text-purple-200">Semifinali</h3>
 <p className="text-sm text-purple-700 dark:text-purple-300">
 Inserisci i risultati delle semifinali.
 </p>
 </div>
 
 <div className="space-y-4">
 {beatBoxSemifinalMatches.map((match, idx) => {
 const team1 = match.team1.map(p => getPlayerById(p)!);
 const team2 = match.team2.map(p => getPlayerById(p)!);
 if (!team1[0] || !team2[0]) return null;
 
 return (
 <div key={idx}>
 <h4 className="font-semibold mb-2 text-center">Semifinale {idx + 1}</h4>
 <div className="grid grid-cols-3 items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
 <div className="text-right text-sm">
 <p className="font-semibold">{formatPlayerName(team1[0])} & {formatPlayerName(team1[1])}</p>
 </div>
 <MatchScoreInput
 sets={match.sets || []}
 onSetsChange={(sets) => {
 const newMatches = [...beatBoxSemifinalMatches];
 const team1Games = sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum, set) => sum + set.team2, 0);
 newMatches[idx] = {
 ...match,
 sets,
 winner: team1Games > team2Games ? 'team1' : team2Games > team1Games ? 'team2' : 'draw'
 };
 setBeatBoxSemifinalMatches(newMatches);
 }}
 disabled={isSubmitting}
 />
 <div className="text-sm">
 <p className="font-semibold">{formatPlayerName(team2[0])} & {formatPlayerName(team2[1])}</p>
 </div>
 </div>
 </div>
 );
 })}
 </div>
 
 <div className="flex gap-3 pt-4">
 <Button 
 onClick={() => {
 setIsInBeatBoxSemifinalsPhase(false);
 setShowBeatBoxStandingsModal(true);
 }}
 variant="secondary"
 className="flex-1"
 >
 Indietro
 </Button>
 <Button
 onClick={() => savePhaseMatches(beatBoxSemifinalMatches, finalsFlowTournament!.id, setBeatBoxSemifinalMatches)}
 disabled={isSubmitting}
 className="flex-1"
 >
 {isSubmitting ? 'Salvataggio...' : 'Salva'}
 </Button>
 <Button 
 onClick={async () => {
 // Verifica che le semifinali siano state generate e abbiano un vincitore
 if (beatBoxSemifinalMatches.length < 2) {
 showHIGAlert('⚠️ Errore: semifinali non generate correttamente.');
 return;
 }
 const allComplete = beatBoxSemifinalMatches.every(m => m.winner && m.winner !== 'draw');
 if (!allComplete) {
 showHIGAlert('⚠️ Inserisci i risultati di tutte le semifinali');
 return;
 }
 
 // Crea finali dai risultati delle semifinali
 const sfResults = {
     sf1Winner: beatBoxSemifinalMatches[0].winner as 'team1' | 'team2',
     sf2Winner: beatBoxSemifinalMatches[1].winner as 'team1' | 'team2',
 };
 const { finals } = createBeatBoxFinalsMatches(
     beatBoxNumBoxes,
     beatBoxStandings,
     finalsFlowTournament!.date,
     sfResults,
     finalsFlowTournament!.playoffType || 'semifinals'
 );
 setBeatBoxFinalMatches(finals.map((m, i) => ({
     ...m,
     id: `temp-final-${i}`,
     tournamentId: finalsFlowTournament!.id
 })));
 
 setIsInBeatBoxSemifinalsPhase(false);
 setTimeout(() => {
 setIsInBeatBoxFinalsPhase(true);
 }, 100);
 }}
 className="flex-1"
 >
 Procedi alle Finali
 </Button>
 </div>
 </div>
 </HIGSheet>
 
 {/* Modal for Beat the Box Finals */}
 <HIGSheet 
 isOpen={isInBeatBoxFinalsPhase} 
 onClose={() => {
 setIsInBeatBoxFinalsPhase(false);
 if (beatBoxSemifinalMatches.length > 0) {
 setTimeout(() => setIsInBeatBoxSemifinalsPhase(true), 100);
 } else {
 setShowBeatBoxStandingsModal(true);
 }
 }} 
 title="📦 Beat the Box - Finali"
 >
 <div className="space-y-4 px-4 pb-6 pt-2">
 <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900 rounded-lg">
 <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">Fase Finale</h3>
 <p className="text-sm text-yellow-700 dark:text-yellow-300">
 Inserisci i risultati delle finali per determinare la classifica finale.
 </p>
 </div>
 
 <div className="space-y-4">
 {beatBoxFinalMatches.map((match, idx) => {
 const team1 = match.team1.map(p => getPlayerById(p)!);
 const team2 = match.team2.map(p => getPlayerById(p)!);
 if (!team1[0] || !team2[0]) return null;
 
 let matchTitle = '';
 if (idx === 0) matchTitle = 'Finale 1° - 2° Posto';
 else if (idx === 1) matchTitle = 'Finalina 3° - 4° Posto';
 else if (idx === 2) matchTitle = 'Partita Consolazione';
 
 return (
 <div key={idx}>
 <h4 className="font-semibold mb-2 text-center">{matchTitle}</h4>
 <div className="grid grid-cols-3 items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
 <div className="text-right text-sm">
 <p className="font-semibold">{formatPlayerName(team1[0])} & {formatPlayerName(team1[1])}</p>
 </div>
 <MatchScoreInput
 sets={match.sets || []}
 onSetsChange={(sets) => {
 const newMatches = [...beatBoxFinalMatches];
 const team1Games = sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum, set) => sum + set.team2, 0);
 newMatches[idx] = {
 ...match,
 sets,
 winner: team1Games > team2Games ? 'team1' : team2Games > team1Games ? 'team2' : 'draw'
 };
 setBeatBoxFinalMatches(newMatches);
 }}
 disabled={isSubmitting}
 />
 <div className="text-sm">
 <p className="font-semibold">{formatPlayerName(team2[0])} & {formatPlayerName(team2[1])}</p>
 </div>
 </div>
 </div>
 );
 })}
 </div>
 
 <div className="flex gap-3 pt-4">
 <Button 
 onClick={() => {
 setIsInBeatBoxFinalsPhase(false);
 if (beatBoxSemifinalMatches.length > 0) {
 setTimeout(() => setIsInBeatBoxSemifinalsPhase(true), 100);
 } else {
 setShowBeatBoxStandingsModal(true);
 }
 }}
 variant="secondary"
 className="flex-1"
 >
 Indietro
 </Button>
 <Button 
 onClick={() => savePhaseMatches(beatBoxFinalMatches, finalsFlowTournament!.id, setBeatBoxFinalMatches)}
 variant="secondary"
 className="flex-1"
 disabled={isSubmitting}
 >
 Salva
 </Button>
 <Button 
 onClick={() => {
 const allComplete = beatBoxFinalMatches.every(m => m.winner && m.winner !== 'draw');
 if (!allComplete) {
 showHIGAlert('⚠️ Inserisci i risultati di tutte le finali');
 return;
 }
 setShowBeatBoxCompleteConfirm(true);
 }}
 className="flex-1"
 disabled={isSubmitting}
 >
 Completa Torneo
 </Button>
 </div>
 </div>
 </HIGSheet>
 
 {/* Modal di CONFERMA completamento Beat the Box */}
 <HIGSheet
 isOpen={showBeatBoxCompleteConfirm}
 onClose={() => !isSubmitting && setShowBeatBoxCompleteConfirm(false)}
 title="Confermi il completamento del torneo?"
 >
 <div className="space-y-3 px-4 pb-6 pt-2">
 <p className="text-sm text-gray-600 dark:text-gray-300">
 Verranno salvate tutte le partite finali e aggiornati gli ELO.
 </p>
 <div className="flex gap-3 pt-2">
 <Button 
 variant="secondary" 
 onClick={() => setShowBeatBoxCompleteConfirm(false)} 
 disabled={isSubmitting} 
 className="flex-1"
 >
 Annulla
 </Button>
 <Button 
 onClick={handleCompleteBeatBoxTournament} 
 disabled={isSubmitting} 
 className="flex-1"
 >
 {isSubmitting ? 'Salvataggio...' : 'Conferma e Salva'}
 </Button>
 </div>
 </div>
 </HIGSheet>
 
 {/* Modal di SUCCESS completamento Beat the Box */}
 <HIGSheet
 isOpen={showBeatBoxCompleteSuccess}
 onClose={() => {
 setShowBeatBoxCompleteSuccess(false);
 setEditingTournament(null);
 setFinalsFlowTournament(null);
 setIsInBeatBoxFinalsPhase(false);
 setIsInBeatBoxSemifinalsPhase(false);
 setBeatBoxFinalMatches([]);
 setBeatBoxSemifinalMatches([]);
 setBeatBoxStandings([]);
 setBeatBoxFinalStandings([]);
 setBeatBoxAllMatches([]);
 setShowBeatBoxStandingsModal(false);
 fetchData();
 }}
 title="🏆 Beat the Box - Risultati Finali"
 >
 <div className="space-y-4 px-4 pb-6 pt-2 max-h-[70vh] overflow-y-auto">
 <div className="text-center p-3 bg-green-50 dark:bg-green-900 rounded">
 <h3 className="font-semibold text-green-800 dark:text-green-200">Torneo completato!</h3>
 <p className="text-sm text-green-700 dark:text-green-300">Gli ELO sono stati aggiornati. Ecco il riepilogo finale.</p>
 </div>
 
 {/* Classifiche Box */}
 {beatBoxStandings.map(b => (
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
 {b.standings.map((s: any, idx: number) => (
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
 {beatBoxFinalMatches.length > 0 && (
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
 if (beatBoxFinalMatches[0] && beatBoxFinalMatches[0].winner) {
 const winTeam = beatBoxFinalMatches[0].winner === 'team1' ? beatBoxFinalMatches[0].team1 : beatBoxFinalMatches[0].team2;
 const loseTeam = beatBoxFinalMatches[0].winner === 'team1' ? beatBoxFinalMatches[0].team2 : beatBoxFinalMatches[0].team1;
 rows.push({ pos: 1, team: getTeamLabel(winTeam) });
 rows.push({ pos: 2, team: getTeamLabel(loseTeam) });
 }
 if (beatBoxFinalMatches[1] && beatBoxFinalMatches[1].winner) {
 const winTeam = beatBoxFinalMatches[1].winner === 'team1' ? beatBoxFinalMatches[1].team1 : beatBoxFinalMatches[1].team2;
 const loseTeam = beatBoxFinalMatches[1].winner === 'team1' ? beatBoxFinalMatches[1].team2 : beatBoxFinalMatches[1].team1;
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
 
 {/* Classifica Individuale */}
 {beatBoxFinalStandings.length > 0 && (
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
 {beatBoxFinalStandings.map(e => (
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
 )}
 
 <div className="flex gap-3 pt-4">
 <Button 
 onClick={() => {
 setShowBeatBoxCompleteSuccess(false);
 setEditingTournament(null);
 setFinalsFlowTournament(null);
 setIsInBeatBoxFinalsPhase(false);
 setIsInBeatBoxSemifinalsPhase(false);
 setBeatBoxFinalMatches([]);
 setBeatBoxSemifinalMatches([]);
 setBeatBoxStandings([]);
 setBeatBoxFinalStandings([]);
 setBeatBoxAllMatches([]);
 setShowBeatBoxStandingsModal(false);
 fetchData();
 }}
 className="flex-1"
 >
 Chiudi
 </Button>
 </div>
 </div>
 </HIGSheet>
 
 {/* Modal for Gironi + Fase Finale Semifinals */}
 <HIGSheet 
 isOpen={isInGironiSemifinalsPhase} 
 onClose={() => {
 setIsInGironiSemifinalsPhase(false);
 setShowGironiStandingsModal(true);
 }} 
 title="🏆 Gironi + Fase Finale - Semifinali"
 >
 <div className="space-y-4 px-4 pb-6 pt-2">
 <div className="mb-4 p-1">
 <h3 className="font-semibold text-gray-900 dark:text-white">Semifinali</h3>
 <p className="text-sm text-gray-700 dark:text-gray-300">
 Inserisci i risultati delle semifinali.
 </p>
 </div>
 
 <div className="space-y-4">
 {gironiSemifinalMatches.map((match, idx) => {
 const team1 = match.team1.map(p => getPlayerById(p)!);
 const team2 = match.team2.map(p => getPlayerById(p)!);
 if (!team1[0] || !team2[0]) return null;
 
 return (
 <div key={idx} className="py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
 <h4 className="font-semibold mb-3 text-gray-900 dark:text-gray-300">Semifinale {idx + 1}</h4>
 <div className="grid grid-cols-3 items-center gap-4">
 <div className="text-sm">
 {team1[0].name} {team1[0].surname}<br/>
 {team1[1].name} {team1[1].surname}
 </div>
 <MatchScoreInput
 sets={match.sets || [{ team1: 0, team2: 0 }]}
 onSetsChange={(sets) => {
 const newMatches = [...gironiSemifinalMatches];
 const team1Games = sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum, set) => sum + set.team2, 0);
 newMatches[idx] = {
 ...match,
 sets,
 winner: team1Games > team2Games ? 'team1' : team2Games > team1Games ? 'team2' : null
 };
 setGironiSemifinalMatches(newMatches);
 }}
 disabled={isSubmitting}
 />
 <div className="text-sm text-right">
 {team2[0].name} {team2[0].surname}<br/>
 {team2[1].name} {team2[1].surname}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 
 <div className="flex gap-3 pt-4">
 <Button 
 onClick={() => {
 setIsInGironiSemifinalsPhase(false);
 setShowGironiStandingsModal(true);
 }}
 variant="secondary"
 className="flex-1"
 >
 Indietro
 </Button>
 <Button 
 onClick={() => savePhaseMatches(gironiSemifinalMatches, finalsFlowTournament!.id, setGironiSemifinalMatches)}
 variant="secondary"
 className="flex-1"
 disabled={isSubmitting}
 >
 Salva
 </Button>
 <Button 
 onClick={async () => {
 // Verifica che le semifinali siano state generate e abbiano un vincitore
 if (gironiSemifinalMatches.length < 2) {
 showHIGAlert('⚠️ Errore: semifinali non generate correttamente.');
 return;
 }
 const allComplete = gironiSemifinalMatches.every(m => m.winner && m.winner !== 'draw');
 if (!allComplete) {
 showHIGAlert('⚠️ Inserisci i risultati di tutte le semifinali');
 return;
 }
 
 // Calcola vincitori e perdenti delle semifinali
 const semi1 = gironiSemifinalMatches[0];
 const semi2 = gironiSemifinalMatches[1];
 
 const semi1Winner = semi1.winner === 'team1' ? semi1.team1 : semi1.team2;
 const semi1Loser = semi1.winner === 'team1' ? semi1.team2 : semi1.team1;
 const semi2Winner = semi2.winner === 'team1' ? semi2.team1 : semi2.team2;
 const semi2Loser = semi2.winner === 'team1' ? semi2.team2 : semi2.team1;
 
 // Crea finale 1°-2°
 const finale12 = {
 id: 'temp-gironi-final-1',
 date: finalsFlowTournament!.date,
 team1: semi1Winner,
 team2: semi2Winner,
 sets: [{ team1: 0, team2: 0 }],
 winner: null as 'team1' | 'team2' | null,
 tournamentId: finalsFlowTournament!.id,
 };
 
 // Crea finalina 3°-4°
 const finale34 = {
 id: 'temp-gironi-final-2',
 date: finalsFlowTournament!.date,
 team1: semi1Loser,
 team2: semi2Loser,
 sets: [{ team1: 0, team2: 0 }],
 winner: null as 'team1' | 'team2' | null,
 tournamentId: finalsFlowTournament!.id,
 };
 
 setGironiFinalMatches([finale34, finale12]); // Prima finalina, poi finale
 
 setIsInGironiSemifinalsPhase(false);
 setTimeout(() => {
 setIsInGironiFinalsPhase(true);
 }, 100);
 }}
 className="flex-1"
 >
 Procedi alle Finali
 </Button>
 </div>
 </div>
 </HIGSheet>
 
 {/* Modal for Gironi + Fase Finale Finals */}
 <HIGSheet 
 isOpen={isInGironiFinalsPhase} 
 onClose={() => {
 setIsInGironiFinalsPhase(false);
 setTimeout(() => setIsInGironiSemifinalsPhase(true), 100);
 }} 
 title="🏆 Gironi + Fase Finale - Finali"
 >
 <div className="space-y-4 px-4 pb-6 pt-2">
 <div className="mb-4 p-3 bg-green-50 dark:bg-green-900 rounded-lg">
 <h3 className="font-semibold text-green-800 dark:text-green-200">Fase Finale</h3>
 <p className="text-sm text-green-700 dark:text-green-300">
 Inserisci i risultati delle finali per determinare la classifica finale.
 </p>
 </div>
 
 <div className="space-y-4">
 {gironiFinalMatches.map((match, idx) => {
 const team1 = match.team1.map(p => getPlayerById(p)!);
 const team2 = match.team2.map(p => getPlayerById(p)!);
 if (!team1[0] || !team2[0]) return null;
 
 const isFinale = idx === 1; // Index 1 = finale 1°-2°
 const title = isFinale ?"Finale 1°-2° Posto" :"Finalina 3°-4° Posto";
 const bgColor = isFinale 
 ?"bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800"
 :"bg-green-100 dark:bg-green-900/30 border-2 border-green-300 dark:border-green-700";
 const titleColor = isFinale
 ?"text-green-900 dark:text-green-300"
 :"text-green-800 dark:text-green-400";
 
 return (
 <div key={idx} className={`${bgColor} p-4 rounded-lg`}>
 <h4 className={`font-semibold mb-3 ${titleColor}`}>{title}</h4>
 <div className="grid grid-cols-3 items-center gap-4">
 <div className="text-sm">
 {team1[0].name} {team1[0].surname}<br/>
 {team1[1].name} {team1[1].surname}
 </div>
 <MatchScoreInput
 sets={match.sets || [{ team1: 0, team2: 0 }]}
 onSetsChange={(sets) => {
 const newMatches = [...gironiFinalMatches];
 const team1Games = sets.reduce((sum, set) => sum + set.team1, 0);
 const team2Games = sets.reduce((sum, set) => sum + set.team2, 0);
 newMatches[idx] = {
 ...match,
 sets,
 winner: team1Games > team2Games ? 'team1' : team2Games > team1Games ? 'team2' : null
 };
 setGironiFinalMatches(newMatches);
 }}
 disabled={isSubmitting}
 />
 <div className="text-sm text-right">
 {team2[0].name} {team2[0].surname}<br/>
 {team2[1].name} {team2[1].surname}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 
 <div className="flex gap-3 pt-4">
 <Button 
 onClick={() => {
 setIsInGironiFinalsPhase(false);
 setTimeout(() => setIsInGironiSemifinalsPhase(true), 100);
 }}
 variant="secondary"
 className="flex-1"
 >
 Indietro
 </Button>
 <Button
 onClick={() => savePhaseMatches(gironiFinalMatches, finalsFlowTournament!.id, setGironiFinalMatches)}
 disabled={isSubmitting}
 className="flex-1"
 >
 {isSubmitting ? 'Salvataggio...' : 'Salva'}
 </Button>
 <Button 
 onClick={() => {
                            const allComplete = gironiFinalMatches.every(m => m.winner && m.winner !== 'draw');
                            if (!allComplete) {
                                showHIGAlert('⚠️ Inserisci i risultati di tutte le finali');
                                return;
                            }
                            setProceedConfirmData({
                                isOpen: true,
                                title: "Completa Torneo",
                                message: "Confermi di voler completare il torneo? Gli ELO verranno aggiornati definitivamente.",
                                actionText: "Finalizza Torneo",
                                onConfirm: async () => {
                                    const tournament = finalsFlowTournament;
                                    if (!tournament) return;
                                    setIsSubmitting(true);
                                    try {
                                        const allNewMatches = [...gironiSemifinalMatches, ...gironiFinalMatches];
                                        for (const match of allNewMatches) {
                                            const res = await fetch('/api/matches', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ ...match, tournamentId: tournament.id })
                                            });
                                            if(!res.ok) throw new Error('Failed to save match');
                                        }
                                        const compRes = await fetch('/api/tournaments/complete', {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ tournamentId: tournament.id })
                                        });
                                        if(!compRes.ok) throw new Error('Failed to complete tournament');
                                        
                                        setEditingTournament(null);
                                        setFinalsFlowTournament(null);
                                        setIsInGironiFinalsPhase(false);
                                        setIsInGironiSemifinalsPhase(false);
                                        setGironiFinalMatches([]);
                                        setGironiSemifinalMatches([]);
                                        setGironiStandings([]);
                                        setShowGironiStandingsModal(false);
                                        if (typeof setActivePage === 'function') {
                                            setActivePage('Tournaments');
                                        }
                                        window.location.reload();
                                    } catch (e) {
                                        showHIGAlert('Errore.');
                                    } finally {
                                        setIsSubmitting(false);
                                    }
                                }
                            });
                        }}
                        className="flex-1 !border-emerald-700/50 !bg-emerald-600 hover:!bg-emerald-700 !text-white dark:!border-emerald-300/35"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Salvataggio...' : 'Conferma e Salva'}
                    </Button>
 </div>
 </div>
             </HIGSheet>
                        {/* Nuovi popup per conferme e successi */}
            <HIGSheet 
                isOpen={proceedConfirmData.isOpen} 
                onClose={() => setProceedConfirmData(prev => ({ ...prev, isOpen: false }))} 
                title={proceedConfirmData.title}
            >
                <div className="p-4 space-y-4">
                    <p className="text-gray-700 dark:text-gray-300">{proceedConfirmData.message}</p>
                    <div className="flex gap-3 justify-end pt-2">
                        <Button variant="secondary" onClick={() => setProceedConfirmData(prev => ({ ...prev, isOpen: false }))}>
                            Annulla
                        </Button>
                        <Button className="!border-emerald-700/50 !bg-emerald-600 hover:!bg-emerald-700 !text-white dark:!border-emerald-300/35" onClick={() => {
                            setProceedConfirmData(prev => ({ ...prev, isOpen: false }));
                            proceedConfirmData.onConfirm();
                        }}>
                            {proceedConfirmData.actionText}
                        </Button>
                    </div>
                </div>
            </HIGSheet>

            <HIGSheet
                isOpen={showSaveSuccess}
                onClose={() => {
                    setShowSaveSuccess(false);
                    if (typeof setActivePage === 'function') {
                        setActivePage('Tournaments');
                    }
                }}
                title="✅ Operazione Completata"
            >
                <div className="p-4 space-y-4 text-center">
                    <p className="text-gray-700 dark:text-gray-300 text-lg">Salvataggio Effettuato!</p>
                    <div className="flex justify-center pt-2">
                        <Button onClick={() => {
                             setShowSaveSuccess(false);
                             if (typeof setActivePage === 'function') {
                                 setActivePage('Tournaments');
                             }
                         }} className="w-full max-w-xs">
                             OK
                         </Button>
                    </div>
                </div>
            </HIGSheet>

            <HIGSheet
                isOpen={showDeleteSuccess}
                onClose={() => setShowDeleteSuccess(false)}
                title="🗑️ Operazione Completata"
            >
                <div className="p-4 space-y-4 text-center">
                    <p className="text-gray-700 dark:text-gray-300 text-lg">Cancellazione Effettuata!</p>
                    <div className="flex justify-center pt-2">
                        <Button onClick={() => setShowDeleteSuccess(false)} className="w-full max-w-xs">
                            OK
                        </Button>
                    </div>
                </div>
            </HIGSheet>

            <HIGAlert
                isOpen={deleteAlert.isOpen}
                title="Elimina Evento/Torneo"
                message="Rimuovi tutti i match e i dati? Puoi scegliere di eliminare anche i giocatori 'isolati' che hanno partecipato solo a questo evento."
                isLoading={deleteAlert.isDeleting}
                loadingText={deleteAlert.loadingText}
                progressPercent={deleteAlert.progressPercent}
                actions={[
                    {
                        label: "Elimina Solo Torneo",
                        style: "default",
                        onPress: () => handleConfirmDeleteTournament(false)
                    },
                    {
                        label: "Elimina Torneo e Giocatori Non Più Attivi",
                        style: "destructive",
                        onPress: () => handleConfirmDeleteTournament(true)
                    },
                    {
                        label: "Annulla",
                        style: "cancel",
                        onPress: () => setDeleteAlert({ isOpen: false, tournamentId: null, isDeleting: false, progressPercent: 0, loadingText: '' })
                    }
                ]}
            />

            <HIGAlert
                isOpen={deleteMatchAlert.isOpen}
                title="Elimina Partita"
                message="Sei sicuro di voler eliminare questa partita? I dati ed il punteggio verranno rimossi permanentemente."
                isLoading={deleteMatchAlert.isDeleting}
                loadingText={deleteMatchAlert.loadingText}
                progressPercent={deleteMatchAlert.progressPercent}
                actions={[
                    {
                        label: "Elimina Partita",
                        style: "destructive",
                        onPress: handleConfirmDeleteMatch
                    },
                    {
                        label: "Annulla",
                        style: "cancel",
                        onPress: () => setDeleteMatchAlert({ isOpen: false, matchId: null, isDeleting: false, progressPercent: 0, loadingText: '' })
                    }
                ]}
            />
        </div>
    );
};

export default MatchesPage;
