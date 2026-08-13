import { Match, Tournament, Player, TournamentType } from '../../types';
import { TournamentPrinter } from '../types';
import { printBeatTheBoxComplete, printBeatTheBoxBlank } from '../../services/printService';
import { calculateBeatBoxStandings } from './engine';
import { groupMatchesByPlayerSets } from '../../services/beatTheBoxService';

export const generateBeatBoxPdfHtml = (
    tournament: Tournament,
    matches: Match[],
    getPlayerById: (id: string) => Player | undefined,
    displayNameOverride?: string
): string => {
    const { boxes, phaseMatches } = groupMatchesByPlayerSets(matches);
    const boxMatchesAll = Array.from(boxes.values()).flat();

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

    const standings = calculateBeatBoxStandings(matches, tournament, getPlayerById);
    const semifinalMatches = matches.filter(m => m.phase === 'semifinal');
    const finalMatches = matches.filter(m => m.phase && m.phase !== 'semifinal');

    // Live real-time PDF mirror (no check on completed status!)
    if (boxMatchesAll.some(m => m.winner || (m.sets && m.sets.some(s => Number(s.team1 || 0) > 0 || Number(s.team2 || 0) > 0)))) {
        return printBeatTheBoxComplete(
            tournament,
            boxesData,
            standings,
            semifinalMatches,
            finalMatches,
            [], // individualStandings
            getPlayerById,
            displayNameOverride
        );
    }

    return printBeatTheBoxBlank(tournament, boxesData, getPlayerById, displayNameOverride);
};

export const BeatTheBoxPrinter: TournamentPrinter = {
    type: TournamentType.BeatTheBox,
    generatePdfHtml: generateBeatBoxPdfHtml
};
