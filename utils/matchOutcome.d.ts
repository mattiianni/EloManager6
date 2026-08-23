export const MATCH_OUTCOME: {
    readonly NOT_ENTERED: 'not_entered';
    readonly VALID_WIN: 'valid_win';
    readonly VALID_DRAW: 'valid_draw';
    readonly FORBIDDEN_DRAW: 'forbidden_draw';
    readonly INVALID_SCORE: 'invalid_score';
};

export type MatchOutcomeStatus = typeof MATCH_OUTCOME[keyof typeof MATCH_OUTCOME];

export interface ValidateMatchOutcomeContext {
    sets?: Array<{ team1: number | string; team2: number | string }> | null;
    tournamentType?: string | null;
    phase?: string | null;
    isDirectElimination?: boolean;
}

export interface MatchOutcomeResult {
    status: MatchOutcomeStatus;
    winner: 'team1' | 'team2' | 'draw' | null;
    team1Total: number;
    team2Total: number;
}

export function isDirectEliminationFormat(format?: string | null): boolean;

export function isDrawForbidden(context?: { tournamentType?: string | null; phase?: string | null; isDirectElimination?: boolean }): boolean;

export function validateMatchOutcome(context?: ValidateMatchOutcomeContext): MatchOutcomeResult;

export function outcomeErrorMessage(status: string): string | null;
