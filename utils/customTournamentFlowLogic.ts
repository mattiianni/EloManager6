import { Player, Match } from '../types.ts';

export interface CustomBoxData {
  boxNumber: number;
  courtNumber: number;
  players: Player[];
  pairs?: [Player, Player][];
  matches: Match[];
}

export interface BoxStandingItem {
  id: string;
  displayName: string;
  points: number;
  gamesWon: number;
  gamesLost: number;
  diff: number;
  rank: number;
  player?: Player;
  pair?: [Player, Player];
}

export interface IndividualStandingItem {
  player: Player;
  eloChange: number;
  rank: number;
  gamesWon: number;
  gamesLost: number;
  winPercentage: number;
}

const formatShort = (p?: Player) => (p ? `${p.name.charAt(0)}. ${p.surname}` : 'TBD');

/**
 * Distribuisce i giocatori singoli nei Box in base all'ELO con distribuzione a serpentina.
 * Ogni Box contiene 4 o 5 giocatori (se 5 giocatori, 1 riposa a turno nei 5 match).
 */
export function distributeSinglesIntoBoxes(
  players: Player[],
  numCampi: number,
  tournamentDate: string,
  startingElos?: Map<string, number>
): CustomBoxData[] {
  const sortedPlayers = [...players].sort((a, b) => {
    const eloA = startingElos?.get(a.id) ?? a.currentElo;
    const eloB = startingElos?.get(b.id) ?? b.currentElo;
    return eloB - eloA;
  });

  const fields = Math.max(1, numCampi);
  const numBoxes = Math.max(1, Math.floor(sortedPlayers.length / 4));
  const boxesPlayers: Player[][] = Array.from({ length: numBoxes }, () => []);

  // Serpentine distribution
  sortedPlayers.forEach((player, idx) => {
    const cycle = Math.floor(idx / numBoxes);
    const rem = idx % numBoxes;
    const boxIdx = cycle % 2 === 1 ? numBoxes - 1 - rem : rem;
    boxesPlayers[boxIdx].push(player);
  });

  return boxesPlayers.map((boxPList, bIdx) => {
    const boxNumber = bIdx + 1;
    const courtNumber = (bIdx % fields) + 1;
    const matches: Match[] = [];

    if (boxPList.length === 5) {
      // 5 giocatori: 5 partite/turni, ciascuno gioca 4 partite e riposa 1 volta
      const [p1, p2, p3, p4, p5] = boxPList;
      const pairings5: [Player, Player, Player, Player][] = [
        [p1, p2, p3, p4], // p5 riposa
        [p1, p3, p2, p5], // p4 riposa
        [p1, p5, p2, p4], // p3 riposa
        [p1, p4, p3, p5], // p2 riposa
        [p2, p3, p4, p5], // p1 riposa
      ];

      pairings5.forEach((pair, roundIdx) => {
        matches.push({
          id: `box-${boxNumber}-m${roundIdx + 1}`,
          date: tournamentDate,
          team1: [pair[0].id, pair[1].id],
          team2: [pair[2].id, pair[3].id],
          sets: [{ team1: 0, team2: 0 }],
          winner: null,
          phase: 'group',
          groupNumber: boxNumber,
          courtNumber,
          roundNumber: roundIdx + 1,
          tournamentId: 'temp',
        } as Match);
      });
    } else if (boxPList.length >= 4) {
      // 4 giocatori: 3 partite (tutti contro tutti)
      const [p1, p2, p3, p4] = boxPList;
      matches.push({
        id: `box-${boxNumber}-m1`,
        date: tournamentDate,
        team1: [p1.id, p2.id],
        team2: [p3.id, p4.id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'group',
        groupNumber: boxNumber,
        courtNumber,
        roundNumber: 1,
        tournamentId: 'temp',
      } as Match);

      matches.push({
        id: `box-${boxNumber}-m2`,
        date: tournamentDate,
        team1: [p1.id, p3.id],
        team2: [p2.id, p4.id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'group',
        groupNumber: boxNumber,
        courtNumber,
        roundNumber: 2,
        tournamentId: 'temp',
      } as Match);

      matches.push({
        id: `box-${boxNumber}-m3`,
        date: tournamentDate,
        team1: [p1.id, p4.id],
        team2: [p2.id, p3.id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'group',
        groupNumber: boxNumber,
        courtNumber,
        roundNumber: 3,
        tournamentId: 'temp',
      } as Match);
    }

    return {
      boxNumber,
      courtNumber,
      players: boxPList,
      matches,
    };
  });
}

/**
 * Genera un unico torneo Americano continuo (tutti con tutti a rotazione individuale).
 * Crea una struttura compatibile (1 raggruppamento globale "Americano") con i match divisi per turno/giornata.
 */
export function generateAmericanoMatchesForCustomFlow(
  players: Player[],
  numCampi: number,
  tournamentDate: string,
  startingElos?: Map<string, number>
): CustomBoxData {
  const sortedPlayers = [...players].sort((a, b) => {
    const eloA = startingElos?.get(a.id) ?? a.currentElo;
    const eloB = startingElos?.get(b.id) ?? b.currentElo;
    return eloB - eloA;
  });

  const n = sortedPlayers.length;
  if (n < 4) {
    return {
      boxNumber: 1,
      courtNumber: 1,
      players: sortedPlayers,
      matches: [],
    };
  }

  const fields = Math.max(1, numCampi);
  // Numero di turni: n - 1 (se pari) oppure n (se dispari per garantire rotazione completa)
  const rounds = n % 2 === 0 ? n - 1 : n;

  // Massimo di giocatori attivi per turno
  const maxActivePlayers = Math.min(n, fields * 4);
  const playersPerRound = Math.floor(maxActivePlayers / 4) * 4;
  const benchedPerRound = n - playersPerRound;

  const benchedCounts = new Map<string, number>();
  const partnerHistory = new Map<string, Set<string>>();

  sortedPlayers.forEach(p => {
    benchedCounts.set(p.id, 0);
    partnerHistory.set(p.id, new Set());
  });

  let currentArrangement = [...sortedPlayers];

  const rotate = (arr: Player[]): Player[] => {
    if (arr.length <= 1) return arr;
    const fixed = arr[0];
    const rest = arr.slice(1);
    const last = rest.pop() as Player;
    return [fixed, last, ...rest];
  };

  const matches: Match[] = [];
  let matchIdCounter = 1;

  for (let r = 0; r < rounds; r++) {
    let activePlayers: Player[] = [];

    if (benchedPerRound > 0) {
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

    const numActive = activePlayers.length;
    const roundPairs: [Player, Player][] = [];
    for (let i = 0; i < numActive / 2; i++) {
      const p1 = activePlayers[i];
      const p2 = activePlayers[numActive - 1 - i];
      roundPairs.push([p1, p2]);

      partnerHistory.get(p1.id)?.add(p2.id);
      partnerHistory.get(p2.id)?.add(p1.id);
    }

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
          id: `americano-m${matchIdCounter++}`,
          date: tournamentDate,
          team1: [pair1[0].id, pair1[1].id],
          team2: [pair2[0].id, pair2[1].id],
          sets: [{ team1: 0, team2: 0 }],
          winner: null,
          phase: 'group',
          groupNumber: 1,
          courtNumber: (i % fields) + 1,
          roundNumber: r + 1,
          tournamentId: 'temp',
        } as Match);
      }
    }

    currentArrangement = rotate(currentArrangement);
  }

  return {
    boxNumber: 1,
    courtNumber: 1,
    players: sortedPlayers,
    matches,
  };
}

