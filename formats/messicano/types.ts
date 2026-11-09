import { Player, Match, Tournament } from '../../types';

export interface MexicanStandingsEntry {
    player: Player;
    points: number;
    gamesWon: number;
    gamesLost: number;
    gameDifference: number;
    matchesPlayed: number;
    rank: number;
}

export interface MexicanCourtGroup {
    courtNumber: number;
    courtLabel: string;
    players: Player[];
    match?: Match;
}

export type MexicanDrawMode = 'Normal' | 'Seeded' | 'Balanced' | 'Manual';
