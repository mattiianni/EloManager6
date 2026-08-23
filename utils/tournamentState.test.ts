import { describe, expect, it } from 'vitest';
import { deriveTournamentState } from './tournamentState.ts';
import { Match, Tournament } from '../types.ts';

const createMockMatch = (winner: Match['winner'] = null, score: number = 0): Match => ({
    id: 'm1',
    team1: ['p1', 'p2'],
    team2: ['p3', 'p4'],
    sets: score > 0 ? [{ team1: score, team2: 0 }] : [],
    winner,
    date: '2026-08-23'
});

describe('deriveTournamentState', () => {
    it('restituisce scheduled se non ci sono partite o nessuna partita è iniziata', () => {
        expect(deriveTournamentState([])).toBe('scheduled');
        expect(deriveTournamentState([createMockMatch(null, 0), createMockMatch(null, 0)])).toBe('scheduled');
    });

    it('restituisce in_progress se almeno una partita ha un punteggio o vincitore', () => {
        const matches = [createMockMatch('team1', 6), createMockMatch(null, 0)];
        expect(deriveTournamentState(matches)).toBe('in_progress');
    });

    it('restituisce completed se tutte le partite hanno un vincitore', () => {
        const matches = [createMockMatch('team1', 6), createMockMatch('team2', 6)];
        expect(deriveTournamentState(matches)).toBe('completed');
    });

    it('rispetta status completed se già impostato nel torneo', () => {
        expect(deriveTournamentState([], { status: 'completed' })).toBe('completed');
    });
});
