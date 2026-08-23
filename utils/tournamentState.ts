import { Match, Tournament } from '../types.ts';

export type DerivedTournamentStatus = 'scheduled' | 'in_progress' | 'completed';

export const isMatchPlayed = (match: Pick<Match, 'sets' | 'winner'>): boolean => {
    if (match.winner) return true;
    if (!match.sets || !Array.isArray(match.sets) || match.sets.length === 0) return false;
    return match.sets.some(s => Number(s.team1 || 0) > 0 || Number(s.team2 || 0) > 0);
};

export const deriveTournamentState = (
    matches: readonly Match[],
    tournament?: Pick<Tournament, 'status'> | null
): DerivedTournamentStatus => {
    if (tournament?.status === 'completed') {
        return 'completed';
    }

    if (!matches || matches.length === 0) {
        return 'scheduled';
    }

    const playedCount = matches.filter(isMatchPlayed).length;
    if (playedCount === 0) {
        return 'scheduled';
    }

    const allCompleted = matches.every(m => Boolean(m.winner));
    if (allCompleted && matches.length > 0) {
        return 'completed';
    }

    return 'in_progress';
};
