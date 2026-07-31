import { Match, SetScore } from '../types.ts';

type TeamIds = readonly [string, string];

const teamKey = (team: readonly string[]): string => [...team].sort().join(',');

export const findMatchBetweenTeams = <TMatch extends Pick<Match, 'team1' | 'team2'>>(
    matches: readonly TMatch[],
    team1: TeamIds,
    team2: TeamIds,
): TMatch | undefined => {
    const team1Key = teamKey(team1);
    const team2Key = teamKey(team2);
    return matches.find(match => {
        const storedTeam1Key = teamKey(match.team1);
        const storedTeam2Key = teamKey(match.team2);
        return (storedTeam1Key === team1Key && storedTeam2Key === team2Key)
            || (storedTeam1Key === team2Key && storedTeam2Key === team1Key);
    });
};

export const orientResultForStoredMatch = (
    storedMatch: Pick<Match, 'team1'>,
    selectedTeam1: TeamIds,
    sets: SetScore[],
    winner: 'team1' | 'team2',
): { sets: SetScore[]; winner: 'team1' | 'team2' } => {
    const sameOrientation = teamKey(storedMatch.team1) === teamKey(selectedTeam1);
    if (sameOrientation) return { sets, winner };
    return {
        sets: sets.map(set => ({ team1: set.team2, team2: set.team1 })),
        winner: winner === 'team1' ? 'team2' : 'team1',
    };
};

