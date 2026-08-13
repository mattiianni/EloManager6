import { Match, Tournament, Player, TournamentType } from '../../types';
import { TournamentPrinter } from '../types';
import { printTorneoLiberoComplete, printTorneoLiberoBlank } from '../../services/printService';

export const generateTorneoLiberoPdfHtml = (
    tournament: Tournament,
    matches: Match[],
    getPlayerById: (id: string) => Player | undefined,
    displayNameOverride?: string
): string => {
    const hasScores = matches.some(m => m.winner || (m.sets && m.sets.some(s => Number(s.team1 || 0) > 0 || Number(s.team2 || 0) > 0)));
    if (hasScores) {
        return printTorneoLiberoComplete(tournament, matches, getPlayerById, displayNameOverride);
    }
    return printTorneoLiberoBlank(tournament, matches, getPlayerById, displayNameOverride);
};

export const TorneoLiberoPrinter: TournamentPrinter = {
    type: TournamentType.TorneoLibero,
    generatePdfHtml: generateTorneoLiberoPdfHtml
};
