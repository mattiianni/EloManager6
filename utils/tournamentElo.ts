export interface TournamentEloMatchInput {
    id: string;
    tournamentId?: string;
    date?: string;
    createdAt?: string;
    roundNumber?: number;
    team1: string[];
    team2: string[];
    winner: 'team1' | 'team2' | 'draw' | null;
}

export interface MatchLocalEloSnapshot {
    team1Average: number;
    team2Average: number;
    team1Delta: number;
    team2Delta: number;
}

export interface TournamentLocalEloResult {
    totalDeltas: Map<string, number>;
    matchSnapshots: Map<string, MatchLocalEloSnapshot>;
}

const compareMatches = (a: TournamentEloMatchInput, b: TournamentEloMatchInput) => {
    const eventDateA = new Date(a.date || 0).getTime();
    const eventDateB = new Date(b.date || 0).getTime();
    if (eventDateA !== eventDateB) return eventDateA - eventDateB;
    const roundA = Number(a.roundNumber) || Number.MAX_SAFE_INTEGER;
    const roundB = Number(b.roundNumber) || Number.MAX_SAFE_INTEGER;
    if (roundA !== roundB) return roundA - roundB;
    const timeA = new Date(a.createdAt || a.date || 0).getTime();
    const timeB = new Date(b.createdAt || b.date || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return String(a.id).localeCompare(String(b.id));
};

/**
 * Calculates tournament-specific ELO. Every distinct tournament starts every
 * player at 1500; only the resulting delta is accumulated across tournaments.
 */
export const calculateTournamentLocalElo = (
    matches: TournamentEloMatchInput[],
    kFactor = 16,
): TournamentLocalEloResult => {
    const grouped = new Map<string, TournamentEloMatchInput[]>();
    matches.forEach(match => {
        const key = match.tournamentId || `unassigned:${match.date || 'unknown'}`;
        const group = grouped.get(key) || [];
        group.push(match);
        grouped.set(key, group);
    });

    const totalDeltas = new Map<string, number>();
    const matchSnapshots = new Map<string, MatchLocalEloSnapshot>();

    grouped.forEach(groupMatches => {
        const localElos = new Map<string, number>();
        const getLocalElo = (playerId: string) => localElos.get(playerId) ?? 1500;

        [...groupMatches].sort(compareMatches).forEach(match => {
            if (!['team1', 'team2', 'draw'].includes(match.winner || '')) return;
            if (match.team1.length === 0 || match.team2.length === 0) return;

            const team1Average = match.team1.reduce((sum, id) => sum + getLocalElo(id), 0) / match.team1.length;
            const team2Average = match.team2.reduce((sum, id) => sum + getLocalElo(id), 0) / match.team2.length;
            const expectedTeam1 = 1 / (1 + Math.pow(10, (team2Average - team1Average) / 400));
            const scoreTeam1 = match.winner === 'team1' ? 1 : match.winner === 'team2' ? 0 : 0.5;
            const team1Delta = kFactor * (scoreTeam1 - expectedTeam1);
            const team2Delta = -team1Delta;

            matchSnapshots.set(match.id, { team1Average, team2Average, team1Delta, team2Delta });
            match.team1.forEach(id => localElos.set(id, getLocalElo(id) + team1Delta));
            match.team2.forEach(id => localElos.set(id, getLocalElo(id) + team2Delta));
        });

        localElos.forEach((finalElo, playerId) => {
            totalDeltas.set(playerId, (totalDeltas.get(playerId) || 0) + finalElo - 1500);
        });
    });

    return { totalDeltas, matchSnapshots };
};
