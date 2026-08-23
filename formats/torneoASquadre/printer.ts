import { Match, Tournament, Player, TournamentType } from '../../types';
import { TournamentPrinter } from '../types';

export const generateTeamTournamentPdfHtml = (
    tournament: Tournament,
    matches: Match[],
    getPlayerById: (id: string) => Player | undefined,
    displayNameOverride?: string
): string => {
    return `<div style="padding: 20px; font-family: sans-serif;">
        <h2>${displayNameOverride || tournament.name}</h2>
        <p>Il report del Torneo a Squadre è disponibile dalla schermata dedicata del torneo.</p>
    </div>`;
};

export const TeamTournamentPrinter: TournamentPrinter = {
    type: TournamentType.TorneoASquadre,
    generatePdfHtml: generateTeamTournamentPdfHtml
};
