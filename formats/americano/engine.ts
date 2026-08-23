import { Match, Tournament, Player, TournamentType } from '../../types';
import { TournamentEngine, PlayoffGenerationResult, ResumeStateResult, StandingsEntry } from '../types';

export const calculateAmericanoStandings = (
    matches: Match[],
    tournament: Tournament,
    getPlayerById: (id: string) => Player | undefined
): StandingsEntry[] => {
    const scoringType = tournament.americanoScoringType || 'games-diff';

    const playerStats = new Map<string, {
        player: Player;
        totalPoints: number;
        totalGamesWon: number;
        totalGamesLost: number;
        matchesPlayed: number;
    }>();

    // Get all unique players from matches
    const allPlayerIds = new Set<string>();
    matches.forEach(match => {
        [...match.team1, ...match.team2].forEach(playerId => {
            if (playerId) allPlayerIds.add(playerId);
        });
    });

    // Initialize stats for each player
    allPlayerIds.forEach(playerId => {
        const player = getPlayerById(playerId) || ({ id: playerId, name: 'Giocatore', surname: '' } as Player);
        playerStats.set(playerId, {
            player,
            totalPoints: 0,
            totalGamesWon: 0,
            totalGamesLost: 0,
            matchesPlayed: 0
        });
    });

    // Process each match score
    matches.forEach(match => {
        if (!match.sets || match.sets.length === 0) return;

        const team1Games = match.sets.reduce((sum, set) => sum + (Number(set.team1) || 0), 0);
        const team2Games = match.sets.reduce((sum, set) => sum + (Number(set.team2) || 0), 0);
        const hasScore = match.sets.some(set => Number(set.team1 || 0) > 0 || Number(set.team2 || 0) > 0) || match.winner;

        if (!hasScore) return;

        match.team1.forEach(pId => {
            const stats = playerStats.get(pId);
            if (stats) {
                stats.matchesPlayed++;
                stats.totalGamesWon += team1Games;
                stats.totalGamesLost += team2Games;
                stats.totalPoints += (scoringType === 'points' ? team1Games : (team1Games > team2Games ? 3 : (team1Games === team2Games ? 1 : 0)));
            }
        });

        match.team2.forEach(pId => {
            const stats = playerStats.get(pId);
            if (stats) {
                stats.matchesPlayed++;
                stats.totalGamesWon += team2Games;
                stats.totalGamesLost += team1Games;
                stats.totalPoints += (scoringType === 'points' ? team2Games : (team2Games > team1Games ? 3 : (team2Games === team1Games ? 1 : 0)));
            }
        });
    });

    // Convert map to standings list
    const standingsList: StandingsEntry[] = Array.from(playerStats.values()).map(s => {
        const gameDiff = s.totalGamesWon - s.totalGamesLost;
        const pts = scoringType === 'points' ? s.totalGamesWon : s.totalPoints;
        return {
            pair: [s.player, s.player],
            team: [s.player],
            points: pts,
            gamesWon: s.totalGamesWon,
            gamesLost: s.totalGamesLost,
            gameDifference: gameDiff,
            matchesPlayed: s.matchesPlayed,
            setsWon: 0,
            setsLost: 0,
            setDifference: 0
        };
    });

    // Sort standings: by points (or games diff) then game difference then games won
    standingsList.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.gameDifference !== a.gameDifference) return b.gameDifference - a.gameDifference;
        return b.gamesWon - a.gamesWon;
    });

    return standingsList;
};

export const AmericanoEngine: TournamentEngine = {
    type: TournamentType.Americano,
    calculateStandings: calculateAmericanoStandings,
    generatePlayoffs: (): PlayoffGenerationResult => {
        return { quarters: [], semifinals: [], finals: [], matchesToSave: [] };
    },
    resumeState: (matches: Match[], tournament: Tournament, getPlayerById: (id: string) => Player | undefined): ResumeStateResult => {
        const standings = calculateAmericanoStandings(matches, tournament, getPlayerById);
        const isCompleted = tournament.status === 'completed' || (matches.length > 0 && matches.every(m => !!m.winner));
        return {
            activePhase: isCompleted ? 'completed' : 'round_robin',
            quarterfinalMatches: [],
            semifinalMatches: [],
            finalMatches: [],
            standings
        };
    },
    validateMatch: (match: Match) => {
        if (!match.sets || match.sets.length === 0) return { isValid: false, error: 'Punteggio mancante' };
        return { isValid: true };
    }
};
