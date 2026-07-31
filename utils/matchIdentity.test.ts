import { describe, expect, it } from 'vitest';
import { findMatchBetweenTeams, orientResultForStoredMatch } from './matchIdentity.ts';

const stored = { team1: ['a', 'b'] as [string, string], team2: ['c', 'd'] as [string, string] };

describe('match identity', () => {
    it('trova la stessa partita anche con squadre e giocatori invertiti', () => {
        expect(findMatchBetweenTeams([stored], ['d', 'c'], ['b', 'a'])).toBe(stored);
    });

    it('inverte punteggio e vincitore secondo l’ordine salvato', () => {
        expect(orientResultForStoredMatch(stored, ['c', 'd'], [{ team1: 6, team2: 2 }], 'team1')).toEqual({
            sets: [{ team1: 2, team2: 6 }],
            winner: 'team2',
        });
    });
});
