import { Match, Tournament, Player, TournamentType } from '../../types';
import { TournamentEngine, PlayoffGenerationResult, ResumeStateResult } from '../types';
import { getCanonicalTeamKey } from '../../utils/matchIdentity';

export const calculateRoundRobinStandings = (
    matches: Match[],
    tournament: Tournament,
    getPlayerById: (id: string) => Player | undefined
) => {
    // Regular round robin matches (not playoffs)
    const rrMatches = matches.filter(m =>
        !['quarterfinal', 'quarterfinals', 'semifinal', 'semifinals', 'final_1_2', 'final_3_4', 'final', 'finals'].includes(String(m.phase || ''))
    );

    const standingsMap = new Map<string, {
        pair: [Player, Player];
        points: number;
        gamesWon: number;
        gamesLost: number;
        matchesPlayed: number;
    }>();

    rrMatches.forEach(m => {
        const k1 = getCanonicalTeamKey(m.team1);
        const k2 = getCanonicalTeamKey(m.team2);

        if (!standingsMap.has(k1)) {
            const p1 = getPlayerById(m.team1[0]) || ({ id: m.team1[0], name: 'Giocatore', surname: '1' } as Player);
            const p2 = getPlayerById(m.team1[1]) || ({ id: m.team1[1], name: 'Giocatore', surname: '2' } as Player);
            standingsMap.set(k1, { pair: [p1, p2], points: 0, gamesWon: 0, gamesLost: 0, matchesPlayed: 0 });
        }
        if (!standingsMap.has(k2)) {
            const p1 = getPlayerById(m.team2[0]) || ({ id: m.team2[0], name: 'Giocatore', surname: '1' } as Player);
            const p2 = getPlayerById(m.team2[1]) || ({ id: m.team2[1], name: 'Giocatore', surname: '2' } as Player);
            standingsMap.set(k2, { pair: [p1, p2], points: 0, gamesWon: 0, gamesLost: 0, matchesPlayed: 0 });
        }

        const sets = m.sets || [];
        const isPlayed = sets.some(s => Number(s.team1 || 0) > 0 || Number(s.team2 || 0) > 0) || !!m.winner;
        if (!isPlayed) return;

        const t1Games = sets.reduce((sum, s) => sum + Number(s.team1 || 0), 0);
        const t2Games = sets.reduce((sum, s) => sum + Number(s.team2 || 0), 0);

        const st1 = standingsMap.get(k1)!;
        const st2 = standingsMap.get(k2)!;

        st1.gamesWon += t1Games;
        st1.gamesLost += t2Games;
        st1.matchesPlayed += 1;

        st2.gamesWon += t2Games;
        st2.gamesLost += t1Games;
        st2.matchesPlayed += 1;

        if (m.winner === 'team1' || t1Games > t2Games) {
            st1.points += 3;
        } else if (m.winner === 'team2' || t2Games > t1Games) {
            st2.points += 3;
        } else if (t1Games === t2Games && t1Games > 0) {
            st1.points += 1;
            st2.points += 1;
        }
    });

    const standings = Array.from(standingsMap.values()).map(entry => ({
        ...entry,
        gameDifference: entry.gamesWon - entry.gamesLost
    }));

    standings.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.gameDifference !== a.gameDifference) return b.gameDifference - a.gameDifference;
        return b.gamesWon - a.gamesWon;
    });

    return standings;
};

