import { Match, Tournament, Player, TournamentType } from '../../types';
import { TournamentPrinter } from '../types';
import { printTeamTournamentReport } from '../../services/printService';

export const generateTeamTournamentPdfHtml = (
    tournament: Tournament,
    matches: Match[],
    getPlayerById: (id: string) => Player | undefined,
    displayNameOverride?: string
): string => {
    return printTeamTournamentReport(tournament as any, getPlayerById as any, displayNameOverride);
};

export const TeamTournamentPrinter: TournamentPrinter = {
    type: TournamentType.TorneoASquadre,
    generatePdfHtml: generateTeamTournamentPdfHtml
};
