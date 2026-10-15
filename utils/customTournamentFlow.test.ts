import { describe, it, expect } from 'vitest';
import { Player, Match, FieldPosition } from '../types.ts';
import { validateCustomFlow } from './customTournamentValidator.ts';
import {
  distributeSinglesIntoBoxes,
  distributePairsIntoBoxes,
  generateAmericanoMatchesForCustomFlow,
  calculateStandingsForBoxes,
  generateSemifinalsMatches,
  generateFinalsMatchesFromBoxes,
  generateFinalsMatchesFromSemifinals,
  computeIndividualStandings,
} from './customTournamentFlowLogic.ts';

// Helper per creare giocatori fittizi con ELO specificato
function createMockPlayer(id: string, name: string, surname: string, elo: number): Player {
  return {
    id,
    name,
    surname,
    currentElo: elo,
    initialElo: elo,
    position: FieldPosition.Indifferente,
  };
}

// Helper per generare N giocatori
function generatePlayers(count: number, baseElo = 1500): Player[] {
  return Array.from({ length: count }, (_, i) =>
    createMockPlayer(`p${i + 1}`, `Player`, `${i + 1}`, baseElo + (count - i) * 10)
  );
}

// Helper per generare N coppie
function generatePairs(count: number, baseElo = 1500): [Player, Player][] {
  const players = generatePlayers(count * 2, baseElo);
  const pairs: [Player, Player][] = [];
  for (let i = 0; i < count; i++) {
    pairs.push([players[i * 2], players[i * 2 + 1]]);
  }
  return pairs;
}

