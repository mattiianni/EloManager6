/**
 * Canonical match-result policy shared by the browser and the API.
 * Keep this module dependency-free so it can be exercised in isolation.
 */

export const MATCH_OUTCOME = Object.freeze({
    NOT_ENTERED: 'not_entered',
    VALID_WIN: 'valid_win',
    VALID_DRAW: 'valid_draw',
    FORBIDDEN_DRAW: 'forbidden_draw',
    INVALID_SCORE: 'invalid_score',
});

const FORBIDDEN_DRAW_PHASES = new Set([
    'direct_elimination_round',
    'round_of_32',
    'round_of_16',
    'quarterfinal',
    'semifinal',
    'final_1_2',
    'final_3_4',
    'finalina',
    'consolation',
    'consolation_final',
]);

const normalizeToken = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const isDirectEliminationFormat = (format) => {
    const token = normalizeToken(format);
    return token === 'eliminazione_diretta' || token === 'direct_elimination';
};

/** @param {{ tournamentType?: string, phase?: string, isDirectElimination?: boolean }} [context] */
export const isDrawForbidden = ({ tournamentType, phase, isDirectElimination = false } = {}) => {
    if (isDirectElimination || isDirectEliminationFormat(tournamentType)) return true;
    const token = normalizeToken(phase);
    if (FORBIDDEN_DRAW_PHASES.has(token)) return true;
    return token.includes('semifinal')
        || token.includes('final')
        || token.includes('consolation');
};

/**
 * @param {{ sets?: Array<{team1: number|string, team2: number|string}>, tournamentType?: string, phase?: string, isDirectElimination?: boolean }} [context]
 * @returns {{status: string, winner: 'team1'|'team2'|'draw'|null, team1Total: number, team2Total: number}}
 */
export const validateMatchOutcome = ({
    sets,
    tournamentType,
    phase,
    isDirectElimination = false,
} = {}) => {
    if (!Array.isArray(sets) || sets.length === 0) {
        return { status: MATCH_OUTCOME.NOT_ENTERED, winner: null, team1Total: 0, team2Total: 0 };
    }

    let team1Total = 0;
    let team2Total = 0;
    let hasScore = false;
    for (const set of sets) {
        const team1 = Number(set?.team1);
        const team2 = Number(set?.team2);
        if (!Number.isFinite(team1) || !Number.isFinite(team2) || team1 < 0 || team2 < 0) {
            return { status: MATCH_OUTCOME.INVALID_SCORE, winner: null, team1Total: 0, team2Total: 0 };
        }
        team1Total += team1;
        team2Total += team2;
        hasScore ||= team1 > 0 || team2 > 0;
    }

    if (!hasScore) {
        return { status: MATCH_OUTCOME.NOT_ENTERED, winner: null, team1Total, team2Total };
    }
    if (team1Total === team2Total) {
        const forbidden = isDrawForbidden({ tournamentType, phase, isDirectElimination });
        return {
            status: forbidden ? MATCH_OUTCOME.FORBIDDEN_DRAW : MATCH_OUTCOME.VALID_DRAW,
            winner: forbidden ? null : 'draw',
            team1Total,
            team2Total,
        };
    }
    return {
        status: MATCH_OUTCOME.VALID_WIN,
        winner: team1Total > team2Total ? 'team1' : 'team2',
        team1Total,
        team2Total,
    };
};

/** @param {string} status */
export const outcomeErrorMessage = (status) => {
    if (status === MATCH_OUTCOME.NOT_ENTERED) return 'Inserisci un risultato valido';
    if (status === MATCH_OUTCOME.FORBIDDEN_DRAW) return 'Questa partita deve avere un vincitore';
    if (status === MATCH_OUTCOME.INVALID_SCORE) return 'Il punteggio inserito non è valido';
    return null;
};