/**
 * Distribuisce le coppie fisse nei Box in base all'ELO medio con distribuzione a serpentina.
 */
export function distributePairsIntoBoxes(
  pairs: [Player, Player][],
  numCampi: number,
  tournamentDate: string
): CustomBoxData[] {
  const sortedPairs = [...pairs].sort((a, b) => {
    const avgA = (a[0].currentElo + a[1].currentElo) / 2;
    const avgB = (b[0].currentElo + b[1].currentElo) / 2;
    return avgB - avgA;
  });

  const numBoxes = Math.min(Math.max(1, numCampi), Math.max(1, sortedPairs.length));
  const boxesPairs: [Player, Player][][] = Array.from({ length: numBoxes }, () => []);

  sortedPairs.forEach((pair, idx) => {
    const cycle = Math.floor(idx / numBoxes);
    const rem = idx % numBoxes;
    const boxIdx = cycle % 2 === 1 ? numBoxes - 1 - rem : rem;
    boxesPairs[boxIdx].push(pair);
  });

  return boxesPairs.map((pairList, bIdx) => {
    const boxNumber = bIdx + 1;
    const courtNumber = (bIdx % Math.max(1, numCampi)) + 1;
    const matches: Match[] = [];

    let matchIdx = 1;
    for (let i = 0; i < pairList.length; i++) {
      for (let j = i + 1; j < pairList.length; j++) {
        matches.push({
          id: `box-${boxNumber}-m${matchIdx}`,
          date: tournamentDate,
          team1: [pairList[i][0].id, pairList[i][1].id],
          team2: [pairList[j][0].id, pairList[j][1].id],
          sets: [{ team1: 0, team2: 0 }],
          winner: null,
          phase: 'group',
          groupNumber: boxNumber,
          courtNumber,
          roundNumber: matchIdx,
          tournamentId: 'temp',
        } as Match);
        matchIdx++;
      }
    }

    return {
      boxNumber,
      courtNumber,
      players: pairList.flatMap(p => [p[0], p[1]]),
      pairs: pairList,
      matches,
    };
  });
}

