import { describe, expect, it } from 'vitest';
import { findMatchBetweenTeams, orientResultForStoredMatch, getCanonicalTeamKey } from './matchIdentity.ts';

const stored = { team1: ['a', 'b'] as [string, string], team2: ['c', 'd'] as [string, string] };

describe('match identity', () => {
    it('normalizza la chiave della coppia indipendentemente dall’ordine dei giocatori', () => {
        expect(getCanonicalTeamKey(['player-B', 'player-A'])).toBe('player-A,player-B');
        expect(getCanonicalTeamKey(['player-A', 'player-B'])).toBe('player-A,player-B');
        expect(getCanonicalTeamKey([])).toBe('');
        expect(getCanonicalTeamKey(null)).toBe('');
    });

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
