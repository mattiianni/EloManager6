import { Match, Tournament, Player, TournamentType } from '../../types.ts';
import { TournamentPrinter } from '../types.ts';
import { printBeatTheBoxComplete, printBeatTheBoxBlank } from '../../services/printService.ts';
import { groupMatchesByPlayerSets } from '../../services/beatTheBoxService.ts';

export const generateTorneoPersonalePdfHtml = (
    tournament: Tournament,
    matches: Match[],
    getPlayerById: (id: string) => Player | undefined,
    displayNameOverride?: string
): string => {
    const { boxes } = groupMatchesByPlayerSets(matches);

    const boxesData: { boxNumber: number; players: Player[]; matches: Match[] }[] = [];
    boxes.forEach((boxMatches, boxNum) => {
        const allPlayers = new Set<string>();
        boxMatches.forEach(m => {
            m.team1.forEach(id => allPlayers.add(id));
            m.team2.forEach(id => allPlayers.add(id));
        });
        boxesData.push({
            boxNumber: boxNum,
            players: Array.from(allPlayers).map(id => getPlayerById(id)!).filter(Boolean),
            matches: boxMatches
        });
    });

    const semifinalMatches = matches.filter(m => m.phase === 'semifinal');
    const finalMatches = matches.filter(m => m.phase && ['final_1_2', 'final_3_4', 'finalina', 'consolation'].includes(m.phase));

    const hasScores = matches.some(m => !!m.winner || (m.sets && m.sets.some(s => Number(s.team1 || 0) > 0 || Number(s.team2 || 0) > 0)));

    if (hasScores) {
        return printBeatTheBoxComplete(
            tournament,
            boxesData,
            [],
            semifinalMatches,
            finalMatches,
            [],
            getPlayerById,
            displayNameOverride
        ) as any as string;
    }

    return printBeatTheBoxBlank(tournament, boxesData, getPlayerById, displayNameOverride) as any as string;
};

export const TorneoPersonalePrinter: TournamentPrinter = {
    type: TournamentType.TorneoPersonale,
    generatePdfHtml: generateTorneoPersonalePdfHtml
};
