import { describe, expect, it } from 'vitest';
import { buildQuarterfinalPairings, buildSemifinalPairings, selectGironiQualifiers } from './gironiPlayoffs.ts';

interface TestPlayer {
    id: string;
    name: string;
    surname: string;
}

const createEntry = (name: string, points: number, gamesWon: number, gamesLost: number, played: number = 2) => ({
    pair: [{ id: `${name}_p1`, name, surname: '1' }, { id: `${name}_p2`, name, surname: '2' }] as [TestPlayer, TestPlayer],
    punti: points,
    gamesWon,
    gamesLost,
    matchesPlayed: played,
});

describe('gironi playoffs - Semifinali', () => {
    it('caso utente: 2 gironi da 3 coppie - qualifica ESATTAMENTE 1°A, 2°A, 1°B, 2°B (mai il 3° di B)', () => {
        const gironeA = [
            createEntry('Criachi-DeLuca', 6, 14, 4, 2),
            createEntry('Ianniello-Tarchiani', 3, 6, 8, 2),
            createEntry('Rosa-Berni', 0, 5, 13, 2),
        ];
        const gironeB = [
            createEntry('Roscini-Silenzi', 3, 12, 10, 2),
            createEntry('Pucci-Niccolini', 3, 10, 11, 2),
            createEntry('Francalanci-Caparrini', 3, 10, 11, 2),
        ];

        const qualifiers = selectGironiQualifiers<ReturnType<typeof createEntry>>([gironeA, gironeB], 'semifinals');

        expect(qualifiers).toHaveLength(4);

        const names = qualifiers.map(q => q.entry.pair[0].name);
        expect(names).toContain('Criachi-DeLuca');
        expect(names).toContain('Ianniello-Tarchiani');
        expect(names).toContain('Roscini-Silenzi');
        expect(names).toContain('Pucci-Niccolini');
        expect(names).not.toContain('Francalanci-Caparrini');

        const pairings = buildSemifinalPairings(qualifiers);
        expect(pairings).toHaveLength(2);

        expect(pairings[0][0].entry.pair[0].name).toBe('Criachi-DeLuca');
        expect(pairings[0][1].entry.pair[0].name).toBe('Pucci-Niccolini');

        expect(pairings[1][0].entry.pair[0].name).toBe('Roscini-Silenzi');
        expect(pairings[1][1].entry.pair[0].name).toBe('Ianniello-Tarchiani');
    });

    it('con 3 gironi qualifica le 3 prime e la migliore seconda', () => {
        const standings = [
            [createEntry('A1', 6, 12, 4), createEntry('A2', 3, 8, 8), createEntry('A3', 0, 4, 12)],
            [createEntry('B1', 6, 12, 6), createEntry('B2', 3, 10, 6), createEntry('B3', 0, 6, 16)],
            [createEntry('C1', 6, 12, 5), createEntry('C2', 3, 7, 9), createEntry('C3', 0, 5, 14)],
        ];

        const qualifiers = selectGironiQualifiers<ReturnType<typeof createEntry>>(standings, 'semifinals');
        expect(qualifiers).toHaveLength(4);

        const names = qualifiers.map(q => q.entry.pair[0].name);
        expect(names).toContain('A1');
        expect(names).toContain('B1');
        expect(names).toContain('C1');
        expect(names).toContain('B2');

        const pairings = buildSemifinalPairings(qualifiers);
        expect(pairings).toHaveLength(2);
    });
});

describe('gironi playoffs - Quarti di finale', () => {
    it('qualifica le prime quattro di due gironi con incrocio tennistico', () => {
        const standings = [
            ['A1', 'A2', 'A3', 'A4', 'A5'].map((name, index) => createEntry(name, 12 - index * 2, 20 - index, 5 + index, 4)),
            ['B1', 'B2', 'B3', 'B4', 'B5'].map((name, index) => createEntry(name, 12 - index * 2, 20 - index, 5 + index, 4)),
        ];
        const qualifiers = selectGironiQualifiers<ReturnType<typeof createEntry>>(standings, 'quarterfinals');
        expect(qualifiers).toHaveLength(8);

        const pairings = buildQuarterfinalPairings(qualifiers);
        expect(pairings).toHaveLength(4);
        expect(pairings[0][0].entry.pair[0].name).toBe('A1');
        expect(pairings[0][1].entry.pair[0].name).toBe('B4');
        expect(pairings[1][0].entry.pair[0].name).toBe('A2');
        expect(pairings[1][1].entry.pair[0].name).toBe('B3');
    });

    it('con 4 gironi qualifica le prime due di ciascun girone', () => {
        const standings = ['A', 'B', 'C', 'D'].map(prefix => [
            createEntry(`${prefix}1`, 6, 12, 4),
            createEntry(`${prefix}2`, 3, 8, 8),
            createEntry(`${prefix}3`, 0, 4, 12),
        ]);
        const qualifiers = selectGironiQualifiers<ReturnType<typeof createEntry>>(standings, 'quarterfinals');
        expect(qualifiers).toHaveLength(8);
        expect(buildQuarterfinalPairings(qualifiers)).toHaveLength(4);
    });
});
