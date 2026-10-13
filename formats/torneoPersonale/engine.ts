import { Match, Tournament, Player, TournamentType } from '../../types.ts';
import { TournamentEngine, PlayoffGenerationResult, ResumeStateResult, StandingsEntry } from '../types.ts';
import { calculateTournamentStandings } from '../../services/tournamentService.ts';
import { calculateAllBoxStandings, groupMatchesByPlayerSets } from '../../services/beatTheBoxService.ts';
import { calculateAmericanoStandings } from '../americano/engine.ts';
import { CustomTournamentFlowConfig, PhaseBlockId } from '../../types/customTournament.ts';

/**
 * Calcola le classifiche in base alle fasi previste dal torneo personale
 */
export const calculateTorneoPersonaleStandings = (
    matches: Match[],
    tournament: Tournament,
    getPlayerById: (id: string) => Player | undefined
): StandingsEntry[] => {
    let flowConfig: CustomTournamentFlowConfig | null = null;
    try {
        flowConfig = typeof tournament.customFlowConfig === 'string'
            ? JSON.parse(tournament.customFlowConfig)
            : tournament.customFlowConfig || (typeof tournament.custom_flow_config === 'string' ? JSON.parse(tournament.custom_flow_config) : tournament.custom_flow_config);
    } catch {
        flowConfig = null;
    }

    const phases: PhaseBlockId[] = flowConfig?.phases || [];

    // Se ha una fase Americano
    if (phases.includes('americano')) {
        return calculateAmericanoStandings(matches, tournament, getPlayerById);
    }

    // Se ha una fase Box
    if (phases.includes('box')) {
        const { boxes } = groupMatchesByPlayerSets(matches);
        const boxMatchesAll = Array.from(boxes.values()).flat();
        const boxesData = Array.from(boxes.entries()).map(([boxNum, bMatches]) => {
            const playerIds = new Set<string>();
            bMatches.forEach(m => {
                m.team1.forEach(id => playerIds.add(id));
                m.team2.forEach(id => playerIds.add(id));
            });
            return {
                boxNumber: boxNum,
                players: Array.from(playerIds).map(id => getPlayerById(id)!).filter(Boolean),
                matches: bMatches
            };
        });

        const boxStandings = calculateAllBoxStandings(boxMatchesAll, boxesData);
        return boxStandings.flatMap(bs => bs.standings.map(s => ({
            player: s.player,
            points: s.points,
            gamesWon: s.gamesWon,
            gamesLost: s.gamesLost,
            gameDifference: s.gameDifference,
            rank: s.rank
        })));
    }

    // Default girone standard per coppie
    const regularMatches = matches.filter(m => !m.phase || m.phase === 'group' || m.phase === 'round_robin' || m.phase === 'ordinary');
    const standings = calculateTournamentStandings(regularMatches, getPlayerById);

    return standings.map((s, idx) => {
        const p1 = getPlayerById(s.team[0]?.id) || s.team[0];
        const p2 = getPlayerById(s.team[1]?.id) || s.team[1];
        return {
            pair: [p1, p2],
            points: s.points,
            gamesWon: s.gamesWon,
            gamesLost: s.gamesLost,
            gameDifference: s.gameDifference,
            matchesPlayed: (s as any).matchesPlayed || 0,
            rank: (s as any).rank || idx + 1
        };
    });
};

export const TorneoPersonaleEngine: TournamentEngine = {
    type: TournamentType.TorneoPersonale,
    calculateStandings: calculateTorneoPersonaleStandings,
    generatePlayoffs: (standings: any[], tournament: Tournament, currentPhase?: string, sfResults?: any): PlayoffGenerationResult => {
        // Generazione generica playoff
        return { quarters: [], semifinals: [], finals: [], matchesToSave: [] };
    },
    resumeState: (matches: Match[], tournament: Tournament, getPlayerById: (id: string) => Player | undefined): ResumeStateResult => {
        const standings = calculateTorneoPersonaleStandings(matches, tournament, getPlayerById);
        const isCompleted = tournament.status === 'completed' || (matches.length > 0 && matches.every(m => !!m.winner));

        const quarterfinalMatches = matches.filter(m => m.phase === 'quarterfinal');
        const semifinalMatches = matches.filter(m => m.phase === 'semifinal');
        const finalMatches = matches.filter(m => m.phase && ['final_1_2', 'final_3_4', 'finalina', 'consolation', 'consolation_final'].includes(m.phase));

        let activePhase: 'round_robin' | 'quarterfinals' | 'semifinals' | 'finals' | 'completed' = 'round_robin';
        if (isCompleted) {
            activePhase = 'completed';
        } else if (finalMatches.length > 0) {
            activePhase = 'finals';
        } else if (semifinalMatches.length > 0) {
            activePhase = 'semifinals';
        } else if (quarterfinalMatches.length > 0) {
            activePhase = 'quarterfinals';
        }

        return {
            activePhase,
            quarterfinalMatches,
            semifinalMatches,
            finalMatches,
            standings
        };
    },
    validateMatch: (match: Match) => {
        if (!match.sets || match.sets.length === 0) return { isValid: false, error: 'Punteggio mancante' };
        return { isValid: true };
    }
};
