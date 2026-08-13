import { Match, Tournament, Player, TournamentType } from '../types';

export interface StandingsEntry {
    pair?: [Player, Player];
    player?: Player;
    points: number;
    gamesWon: number;
    gamesLost: number;
    gameDifference: number;
    matchesPlayed?: number;
    rank?: number;
    eloChange?: number;
    winPercentage?: number;
}

export interface PlayoffGenerationResult {
    quarters?: Match[];
    semifinals?: Match[];
    finals?: Match[];
    matchesToSave: Match[];
}

export interface ResumeStateResult {
    activePhase: 'round_robin' | 'quarterfinals' | 'semifinals' | 'finals' | 'completed';
    quarterfinalMatches: Match[];
    semifinalMatches: Match[];
    finalMatches: Match[];
    standings: any[];
}

export interface TournamentEngine {
    type: TournamentType;
    calculateStandings(matches: Match[], tournament: Tournament, getPlayerById: (id: string) => Player | undefined): any[];
    generatePlayoffs(standings: any[], tournament: Tournament, currentPhase?: string, sfResults?: any): PlayoffGenerationResult;
    resumeState(matches: Match[], tournament: Tournament, getPlayerById: (id: string) => Player | undefined): ResumeStateResult;
    validateMatch(match: Match, phase?: string): { isValid: boolean; error?: string };
}

export interface TournamentPrinter {
    type: TournamentType;
    generatePdfHtml(
        tournament: Tournament,
        matches: Match[],
        getPlayerById: (id: string) => Player | undefined,
        displayNameOverride?: string
    ): string;
}
