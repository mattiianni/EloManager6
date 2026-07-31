import { describe, it, expect } from 'vitest';
import { buildPlayerEloTimeline, formatLabel, resolveEventContext, sumPlayerEventEloDelta } from './eloEventsService.ts';
import { EloHistoryEntry, Match, Tournament, TeamTournamentMatchday, TournamentType } from '../types.ts';

describe('eloEventsService Tests', () => {
    const playerId = 'player-1';

    // Mock data structures - struttura REALE del DB:
    // name = Nome Torneo Padre (es: "TorneOtto Inverno 2025")
    // type = Nome Giornata (es: "Beat the Box")
    // giornataName = null nei record vecchi
    const mockTournaments: Tournament[] = [
        {
            id: 't-day-1',
            name: 'TorneOtto Inverno 2025',
            type: TournamentType.BeatTheBox,
            date: '2026-05-10T18:00:00Z',
            club: 'Padel Club',
            matchIds: [],
            status: 'completed',
            giornataName: null
        },
        {
            id: 't-day-2',
            name: 'TorneOtto Inverno 2025',
            type: TournamentType.BeatTheBox,
            date: '2026-05-17T18:00:00Z',
            club: 'Padel Club',
            matchIds: [],
            status: 'completed',
            giornataName: null
        },
        {
            id: 't-day-3',
            name: 'TorneOtto Inverno 2025',
            type: TournamentType.BeatTheBox,
            date: '2026-05-24T18:00:00Z',
            club: 'Padel Club',
            matchIds: [],
            status: 'completed',
            giornataName: null
        },
        {
            id: 'team-root',
            name: 'Torneo a Squadre Inverno 2026',
            type: TournamentType.TorneoASquadre,
            date: '2026-06-01T18:00:00Z',
            club: 'Padel Club',
            matchIds: [],
            status: 'completed'
        }
    ];

    const mockTeamMatchdays: TeamTournamentMatchday[] = [
        {
            id: 'matchday-1',
            rootTournamentId: 'team-root',
            tournamentDayId: 'team-day-1',
            date: '2026-06-10T18:00:00Z',
            team1_number: 1,
            team2_number: 2,
            round_number: 1,
            phase: 'round_robin',
            matches_per_day: 3,
            status: 'completed'
        }
    ];

    it('5 matches in same tournament giornata should produce exactly 1 event with summed delta', () => {
        const eloHistory: EloHistoryEntry[] = Array.from({ length: 5 }, (_, i) => ({
            eventId: `match-${i}`,
            playerId,
            eloBefore: 1500,
            eloAfter: 1510,
            delta: 10,
            date: '2026-05-10T19:00:00Z',
            type: 'match'
        }));

        const matches: Match[] = Array.from({ length: 5 }, (_, i) => ({
            id: `match-${i}`,
            date: '2026-05-10T19:00:00Z',
            team1: [playerId, 'partner'],
            team2: ['opp1', 'opp2'],
            sets: [{ team1: 6, team2: 4 }],
            winner: 'team1',
            tournamentId: 't-day-1'
        }));

        const timeline = buildPlayerEloTimeline(playerId, eloHistory, matches, mockTournaments, []);
        
        expect(timeline).toHaveLength(1);
        expect(timeline[0].delta).toBe(50);
        expect(timeline[0].parentTournamentName).toBe('TorneOtto Inverno 2025');
        expect(timeline[0].dayLabel).toBe('Beat the Box');
    });

    it('mother tournament with 3 giornate: general view has 3 events, filtered view matches parent name', () => {
        const eloHistory: EloHistoryEntry[] = [
            { eventId: 'match-1', playerId, eloBefore: 1500, eloAfter: 1510, delta: 10, date: '2026-05-10T19:00:00Z', type: 'match' },
            { eventId: 'match-2', playerId, eloBefore: 1510, eloAfter: 1505, delta: -5, date: '2026-05-17T19:00:00Z', type: 'match' },
            { eventId: 'match-3', playerId, eloBefore: 1505, eloAfter: 1520, delta: 15, date: '2026-05-24T19:00:00Z', type: 'match' }
        ];

        const matches: Match[] = [
            { id: 'match-1', date: '2026-05-10T19:00:00Z', team1: [playerId, 'p'], team2: ['o1', 'o2'], sets: [], winner: 'team1', tournamentId: 't-day-1' },
            { id: 'match-2', date: '2026-05-17T19:00:00Z', team1: [playerId, 'p'], team2: ['o1', 'o2'], sets: [], winner: 'team2', tournamentId: 't-day-2' },
            { id: 'match-3', date: '2026-05-24T19:00:00Z', team1: [playerId, 'p'], team2: ['o1', 'o2'], sets: [], winner: 'team1', tournamentId: 't-day-3' }
        ];

        // General view
        const generalTimeline = buildPlayerEloTimeline(playerId, eloHistory, matches, mockTournaments, []);
        expect(generalTimeline).toHaveLength(3);

        // Filtered view by parent name
        const filteredTimeline = buildPlayerEloTimeline(playerId, eloHistory, matches, mockTournaments, [], {
            parentTournamentName: 'TorneOtto Inverno 2025'
        });
        expect(filteredTimeline).toHaveLength(3);
        expect(formatLabel(filteredTimeline[0], false)).toBe('Beat the Box');
        expect(formatLabel(filteredTimeline[0], true)).toBe('TorneOtto Inverno 2025 · Beat the Box');
    });

    it('team tournament matchdays format correctly in general and filtered views', () => {
        const eloHistory: EloHistoryEntry[] = [
            { eventId: 'matchday-1', playerId, eloBefore: 1500, eloAfter: 1515, delta: 15, date: '2026-06-10T19:00:00Z', type: 'team_tournament_matchday' }
        ];

        const timeline = buildPlayerEloTimeline(playerId, eloHistory, [], mockTournaments, mockTeamMatchdays);
        expect(timeline).toHaveLength(1);
        expect(timeline[0].isTeamTournament).toBe(true);

        const label = formatLabel(timeline[0], true);
        expect(label).toBe('Giornata Torneo a Squadre Inverno 2026 del 10/06/2026');
    });

    it('friendly matches should not merge with tournament events and render correctly', () => {
        const eloHistory: EloHistoryEntry[] = [
            { eventId: 'match-friendly', playerId, eloBefore: 1500, eloAfter: 1508, delta: 8, date: '2026-05-10T15:00:00Z', type: 'match' }
        ];

        const matches: Match[] = [
            { id: 'match-friendly', date: '2026-05-10T15:00:00Z', team1: [playerId, 'p'], team2: ['o1', 'o2'], sets: [], winner: 'team1' }
        ];

        const timeline = buildPlayerEloTimeline(playerId, eloHistory, matches, mockTournaments, []);
        expect(timeline).toHaveLength(1);
        expect(timeline[0].parentTournamentName).toBeNull();
        expect(formatLabel(timeline[0], true)).toBe('Partita Amichevole');
    });

    it('non attribuisce un evento orfano a un torneo usando soltanto la data', () => {
        const entry: EloHistoryEntry = {
            eventId: 'missing-tournament',
            playerId,
            eloBefore: 1500,
            eloAfter: 1505,
            delta: 5,
            date: '2026-05-10T20:00:00Z',
            type: 'tournament',
        };
        const context = resolveEventContext(entry, [], mockTournaments, []);
        expect(context.parentTournamentName).toBeNull();
        expect(context.dayLabel).toBe('Evento non associato');
    });

    it('corrupted tournament day matches log warning or fallback safely without disappearing', () => {
        const eloHistory: EloHistoryEntry[] = [
            { eventId: 'match-corrupted', playerId, eloBefore: 1500, eloAfter: 1512, delta: 12, date: '2026-05-10T19:00:00Z', type: 'match' }
        ];

        const matches: Match[] = [
            { id: 'match-corrupted', date: '2026-05-10T19:00:00Z', team1: [playerId, 'p'], team2: ['o1', 'o2'], sets: [], winner: 'team1', tournamentId: 'non-existent-id' }
        ];

        const timeline = buildPlayerEloTimeline(playerId, eloHistory, matches, mockTournaments, []);
        expect(timeline).toHaveLength(1);
        expect(timeline[0].dayLabel).toBe('Giornata Torneo');
    });

    it('keeps ELO variations separate when tournament days share the same name', () => {
        const eloHistory: EloHistoryEntry[] = [
            { eventId: 't-day-1', playerId, eloBefore: 1500, eloAfter: 1506, delta: 6, date: '2026-05-10T18:00:00Z', type: 'tournament' },
            { eventId: 't-day-1', playerId, eloBefore: 1506, eloAfter: 1508, delta: 2, date: '2026-05-10T18:00:00Z', type: 'tournament' },
            { eventId: 't-day-2', playerId, eloBefore: 1508, eloAfter: 1503, delta: -5, date: '2026-05-17T18:00:00Z', type: 'tournament' },
            { eventId: 't-day-1', playerId: 'another-player', eloBefore: 1500, eloAfter: 1492, delta: -8, date: '2026-05-10T18:00:00Z', type: 'tournament' },
        ];

        expect(sumPlayerEventEloDelta(playerId, 't-day-1', eloHistory)).toBe(8);
        expect(sumPlayerEventEloDelta(playerId, 't-day-2', eloHistory)).toBe(-5);
    });

    it('includes ELO history linked to tournament match IDs after a full recalculation', () => {
        const eloHistory: EloHistoryEntry[] = [
            { eventId: 'match-1', playerId, eloBefore: 1500, eloAfter: 1508, delta: 8, date: '2026-05-10T18:00:00Z', type: 'tournament' },
            { eventId: 'match-2', playerId, eloBefore: 1508, eloAfter: 1514, delta: 6, date: '2026-05-10T19:00:00Z', type: 'tournament' },
            { eventId: 'other-match', playerId, eloBefore: 1514, eloAfter: 1510, delta: -4, date: '2026-05-11T18:00:00Z', type: 'tournament' },
        ];

        expect(sumPlayerEventEloDelta(playerId, 't-day-1', eloHistory, ['match-1', 'match-2'])).toBe(14);
    });
});
