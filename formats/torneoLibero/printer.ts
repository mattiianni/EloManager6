import { Match, Tournament, Player, TournamentType } from '../../types';
import { TournamentPrinter } from '../types';

export const generateTorneoLiberoPdfHtml = (
    tournament: Tournament,
    matches: Match[],
    getPlayerById: (id: string) => Player | undefined,
    displayNameOverride?: string
): string => {
    return `<div style="padding: 20px; font-family: sans-serif;">
        <h2>${displayNameOverride || tournament.name}</h2>
        <p>Il report del Torneo Libero è disponibile dalla schermata dedicata alle partite.</p>
    </div>`;
};

export const TorneoLiberoPrinter: TournamentPrinter = {
    type: TournamentType.TorneoLibero,
    generatePdfHtml: generateTorneoLiberoPdfHtml
};
