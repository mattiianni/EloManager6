import { describe, expect, it } from 'vitest';
import { TournamentType } from '../types.ts';
import { normalizeTournamentRounds } from './tournamentRounds.ts';

const match = (id: string, roundNumber?: number) => ({
    id,
    date: '2026-07-31T12:00:00.000Z',
    team1: [`${id}-a`, `${id}-b`] as [string, string],
    team2: [`${id}-c`, `${id}-d`] as [string, string],
    roundNumber,
});

describe('normalizeTournamentRounds', () => {
    it('ordina i turni e resetta i campi in ogni turno', () => {
        const rounds = normalizeTournamentRounds(
            [match('r3b', 3), match('r1b', 1), match('r2a', 2), match('r1a', 1), match('r3a', 3)],
            TournamentType.Americano,
            { fields: 2 },
        );
        expect(rounds.map(round => round.roundNumber)).toEqual([1, 2, 3]);
        expect(rounds[0].matches.map(item => item.courtNumber)).toEqual([1, 2]);
        expect(rounds[1].matches.map(item => item.courtNumber)).toEqual([1]);
        expect(rounds[2].matches.map(item => item.courtNumber)).toEqual([1, 2]);
    });

    it('ricostruisce i turni TorneOtto quando roundNumber manca', () => {
        const rounds = normalizeTournamentRounds(
            [match('a'), match('b'), match('c'), match('d'), match('e'), match('f')],
            TournamentType.TorneOtto,
        );
        expect(rounds.map(round => round.label)).toEqual(['Turno 1', 'Turno 2', 'Turno 3']);
        expect(rounds.every(round => round.matches.length === 2)).toBe(true);
    });

    it('genera etichette andata e ritorno', () => {
        const rounds = normalizeTournamentRounds(
            [match('a', 1), match('b', 2), match('c', 3), match('d', 4)],
            TournamentType.RoundRobinFinali,
            { homeAway: true },
        );
        expect(rounds.map(round => round.label)).toEqual([
            '1ª Giornata di Andata',
            '2ª Giornata di Andata',
            '1ª Giornata di Ritorno',
            '2ª Giornata di Ritorno',
        ]);
    });

    it('calcola i partecipanti a riposo', () => {
        const onlyMatch = match('a', 1);
        const rounds = normalizeTournamentRounds([onlyMatch], TournamentType.Americano, {
            participantIds: [...onlyMatch.team1, ...onlyMatch.team2, 'resting-player'],
        });
        expect(rounds[0].restingParticipantIds).toEqual(['resting-player']);
    });
});