export const generateRoundRobinPlayoffs = (
    standings: any[],
    tournament: Tournament,
    currentPhase?: string,
    completedPhaseMatches?: Match[]
): PlayoffGenerationResult => {
    const playoffType = (tournament.roundRobinPlayoffType || tournament.round_robin_playoff_type) || 'finals_only';

    if (playoffType === 'no_finals') {
        return { matchesToSave: [] };
    }

    const now = Date.now();

    // 1. Quarti di Finale Progression (for 8+ pairs)
    if (playoffType === 'quarterfinals') {
        if (!currentPhase || currentPhase === 'round_robin') {
            const top8 = standings.slice(0, 8);
            if (top8.length < 8) return { matchesToSave: [] };

            const quarters: Match[] = [
                // Q1: 1° vs 8°
                { id: `temp_rr_q1_${now}`, date: tournament.date, team1: top8[0].pair.map((p: Player) => p.id), team2: top8[7].pair.map((p: Player) => p.id), sets: [{ team1: 0, team2: 0 }], winner: null, tournamentId: tournament.id, phase: 'quarterfinal', roundNumber: 2 },
                // Q2: 2° vs 7°
                { id: `temp_rr_q2_${now}`, date: tournament.date, team1: top8[1].pair.map((p: Player) => p.id), team2: top8[6].pair.map((p: Player) => p.id), sets: [{ team1: 0, team2: 0 }], winner: null, tournamentId: tournament.id, phase: 'quarterfinal', roundNumber: 2 },
                // Q3: 3° vs 6°
                { id: `temp_rr_q3_${now}`, date: tournament.date, team1: top8[2].pair.map((p: Player) => p.id), team2: top8[5].pair.map((p: Player) => p.id), sets: [{ team1: 0, team2: 0 }], winner: null, tournamentId: tournament.id, phase: 'quarterfinal', roundNumber: 2 },
                // Q4: 4° vs 5°
                { id: `temp_rr_q4_${now}`, date: tournament.date, team1: top8[3].pair.map((p: Player) => p.id), team2: top8[4].pair.map((p: Player) => p.id), sets: [{ team1: 0, team2: 0 }], winner: null, tournamentId: tournament.id, phase: 'quarterfinal', roundNumber: 2 },
            ];

            return { quarters, matchesToSave: quarters };
        }

        if (currentPhase === 'quarterfinals' && completedPhaseMatches && completedPhaseMatches.length === 4) {
            const winners = completedPhaseMatches.map(m => m.winner === 'team1' ? m.team1 : m.team2);
            const semis: Match[] = [
                // Semifinale A: Winner Q1 vs Winner Q4
                { id: `temp_rr_sf1_${now}`, date: tournament.date, team1: winners[0], team2: winners[3], sets: [{ team1: 0, team2: 0 }], winner: null, tournamentId: tournament.id, phase: 'semifinal', roundNumber: 3 },
                // Semifinale B: Winner Q2 vs Winner Q3
                { id: `temp_rr_sf2_${now}`, date: tournament.date, team1: winners[1], team2: winners[2], sets: [{ team1: 0, team2: 0 }], winner: null, tournamentId: tournament.id, phase: 'semifinal', roundNumber: 3 },
            ];
            return { semifinals: semis, matchesToSave: semis };
        }
    }

    // 2. Semifinali Progression
    if (playoffType === 'semifinals' || (playoffType === 'quarterfinals' && currentPhase === 'semifinals')) {
        if ((!currentPhase || currentPhase === 'round_robin') && playoffType === 'semifinals') {
            const top4 = standings.slice(0, 4);
            if (top4.length < 4) return { matchesToSave: [] };

            const semis: Match[] = [
                // SF1: 1° vs 4°
                { id: `temp_rr_sf1_${now}`, date: tournament.date, team1: top4[0].pair.map((p: Player) => p.id), team2: top4[3].pair.map((p: Player) => p.id), sets: [{ team1: 0, team2: 0 }], winner: null, tournamentId: tournament.id, phase: 'semifinal', roundNumber: 2 },
                // SF2: 2° vs 3°
                { id: `temp_rr_sf2_${now}`, date: tournament.date, team1: top4[1].pair.map((p: Player) => p.id), team2: top4[2].pair.map((p: Player) => p.id), sets: [{ team1: 0, team2: 0 }], winner: null, tournamentId: tournament.id, phase: 'semifinal', roundNumber: 2 },
            ];
            return { semifinals: semis, matchesToSave: semis };
        }

        if ((currentPhase === 'semifinals' || currentPhase === 'quarterfinals') && completedPhaseMatches && completedPhaseMatches.length === 2) {
            const winners = completedPhaseMatches.map(m => m.winner === 'team1' ? m.team1 : m.team2);
            const losers = completedPhaseMatches.map(m => m.winner === 'team1' ? m.team2 : m.team1);

            const finals: Match[] = [
                // Finale 1°-2°: Winner SF1 vs Winner SF2
                { id: `temp_rr_f1_${now}`, date: tournament.date, team1: winners[0], team2: winners[1], sets: [{ team1: 0, team2: 0 }], winner: null, tournamentId: tournament.id, phase: 'final_1_2', roundNumber: 4 },
                // Finale 3°-4°: Loser SF1 vs Loser SF2
                { id: `temp_rr_f2_${now}`, date: tournament.date, team1: losers[0], team2: losers[1], sets: [{ team1: 0, team2: 0 }], winner: null, tournamentId: tournament.id, phase: 'final_3_4', roundNumber: 4 },
            ];
            return { finals, matchesToSave: finals };
        }
    }

    // 3. Direct Finals (finals_only)
    if (playoffType === 'finals_only') {
        const top4 = standings.slice(0, 4);
        if (top4.length < 4) return { matchesToSave: [] };

        const finals: Match[] = [
            // Finale 1°-2°: 1° vs 2°
            { id: `temp_rr_f1_${now}`, date: tournament.date, team1: top4[0].pair.map((p: Player) => p.id), team2: top4[1].pair.map((p: Player) => p.id), sets: [{ team1: 0, team2: 0 }], winner: null, tournamentId: tournament.id, phase: 'final_1_2', roundNumber: 2 },
            // Finale 3°-4°: 3° vs 4°
            { id: `temp_rr_f2_${now}`, date: tournament.date, team1: top4[2].pair.map((p: Player) => p.id), team2: top4[3].pair.map((p: Player) => p.id), sets: [{ team1: 0, team2: 0 }], winner: null, tournamentId: tournament.id, phase: 'final_3_4', roundNumber: 2 },
        ];
        return { finals, matchesToSave: finals };
    }

    return { matchesToSave: [] };
};

