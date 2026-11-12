import { describe, it, expect } from 'vitest';
import { getTournamentSeriesKey } from './tournamentLabels';
import { Tournament, TournamentType } from '../types';

describe('getTournamentSeriesKey: nome del torneo madre', () => {
    const day = (over: Partial<Tournament>): Tournament => ({
        id: 'd1', name: 'Beat the Box (No Finali)', type: TournamentType.BeatTheBox, date: '2026-11-12T18:00:00Z',
        club: 'C', matchIds: [], status: 'completed', ...over,
    } as Tournament);

    it('con giornataName restituisce il torneo madre, non il nome dell\'ultima giornata', () => {
        expect(getTournamentSeriesKey(day({ giornataName: 'TorneOtto 2026/2027' }))).toBe('TorneOtto 2026/2027');
    });
    it('senza giornataName (torneo singolo) restituisce il nome del torneo', () => {
        expect(getTournamentSeriesKey(day({ name: 'Sfida Serale', giornataName: null }))).toBe('Sfida Serale');
    });
});