describe('1. Validazione Combinazioni Torneo Personale (customTournamentValidator)', () => {
  describe('A. Combinazione: box + finali', () => {
    it('valido per Singoli con 4 o 5 giocatori per campo (es. 8, 9, 10 su 2 campi)', () => {
      [8, 9, 10].forEach(n => {
        const res = validateCustomFlow(['box', 'finali'], 'singles', n, 2);
        expect(res.isValid, `Fallito con ${n} giocatori su 2 campi`).toBe(true);
      });
      [12, 13, 14, 15].forEach(n => {
        const res = validateCustomFlow(['box', 'finali'], 'singles', n, 3);
        expect(res.isValid, `Fallito con ${n} giocatori su 3 campi`).toBe(true);
      });
    });

    it('invalido per Singoli fuori dal range 4-5 per campo (es. 7 o 11 su 2 campi)', () => {
      [2, 3, 7, 11, 14].forEach(n => {
        const res = validateCustomFlow(['box', 'finali'], 'singles', n, 2);
        expect(res.isValid, `Dovrebbe fallire con ${n} giocatori`).toBe(false);
      });
    });

    it('valido per Coppie con 6 e 8 coppie su 2 campi, 10 coppie su 3 campi', () => {
      expect(validateCustomFlow(['box', 'finali'], 'pairs', 6, 2).isValid).toBe(true);
      expect(validateCustomFlow(['box', 'finali'], 'pairs', 8, 2).isValid).toBe(true);
      expect(validateCustomFlow(['box', 'finali'], 'pairs', 10, 3).isValid).toBe(true);
    });

    it('invalido per Coppie con meno di 3 o più di 4 per campo', () => {
      // 10 coppie su 2 campi = 5 a campo -> errore
      const res1 = validateCustomFlow(['box', 'finali'], 'pairs', 10, 2);
      expect(res1.isValid).toBe(false);

      // 6 coppie su 3 campi = 2 a campo -> errore
      const res2 = validateCustomFlow(['box', 'finali'], 'pairs', 6, 3);
      expect(res2.isValid).toBe(false);
    });
  });

  describe('B. Combinazione: box + semifinali + finali', () => {
    it('invalido per Singoli con 4 giocatori (servono almeno 8 giocatori per 2 semifinali)', () => {
      const res = validateCustomFlow(['box', 'semifinali', 'finali'], 'singles', 4, 1);
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => e.includes('almeno 8 giocatori'))).toBe(true);
    });

    it('valido per Singoli con 8, 12, 16 giocatori', () => {
      [8, 12, 16].forEach(n => {
        const res = validateCustomFlow(['box', 'semifinali', 'finali'], 'singles', n, Math.ceil(n / 4));
        expect(res.isValid, `Fallito con ${n} giocatori`).toBe(true);
      });
    });

    it('invalido per Coppie con meno di 4 coppie', () => {
      const res = validateCustomFlow(['box', 'semifinali', 'finali'], 'pairs', 3, 1);
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => e.includes('almeno 4 coppie'))).toBe(true);
    });

    it('valido per Coppie con 6, 8, 10 coppie su campi adatti', () => {
      expect(validateCustomFlow(['box', 'semifinali', 'finali'], 'pairs', 6, 2).isValid).toBe(true);
      expect(validateCustomFlow(['box', 'semifinali', 'finali'], 'pairs', 8, 2).isValid).toBe(true);
      expect(validateCustomFlow(['box', 'semifinali', 'finali'], 'pairs', 10, 3).isValid).toBe(true);
    });
  });

  describe('C. Combinazione: box + quarti + semifinali + finali', () => {
    it('richiede almeno 16 giocatori per Singoli', () => {
      expect(validateCustomFlow(['box', 'quarti', 'semifinali', 'finali'], 'singles', 8, 2).isValid).toBe(false);
      expect(validateCustomFlow(['box', 'quarti', 'semifinali', 'finali'], 'singles', 12, 3).isValid).toBe(false);
      expect(validateCustomFlow(['box', 'quarti', 'semifinali', 'finali'], 'singles', 16, 4).isValid).toBe(true);
    });

    it('richiede almeno 8 coppie per Coppie', () => {
      expect(validateCustomFlow(['box', 'quarti', 'semifinali', 'finali'], 'pairs', 6, 2).isValid).toBe(false);
      expect(validateCustomFlow(['box', 'quarti', 'semifinali', 'finali'], 'pairs', 8, 2).isValid).toBe(true);
      expect(validateCustomFlow(['box', 'quarti', 'semifinali', 'finali'], 'pairs', 10, 3).isValid).toBe(true);
    });
  });

  describe('D. Combinazione: americano + finali', () => {
    it('valido solo per Singoli con almeno 6 giocatori', () => {
      expect(validateCustomFlow(['americano', 'finali'], 'singles', 5, 1).isValid).toBe(false);
      expect(validateCustomFlow(['americano', 'finali'], 'singles', 6, 1).isValid).toBe(true);
      expect(validateCustomFlow(['americano', 'finali'], 'singles', 7, 2).isValid).toBe(true);
      expect(validateCustomFlow(['americano', 'finali'], 'singles', 8, 2).isValid).toBe(true);
      expect(validateCustomFlow(['americano', 'finali'], 'singles', 12, 3).isValid).toBe(true);
    });

    it('vietato per Coppie Fisse', () => {
      const res = validateCustomFlow(['americano', 'finali'], 'pairs', 8, 2);
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => e.includes('Americano'))).toBe(true);
    });
  });

  describe('E. Combinazione: girone + semifinali + finali', () => {
    it('valido per Coppie Fisse con almeno 4 coppie', () => {
      expect(validateCustomFlow(['girone', 'semifinali', 'finali'], 'pairs', 4, 2).isValid).toBe(true);
      expect(validateCustomFlow(['girone', 'semifinali', 'finali'], 'pairs', 5, 2).isValid).toBe(true);
      expect(validateCustomFlow(['girone', 'semifinali', 'finali'], 'pairs', 6, 2).isValid).toBe(true);
    });

    it('vietato per Singoli', () => {
      const res = validateCustomFlow(['girone', 'semifinali', 'finali'], 'singles', 8, 2);
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => e.includes('Girone Italiano'))).toBe(true);
    });

    it('invalido se le coppie sono meno di 4', () => {
      const res = validateCustomFlow(['girone', 'semifinali', 'finali'], 'pairs', 3, 1);
      expect(res.isValid).toBe(false);
    });
  });

  describe('F. Combinazione: torneotto + finali', () => {
    it('valido per Coppie Fisse con esattamente 4 coppie', () => {
      expect(validateCustomFlow(['torneotto', 'finali'], 'pairs', 4, 2).isValid).toBe(true);
    });

    it('invalido se il numero di coppie è diverso da 4', () => {
      expect(validateCustomFlow(['torneotto', 'finali'], 'pairs', 6, 2).isValid).toBe(false);
      expect(validateCustomFlow(['torneotto', 'finali'], 'pairs', 8, 2).isValid).toBe(false);
    });

    it('vietato per Singoli', () => {
      expect(validateCustomFlow(['torneotto', 'finali'], 'singles', 4, 1).isValid).toBe(false);
    });
  });
});

