import { describe, it, expect } from 'vitest';
import {
    getAssignedPlayerIdsInPhase,
    isPlayerDisabledForSlot,
    validatePlayoffPhaseTeams,
    updateMatchPlayer
} from './playoffBypass.ts';
import { calculateTournamentLocalElo } from './tournamentElo.ts';

describe('playoffBypass utilities', () => {
    it('extracts all assigned player IDs across matches', () => {
        const matches = [
            { team1: ['p1', 'p2'] as [string, string], team2: ['p3', 'p4'] as [string, string] },
            { team1: ['p5', 'p6'] as [string, string], team2: ['p7', 'p8'] as [string, string] }
        ];

        const assigned = getAssignedPlayerIdsInPhase(matches);
        expect(assigned).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
    });

    it('correctly disables players already selected elsewhere in phase, but keeps current slot player enabled', () => {
        const assigned = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

        // Candidate 'p3' is currently in this slot: must NOT be disabled
        expect(isPlayerDisabledForSlot('p3', 'p3', assigned)).toBe(false);

        // Candidate 'p1' is in another slot: MUST be disabled
        expect(isPlayerDisabledForSlot('p1', 'p3', assigned)).toBe(true);

        // Candidate 'p9' is not assigned anywhere: MUST be enabled
        expect(isPlayerDisabledForSlot('p9', 'p3', assigned)).toBe(false);

        // Empty candidate ID: not disabled
        expect(isPlayerDisabledForSlot('', 'p3', assigned)).toBe(false);
    });

    it('validates complete and non-duplicated teams', () => {
        const validMatches = [
            { team1: ['p1', 'p2'] as [string, string], team2: ['p3', 'p4'] as [string, string] },
            { team1: ['p5', 'p6'] as [string, string], team2: ['p7', 'p8'] as [string, string] }
        ];

        expect(validatePlayoffPhaseTeams(validMatches).isValid).toBe(true);

        // Duplicated player across matches
        const duplicatedMatches = [
            { team1: ['p1', 'p2'] as [string, string], team2: ['p3', 'p4'] as [string, string] },
            { team1: ['p2', 'p6'] as [string, string], team2: ['p7', 'p8'] as [string, string] }
        ];

        const resDup = validatePlayoffPhaseTeams(duplicatedMatches);
        expect(resDup.isValid).toBe(false);
        expect(resDup.error).toContain('assegnato più volte');

        // Incomplete team
        const incompleteMatches = [
            { team1: ['p1', ''] as [string, string], team2: ['p3', 'p4'] as [string, string] }
        ];

        const resInc = validatePlayoffPhaseTeams(incompleteMatches);
        expect(resInc.isValid).toBe(false);
        expect(resInc.error).toContain('Seleziona tutti i giocatori');
    });

    it('immutably updates match player in specified slot', () => {
        const match = {
            team1: ['p1', 'p2'] as [string, string],
            team2: ['p3', 'p4'] as [string, string],
            sets: [{ team1: 6, team2: 4 }],
            winner: 'team1' as const
        };

        const updated = updateMatchPlayer(match, 'team1', 1, 'p99');

        expect(updated.team1).toEqual(['p1', 'p99']);
        expect(updated.team2).toEqual(['p3', 'p4']);
        expect(updated.sets).toEqual([{ team1: 6, team2: 4 }]);
        expect(updated.winner).toBe('team1');
        // Original remains untouched
        expect(match.team1).toEqual(['p1', 'p2']);
    });

    it('correctly credits ELO changes to substituted player Y in place of D', () => {
        // Tournament match played by A ('p1') + Y ('p9') vs E ('p5') + F ('p6')
        // Team 1 wins
        const matches = [
            {
                id: 'final-1',
                tournamentId: 'tourn-1',
                team1: ['p1', 'p9'],
                team2: ['p5', 'p6'],
                winner: 'team1' as const,
                date: '2026-11-09T18:00:00Z',
            }
        ];

        const eloResult = calculateTournamentLocalElo(matches, 16);

        // p1 and p9 must both gain positive delta
        expect(eloResult.totalDeltas.get('p1')).toBeGreaterThan(0);
        expect(eloResult.totalDeltas.get('p9')).toBeGreaterThan(0);
        expect(eloResult.totalDeltas.get('p9')).toBe(eloResult.totalDeltas.get('p1'));

        // p5 and p6 must lose ELO
        expect(eloResult.totalDeltas.get('p5')).toBeLessThan(0);
        expect(eloResult.totalDeltas.get('p6')).toBeLessThan(0);

        // Old player D ('p4') who was NOT in the match has 0 delta
        expect(eloResult.totalDeltas.get('p4')).toBeUndefined();
    });
});

import { getPlayoffPhaseTeamsError } from './playoffBypass';
describe('getPlayoffPhaseTeamsError', () => {
    it('ritorna null per coppie valide e un messaggio per quelle non valide', () => {
        expect(getPlayoffPhaseTeamsError([{ team1: ['a', 'b'], team2: ['c', 'd'] }])).toBeNull();
        expect(getPlayoffPhaseTeamsError([{ team1: ['a', 'b'], team2: ['a', 'd'] }])).toContain('assegnato più volte');
        expect(typeof getPlayoffPhaseTeamsError([])).toBe('string');
    });
});
