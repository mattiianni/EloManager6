import { describe, expect, it } from 'vitest';
import { calculateTournamentLocalElo, TournamentEloMatchInput } from './tournamentElo.ts';

const match = (overrides: Partial<TournamentEloMatchInput> = {}): TournamentEloMatchInput => ({
    id: 'm1',
    tournamentId: 't1',
    team1: ['a', 'b'],
    team2: ['c', 'd'],
    winner: 'team1',
    ...overrides,
});

describe('tournament-local ELO', () => {
    it('starts every player at 1500', () => {
        const result = calculateTournamentLocalElo([match()]);
        expect(result.totalDeltas.get('a')).toBeCloseTo(8);
        expect(result.totalDeltas.get('c')).toBeCloseTo(-8);
        expect(result.matchSnapshots.get('m1')?.team1Average).toBe(1500);
    });

    it('evolves ratings sequentially inside the same tournament', () => {
        const result = calculateTournamentLocalElo([
            match({ id: 'm1', roundNumber: 1 }),
            match({ id: 'm2', roundNumber: 2, team2: ['e', 'f'] }),
        ]);
        expect(result.matchSnapshots.get('m2')!.team1Average).toBeGreaterThan(1500);
        expect(result.totalDeltas.get('a')).toBeGreaterThan(8);
        expect(result.totalDeltas.get('a')).toBeLessThan(16);
    });

    it('resets the same athlete to 1500 in a new tournament', () => {
        const result = calculateTournamentLocalElo([
            match({ id: 'm1', tournamentId: 't1' }),
            match({ id: 'm2', tournamentId: 't2', team2: ['e', 'f'] }),
        ]);
        expect(result.matchSnapshots.get('m2')?.team1Average).toBe(1500);
        expect(result.totalDeltas.get('a')).toBeCloseTo(16);
    });

    it('continues the same tournament across giornate in date order', () => {
        const result = calculateTournamentLocalElo([
            match({ id: 'later', date: '2026-07-02', roundNumber: 1, team2: ['e', 'f'] }),
            match({ id: 'earlier', date: '2026-07-01', roundNumber: 9 }),
        ]);
        expect(result.matchSnapshots.get('earlier')?.team1Average).toBe(1500);
        expect(result.matchSnapshots.get('later')!.team1Average).toBeGreaterThan(1500);
    });
});
