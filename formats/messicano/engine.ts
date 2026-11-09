import { Match, Tournament, Player, TournamentType } from '../../types';
import { TournamentEngine, PlayoffGenerationResult, ResumeStateResult, StandingsEntry } from '../types';
import { calculateMexicanStandings } from './jitEngine';

export const MexicanEngine: TournamentEngine = {
    type: TournamentType.Mexican,

    calculateStandings: (
        matches: Match[],
        tournament: Tournament,
        getPlayerById: (id: string) => Player | undefined
    ): StandingsEntry[] => {
        const scoringType = tournament.mexicanScoringType || tournament.americanoScoringType || 'games-diff';

        // Estrai tutti i giocatori unici presenti nei match o nel torneo
        const playerIds = new Set<string>();
        matches.forEach(m => {
            [...(m.team1 || []), ...(m.team2 || [])].forEach(id => {
                if (id) playerIds.add(id);
            });
        });

        const allPlayers: Player[] = Array.from(playerIds).map(id => {
            return getPlayerById(id) || ({
                id,
                name: 'Giocatore',
                surname: '',
                currentElo: 1500,
                initialElo: 1500
            } as Player);
        });

        const mexicanStandings = calculateMexicanStandings(matches, allPlayers, scoringType);

        return mexicanStandings.map(st => ({
            player: st.player,
            pair: [st.player, st.player],
            points: st.points,
            gamesWon: st.gamesWon,
            gamesLost: st.gamesLost,
            gameDifference: st.gameDifference,
            matchesPlayed: st.matchesPlayed,
            rank: st.rank
        }));
    },

    generatePlayoffs: (): PlayoffGenerationResult => {
        return { quarters: [], semifinals: [], finals: [], matchesToSave: [] };
    },

    resumeState: (
        matches: Match[],
        tournament: Tournament,
        getPlayerById: (id: string) => Player | undefined
    ): ResumeStateResult => {
        const standings = MexicanEngine.calculateStandings(matches, tournament, getPlayerById);
        const isCompleted = tournament.status === 'completed' || (matches.length > 0 && matches.every(m => !!m.winner));
        return {
            activePhase: isCompleted ? 'completed' : 'round_robin',
            quarterfinalMatches: [],
            semifinalMatches: [],
            finalMatches: [],
            standings
        };
    },

    validateMatch: (match: Match) => {
        if (!match.sets || match.sets.length === 0) {
            return { isValid: false, error: 'Punteggio mancante' };
        }
        return { isValid: true };
    }
};
