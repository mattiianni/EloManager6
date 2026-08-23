import { Match, Tournament, Player, TournamentType } from '../../types';
import { TournamentPrinter } from '../types';
import { printTpraTournamentReport } from '../../services/printService';

export const generateEliminazioneDirettaPdfHtml = (
    tournament: Tournament,
    matches: Match[],
    getPlayerById: (id: string) => Player | undefined,
    displayNameOverride?: string
): string => {
    return printTpraTournamentReport(tournament, matches, getPlayerById, displayNameOverride) as any as string;
};

export const EliminazioneDirettaPrinter: TournamentPrinter = {
    type: TournamentType.EliminazioneDiretta,
    generatePdfHtml: generateEliminazioneDirettaPdfHtml
};
