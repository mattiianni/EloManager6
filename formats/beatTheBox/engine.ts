import { Match, Tournament, Player, TournamentType } from '../../types';
import { TournamentEngine, PlayoffGenerationResult, ResumeStateResult } from '../types';
import { calculateAllBoxStandings, createFinalsMatches as createBeatBoxFinalsMatches, groupMatchesByPlayerSets } from '../../services/beatTheBoxService';

export const calculateBeatBoxStandings = (
    matches: Match[],
    tournament: Tournament,
    getPlayerById: (id: string) => Player | undefined
) => {
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

    return calculateAllBoxStandings(boxMatchesAll, boxesData);
};

export const BeatTheBoxEngine: TournamentEngine = {
    type: TournamentType.BeatTheBox,
    calculateStandings: calculateBeatBoxStandings,
    generatePlayoffs: (standings: any[], tournament: Tournament, currentPhase?: string, sfResults?: any): PlayoffGenerationResult => {
        const numBoxes = standings.length;
        const playoffType = (tournament.playoffType as any) || 'semifinals';
        const { semifinals, finals } = createBeatBoxFinalsMatches(numBoxes, standings, tournament.date, sfResults, playoffType);
        return {
            semifinals,
            finals,
            matchesToSave: [...(semifinals || []), ...(finals || [])]
        };
    },
    resumeState: (matches: Match[], tournament: Tournament, getPlayerById: (id: string) => Player | undefined): ResumeStateResult => {
        const standings = calculateBeatBoxStandings(matches, tournament, getPlayerById);
        const semifinalMatches = matches.filter(m => m.phase === 'semifinal');
        const finalMatches = matches.filter(m => m.phase && m.phase !== 'semifinal');

        const isMatchDone = (m: Match) => !!m.winner && m.sets && m.sets.length > 0 && !(m.sets.length === 1 && Number(m.sets[0].team1 || 0) === 0 && Number(m.sets[0].team2 || 0) === 0);

        if (semifinalMatches.length > 0) {
            const allSemisDone = semifinalMatches.every(isMatchDone);
            if (allSemisDone) {
                return { activePhase: 'finals', quarterfinalMatches: [], semifinalMatches, finalMatches, standings };
            }
            return { activePhase: 'semifinals', quarterfinalMatches: [], semifinalMatches, finalMatches, standings };
        }

        if (finalMatches.length > 0) {
            const allFinalsDone = finalMatches.every(isMatchDone);
            if (allFinalsDone && tournament.status === 'completed') {
                return { activePhase: 'completed', quarterfinalMatches: [], semifinalMatches, finalMatches, standings };
            }
            return { activePhase: 'finals', quarterfinalMatches: [], semifinalMatches, finalMatches, standings };
        }

        return { activePhase: 'round_robin', quarterfinalMatches: [], semifinalMatches: [], finalMatches: [], standings };
    },
    validateMatch: (match: Match) => {
        if (!match.sets || match.sets.length === 0) return { isValid: false, error: 'Punteggio mancante' };
        return { isValid: true };
    }
};
