import { Match, Tournament, Player, TournamentType } from '../../types';
import { TournamentPrinter } from '../types';
import { printGironiTournament } from '../../services/printService';

export const generateGironiPdfHtml = (
    tournament: Tournament,
    matches: Match[],
    getPlayerById: (id: string) => Player | undefined,
    displayNameOverride?: string
): string => {
    return printGironiTournament(tournament, matches, getPlayerById, displayNameOverride) as any as string;
};

export const GironiPrinter: TournamentPrinter = {
    type: TournamentType.GironiFaseFinale,
    generatePdfHtml: generateGironiPdfHtml
};