/**
 * Calcola le classifiche dei box: Vittoria = 3 pt, Pareggio = 1 pt, Sconfitta = 0 pt,
 * ordinamento: punti DESC, differenza games DESC, games vinti DESC.
 */
export function calculateStandingsForBoxes(
  boxesData: CustomBoxData[],
  isSingles: boolean
): Record<number, BoxStandingItem[]> {
  const standingsByBox: Record<number, BoxStandingItem[]> = {};

  boxesData.forEach(box => {
    if (isSingles) {
      const statsMap = new Map<string, {
        player: Player;
        points: number;
        gamesWon: number;
        gamesLost: number;
      }>();

      box.players.forEach(p => {
        statsMap.set(p.id, { player: p, points: 0, gamesWon: 0, gamesLost: 0 });
      });

      box.matches.forEach(m => {
        if (!m.winner) return;
        const t1 = (m.sets || []).reduce((s, x) => s + (x.team1 || 0), 0);
        const t2 = (m.sets || []).reduce((s, x) => s + (x.team2 || 0), 0);

        m.team1.forEach(pId => {
          const st = statsMap.get(pId);
          if (st) {
            if (m.winner === 'team1') st.points += 3;
            else if (m.winner === 'draw') st.points += 1;
            st.gamesWon += t1;
            st.gamesLost += t2;
          }
        });

        m.team2.forEach(pId => {
          const st = statsMap.get(pId);
          if (st) {
            if (m.winner === 'team2') st.points += 3;
            else if (m.winner === 'draw') st.points += 1;
            st.gamesWon += t2;
            st.gamesLost += t1;
          }
        });
      });

      const list: BoxStandingItem[] = Array.from(statsMap.values()).map(s => ({
        id: s.player.id,
        player: s.player,
        displayName: formatShort(s.player),
        points: s.points,
        gamesWon: s.gamesWon,
        gamesLost: s.gamesLost,
        diff: s.gamesWon - s.gamesLost,
        rank: 0,
      }));

      list.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.diff !== a.diff) return b.diff - a.diff;
        return b.gamesWon - a.gamesWon;
      });

      list.forEach((item, idx) => { item.rank = idx + 1; });
      standingsByBox[box.boxNumber] = list;
    } else {
      // Pairs mode
      const pairList = box.pairs || [];
      const statsList: BoxStandingItem[] = pairList.map(pair => {
        const pairKey = [pair[0].id, pair[1].id].sort().join('-');
        return {
          id: pairKey,
          pair,
          displayName: `${pair[0].surname}/${pair[1].surname}`,
          points: 0,
          gamesWon: 0,
          gamesLost: 0,
          diff: 0,
          rank: 0,
        };
      });

      box.matches.forEach(m => {
        if (!m.winner) return;
        const t1 = (m.sets || []).reduce((s, x) => s + (x.team1 || 0), 0);
        const t2 = (m.sets || []).reduce((s, x) => s + (x.team2 || 0), 0);

        const key1 = [...m.team1].sort().join('-');
        const key2 = [...m.team2].sort().join('-');

        const p1Stats = statsList.find(s => s.id === key1);
        const p2Stats = statsList.find(s => s.id === key2);

        if (p1Stats) {
          if (m.winner === 'team1') p1Stats.points += 3;
          else if (m.winner === 'draw') p1Stats.points += 1;
          p1Stats.gamesWon += t1;
          p1Stats.gamesLost += t2;
        }

        if (p2Stats) {
          if (m.winner === 'team2') p2Stats.points += 3;
          else if (m.winner === 'draw') p2Stats.points += 1;
          p2Stats.gamesWon += t2;
          p2Stats.gamesLost += t1;
        }
      });

      statsList.forEach(s => { s.diff = s.gamesWon - s.gamesLost; });

      statsList.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.diff !== a.diff) return b.diff - a.diff;
        return b.gamesWon - a.gamesWon;
      });

      statsList.forEach((item, idx) => { item.rank = idx + 1; });
      standingsByBox[box.boxNumber] = statsList;
    }
  });

  return standingsByBox;
}

