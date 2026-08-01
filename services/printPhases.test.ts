import { describe, expect, it } from 'vitest';
import { partitionMatchesByPhase } from './printService.ts';
import { Match } from '../types.ts';

const match = (id: string, phase: Match['phase'], score: [number, number]): Match => ({
    id,
    date: '2026-08-01',
    team1: [`${id}-1`, `${id}-2`],
    team2: [`${id}-3`, `${id}-4`],
    sets: [{ team1: score[0], team2: score[1] }],
    winner: score[0] === score[1] ? 'draw' : score[0] > score[1] ? 'team1' : 'team2',
    phase,
});

describe('PDF phase partition', () => {
    it('mantiene indipendenti gironi, quarti, semifinali e finali anche con risultati parziali', () => {
        const matches = [
            match('g1', 'group', [6, 4]),
            match('g2', 'group', [0, 0]),
            match('q1', 'quarterfinal', [6, 3]),
            match('q2', 'quarterfinal', [0, 0]),
            match('s1', 'semifinal', [0, 0]),
            match('f1', 'final_1_2', [0, 0]),
        ];
        const phases = partitionMatchesByPhase(matches);
        expect(phases.regular.map(item => item.id)).toEqual(['g1', 'g2']);
        expect(phases.quarterfinals.map(item => item.id)).toEqual(['q1', 'q2']);
        expect(phases.semifinals.map(item => item.id)).toEqual(['s1']);
        expect(phases.finals.map(item => item.id)).toEqual(['f1']);
    });
});
