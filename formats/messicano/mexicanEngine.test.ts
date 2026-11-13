import { describe, it, expect } from 'vitest';
import { Player, Tournament, TournamentType, Match, FieldPosition } from '../../types';
import {
    calculateMexicanStandings,
    segmentCourts,
    optimizeCourtPairings,
    generateFirstRoundMexicanMatches,
    generateNextMexicanRoundMatches,
    pairKey,
    buildPartnerHistory
} from './jitEngine';
import { MexicanEngine } from './engine';
import { generateMexicanPdfHtml } from './printer';

const createMockPlayer = (id: string, name: string, surname: string, currentElo: number): Player => ({
    id,
    name,
    surname,
    position: FieldPosition.Indifferente,
    initialElo: 1500,
    currentElo
});

function createPlayers(count: number): Player[] {
    const players: Player[] = [];
    for (let i = 1; i <= count; i++) {
        players.push(createMockPlayer(`p${i}`, `Nome${i}`, `Cognome${i}`, 2400 - i * 30));
    }
    return players;
}

describe('Torneo Messicano - Validazioni e Core Logico JIT', () => {
    const players8: Player[] = [
        createMockPlayer('p1', 'Player', 'One', 2100),
        createMockPlayer('p2', 'Player', 'Two', 2000),
        createMockPlayer('p3', 'Player', 'Three', 1900),
        createMockPlayer('p4', 'Player', 'Four', 1800),
        createMockPlayer('p5', 'Player', 'Five', 1700),
        createMockPlayer('p6', 'Player', 'Six', 1600),
        createMockPlayer('p7', 'Player', 'Seven', 1500),
        createMockPlayer('p8', 'Player', 'Eight', 1400),
    ];

    it('1. Rifiuta partecipanti non multipli di 4 o inferiori a 8', () => {
        const invalidCounts = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19];
        invalidCounts.forEach(count => {
            const list = createPlayers(count);
            expect(() => generateFirstRoundMexicanMatches(list, 'Normal', '2026-11-09')).toThrow();
        });

        // Multipli di 4 validi non devono lanciare eccezioni
        const validCounts = [8, 12, 16, 20, 24];
        validCounts.forEach(count => {
            const list = createPlayers(count);
            const matches = generateFirstRoundMexicanMatches(list, 'Seeded', '2026-11-09');
            expect(matches.length).toBe(count / 4);
        });
    });

    it('2. Round 1 in modalità Seeded assegna i primi 4 al Campo 1 con incrocio (1+4) vs (2+3)', () => {
        const matches = generateFirstRoundMexicanMatches(players8, 'Seeded', '2026-11-09');
        expect(matches.length).toBe(2);

        // Campo 1: p1 (2100), p2 (2000), p3 (1900), p4 (1800)
        const m1 = matches.find(m => m.courtNumber === 1);
        expect(m1).toBeDefined();
        expect(m1?.team1).toEqual(['p1', 'p4']);
        expect(m1?.team2).toEqual(['p2', 'p3']);

        // Campo 2: p5 (1700), p6 (1600), p7 (1500), p8 (1400)
        const m2 = matches.find(m => m.courtNumber === 2);
        expect(m2).toBeDefined();
        expect(m2?.team1).toEqual(['p5', 'p8']);
        expect(m2?.team2).toEqual(['p6', 'p7']);
    });

    it('3. Round 1 in modalità Balanced (Snake Draft) bilancia la forza media dei campi', () => {
        const matches = generateFirstRoundMexicanMatches(players8, 'Balanced', '2026-11-09');
        expect(matches.length).toBe(2);

        const c1EloSum = matches[0].team1.concat(matches[0].team2)
            .map(id => players8.find(p => p.id === id)!.currentElo).reduce((a, b) => a + b, 0);
        const c2EloSum = matches[1].team1.concat(matches[1].team2)
            .map(id => players8.find(p => p.id === id)!.currentElo).reduce((a, b) => a + b, 0);

        // Per una progressione aritmetica di ELO, la serpentina produce esattamente somme identiche
        expect(c1EloSum).toBe(c2EloSum);
    });

    it('4. Round 1 in modalità Manual rispetta le assegnazioni specificate', () => {
        const manualMatches = generateFirstRoundMexicanMatches(players8, 'Manual', '2026-11-09', [
            { courtNumber: 1, players: ['p8', 'p7', 'p6', 'p5'] },
            { courtNumber: 2, players: ['p4', 'p3', 'p2', 'p1'] }
        ]);
        expect(manualMatches.length).toBe(2);
        expect(manualMatches[0].team1).toEqual(['p8', 'p5']);
        expect(manualMatches[0].team2).toEqual(['p7', 'p6']);
        expect(manualMatches[1].team1).toEqual(['p4', 'p1']);
        expect(manualMatches[1].team2).toEqual(['p3', 'p2']);
    });

    it('5. Gerarchia Tie-Breakers Completa (Punti > ELO attuale DB > Diff Game > Game Vinti > ID)', () => {
        // 5.1 Punti diversi
        const testP = [
            createMockPlayer('pA', 'A', 'A', 1800),
            createMockPlayer('pB', 'B', 'B', 1700),
            createMockPlayer('pC', 'C', 'C', 1700),
            createMockPlayer('pD', 'D', 'D', 1700),
        ];
        const mPunti: Match[] = [{
            id: 'm1', date: '2026-11-09',
            team1: ['pA', 'pB'], team2: ['pC', 'pD'],
            sets: [{ team1: 6, team2: 4 }], winner: 'team1',
            courtNumber: 1, roundNumber: 1
        }];
        const st1 = calculateMexicanStandings(mPunti, testP, 'games-diff');
        expect(st1[0].player.id).toBe('pA');
        expect(st1[1].player.id).toBe('pB');

        // 5.2 Pari Punti -> ELO attuale DB
        const mElo: Match[] = [{
            id: 'm1', date: '2026-11-09',
            team1: ['pA', 'pC'], team2: ['pB', 'pD'],
            sets: [{ team1: 6, team2: 4 }], winner: 'team1',
            courtNumber: 1, roundNumber: 1
        }];
        const st2 = calculateMexicanStandings(mElo, [testP[0], testP[2]], 'games-diff');
        expect(st2[0].player.id).toBe('pA'); // pA ha 1800 ELO vs 1700 di pC

        // 5.3 Pari Punti ed ELO -> Diff Game
        const pDiff1 = createMockPlayer('pDiff1', 'X', '1', 1600);
        const pDiff2 = createMockPlayer('pDiff2', 'X', '2', 1600);
        const mDiff: Match[] = [
            {
                id: 'm1', date: '2026-11-09',
                team1: ['pDiff1', 'd1'], team2: ['d2', 'd3'],
                sets: [{ team1: 6, team2: 1 }], winner: 'team1', // 3 pt, diff +5
                courtNumber: 1, roundNumber: 1
            },
            {
                id: 'm2', date: '2026-11-09',
                team1: ['pDiff2', 'd4'], team2: ['d5', 'd6'],
                sets: [{ team1: 6, team2: 4 }], winner: 'team1', // 3 pt, diff +2
                courtNumber: 2, roundNumber: 1
            }
        ];
        const st3 = calculateMexicanStandings(mDiff, [pDiff1, pDiff2], 'games-diff');
        expect(st3[0].player.id).toBe('pDiff1');

        // 5.4 Pari Punti, ELO e Diff -> Game Vinti totali
        const pGv1 = createMockPlayer('pGV1', 'Y', '1', 1600);
        const pGv2 = createMockPlayer('pGV2', 'Y', '2', 1600);
        const mGv: Match[] = [
            {
                id: 'm1', date: '2026-11-09',
                team1: ['pGV1', 'd1'], team2: ['d2', 'd3'],
                sets: [{ team1: 7, team2: 5 }], winner: 'team1', // 3 pt, diff +2, GV 7
                courtNumber: 1, roundNumber: 1
            },
            {
                id: 'm2', date: '2026-11-09',
                team1: ['pGV2', 'd4'], team2: ['d5', 'd6'],
                sets: [{ team1: 6, team2: 4 }], winner: 'team1', // 3 pt, diff +2, GV 6
                courtNumber: 2, roundNumber: 1
            }
        ];
        const st4 = calculateMexicanStandings(mGv, [pGv1, pGv2], 'games-diff');
        expect(st4[0].player.id).toBe('pGV1');

        // 5.5 Tutto identico -> determinismo alfabetico su ID
        const pId1 = createMockPlayer('player_alpha', 'Z', '1', 1600);
        const pId2 = createMockPlayer('player_beta', 'Z', '2', 1600);
        const st5 = calculateMexicanStandings([], [pId2, pId1], 'games-diff');
        expect(st5[0].player.id).toBe('player_alpha');
        expect(st5[1].player.id).toBe('player_beta');
    });

    it('6. Segmentazione Campi: suddivide la classifica in blocchi ordinati da 4', () => {
        const courts = segmentCourts(players8);
        expect(courts.length).toBe(2);
        expect(courts[0].map(p => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
        expect(courts[1].map(p => p.id)).toEqual(['p5', 'p6', 'p7', 'p8']);
    });

    it('7. Ottimizzazione Coppie Anti-Ripetizione e Fallback a Incrocio di Merito', () => {
        const [A, B, C, D] = [
            createMockPlayer('A', 'A', '1', 2000),
            createMockPlayer('B', 'B', '2', 1900),
            createMockPlayer('C', 'C', '3', 1800),
            createMockPlayer('D', 'D', '4', 1700),
        ];

        // 7.1 Storico vuoto: sceglie fallback (1+4 vs 2+3)
        const emptyHist = new Map<string, number>();
        const opt0 = optimizeCourtPairings([A, B, C, D], emptyHist);
        expect(opt0.combinationType).toBe('1-4_vs_2-3');
        expect(opt0.team1).toEqual(['A', 'D']);
        expect(opt0.team2).toEqual(['B', 'C']);

        // 7.2 Storico con A+D già giocato -> sceglie una combinazione a costo 0
        const hist1 = new Map<string, number>();
        hist1.set(pairKey('A', 'D'), 1);
        hist1.set(pairKey('B', 'C'), 1);
        const opt1 = optimizeCourtPairings([A, B, C, D], hist1);
        expect(opt1.repetitionCost).toBe(0);
        expect(opt1.combinationType).not.toBe('1-4_vs_2-3');

        // 7.3 Storico dove tutte le 3 combinazioni hanno costo 1 -> sceglie fallback 1-4 vs 2-3
        const histAll = new Map<string, number>();
        histAll.set(pairKey('A', 'D'), 1);
        histAll.set(pairKey('A', 'B'), 1);
        histAll.set(pairKey('A', 'C'), 1);
        const optAll = optimizeCourtPairings([A, B, C, D], histAll);
        expect(optAll.combinationType).toBe('1-4_vs_2-3');
    });

    it('8. Simulazione Torneo a 8 Giocatori su 4 Turni Consecutivi JIT', () => {
        const players = createPlayers(8);
        const r1Matches = generateFirstRoundMexicanMatches(players, 'Seeded', '2026-11-09');
        expect(r1Matches.length).toBe(2);

        // Turno 1
        r1Matches[0].sets = [{ team1: 6, team2: 2 }];
        r1Matches[0].winner = 'team1';
        r1Matches[1].sets = [{ team1: 6, team2: 3 }];
        r1Matches[1].winner = 'team1';

        // Turno 2 JIT
        const r2Matches = generateNextMexicanRoundMatches(r1Matches, players, 2, '2026-11-09', 'games-diff');
        expect(r2Matches.length).toBe(2);
        // I 4 vincitori salgono al Campo 1 (Top Court)
        const court1Round2 = new Set([...r2Matches[0].team1, ...r2Matches[0].team2]);
        expect(court1Round2.has('p1')).toBe(true);
        expect(court1Round2.has('p4')).toBe(true);
        expect(court1Round2.has('p5')).toBe(true);
        expect(court1Round2.has('p8')).toBe(true);

        r2Matches[0].sets = [{ team1: 6, team2: 4 }];
        r2Matches[0].winner = 'team1';
        r2Matches[1].sets = [{ team1: 6, team2: 1 }];
        r2Matches[1].winner = 'team1';

        // Turno 3 JIT
        const completedT2 = [...r1Matches, ...r2Matches];
        const r3Matches = generateNextMexicanRoundMatches(completedT2, players, 3, '2026-11-09', 'games-diff');
        expect(r3Matches.length).toBe(2);
        r3Matches[0].sets = [{ team1: 6, team2: 5 }];
        r3Matches[0].winner = 'team1';
        r3Matches[1].sets = [{ team1: 6, team2: 3 }];
        r3Matches[1].winner = 'team1';

        // Turno 4 JIT
        const completedT3 = [...completedT2, ...r3Matches];
        const r4Matches = generateNextMexicanRoundMatches(completedT3, players, 4, '2026-11-09', 'games-diff');
        expect(r4Matches.length).toBe(2);
        expect(r4Matches.every(m => m.roundNumber === 4)).toBe(true);

        // Verifica che nessun giocatore sia duplicato nel turno 4
        const t4Players = new Set<string>();
        r4Matches.forEach(m => {
            [...m.team1, ...m.team2].forEach(pId => t4Players.add(pId));
        });
        expect(t4Players.size).toBe(8);
    });

    it('9. Simulazione Torneo a 12 Giocatori (3 Campi: Top, Mid, Flop) su 4 Turni JIT', () => {
        const players12 = createPlayers(12);
        let allMatches = generateFirstRoundMexicanMatches(players12, 'Seeded', '2026-11-09');
        expect(allMatches.length).toBe(3);

        for (let r = 1; r <= 4; r++) {
            const currentRMatches = allMatches.filter(m => m.roundNumber === r);
            currentRMatches.forEach((m, idx) => {
                const t1 = 6;
                const t2 = (idx === 0) ? 4 : (idx === 1) ? 2 : 5;
                m.sets = [{ team1: t1, team2: t2 }];
                m.winner = 'team1';
            });

            if (r < 4) {
                const nextR = r + 1;
                const nextMatches = generateNextMexicanRoundMatches(allMatches, players12, nextR, '2026-11-09', 'games-diff');
                expect(nextMatches.length).toBe(3);

                // Verifica che copra tutti i 12 partecipanti senza duplicati
                const rPlayers = new Set<string>();
                nextMatches.forEach(m => {
                    [...m.team1, ...m.team2].forEach(id => rPlayers.add(id));
                });
                expect(rPlayers.size).toBe(12);

                // Verifica segmentazione Top, Mid, Flop
                const standings = calculateMexicanStandings(allMatches, players12, 'games-diff');
                const top4Standings = standings.slice(0, 4).map(s => s.player.id).sort();
                const mid4Standings = standings.slice(4, 8).map(s => s.player.id).sort();
                const flop4Standings = standings.slice(8, 12).map(s => s.player.id).sort();

                const c1 = [...nextMatches[0].team1, ...nextMatches[0].team2].sort();
                const c2 = [...nextMatches[1].team1, ...nextMatches[1].team2].sort();
                const c3 = [...nextMatches[2].team1, ...nextMatches[2].team2].sort();

                expect(c1).toEqual(top4Standings);
                expect(c2).toEqual(mid4Standings);
                expect(c3).toEqual(flop4Standings);

                allMatches.push(...nextMatches);
            }
        }

        // Calcolo finale classifica
        const tourn: Tournament = {
            id: 'sim-12',
            name: 'Messicano 12 Giocatori',
            type: TournamentType.Mexican,
            date: '2026-11-09',
            club: 'Club Test',
            matchIds: [],
            status: 'completed',
            mexicanFields: 3,
            mexicanRounds: 4,
            mexicanScoringType: 'games-diff'
        };
        const standings = MexicanEngine.calculateStandings(allMatches, tourn, id => players12.find(p => p.id === id));
        expect(standings.length).toBe(12);
        expect(standings[0].rank).toBe(1);
        expect(standings[0].points).toBe(12); // Ha vinto tutte e 4 le partite
    });

    it('10. Simulazione Torneo a 16 Giocatori (4 Campi: Top, Mid1, Mid2, Flop) su 5 Turni JIT', () => {
        const players16 = createPlayers(16);
        let allMatches = generateFirstRoundMexicanMatches(players16, 'Balanced', '2026-11-09');
        expect(allMatches.length).toBe(4);

        for (let r = 1; r <= 5; r++) {
            const currentRMatches = allMatches.filter(m => m.roundNumber === r);
            currentRMatches.forEach((m, idx) => {
                const t1 = 6;
                const t2 = (idx % 2 === 0) ? 3 : 4;
                m.sets = [{ team1: t1, team2: t2 }];
                m.winner = 'team1';
            });

            if (r < 5) {
                const nextR = r + 1;
                const nextMatches = generateNextMexicanRoundMatches(allMatches, players16, nextR, '2026-11-09', 'games-diff');
                expect(nextMatches.length).toBe(4);

                // Verifica che copra tutti i 16 partecipanti
                const rPlayers = new Set<string>();
                nextMatches.forEach(m => {
                    [...m.team1, ...m.team2].forEach(id => rPlayers.add(id));
                });
                expect(rPlayers.size).toBe(16);

                // Verifica che Campo 1 contenga esattamente i primi 4 della graduatoria
                const standings = calculateMexicanStandings(allMatches, players16, 'games-diff');
                const top4Standings = standings.slice(0, 4).map(s => s.player.id).sort();
                const c1Players = [...nextMatches[0].team1, ...nextMatches[0].team2].sort();
                expect(c1Players).toEqual(top4Standings);

                allMatches.push(...nextMatches);
            }
        }

        const tourn: Tournament = {
            id: 'sim-16',
            name: 'Messicano 16 Giocatori',
            type: TournamentType.Mexican,
            date: '2026-11-09',
            club: 'Club Test',
            matchIds: [],
            status: 'completed',
            mexicanFields: 4,
            mexicanRounds: 5,
            mexicanScoringType: 'games-diff'
        };
        const standings = MexicanEngine.calculateStandings(allMatches, tourn, id => players16.find(p => p.id === id));
        expect(standings.length).toBe(16);
        expect(standings.every(s => s.matchesPlayed === 5)).toBe(true);
    });

    it('11. Modalità Scoring a Punti/Game (scoringType === points)', () => {
        const matches: Match[] = [
            {
                id: 'm1', date: '2026-11-09',
                team1: ['p1', 'p4'], team2: ['p2', 'p3'],
                sets: [{ team1: 15, team2: 9 }], winner: 'team1',
                courtNumber: 1, roundNumber: 1
            }
        ];
        const standings = calculateMexicanStandings(matches, players8.slice(0, 4), 'points');
        expect(standings[0].player.id).toBe('p1');
        expect(standings[0].points).toBe(15);
        expect(standings[1].player.id).toBe('p4');
        expect(standings[1].points).toBe(15);
        expect(standings[2].points).toBe(9);
        expect(standings[3].points).toBe(9);
    });

    it('12. Generazione HTML Stampa PDF: include icone SVG moderne, data e footer standard HIG', () => {
        const tourn: Tournament = {
            id: 'pdf-test',
            name: 'Sociale Messicano 2026',
            type: TournamentType.Mexican,
            date: '2026-11-09',
            club: 'Circolo Padel Milano',
            matchIds: [],
            status: 'completed',
            mexicanFields: 2,
            mexicanRounds: 3,
            mexicanScoringType: 'games-diff'
        };

        const matches = generateFirstRoundMexicanMatches(players8, 'Seeded', '2026-11-09');
        matches[0].sets = [{ team1: 6, team2: 4 }];
        matches[0].winner = 'team1';
        matches[1].sets = [{ team1: 6, team2: 2 }];
        matches[1].winner = 'team1';

        const getPlayerById = (id: string) => players8.find(p => p.id === id);
        const html = generateMexicanPdfHtml(tourn, matches, getPlayerById, undefined, false);

        expect(html).toContain('Sociale Messicano 2026');
        expect(html).toContain('Torneo Messicano (JIT Coppie Mobili)');
        expect(html).toContain('Padel ELO Manager • Torneo Messicano • Versione');
        expect(html).toContain('CLASSIFICA INDIVIDUALE');
        expect(html).not.toContain('emoji');
    });

    it('generateMexicanPdfHtml: restituisce frammento pulito per openPrintWindow senza doppi tag html/head/body', () => {
        const tourn: Tournament = {
            id: 't-clean',
            name: 'Messicano Pulito',
            type: TournamentType.Mexican,
            date: '2026-11-09',
            club: 'Circolo Padel',
            matchIds: [],
            status: 'scheduled',
            mexicanFields: 2,
            mexicanRounds: 3,
            mexicanScoringType: 'games-diff'
        };
        const matches = generateFirstRoundMexicanMatches(players8, 'Normal', '2026-11-09');
        const html = generateMexicanPdfHtml(tourn, matches, id => players8.find(p => p.id === id), undefined, true);
        expect(html).not.toContain('<!DOCTYPE');
        expect(html).not.toContain('<html');
        expect(html).not.toContain('<body');
        expect(html).toContain('class="print-page"');
        expect(html).toContain('TURNI E PARTITE SUI CAMPI');
    });
});
