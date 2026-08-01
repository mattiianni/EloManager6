import { describe, expect, it } from 'vitest';
import { Match } from '../types.ts';
import { expectedRoundRobinMatches, separateTournamentGroups } from './tournamentGroups.ts';

const makeMatch = (id: string, teams: [string, string], createdAt: string, groupNumber?: number): Match => ({
    id,
    date: '2026-08-01',
    team1: [`${teams[0]}a`, `${teams[0]}b`],
    team2: [`${teams[1]}a`, `${teams[1]}b`],
    sets: [{ team1: 0, team2: 0 }],
    winner: null,
    createdAt,
    groupNumber,
});

describe('separateTournamentGroups', () => {
    it('separa prima i gironi espliciti anche se i turni sono intercalati', () => {
        const matches = [
            makeMatch('a1', ['A', 'B'], '1', 1),
            makeMatch('b1', ['E', 'F'], '2', 2),
            makeMatch('a2', ['C', 'D'], '3', 1),
            makeMatch('b2', ['G', 'H'], '4', 2),
        ];
        expect(separateTournamentGroups(matches, 2).map(group => group.map(match => match.id)))
            .toEqual([['a1', 'a2'], ['b1', 'b2']]);
    });

    it('ricostruisce il legacy 4+4 dall’ordine originale girone per girone', () => {
        const pairs: [string, string][] = [['A','B'],['C','D'],['A','C'],['B','D'],['A','D'],['B','C']];
        const matches = [
            ...pairs.map((pair, index) => makeMatch(`a${index}`, pair, String(index).padStart(2, '0'))),
            ...pairs.map((pair, index) => makeMatch(`b${index}`, [String.fromCharCode(pair[0].charCodeAt(0) + 4), String.fromCharCode(pair[1].charCodeAt(0) + 4)], String(index + 6).padStart(2, '0'))),
        ];
        expect(separateTournamentGroups(matches.reverse(), 2).map(group => group.length)).toEqual([6, 6]);
    });

    it('riconosce i gironi legacy dalle squadre anche senza numGironi e con partite intercalate', () => {
        const groupA = [
            makeMatch('a1', ['A', 'B'], 'same'),
            makeMatch('a2', ['C', 'D'], 'same'),
            makeMatch('a3', ['A', 'C'], 'same'),
            makeMatch('a4', ['B', 'D'], 'same'),
            makeMatch('a5', ['A', 'D'], 'same'),
            makeMatch('a6', ['B', 'C'], 'same'),
        ];
        const groupB = [
            makeMatch('b1', ['E', 'F'], 'same'),
            makeMatch('b2', ['G', 'H'], 'same'),
            makeMatch('b3', ['E', 'G'], 'same'),
            makeMatch('b4', ['F', 'H'], 'same'),
            makeMatch('b5', ['E', 'H'], 'same'),
            makeMatch('b6', ['F', 'G'], 'same'),
        ];
        const interleaved = groupA.flatMap((match, index) => [match, groupB[index]]);

        expect(separateTournamentGroups(interleaved, 0).map(group => group.map(match => match.id)))
            .toEqual([groupA.map(match => match.id), groupB.map(match => match.id)]);
    });

    it('mantiene separati anche gironi di dimensioni diverse', () => {
        const groupA: [string, string][] = [
            ['A', 'B'], ['A', 'C'], ['A', 'D'], ['A', 'E'], ['B', 'C'],
            ['B', 'D'], ['B', 'E'], ['C', 'D'], ['C', 'E'], ['D', 'E'],
        ];
        const groupB: [string, string][] = [
            ['F', 'G'], ['F', 'H'], ['F', 'I'], ['G', 'H'], ['G', 'I'], ['H', 'I'],
        ];
        const matches = [
            ...groupA.map((pair, index) => makeMatch(`a${index}`, pair, String(index).padStart(2, '0'))),
            ...groupB.map((pair, index) => makeMatch(`b${index}`, pair, String(index + groupA.length).padStart(2, '0'))),
        ];

        const groups = separateTournamentGroups(matches, 2);
        expect(groups.map(group => group.length)).toEqual([10, 6]);
        expect(groups.map(group => new Set(group.flatMap(match => [match.team1.join('|'), match.team2.join('|')])).size))
            .toEqual([5, 4]);
    });

    it('calcola le permutazioni round robin', () => {
        expect(expectedRoundRobinMatches(3)).toBe(3);
        expect(expectedRoundRobinMatches(4)).toBe(6);
        expect(expectedRoundRobinMatches(5)).toBe(10);
    });
});
