import { Match } from '../../types';

export const validateRoundRobinMatch = (match: Match) => {
    if (!match.sets || match.sets.length === 0) {
        return { isValid: false, error: 'Punteggio mancante' };
    }

    const firstSet = match.sets[0];
    if (firstSet.team1 === 0 && firstSet.team2 === 0) {
        return { isValid: false, error: 'Punteggio 0-0 non valido per partita disputata' };
    }

    return { isValid: true };
};
