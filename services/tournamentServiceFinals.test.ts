import { describe, expect, it } from 'vitest';
import { FieldPosition, Match, Player } from '../types.ts';
import { calculateFinalStandingsForRoundRobinFinali } from './tournamentService.ts';

const player = (id: string): Player => ({
    id, name: id, surname: 'X', position: FieldPosition.Indifferente, currentElo: 1500, initialElo: 1500,
} as Player);
const players = new Map(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => [id, player(id)]));
const getPlayerById = (id: string) => players.get(id);

const match = (id: string, t1: [string, string], t2: [string, string], winner: Match['winner'], games: [number, number]): Match => ({
    id, date: '2026-11-10', team1: t1, team2: t2,
    sets: [{ team1: games[0], team2: games[1] }], winner,
} as Match);

describe('calculateFinalStandingsForRoundRobinFinali', () => {
    const rr = [match('rr1', ['a', 'b'], ['c', 'd'], 'team1', [6, 3])];

    it('non inventa un podio se le finali non sono ancora state giocate', () => {
        const unplayed = [
            ...rr,
            match('f1', ['a', 'b'], ['e', 'f'], null, [0, 0]),
            match('f2', ['c', 'd'], ['g', 'h'], null, [0, 0]),
        ];
        const result = calculateFinalStandingsForRoundRobinFinali(unplayed, rr.length, getPlayerById);
        // Fallback alla classifica normale: la squadra che ha vinto il girone resta prima,
        // e la squadra 2 di una finale non giocata non viene promossa a 1ª solo perché winner è null.
        expect(result[0].team.map(p => p.id).sort().join('-')).toBe('a-b');
    });

    it('con finali giocate assegna il podio ai vincitori', () => {
        const played = [
            ...rr,
            match('f1', ['a', 'b'], ['e', 'f'], 'team1', [6, 2]),
            match('f2', ['c', 'd'], ['g', 'h'], 'team1', [6, 4]),
        ];
        const result = calculateFinalStandingsForRoundRobinFinali(played, rr.length, getPlayerById);
        expect(result[0].team.map(p => p.id).sort().join('-')).toBe('a-b');
    });
});