describe('2. Logica Distribuzione Box (Singoli e Coppie)', () => {
  describe('A. Singoli (4, 8, 12, 16 giocatori) con 1, 2, 3, 4 campi', () => {
    it('4 giocatori con 1 campo -> 1 box da 4 giocatori, campo 1, 3 partite', () => {
      const players = generatePlayers(4);
      const boxes = distributeSinglesIntoBoxes(players, 1, '2026-10-13');
      expect(boxes.length).toBe(1);
      expect(boxes[0].players.length).toBe(4);
      expect(boxes[0].courtNumber).toBe(1);
      expect(boxes[0].matches.length).toBe(3);
    });

    it('4 giocatori con 2 campi -> sempre 1 box da 4 giocatori (mai sdoppiato in 2 mezze squadre)', () => {
      const players = generatePlayers(4);
      const boxes = distributeSinglesIntoBoxes(players, 2, '2026-10-13');
      expect(boxes.length).toBe(1);
      expect(boxes[0].players.length).toBe(4);
      expect(boxes[0].matches.length).toBe(3);
    });

    it('8 giocatori con 1 campo -> 2 box da 4 giocatori, entrambi assegnati a campo 1', () => {
      const players = generatePlayers(8);
      const boxes = distributeSinglesIntoBoxes(players, 1, '2026-10-13');
      expect(boxes.length).toBe(2);
      expect(boxes[0].players.length).toBe(4);
      expect(boxes[1].players.length).toBe(4);
      expect(boxes[0].courtNumber).toBe(1);
      expect(boxes[1].courtNumber).toBe(1);
      expect(boxes[0].matches.length).toBe(3);
      expect(boxes[1].matches.length).toBe(3);
    });

    it('8 giocatori con 2 campi -> 2 box da 4 giocatori, campi 1 e 2', () => {
      const players = generatePlayers(8);
      const boxes = distributeSinglesIntoBoxes(players, 2, '2026-10-13');
      expect(boxes.length).toBe(2);
      expect(boxes[0].courtNumber).toBe(1);
      expect(boxes[1].courtNumber).toBe(2);
      expect(boxes[0].players.length).toBe(4);
      expect(boxes[1].players.length).toBe(4);
    });

    it('8 giocatori con 3 o 4 campi -> 2 box da 4 giocatori su campi 1 e 2', () => {
      const players = generatePlayers(8);
      const boxes = distributeSinglesIntoBoxes(players, 4, '2026-10-13');
      expect(boxes.length).toBe(2);
      expect(boxes[0].players.length).toBe(4);
      expect(boxes[1].players.length).toBe(4);
    });

    it('12 giocatori con 3 campi -> 3 box da 4 giocatori, campi 1, 2, 3', () => {
      const players = generatePlayers(12);
      const boxes = distributeSinglesIntoBoxes(players, 3, '2026-10-13');
      expect(boxes.length).toBe(3);
      expect(boxes.map(b => b.players.length)).toEqual([4, 4, 4]);
      expect(boxes.map(b => b.courtNumber)).toEqual([1, 2, 3]);
    });

    it('16 giocatori con 4 campi -> 4 box da 4 giocatori, campi 1, 2, 3, 4', () => {
      const players = generatePlayers(16);
      const boxes = distributeSinglesIntoBoxes(players, 4, '2026-10-13');
      expect(boxes.length).toBe(4);
      expect(boxes.map(b => b.players.length)).toEqual([4, 4, 4, 4]);
      expect(boxes.map(b => b.courtNumber)).toEqual([1, 2, 3, 4]);
      expect(boxes.every(b => b.matches.length === 3)).toBe(true);
    });

    it('Verifica serpentina ELO: teste di serie distribuite uniformemente', () => {
      // 8 giocatori: ordinati p1 (migliore) -> p8 (peggiore)
      const players = generatePlayers(8);
      const boxes = distributeSinglesIntoBoxes(players, 2, '2026-10-13');
      // Box 1 deve avere seed 1 (p1), seed 4 (p4), seed 5 (p5), seed 8 (p8)
      const box1Ids = boxes[0].players.map(p => p.id);
      expect(box1Ids).toEqual(['p1', 'p4', 'p5', 'p8']);

      // Box 2 deve avere seed 2 (p2), seed 3 (p3), seed 6 (p6), seed 7 (p7)
      const box2Ids = boxes[1].players.map(p => p.id);
      expect(box2Ids).toEqual(['p2', 'p3', 'p6', 'p7']);
    });

    it('5 giocatori con 1 campo -> 1 box da 5 giocatori con 5 partite (1 a riposo per turno)', () => {
      const players = generatePlayers(5);
      const boxes = distributeSinglesIntoBoxes(players, 1, '2026-10-13');
      expect(boxes.length).toBe(1);
      expect(boxes[0].players.length).toBe(5);
      expect(boxes[0].matches.length).toBe(5);

      // Ciascun giocatore deve comparire in esattamente 4 partite su 5
      players.forEach(p => {
        const appearances = boxes[0].matches.filter(m => [...m.team1, ...m.team2].includes(p.id)).length;
        expect(appearances).toBe(4);
      });
    });

    it('9 giocatori con 2 campi -> 2 box (uno da 5 e uno da 4 giocatori)', () => {
      const players = generatePlayers(9);
      const boxes = distributeSinglesIntoBoxes(players, 2, '2026-10-13');
      expect(boxes.length).toBe(2);
      expect(boxes[0].players.length).toBe(5);
      expect(boxes[1].players.length).toBe(4);
      expect(boxes[0].matches.length).toBe(5);
      expect(boxes[1].matches.length).toBe(3);
    });
  });

  describe('B. Coppie (6, 8, 10 coppie) con 2, 3 campi', () => {
    it('6 coppie con 2 campi -> 2 box da 3 coppie, 3 partite per box', () => {
      const pairs = generatePairs(6);
      const boxes = distributePairsIntoBoxes(pairs, 2, '2026-10-13');
      expect(boxes.length).toBe(2);
      expect(boxes[0].pairs?.length).toBe(3);
      expect(boxes[1].pairs?.length).toBe(3);
      expect(boxes[0].courtNumber).toBe(1);
      expect(boxes[1].courtNumber).toBe(2);
      // Con 3 coppie, match robin robin = 3*(3-1)/2 = 3 match
      expect(boxes[0].matches.length).toBe(3);
      expect(boxes[1].matches.length).toBe(3);
    });

    it('8 coppie con 2 campi -> 2 box da 4 coppie, 6 partite per box', () => {
      const pairs = generatePairs(8);
      const boxes = distributePairsIntoBoxes(pairs, 2, '2026-10-13');
      expect(boxes.length).toBe(2);
      expect(boxes[0].pairs?.length).toBe(4);
      expect(boxes[1].pairs?.length).toBe(4);
      // Con 4 coppie, match round robin = 4*(4-1)/2 = 6 match
      expect(boxes[0].matches.length).toBe(6);
      expect(boxes[1].matches.length).toBe(6);
    });

    it('10 coppie con 3 campi -> 3 box (3, 3, 4 coppie)', () => {
      const pairs = generatePairs(10);
      const boxes = distributePairsIntoBoxes(pairs, 3, '2026-10-13');
      expect(boxes.length).toBe(3);
      const pairCounts = boxes.map(b => b.pairs?.length).sort();
      expect(pairCounts).toEqual([3, 3, 4]);
      expect(boxes.map(b => b.courtNumber)).toEqual([1, 2, 3]);
    });
  });
});

