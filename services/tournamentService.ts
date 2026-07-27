
import { Player, Match, TournamentStandingEntry, SetScore } from '../types.ts';

const getTeamId = (team: [Player, Player]): string => {
    return team.map(p => p.id).sort().join('-');
};

const countGames = (sets: SetScore[]): { gamesWon: number, gamesLost: number } => {
    return sets.reduce((acc, set) => ({
        gamesWon: acc.gamesWon + set.team1,
        gamesLost: acc.gamesLost + set.team2
    }), { gamesWon: 0, gamesLost: 0 });
};

export function calculateTournamentStandings(
    tournamentMatches: Match[],
    getPlayerById: (id: string) => Player | undefined
): TournamentStandingEntry[] {
    const standingsMap = new Map<string, Omit<TournamentStandingEntry, 'team' | 'teamId'>>();
    const teamsMap = new Map<string, [Player, Player]>();

    for (const match of tournamentMatches) {
        const player1A = getPlayerById(match.team1[0]);
        const player1B = getPlayerById(match.team1[1]);
        const player2A = getPlayerById(match.team2[0]);
        const player2B = getPlayerById(match.team2[1]);

        if (!player1A || !player1B || !player2A || !player2B) continue;

        const team1: [Player, Player] = [player1A, player1B];
        const team2: [Player, Player] = [player2A, player2B];
        
        const team1Id = getTeamId(team1);
        const team2Id = getTeamId(team2);

        if (!standingsMap.has(team1Id)) {
            standingsMap.set(team1Id, { points: 0, gamesWon: 0, gamesLost: 0, gameDifference: 0 });
            teamsMap.set(team1Id, team1);
        }
        if (!standingsMap.has(team2Id)) {
            standingsMap.set(team2Id, { points: 0, gamesWon: 0, gamesLost: 0, gameDifference: 0 });
            teamsMap.set(team2Id, team2);
        }

        const team1Stats = standingsMap.get(team1Id)!;
        const team2Stats = standingsMap.get(team2Id)!;

        // Assign points
        if (match.winner === 'team1') {
            team1Stats.points += 3;
        } else {
            team2Stats.points += 3;
        }

        // Calculate games
        const team1Games = match.sets.reduce((acc, set) => acc + set.team1, 0);
        const team2Games = match.sets.reduce((acc, set) => acc + set.team2, 0);

        team1Stats.gamesWon += team1Games;
        team1Stats.gamesLost += team2Games;
        team2Stats.gamesWon += team2Games;
        team2Stats.gamesLost += team1Games;
    }

    const standings: TournamentStandingEntry[] = [];
    for (const [teamId, stats] of standingsMap.entries()) {
        standings.push({
            teamId,
            team: teamsMap.get(teamId)!,
            ...stats,
            gameDifference: stats.gamesWon - stats.gamesLost,
        });
    }

    // Sort standings: by points, then by game difference
    standings.sort((a, b) => {
        if (b.points !== a.points) {
            return b.points - a.points;
        }
        return b.gameDifference - a.gameDifference;
    });

    return standings;
}

// Calculate final standings for Round Robin + Finali based on finals results
export function calculateFinalStandingsForRoundRobinFinali(
    allMatches: Match[], 
    roundRobinMatchCount: number,
    getPlayerById: (id: string) => Player | undefined
): TournamentStandingEntry[] {
    // Split matches into round robin and finals
    const finalsMatches = allMatches.slice(roundRobinMatchCount);
    
    if (finalsMatches.length !== 2) {
        // Fallback to normal calculation if finals are not present
        return calculateTournamentStandings(allMatches, getPlayerById);
    }
    
    const finale1_2 = finalsMatches[0]; // Finale 1°-2°
    const finale3_4 = finalsMatches[1]; // Finale 3°-4°
    
    // Determine winners and losers
    const winner1_2 = finale1_2.winner === 'team1' ? finale1_2.team1 : finale1_2.team2;
    const loser1_2 = finale1_2.winner === 'team1' ? finale1_2.team2 : finale1_2.team1;
    const winner3_4 = finale3_4.winner === 'team1' ? finale3_4.team1 : finale3_4.team2;
    const loser3_4 = finale3_4.winner === 'team1' ? finale3_4.team2 : finale3_4.team1;
    
    // Calculate game stats for display
    const getTeamStats = (teamIds: [string, string]): { gamesWon: number, gamesLost: number } => {
        let gamesWon = 0;
        let gamesLost = 0;
        const targetSorted = [...teamIds].sort().join('-');
        
        allMatches.forEach(match => {
            const team1Sorted = [...match.team1].sort().join('-');
            const team2Sorted = [...match.team2].sort().join('-');
            
            if (team1Sorted === targetSorted) {
                gamesWon += match.sets.reduce((sum, set) => sum + set.team1, 0);
                gamesLost += match.sets.reduce((sum, set) => sum + set.team2, 0);
            } else if (team2Sorted === targetSorted) {
                gamesWon += match.sets.reduce((sum, set) => sum + set.team2, 0);
                gamesLost += match.sets.reduce((sum, set) => sum + set.team1, 0);
            }
        });
        
        return { gamesWon, gamesLost };
    };
    
    const safeGetPlayer = (id: string): Player => {
        return getPlayerById(id) || { id, name: 'Giocatore', surname: '', currentElo: 1500 };
    };

    // Build standings in correct order based on finals
    const standings: TournamentStandingEntry[] = [];
    
    // 1st place: winner of finale 1°-2°
    const team1 = [safeGetPlayer(winner1_2[0]), safeGetPlayer(winner1_2[1])];
    const stats1 = getTeamStats(winner1_2 as [string, string]);
    standings.push({
        teamId: winner1_2.join('-'),
        team: team1 as [Player, Player],
        points: 12, // 4 wins (arbitrary, but indicates 1st)
        gamesWon: stats1.gamesWon,
        gamesLost: stats1.gamesLost,
        gameDifference: stats1.gamesWon - stats1.gamesLost
    });
    
    // 2nd place: loser of finale 1°-2°
    const team2 = [safeGetPlayer(loser1_2[0]), safeGetPlayer(loser1_2[1])];
    const stats2 = getTeamStats(loser1_2 as [string, string]);
    standings.push({
        teamId: loser1_2.join('-'),
        team: team2 as [Player, Player],
        points: 9, // 3 wins
        gamesWon: stats2.gamesWon,
        gamesLost: stats2.gamesLost,
        gameDifference: stats2.gamesWon - stats2.gamesLost
    });
    
    // 3rd place: winner of finale 3°-4°
    const team3 = [safeGetPlayer(winner3_4[0]), safeGetPlayer(winner3_4[1])];
    const stats3 = getTeamStats(winner3_4 as [string, string]);
    standings.push({
        teamId: winner3_4.join('-'),
        team: team3 as [Player, Player],
        points: 6, // 2 wins
        gamesWon: stats3.gamesWon,
        gamesLost: stats3.gamesLost,
        gameDifference: stats3.gamesWon - stats3.gamesLost
    });
    
    // 4th place: loser of finale 3°-4°
    const team4 = [safeGetPlayer(loser3_4[0]), safeGetPlayer(loser3_4[1])];
    const stats4 = getTeamStats(loser3_4 as [string, string]);
    standings.push({
        teamId: loser3_4.join('-'),
        team: team4 as [Player, Player],
        points: 3, // 1 win
        gamesWon: stats4.gamesWon,
        gamesLost: stats4.gamesLost,
        gameDifference: stats4.gamesWon - stats4.gamesLost
    });
    
    return standings;
}
