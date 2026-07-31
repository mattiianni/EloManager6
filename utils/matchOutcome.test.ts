import { describe, expect, it } from 'vitest';
import { MATCH_OUTCOME, validateMatchOutcome } from './matchOutcome.js';

describe('validateMatchOutcome', () => {
    it('considera 0-0 un risultato non inserito', () => {
        expect(validateMatchOutcome({ sets: [{ team1: 0, team2: 0 }] }).status)
            .toBe(MATCH_OUTCOME.NOT_ENTERED);
    });

    it.each(['semifinal', 'final_1_2', 'final_3_4', 'finalina', 'consolation_final'])(
        'vieta il pareggio nella fase %s',
        phase => {
            expect(validateMatchOutcome({ sets: [{ team1: 6, team2: 6 }], phase }).status)
                .toBe(MATCH_OUTCOME.FORBIDDEN_DRAW);
        },
    );

    it('vieta il pareggio in ogni round di Eliminazione Diretta', () => {
        expect(validateMatchOutcome({
            sets: [{ team1: 5, team2: 5 }],
            tournamentType: 'Eliminazione Diretta',
            phase: 'ordinary',
        }).status).toBe(MATCH_OUTCOME.FORBIDDEN_DRAW);
    });

    it.each(['Americano', "TorneOtto 30'", 'Round Robin + Finali', 'Gironi + Fase Finale', 'Beat the Box', 'Torneo Libero'])(
        'ammette il pareggio nella fase ordinaria di %s',
        tournamentType => {
            const result = validateMatchOutcome({
                sets: [{ team1: 6, team2: 6 }],
                tournamentType,
                phase: 'ordinary',
            });
            expect(result.status).toBe(MATCH_OUTCOME.VALID_DRAW);
            expect(result.winner).toBe('draw');
        },
    );

    it('rifiuta punteggi negativi o non numerici', () => {
        expect(validateMatchOutcome({ sets: [{ team1: -1, team2: 3 }] }).status)
            .toBe(MATCH_OUTCOME.INVALID_SCORE);
    });
});