describe('3. Calcolo Punteggi e Classifiche (Vittoria 3, Pareggio 1, Sconfitta 0, Diff Games)', () => {
  it('calcola correttamente i punti nei box Singoli con vittoria, pareggio e differenza game', () => {
    const players = generatePlayers(4);
    const boxes = distributeSinglesIntoBoxes(players, 1, '2026-10-13');

    // Partita 1: team1 (p1, p2) batte team2 (p3, p4) 6-2
    boxes[0].matches[0].sets = [{ team1: 6, team2: 2 }];
    boxes[0].matches[0].winner = 'team1';

    // Partita 2: team1 (p1, p3) pareggia con team2 (p2, p4) 4-4
    boxes[0].matches[1].sets = [{ team1: 4, team2: 4 }];
    boxes[0].matches[1].winner = 'draw';

    // Partita 3: team1 (p1, p4) perde contro team2 (p2, p3) 3-6
    boxes[0].matches[2].sets = [{ team1: 3, team2: 6 }];
    boxes[0].matches[2].winner = 'team2';

    const standings = calculateStandingsForBoxes(boxes, true);
    const box1Standings = standings[1];

    expect(box1Standings.length).toBe(4);

    // p1: match 1 vittoria (3pt, +4), match 2 pareggio (1pt, 0), match 3 sconfitta (0pt, -3) => tot: 4pt, diff: +1
    const p1Stats = box1Standings.find(s => s.id === 'p1')!;
    expect(p1Stats.points).toBe(4);
    expect(p1Stats.gamesWon).toBe(13);
    expect(p1Stats.gamesLost).toBe(12);
    expect(p1Stats.diff).toBe(1);

    // p2: match 1 vittoria (3pt), match 2 pareggio (1pt), match 3 vittoria (3pt) => tot: 7pt
    const p2Stats = box1Standings.find(s => s.id === 'p2')!;
    expect(p2Stats.points).toBe(7);
    expect(p2Stats.rank).toBe(1); // p2 primo
  });

  it('calcola correttamente i punti nei box a Coppie', () => {
    const pairs = generatePairs(6);
    const boxes = distributePairsIntoBoxes(pairs, 2, '2026-10-13');

    // Box 1 (coppie c1, c2, c3):
    // c1 batte c2 6-1
    boxes[0].matches[0].sets = [{ team1: 6, team2: 1 }];
    boxes[0].matches[0].winner = 'team1';

    // c1 batte c3 6-3
    boxes[0].matches[1].sets = [{ team1: 6, team2: 3 }];
    boxes[0].matches[1].winner = 'team1';

    // c2 batte c3 6-4
    boxes[0].matches[2].sets = [{ team1: 6, team2: 4 }];
    boxes[0].matches[2].winner = 'team1';

    const standings = calculateStandingsForBoxes(boxes, false);
    const box1Standings = standings[1];

    expect(box1Standings[0].points).toBe(6); // 2 vittorie = 6 pt
    expect(box1Standings[0].rank).toBe(1);
    expect(box1Standings[1].points).toBe(3); // 1 vittoria = 3 pt
    expect(box1Standings[1].rank).toBe(2);
    expect(box1Standings[2].points).toBe(0); // 0 vittorie = 0 pt
    expect(box1Standings[2].rank).toBe(3);
  });
});