export const resumeRoundRobinState = (
    matches: Match[],
    tournament: Tournament,
    getPlayerById: (id: string) => Player | undefined
): ResumeStateResult => {
    const standings = calculateRoundRobinStandings(matches, tournament, getPlayerById);

    const quarterfinalMatches = matches.filter(m => m.phase === 'quarterfinal');
    const semifinalMatches = matches.filter(m => m.phase === 'semifinal');
    const finalMatches = matches.filter(m => m.phase === 'final_1_2' || m.phase === 'final_3_4');

    const isMatchDone = (m: Match) => !!m.winner && m.sets && m.sets.length > 0 && !(m.sets.length === 1 && Number(m.sets[0].team1 || 0) === 0 && Number(m.sets[0].team2 || 0) === 0);

    const playoffType = (tournament.roundRobinPlayoffType || tournament.round_robin_playoff_type) || 'finals_only';

    if (playoffType === 'quarterfinals') {
        if (quarterfinalMatches.length > 0) {
            const allQuartersDone = quarterfinalMatches.length === 4 && quarterfinalMatches.every(isMatchDone);
            if (allQuartersDone) {
                if (semifinalMatches.length > 0) {
                    const allSemisDone = semifinalMatches.length === 2 && semifinalMatches.every(isMatchDone);
                    if (allSemisDone) {
                        return { activePhase: 'finals', quarterfinalMatches, semifinalMatches, finalMatches, standings };
                    }
                    return { activePhase: 'semifinals', quarterfinalMatches, semifinalMatches, finalMatches, standings };
                }
                return { activePhase: 'semifinals', quarterfinalMatches, semifinalMatches, finalMatches, standings };
            }
            return { activePhase: 'quarterfinals', quarterfinalMatches, semifinalMatches, finalMatches, standings };
        }
    }

    if (playoffType === 'semifinals') {
        if (semifinalMatches.length > 0) {
            const allSemisDone = semifinalMatches.length === 2 && semifinalMatches.every(isMatchDone);
            if (allSemisDone) {
                return { activePhase: 'finals', quarterfinalMatches, semifinalMatches, finalMatches, standings };
            }
            return { activePhase: 'semifinals', quarterfinalMatches, semifinalMatches, finalMatches, standings };
        }
    }

    if (finalMatches.length > 0) {
        const allFinalsDone = finalMatches.every(isMatchDone);
        if (allFinalsDone && tournament.status === 'completed') {
            return { activePhase: 'completed', quarterfinalMatches, semifinalMatches, finalMatches, standings };
        }
        return { activePhase: 'finals', quarterfinalMatches, semifinalMatches, finalMatches, standings };
    }

    return { activePhase: 'round_robin', quarterfinalMatches: [], semifinalMatches: [], finalMatches: [], standings };
};

export const RoundRobinEngine: TournamentEngine = {
    type: TournamentType.RoundRobinFinali,
    calculateStandings: calculateRoundRobinStandings,
    generatePlayoffs: generateRoundRobinPlayoffs,
    resumeState: resumeRoundRobinState,
    validateMatch: (match: Match) => {
        if (!match.sets || match.sets.length === 0) return { isValid: false, error: 'Punteggio mancante' };
        return { isValid: true };
    }
};
