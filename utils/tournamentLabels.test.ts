import { describe, it, expect } from 'vitest';
import { getTournamentSeriesKey, getTournamentDisplayName, getCompletedTournamentDayDisplayName } from './tournamentLabels';
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

describe('getTournamentDisplayName / getCompletedTournamentDayDisplayName: nomi giornate e serie', () => {
    const t1: Tournament = {
        id: 't1',
        name: 'TorneOtto 2026/2027',
        type: TournamentType.BeatTheBox,
        status: 'completed',
        date: '2026-10-16T00:00:00.000Z',
        club: 'Club',
        matchIds: []
    };
    const t2: Tournament = {
        id: 't2',
        name: 'Beat the Box (No Finali)',
        type: TournamentType.TorneoLibero,
        status: 'completed',
        date: '2026-11-12T00:00:00.000Z',
        giornataName: 'TorneOtto 2026/2027',
        club: 'Club',
        matchIds: []
    };
    const t3: Tournament = {
        id: 't3',
        name: 'TorneOtto 2026/2027',
        type: TournamentType.Mexican,
        status: 'completed',
        date: '2026-11-13T00:00:00.000Z',
        giornataName: 'TorneOtto 2026/2027',
        club: 'Club',
        matchIds: []
    };

    const series = [t1, t2, t3];

    it('restituisce il nome/tipo della giornata invece di forzare "TorneOtto 2026/2027 - X^ Giornata"', () => {
        // Giorno 1: Beat the Box
        expect(getTournamentDisplayName(t1, series)).toBe('Beat the Box');
        // Giorno 2: Beat the Box (No Finali)
        expect(getTournamentDisplayName(t2, series)).toBe('Beat the Box (No Finali)');
        // Giorno 3: Mexicano (non "TorneOtto 2026/2027 - 3^ Giornata")
        expect(getTournamentDisplayName(t3, series)).toBe('Mexicano');
    });

    it('per tornei singoli non appartenenti a serie multi-giornata restituisce il nome del torneo', () => {
        const standalone: Tournament = {
            id: 's1',
            name: 'Torneo di Natale',
            type: TournamentType.BeatTheBox,
            status: 'completed',
            date: '2026-12-25T00:00:00.000Z',
            club: 'Club',
            matchIds: []
        };
        expect(getTournamentDisplayName(standalone, [standalone])).toBe('Torneo di Natale');
    });
});