describe('4. Avanzamento alle Fasi Successive (Semifinali e Finali)', () => {
  describe('A. Semifinali e Finali per Singoli (8 giocatori / 2 box)', () => {
    it('genera correttamente semifinali incrociate tra box 1 e box 2', () => {
      const players = generatePlayers(8);
      const boxes = distributeSinglesIntoBoxes(players, 2, '2026-10-13');

      // Simula match completati
      boxes.forEach(b => b.matches.forEach(m => {
        m.sets = [{ team1: 6, team2: 2 }];
        m.winner = 'team1';
      }));

      const standings = calculateStandingsForBoxes(boxes, true);
      const sfMatches = generateSemifinalsMatches(standings, true, '2026-10-13');

      expect(sfMatches.length).toBe(2);
      expect(sfMatches[0].phase).toBe('semifinal');
      expect(sfMatches[1].phase).toBe('semifinal');

      // SF1: 1° B1 con 4° B2 vs 2° B2 con 3° B1
      expect(sfMatches[0].team1).toEqual([standings[1][0].id, standings[2][3].id]);
      expect(sfMatches[0].team2).toEqual([standings[2][1].id, standings[1][2].id]);

      // SF2: 1° B2 con 4° B1 vs 2° B1 con 3° B2
      expect(sfMatches[1].team1).toEqual([standings[2][0].id, standings[1][3].id]);
      expect(sfMatches[1].team2).toEqual([standings[1][1].id, standings[2][2].id]);

      // Risultati semifinali -> Generazione Finali
      sfMatches[0].winner = 'team1'; // Vincente SF1 = team1
      sfMatches[1].winner = 'team2'; // Vincente SF2 = team2

      const finals = generateFinalsMatchesFromSemifinals(sfMatches, '2026-10-13');
      expect(finals.length).toBe(2);

      // Finale 1-2: vincitrici sf1 e sf2
      expect(finals[0].phase).toBe('final_1_2');
      expect(finals[0].team1).toEqual(sfMatches[0].team1);
      expect(finals[0].team2).toEqual(sfMatches[1].team2);

      // Finale 3-4: perdenti sf1 e sf2
      expect(finals[1].phase).toBe('final_3_4');
      expect(finals[1].team1).toEqual(sfMatches[0].team2);
      expect(finals[1].team2).toEqual(sfMatches[1].team1);
    });
  });

  describe('B. Finali dirette da Box Singoli (4 giocatori / 1 box)', () => {
    it('genera finale 1°-2° bilanciata (1° & 4° vs 2° & 3°)', () => {
      const players = generatePlayers(4);
      const boxes = distributeSinglesIntoBoxes(players, 1, '2026-10-13');
      boxes[0].matches.forEach(m => {
        m.sets = [{ team1: 6, team2: 3 }];
        m.winner = 'team1';
      });

      const standings = calculateStandingsForBoxes(boxes, true);
      const finals = generateFinalsMatchesFromBoxes(standings, true, '2026-10-13');

      expect(finals.length).toBe(1);
      expect(finals[0].phase).toBe('final_1_2');
      expect(finals[0].team1).toEqual([standings[1][0].id, standings[1][3].id]);
      expect(finals[0].team2).toEqual([standings[1][1].id, standings[1][2].id]);
    });
  });

  describe('C. Semifinali e Finali per Coppie (2 box e 3 box)', () => {
    it('genera semifinali incrociate per 2 box a coppie (1° B1 vs 2° B2, 1° B2 vs 2° B1)', () => {
      const pairs = generatePairs(6);
      const boxes = distributePairsIntoBoxes(pairs, 2, '2026-10-13');
      boxes.forEach(b => b.matches.forEach(m => {
        m.sets = [{ team1: 6, team2: 4 }];
        m.winner = 'team1';
      }));

      const standings = calculateStandingsForBoxes(boxes, false);
      const sfMatches = generateSemifinalsMatches(standings, false, '2026-10-13');

      expect(sfMatches.length).toBe(2);
      expect(sfMatches[0].team1).toEqual([standings[1][0].pair![0].id, standings[1][0].pair![1].id]);
      expect(sfMatches[0].team2).toEqual([standings[2][1].pair![0].id, standings[2][1].pair![1].id]);
      expect(sfMatches[1].team1).toEqual([standings[2][0].pair![0].id, standings[2][0].pair![1].id]);
      expect(sfMatches[1].team2).toEqual([standings[1][1].pair![0].id, standings[1][1].pair![1].id]);
    });

    it('genera finali dirette per 2 box a coppie (1° B1 vs 1° B2, 2° B1 vs 2° B2)', () => {
      const pairs = generatePairs(8);
      const boxes = distributePairsIntoBoxes(pairs, 2, '2026-10-13');
      boxes.forEach(b => b.matches.forEach(m => {
        m.sets = [{ team1: 6, team2: 2 }];
        m.winner = 'team1';
      }));

      const standings = calculateStandingsForBoxes(boxes, false);
      const finals = generateFinalsMatchesFromBoxes(standings, false, '2026-10-13');

      expect(finals.length).toBe(2);
      expect(finals[0].phase).toBe('final_1_2');
      expect(finals[0].team1).toEqual([standings[1][0].pair![0].id, standings[1][0].pair![1].id]);
      expect(finals[0].team2).toEqual([standings[2][0].pair![0].id, standings[2][0].pair![1].id]);
      expect(finals[1].phase).toBe('final_3_4');
      expect(finals[1].team1).toEqual([standings[1][1].pair![0].id, standings[1][1].pair![1].id]);
      expect(finals[1].team2).toEqual([standings[2][1].pair![0].id, standings[2][1].pair![1].id]);
    });

    it('genera semifinali corrette per 3 box a coppie (3 prime + migliore seconda)', () => {
      const pairs = generatePairs(10);
      const boxes = distributePairsIntoBoxes(pairs, 3, '2026-10-13');
      boxes.forEach(b => b.matches.forEach(m => {
        m.sets = [{ team1: 6, team2: 3 }];
        m.winner = 'team1';
      }));

      const standings = calculateStandingsForBoxes(boxes, false);
      const sfMatches = generateSemifinalsMatches(standings, false, '2026-10-13');

      expect(sfMatches.length).toBe(2);
      expect(sfMatches[0].phase).toBe('semifinal');
      expect(sfMatches[1].phase).toBe('semifinal');
    });
  });

  describe('D. Calcolo Classifica Individuale per Stampa PDF', () => {
    it('calcola correttamente statistiche individuali per tutti i giocatori', () => {
      const players = generatePlayers(4);
      const boxes = distributeSinglesIntoBoxes(players, 1, '2026-10-13');
      boxes[0].matches[0].sets = [{ team1: 6, team2: 2 }];
      boxes[0].matches[0].winner = 'team1';

      const ind = computeIndividualStandings(boxes, boxes[0].matches);
      expect(ind.length).toBe(4);
      expect(ind.every(i => i.player && i.player.id)).toBe(true);
      expect(ind[0].gamesWon).toBeGreaterThanOrEqual(ind[1].gamesWon);
    });
  });

  describe('E. Americano Unico Continuo (No Box)', () => {
    it('genera un unico box aggregato con tutte le partite distribuite sui campi', () => {
      const players = generatePlayers(8);
      const americanoData = generateAmericanoMatchesForCustomFlow(players, 2, '2026-10-13');

      expect(americanoData.boxNumber).toBe(1);
      expect(americanoData.courtNumber).toBe(1);
      expect(americanoData.players.length).toBe(8);
      expect(americanoData.matches.length).toBeGreaterThan(0);

      // Ogni match ha roundNumber, courtNumber assegnato e phase corretta
      americanoData.matches.forEach(m => {
        expect(m.roundNumber).toBeDefined();
        expect(m.courtNumber).toBeDefined();
        expect(m.courtNumber).toBeGreaterThanOrEqual(1);
        expect(m.courtNumber).toBeLessThanOrEqual(2);
        expect(m.phase).toBe('group');
        expect(m.groupNumber).toBe(1);
      });
    });

    it('avanza correttamente da Americano a Semifinali e Finali', () => {
      const players = generatePlayers(8);
      const americanoData = generateAmericanoMatchesForCustomFlow(players, 2, '2026-10-13');

      // Assegna punteggi a tutte le partite dell'americano
      americanoData.matches.forEach((m, idx) => {
        m.sets = [{ team1: 6 + (idx % 2), team2: 2 }];
        m.winner = 'team1';
      });

      const standings = calculateStandingsForBoxes([americanoData], true);
      expect(standings[1]).toBeDefined();
      expect(standings[1].length).toBe(8);

      // Genera semifinali per i migliori 8
      const sfMatches = generateSemifinalsMatches(standings, true, '2026-10-13');
      expect(sfMatches.length).toBe(2);
      expect(sfMatches[0].phase).toBe('semifinal');
      expect(sfMatches[1].phase).toBe('semifinal');

      // Concludi semifinali e genera finali
      sfMatches[0].sets = [{ team1: 6, team2: 3 }];
      sfMatches[0].winner = 'team1';
      sfMatches[1].sets = [{ team1: 6, team2: 4 }];
      sfMatches[1].winner = 'team1';

      const finals = generateFinalsMatchesFromSemifinals(sfMatches, '2026-10-13');
      expect(finals.length).toBe(2);
      expect(finals.some(f => f.phase === 'final_1_2')).toBe(true);
      expect(finals.some(f => f.phase === 'final_3_4')).toBe(true);
    });

    it('supporta Americano con accesso diretto a Finali (senza semifinali) con 8 giocatori', () => {
      const players = generatePlayers(8);
      const americanoData = generateAmericanoMatchesForCustomFlow(players, 2, '2026-10-13');

      americanoData.matches.forEach((m, idx) => {
        m.sets = [{ team1: 6 + idx, team2: 1 }];
        m.winner = 'team1';
      });

      const standings = calculateStandingsForBoxes([americanoData], true);
      const finalsDirect = generateFinalsMatchesFromBoxes(standings, true, '2026-10-13');
      expect(finalsDirect.length).toBe(2);
      expect(finalsDirect.find(f => f.phase === 'final_1_2')).toBeDefined();
      expect(finalsDirect.find(f => f.phase === 'final_3_4')).toBeDefined();
    });
  });

  describe('8. Distribuzione Singoli a Teste di Serie & Assenza Duplicazioni', () => {
    it('distribuisce 8 giocatori singoli in 2 Box a teste di serie: Seed 1 e Seed 2 in box diversi', () => {
      const p1 = createMockPlayer('p1', 'Seed', 'One', 1800);
      const p2 = createMockPlayer('p2', 'Seed', 'Two', 1700);
      const p3 = createMockPlayer('p3', 'Seed', 'Three', 1600);
      const p4 = createMockPlayer('p4', 'Seed', 'Four', 1500);
      const p5 = createMockPlayer('p5', 'Player', 'Five', 1400);
      const p6 = createMockPlayer('p6', 'Player', 'Six', 1300);
      const p7 = createMockPlayer('p7', 'Player', 'Seven', 1200);
      const p8 = createMockPlayer('p8', 'Player', 'Eight', 1100);

      const players = [p4, p8, p1, p5, p2, p6, p3, p7]; // In ordine sparso

      const boxes = distributeSinglesIntoBoxes(players, 2, '2026-10-15');
      expect(boxes.length).toBe(2);

      const box1Players = boxes[0].players;
      const box2Players = boxes[1].players;

      expect(box1Players.length).toBe(4);
      expect(box2Players.length).toBe(4);

      // Seed 1 (1800) e Seed 2 (1700) devono essere in box DIVERSI!
      const box1HasP1 = box1Players.some(p => p.id === 'p1');
      const box2HasP2 = box2Players.some(p => p.id === 'p2');
      expect(box1HasP1).toBe(true);
      expect(box2HasP2).toBe(true);

      // Nessuna duplicazione di giocatori
      const allIds = [...box1Players.map(p => p.id), ...box2Players.map(p => p.id)];
      expect(new Set(allIds).size).toBe(8);

      // Tutte le partite hanno 4 giocatori distinti
      boxes.forEach(b => {
        b.matches.forEach(m => {
          const matchPlayerIds = [m.team1[0], m.team1[1], m.team2[0], m.team2[1]];
          expect(new Set(matchPlayerIds).size).toBe(4);
        });
      });
    });

    it('distribuisce 12 giocatori singoli in 3 Box con teste di serie 1, 2, 3 in box differenti', () => {
      const players = generatePlayers(12, 1400); // p1=1520, p2=1510, p3=1500...
      const boxes = distributeSinglesIntoBoxes(players, 3, '2026-10-15');
      expect(boxes.length).toBe(3);

      expect(boxes[0].players.some(p => p.id === 'p1')).toBe(true);
      expect(boxes[1].players.some(p => p.id === 'p2')).toBe(true);
      expect(boxes[2].players.some(p => p.id === 'p3')).toBe(true);

      const allIds = boxes.flatMap(b => b.players.map(p => p.id));
      expect(new Set(allIds).size).toBe(12);
    });

    it('deduplica correttamente coppie fittizie [p, p] senza generare nomi duplicati', () => {
      const players = generatePlayers(8);
      const fakePairs: [Player, Player][] = players.map(p => [p, p]);

      const uniqueMap = new Map<string, Player>();
      fakePairs.flatMap(p => [p[0], p[1]]).filter((p): p is Player => Boolean(p)).forEach(p => {
        if (!uniqueMap.has(p.id)) uniqueMap.set(p.id, p);
      });
      const rawPlayers = Array.from(uniqueMap.values());
      expect(rawPlayers.length).toBe(8);

      const boxes = distributeSinglesIntoBoxes(rawPlayers, 2, '2026-10-15');
      boxes.forEach(b => {
        expect(b.players.length).toBe(4);
        expect(new Set(b.players.map(p => p.id)).size).toBe(4);
      });
    });
  });
});
