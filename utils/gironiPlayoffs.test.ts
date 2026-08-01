import { describe, expect, it } from 'vitest';
import { buildQuarterfinalPairings, selectGironiQualifiers } from './gironiPlayoffs.ts';

const entry = (name: string, points: number, played: number) => ({
    pair: [name, `${name}2`] as [string, string],
    punti: points,
    gamesWon: points * 2,
    gamesLost: played,
    matchesPlayed: played,
});

describe('gironi playoffs', () => {
    it('qualifica le prime quattro di due gironi', () => {
        const standings = [
            ['A1','A2','A3','A4'].map((name, index) => entry(name, 12 - index, 3)),
            ['B1','B2','B3','B4'].map((name, index) => entry(name, 12 - index, 3)),
        ];
        const qualifiers = selectGironiQualifiers(standings, 'quarterfinals');
        expect(qualifiers).toHaveLength(8);
        expect(buildQuarterfinalPairings(qualifiers).every(([a, b]) => a.groupIndex !== b.groupIndex)).toBe(true);
    });

    it('con tre gironi aggiunge le due migliori terze normalizzando le partite giocate', () => {
        const standings = [
            [entry('A1', 9, 3), entry('A2', 6, 3), entry('A3', 6, 3), entry('A4', 3, 3)],
            [entry('B1', 12, 4), entry('B2', 8, 4), entry('B3', 7, 4), entry('B4', 4, 4)],
            [entry('C1', 9, 3), entry('C2', 6, 3), entry('C3', 3, 3)],
        ];
        const qualifiers = selectGironiQualifiers(standings, 'quarterfinals');
        expect(qualifiers).toHaveLength(8);
        expect(qualifiers.filter(q => q.groupRank === 3).map(q => q.entry.pair[0])).toEqual(['A3', 'B3']);
    });

    it('con quattro gironi qualifica le prime due', () => {
        const standings = ['A','B','C','D'].map(prefix => [entry(`${prefix}1`, 6, 2), entry(`${prefix}2`, 3, 2), entry(`${prefix}3`, 0, 2)]);
        expect(selectGironiQualifiers(standings, 'quarterfinals')).toHaveLength(8);
    });

    it('gestisce 11 coppie distribuite 4+4+3', () => {
        const standings = [
            ['A1','A2','A3','A4'].map((name, index) => entry(name, 9 - index * 2, 3)),
            ['B1','B2','B3','B4'].map((name, index) => entry(name, 9 - index * 2, 3)),
            ['C1','C2','C3'].map((name, index) => entry(name, 6 - index * 2, 2)),
        ];
        const qualifiers = selectGironiQualifiers(standings, 'quarterfinals');
        expect(qualifiers).toHaveLength(8);
        expect(qualifiers.filter(item => item.groupRank === 3)).toHaveLength(2);
        expect(buildQuarterfinalPairings(qualifiers)).toHaveLength(4);
    });
});