/**
 * Genera le semifinali dai risultati dei box.
 */
export function generateSemifinalsMatches(
  boxStandings: Record<number, BoxStandingItem[]>,
  isSingles: boolean,
  tournamentDate: string
): Match[] {
  const boxNumbers = Object.keys(boxStandings).map(Number).sort((a, b) => a - b);

  if (isSingles) {
    if (boxNumbers.length === 2) {
      const box1 = boxStandings[1] || [];
      const box2 = boxStandings[2] || [];

      if (box1.length < 4 || box2.length < 4) return [];

      const sf1: Match = {
        id: 'sf-1',
        date: tournamentDate,
        team1: [box1[0].id, box2[3].id],
        team2: [box2[1].id, box1[2].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'semifinal',
        roundNumber: 1,
        courtNumber: 1,
        tournamentId: 'temp',
      } as Match;

      const sf2: Match = {
        id: 'sf-2',
        date: tournamentDate,
        team1: [box2[0].id, box1[3].id],
        team2: [box1[1].id, box2[2].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'semifinal',
        roundNumber: 1,
        courtNumber: 2,
        tournamentId: 'temp',
      } as Match;

      return [sf1, sf2];
    } else {
      // 3 o 4 box di singoli: classifica globale e top 8
      const allPlayers = Object.values(boxStandings).flat();
      allPlayers.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.diff !== a.diff) return b.diff - a.diff;
        return b.gamesWon - a.gamesWon;
      });

      if (allPlayers.length < 8) return [];

      const sf1: Match = {
        id: 'sf-1',
        date: tournamentDate,
        team1: [allPlayers[0].id, allPlayers[7].id],
        team2: [allPlayers[3].id, allPlayers[4].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'semifinal',
        roundNumber: 1,
        courtNumber: 1,
        tournamentId: 'temp',
      } as Match;

      const sf2: Match = {
        id: 'sf-2',
        date: tournamentDate,
        team1: [allPlayers[1].id, allPlayers[6].id],
        team2: [allPlayers[2].id, allPlayers[5].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'semifinal',
        roundNumber: 1,
        courtNumber: 2,
        tournamentId: 'temp',
      } as Match;

      return [sf1, sf2];
    }
  } else {
    // Pairs mode
    if (boxNumbers.length === 2) {
      const box1 = boxStandings[1] || [];
      const box2 = boxStandings[2] || [];

      if (!box1[0]?.pair || !box2[0]?.pair || !box1[1]?.pair || !box2[1]?.pair) return [];

      const sf1: Match = {
        id: 'sf-1',
        date: tournamentDate,
        team1: [box1[0].pair[0].id, box1[0].pair[1].id],
        team2: [box2[1].pair[0].id, box2[1].pair[1].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'semifinal',
        roundNumber: 1,
        courtNumber: 1,
        tournamentId: 'temp',
      } as Match;

      const sf2: Match = {
        id: 'sf-2',
        date: tournamentDate,
        team1: [box2[0].pair[0].id, box2[0].pair[1].id],
        team2: [box1[1].pair[0].id, box1[1].pair[1].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'semifinal',
        roundNumber: 1,
        courtNumber: 2,
        tournamentId: 'temp',
      } as Match;

      return [sf1, sf2];
    } else if (boxNumbers.length === 3) {
      // 3 box a coppie: le 3 prime + la migliore seconda
      const firsts = [boxStandings[1]?.[0], boxStandings[2]?.[0], boxStandings[3]?.[0]].filter(Boolean);
      const seconds = [boxStandings[1]?.[1], boxStandings[2]?.[1], boxStandings[3]?.[1]].filter(Boolean);

      const sortByScore = (a: BoxStandingItem, b: BoxStandingItem) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.diff !== a.diff) return b.diff - a.diff;
        return b.gamesWon - a.gamesWon;
      };

      firsts.sort(sortByScore);
      seconds.sort(sortByScore);

      const seed1 = firsts[0];
      const seed2 = firsts[1];
      const seed3 = firsts[2];
      const seed4 = seconds[0];

      if (!seed1?.pair || !seed2?.pair || !seed3?.pair || !seed4?.pair) return [];

      const sf1: Match = {
        id: 'sf-1',
        date: tournamentDate,
        team1: [seed1.pair[0].id, seed1.pair[1].id],
        team2: [seed4.pair[0].id, seed4.pair[1].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'semifinal',
        roundNumber: 1,
        courtNumber: 1,
        tournamentId: 'temp',
      } as Match;

      const sf2: Match = {
        id: 'sf-2',
        date: tournamentDate,
        team1: [seed2.pair[0].id, seed2.pair[1].id],
        team2: [seed3.pair[0].id, seed3.pair[1].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'semifinal',
        roundNumber: 1,
        courtNumber: 2,
        tournamentId: 'temp',
      } as Match;

      return [sf1, sf2];
    } else if (boxNumbers.length === 1) {
      // 1 box a 4 coppie
      const box1 = boxStandings[1] || [];
      if (box1.length < 4 || !box1[0]?.pair || !box1[1]?.pair || !box1[2]?.pair || !box1[3]?.pair) return [];

      const sf1: Match = {
        id: 'sf-1',
        date: tournamentDate,
        team1: [box1[0].pair[0].id, box1[0].pair[1].id],
        team2: [box1[3].pair[0].id, box1[3].pair[1].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'semifinal',
        roundNumber: 1,
        courtNumber: 1,
        tournamentId: 'temp',
      } as Match;

      const sf2: Match = {
        id: 'sf-2',
        date: tournamentDate,
        team1: [box1[1].pair[0].id, box1[1].pair[1].id],
        team2: [box1[2].pair[0].id, box1[2].pair[1].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'semifinal',
        roundNumber: 1,
        courtNumber: 2,
        tournamentId: 'temp',
      } as Match;

      return [sf1, sf2];
    }
  }

  return [];
}

/**
 * Genera le finali direttamente dai Box (quando non sono previste semifinali).
 */
export function generateFinalsMatchesFromBoxes(
  boxStandings: Record<number, BoxStandingItem[]>,
  isSingles: boolean,
  tournamentDate: string
): Match[] {
  const boxNumbers = Object.keys(boxStandings).map(Number).sort((a, b) => a - b);

  if (isSingles) {
    if (boxNumbers.length === 1) {
      // 1 Gruppo (es. Americano a classifica unica o singolo box)
      const box1 = boxStandings[1] || [];
      if (box1.length < 4) return [];

      const matches: Match[] = [];
      // Finale 1°-2° posto: 1° & 4° vs 2° & 3°
      matches.push({
        id: 'final-1-2',
        date: tournamentDate,
        team1: [box1[0].id, box1[3].id],
        team2: [box1[1].id, box1[2].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'final_1_2',
        roundNumber: 1,
        courtNumber: 1,
        tournamentId: 'temp',
      } as Match);

      // Se ci sono almeno 8 giocatori, genera anche finale 3°-4° posto (tra 5°, 6°, 7°, 8°)
      if (box1.length >= 8) {
        matches.push({
          id: 'final-3-4',
          date: tournamentDate,
          team1: [box1[4].id, box1[7].id],
          team2: [box1[5].id, box1[6].id],
          sets: [{ team1: 0, team2: 0 }],
          winner: null,
          phase: 'final_3_4',
          roundNumber: 1,
          courtNumber: 2,
          tournamentId: 'temp',
        } as Match);
      }

      return matches;
    } else if (boxNumbers.length === 2) {
      const box1 = boxStandings[1] || [];
      const box2 = boxStandings[2] || [];
      if (box1.length < 4 || box2.length < 4) return [];

      const final1: Match = {
        id: 'final-1-2',
        date: tournamentDate,
        team1: [box1[0].id, box2[1].id],
        team2: [box2[0].id, box1[1].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'final_1_2',
        roundNumber: 1,
        courtNumber: 1,
        tournamentId: 'temp',
      } as Match;

      const final3: Match = {
        id: 'final-3-4',
        date: tournamentDate,
        team1: [box1[2].id, box2[3].id],
        team2: [box2[2].id, box1[3].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'final_3_4',
        roundNumber: 1,
        courtNumber: 2,
        tournamentId: 'temp',
      } as Match;

      return [final1, final3];
    } else {
      // 3 o 4 Box di singoli: classifica generale
      const allPlayers = Object.values(boxStandings).flat();
      allPlayers.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.diff !== a.diff) return b.diff - a.diff;
        return b.gamesWon - a.gamesWon;
      });

      if (allPlayers.length < 8) return [];

      const final1: Match = {
        id: 'final-1-2',
        date: tournamentDate,
        team1: [allPlayers[0].id, allPlayers[3].id],
        team2: [allPlayers[1].id, allPlayers[2].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'final_1_2',
        roundNumber: 1,
        courtNumber: 1,
        tournamentId: 'temp',
      } as Match;

      const final3: Match = {
        id: 'final-3-4',
        date: tournamentDate,
        team1: [allPlayers[4].id, allPlayers[7].id],
        team2: [allPlayers[5].id, allPlayers[6].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'final_3_4',
        roundNumber: 1,
        courtNumber: 2,
        tournamentId: 'temp',
      } as Match;

      return [final1, final3];
    }
  } else {
    // Pairs mode
    if (boxNumbers.length === 1) {
      const box1 = boxStandings[1] || [];
      if (box1.length < 2 || !box1[0]?.pair || !box1[1]?.pair) return [];

      const matches: Match[] = [];
      matches.push({
        id: 'final-1-2',
        date: tournamentDate,
        team1: [box1[0].pair[0].id, box1[0].pair[1].id],
        team2: [box1[1].pair[0].id, box1[1].pair[1].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'final_1_2',
        roundNumber: 1,
        courtNumber: 1,
        tournamentId: 'temp',
      } as Match);

      if (box1.length >= 4 && box1[2]?.pair && box1[3]?.pair) {
        matches.push({
          id: 'final-3-4',
          date: tournamentDate,
          team1: [box1[2].pair[0].id, box1[2].pair[1].id],
          team2: [box1[3].pair[0].id, box1[3].pair[1].id],
          sets: [{ team1: 0, team2: 0 }],
          winner: null,
          phase: 'final_3_4',
          roundNumber: 1,
          courtNumber: 2,
          tournamentId: 'temp',
        } as Match);
      }

      return matches;
    } else if (boxNumbers.length === 2) {
      const box1 = boxStandings[1] || [];
      const box2 = boxStandings[2] || [];

      if (!box1[0]?.pair || !box2[0]?.pair || !box1[1]?.pair || !box2[1]?.pair) return [];

      const final1: Match = {
        id: 'final-1-2',
        date: tournamentDate,
        team1: [box1[0].pair[0].id, box1[0].pair[1].id],
        team2: [box2[0].pair[0].id, box2[0].pair[1].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'final_1_2',
        roundNumber: 1,
        courtNumber: 1,
        tournamentId: 'temp',
      } as Match;

      const final3: Match = {
        id: 'final-3-4',
        date: tournamentDate,
        team1: [box1[1].pair[0].id, box1[1].pair[1].id],
        team2: [box2[1].pair[0].id, box2[1].pair[1].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'final_3_4',
        roundNumber: 1,
        courtNumber: 2,
        tournamentId: 'temp',
      } as Match;

      return [final1, final3];
    } else if (boxNumbers.length === 3) {
      const firsts = [boxStandings[1]?.[0], boxStandings[2]?.[0], boxStandings[3]?.[0]].filter(Boolean);
      const seconds = [boxStandings[1]?.[1], boxStandings[2]?.[1], boxStandings[3]?.[1]].filter(Boolean);

      const sortByScore = (a: BoxStandingItem, b: BoxStandingItem) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.diff !== a.diff) return b.diff - a.diff;
        return b.gamesWon - a.gamesWon;
      };

      firsts.sort(sortByScore);
      seconds.sort(sortByScore);

      if (!firsts[0]?.pair || !firsts[1]?.pair || !firsts[2]?.pair || !seconds[0]?.pair) return [];

      const final1: Match = {
        id: 'final-1-2',
        date: tournamentDate,
        team1: [firsts[0].pair[0].id, firsts[0].pair[1].id],
        team2: [firsts[1].pair[0].id, firsts[1].pair[1].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'final_1_2',
        roundNumber: 1,
        courtNumber: 1,
        tournamentId: 'temp',
      } as Match;

      const final3: Match = {
        id: 'final-3-4',
        date: tournamentDate,
        team1: [firsts[2].pair[0].id, firsts[2].pair[1].id],
        team2: [seconds[0].pair[0].id, seconds[0].pair[1].id],
        sets: [{ team1: 0, team2: 0 }],
        winner: null,
        phase: 'final_3_4',
        roundNumber: 1,
        courtNumber: 2,
        tournamentId: 'temp',
      } as Match;

      return [final1, final3];
    }
  }

  return [];
}

/**
 * Genera le finali dopo che le semifinali sono state completate.
 */
export function generateFinalsMatchesFromSemifinals(
  semifinalMatches: Match[],
  tournamentDate: string
): Match[] {
  if (semifinalMatches.length < 2) return [];

  const sf1 = semifinalMatches[0];
  const sf2 = semifinalMatches[1];

  const sf1WinnerTeam = sf1.winner === 'team1' ? sf1.team1 : sf1.team2;
  const sf1LoserTeam = sf1.winner === 'team1' ? sf1.team2 : sf1.team1;
  const sf2WinnerTeam = sf2.winner === 'team1' ? sf2.team1 : sf2.team2;
  const sf2LoserTeam = sf2.winner === 'team1' ? sf2.team2 : sf2.team1;

  const final1: Match = {
    id: 'final-1-2',
    date: tournamentDate,
    team1: sf1WinnerTeam,
    team2: sf2WinnerTeam,
    sets: [{ team1: 0, team2: 0 }],
    winner: null,
    phase: 'final_1_2',
    roundNumber: 1,
    courtNumber: 1,
    tournamentId: 'temp',
  } as Match;

  const final3: Match = {
    id: 'final-3-4',
    date: tournamentDate,
    team1: sf1LoserTeam,
    team2: sf2LoserTeam,
    sets: [{ team1: 0, team2: 0 }],
    winner: null,
    phase: 'final_3_4',
    roundNumber: 1,
    courtNumber: 2,
    tournamentId: 'temp',
  } as Match;

  return [final1, final3];
}

/**
 * Calcola le classifiche individuali per tutti i giocatori (usate nella stampa BeatTheBoxComplete).
 */
export function computeIndividualStandings(
  boxesData: CustomBoxData[],
  allMatches: Match[]
): IndividualStandingItem[] {
  const playerStats = new Map<string, { player: Player; gamesWon: number; gamesLost: number }>();

  // Inizializza tutti i giocatori
  boxesData.forEach(box => {
    box.players.forEach(p => {
      if (!playerStats.has(p.id)) {
        playerStats.set(p.id, { player: p, gamesWon: 0, gamesLost: 0 });
      }
    });
  });

  allMatches.forEach(m => {
    if (!m.winner) return;
    const t1 = (m.sets || []).reduce((s, x) => s + (x.team1 || 0), 0);
    const t2 = (m.sets || []).reduce((s, x) => s + (x.team2 || 0), 0);

    m.team1.forEach(pid => {
      const stats = playerStats.get(pid);
      if (stats) {
        stats.gamesWon += t1;
        stats.gamesLost += t2;
      }
    });

    m.team2.forEach(pid => {
      const stats = playerStats.get(pid);
      if (stats) {
        stats.gamesWon += t2;
        stats.gamesLost += t1;
      }
    });
  });

  const list: IndividualStandingItem[] = Array.from(playerStats.values()).map(s => {
    const totalGames = s.gamesWon + s.gamesLost;
    const winPercentage = totalGames > 0 ? (s.gamesWon / totalGames) * 100 : 0;
    return {
      player: s.player,
      eloChange: 0,
      rank: 0,
      gamesWon: s.gamesWon,
      gamesLost: s.gamesLost,
      winPercentage,
    };
  });

  list.sort((a, b) => {
    const diffA = a.gamesWon - a.gamesLost;
    const diffB = b.gamesWon - b.gamesLost;
    if (diffB !== diffA) return diffB - diffA;
    return b.gamesWon - a.gamesWon;
  });

  list.forEach((item, idx) => { item.rank = idx + 1; });
  return list;
}
