import { describe, expect, it } from 'vitest';
import { FieldPosition, Player } from '../types.ts';
import {
    BoxStanding,
    createFinalsMatches,
    createSemifinalsAndFinalsFor2Boxes,
    playoffTypeAllowsFinalsOnly,
    resolveBeatBoxPlayoffType,
} from './beatTheBoxService.ts';

const player = (id: string): Player => ({
    id, name: id, surname: 'X', position: FieldPosition.Indifferente, currentElo: 1500, initialElo: 1500,
} as Player);

const makeBox = (boxNumber: number, prefix: string): BoxStanding => ({
    boxNumber,
    standings: [0, 1, 2, 3].map(i => ({
        player: player(`${prefix}${i + 1}`), points: 3 - i, gamesWon: 0, gamesLost: 0, gameDifference: 0, rank: i + 1,
    })),
});
const boxes = (n: number) => Array.from({ length: n }, (_, i) => makeBox(i + 1, String.fromCharCode(65 + i)));
const sorted = (t: [string, string]) => [...t].sort().join('+');

describe('Beat the Box 8 persone (2 box) con semifinali — tabellone 1 contro 4', () => {
    const { semifinals, finals } = createSemifinalsAndFinalsFor2Boxes(boxes(2), '2026-11-20');

    it('semifinale 1 = A1+B2 contro B3+A4, semifinale 2 = B1+A2 contro A3+B4', () => {
        expect(semifinals).toHaveLength(2);
        expect(semifinals.every(m => m.phase === 'semifinal')).toBe(true);
        expect([sorted(semifinals[0].team1), sorted(semifinals[0].team2)]).toEqual(['A1+B2', 'A4+B3']);
        expect([sorted(semifinals[1].team1), sorted(semifinals[1].team2)]).toEqual(['A2+B1', 'A3+B4']);
    });

    it('tutti gli 8 giocatori compaiono una sola volta e nessuna coppia ripete il compagno del box', () => {
        const ids = semifinals.flatMap(m => [...m.team1, ...m.team2]);
        expect(new Set(ids).size).toBe(8);
        semifinals.forEach(m => [m.team1, m.team2].forEach(t => expect(t[0][0]).not.toBe(t[1][0])));
    });

    it('senza risultati non genera le finali', () => {
        expect(finals).toEqual([]);
    });

    it.each([
        ['team1', 'team1', 'A1+B2', 'A2+B1', 'A4+B3', 'A3+B4'],
        ['team2', 'team2', 'A4+B3', 'A3+B4', 'A1+B2', 'A2+B1'],
        ['team1', 'team2', 'A1+B2', 'A3+B4', 'A4+B3', 'A2+B1'],
        ['team2', 'team1', 'A4+B3', 'A2+B1', 'A1+B2', 'A3+B4'],
    ] as const)('finali con vincitori %s/%s', (w1, w2, f1a, f1b, f2a, f2b) => {
        const r = createSemifinalsAndFinalsFor2Boxes(boxes(2), '2026-11-20', { sf1Winner: w1, sf2Winner: w2 });
        expect(r.finals.map(m => m.phase)).toEqual(['final_1_2', 'final_3_4']);
        expect([sorted(r.finals[0].team1), sorted(r.finals[0].team2)]).toEqual([f1a, f1b]);
        expect([sorted(r.finals[1].team1), sorted(r.finals[1].team2)]).toEqual([f2a, f2b]);
    });
});

describe('createFinalsMatches — instradamento', () => {
    it('2 box solo finali: invariato (nessuna semifinale, 2 finali)', () => {
        const r = createFinalsMatches(2, boxes(2), '2026-11-20', undefined, 'finals_only');
        expect(r.semifinals).toBeUndefined();
        expect(r.finals.map(m => m.phase)).toEqual(['final_1_2', 'final_3_4']);
        expect([sorted(r.finals[0].team1), sorted(r.finals[0].team2)]).toEqual(['A1+B2', 'A2+B1']);
        expect([sorted(r.finals[1].team1), sorted(r.finals[1].team2)]).toEqual(['A3+B4', 'A4+B3']);
    });

    it('2 box con semifinali: 2 semifinali', () => {
        const r = createFinalsMatches(2, boxes(2), '2026-11-20', undefined, 'semifinals');
        expect(r.semifinals).toHaveLength(2);
    });

    it.each([5, 6])('%i box con "solo finali" non produce mai una fase finale vuota', (n) => {
        const r = createFinalsMatches(n, boxes(n), '2026-11-20', undefined, 'finals_only');
        expect((r.semifinals ?? []).length).toBeGreaterThan(0);
    });

    it('la scelta "solo finali" è prevista solo da 2 a 4 box', () => {
        expect([1, 2, 3, 4, 5, 6].map(playoffTypeAllowsFinalsOnly)).toEqual([false, true, true, true, false, false]);
    });
});

describe('resolveBeatBoxPlayoffType', () => {
    it('valore salvato rispettato', () => {
        expect(resolveBeatBoxPlayoffType('semifinals', 2)).toBe('semifinals');
        expect(resolveBeatBoxPlayoffType('finals_only', 4)).toBe('finals_only');
    });
    it('assente: 2 box = solo finali (flusso storico), 3+ box = semifinali', () => {
        expect(resolveBeatBoxPlayoffType(undefined, 2)).toBe('finals_only');
        expect(resolveBeatBoxPlayoffType(null, 3)).toBe('semifinals');
        expect(resolveBeatBoxPlayoffType('', 4)).toBe('semifinals');
    });
});
