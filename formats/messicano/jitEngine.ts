import { Player, Match } from '../../types';
import { MexicanStandingsEntry, MexicanDrawMode } from './types';

export const pairKey = (id1: string, id2: string): string => {
    return [id1, id2].sort().join('__');
};

/**
 * Calcola la classifica provvisoria o finale del torneo Messicano.
 * Gerarchia Tie-Breakers:
 * 1. Punti Torneo (o game vinti se scoringType === 'points')
 * 2. Ranking ELO attuale del giocatore (Tie-breaker primario di merito da DB)
 * 3. Differenza Game (gamesWon - gamesLost)
 * 4. Game totali vinti
 * 5. ID giocatore (ordine deterministico)
 */
export function calculateMexicanStandings(
    matches: Match[],
    allPlayers: Player[],
    scoringType: 'games-diff' | 'points' = 'games-diff'
): MexicanStandingsEntry[] {
    const statsMap = new Map<string, {
        player: Player;
        points: number;
        gamesWon: number;
        gamesLost: number;
        matchesPlayed: number;
    }>();

    // Inizializza tutti i giocatori partecipanti
    allPlayers.forEach(p => {
        if (!p || !p.id) return;
        statsMap.set(p.id, {
            player: p,
            points: 0,
            gamesWon: 0,
            gamesLost: 0,
            matchesPlayed: 0
        });
    });

    // Calcola i punti accumulati nei match
    matches.forEach(match => {
        if (!match.sets || match.sets.length === 0) return;

        const team1Games = match.sets.reduce((sum, s) => sum + (Number(s.team1) || 0), 0);
        const team2Games = match.sets.reduce((sum, s) => sum + (Number(s.team2) || 0), 0);
        const hasScore = match.sets.some(s => Number(s.team1 || 0) > 0 || Number(s.team2 || 0) > 0) || match.winner;

        if (!hasScore) return;

        const isTeam1Winner = match.winner === 'team1' || (match.winner === null && team1Games > team2Games);
        const isTeam2Winner = match.winner === 'team2' || (match.winner === null && team2Games > team1Games);
        const isDraw = match.winner === 'draw' || (team1Games === team2Games && team1Games > 0);

        // Aggiorna Team 1
        match.team1.forEach(pId => {
            const st = statsMap.get(pId);
            if (st) {
                st.matchesPlayed += 1;
                st.gamesWon += team1Games;
                st.gamesLost += team2Games;
                if (scoringType === 'points') {
                    st.points += team1Games;
                } else {
                    if (isTeam1Winner) st.points += 3;
                    else if (isDraw) st.points += 1;
                }
            }
        });

        // Aggiorna Team 2
        match.team2.forEach(pId => {
            const st = statsMap.get(pId);
            if (st) {
                st.matchesPlayed += 1;
                st.gamesWon += team2Games;
                st.gamesLost += team1Games;
                if (scoringType === 'points') {
                    st.points += team2Games;
                } else {
                    if (isTeam2Winner) st.points += 3;
                    else if (isDraw) st.points += 1;
                }
            }
        });
    });

    const entries: MexicanStandingsEntry[] = Array.from(statsMap.values()).map(st => ({
        player: st.player,
        points: st.points,
        gamesWon: st.gamesWon,
        gamesLost: st.gamesLost,
        gameDifference: st.gamesWon - st.gamesLost,
        matchesPlayed: st.matchesPlayed,
        rank: 1
    }));

    // Ordinamento gerarchico
    entries.sort((a, b) => {
        // 1. Punti torneo
        if (b.points !== a.points) return b.points - a.points;
        // 2. Ranking ELO attuale DB (Tie-breaker primario)
        const eloA = a.player.currentElo ?? 1500;
        const eloB = b.player.currentElo ?? 1500;
        if (eloB !== eloA) return eloB - eloA;
        // 3. Differenza game
        if (b.gameDifference !== a.gameDifference) return b.gameDifference - a.gameDifference;
        // 4. Game vinti
        if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
        // 5. Determinismo assoluto su ID
        return a.player.id.localeCompare(b.player.id);
    });

    // Assegna il rank 1..N
    entries.forEach((e, idx) => {
        e.rank = idx + 1;
    });

    return entries;
}

/**
 * Segmenta i giocatori ordinati per merito in blocchi da 4 per ciascun campo.
 * Court 1 = Top (posizioni 1..4)
 * Court 2 = Mid (posizioni 5..8)
 * Court 3 = Flop (posizioni 9..12) ...
 */
export function segmentCourts(sortedPlayers: Player[]): Player[][] {
    const courts: Player[][] = [];
    const totalCourts = Math.floor(sortedPlayers.length / 4);

    for (let c = 0; c < totalCourts; c++) {
        courts.push(sortedPlayers.slice(c * 4, (c + 1) * 4));
    }
    return courts;
}

/**
 * Calcola quante volte ciascuna coppia ha giocato assieme nei turni precedenti del torneo corrente.
 */
export function buildPartnerHistory(pastMatches: Match[]): Map<string, number> {
    const history = new Map<string, number>();

    pastMatches.forEach(m => {
        if (m.team1 && m.team1.length === 2 && m.team1[0] && m.team1[1]) {
            const k1 = pairKey(m.team1[0], m.team1[1]);
            history.set(k1, (history.get(k1) || 0) + 1);
        }
        if (m.team2 && m.team2.length === 2 && m.team2[0] && m.team2[1]) {
            const k2 = pairKey(m.team2[0], m.team2[1]);
            history.set(k2, (history.get(k2) || 0) + 1);
        }
    });

    return history;
}

export interface OptimizedCourtMatch {
    team1: [string, string];
    team2: [string, string];
    repetitionCost: number;
    combinationType: '1-4_vs_2-3' | '1-2_vs_3-4' | '1-3_vs_2-4';
}

/**
 * Ottimizza le coppie per i 4 giocatori di un campo [A, B, C, D] ordinati per merito provvisorio.
 * Le 3 combinazioni possibili:
 * - Comb 3: (A+D) vs (B+C) -> (1°+4°) vs (2°+3°) [Incrocio di merito classico & Fallback]
 * - Comb 1: (A+B) vs (C+D) -> (1°+2°) vs (3°+4°)
 * - Comb 2: (A+C) vs (B+D) -> (1°+3°) vs (2°+4°)
 */
export function optimizeCourtPairings(
    courtPlayers: Player[],
    partnerHistory: Map<string, number>
): OptimizedCourtMatch {
    if (courtPlayers.length !== 4) {
        throw new Error(`Il campo richiede esattamente 4 giocatori, ricevuti: ${courtPlayers.length}`);
    }

    const [A, B, C, D] = courtPlayers;

    // Comb 3: (A+D) vs (B+C) -> 1°+4° vs 2°+3° (Standard Fallback di merito)
    const cost3 = (partnerHistory.get(pairKey(A.id, D.id)) || 0) + (partnerHistory.get(pairKey(B.id, C.id)) || 0);

    // Comb 1: (A+B) vs (C+D) -> 1°+2° vs 3°+4°
    const cost1 = (partnerHistory.get(pairKey(A.id, B.id)) || 0) + (partnerHistory.get(pairKey(C.id, D.id)) || 0);

    // Comb 2: (A+C) vs (B+D) -> 1°+3° vs 2°+4°
    const cost2 = (partnerHistory.get(pairKey(A.id, C.id)) || 0) + (partnerHistory.get(pairKey(B.id, D.id)) || 0);

    const minCost = Math.min(cost3, cost1, cost2);

    // Se la combinazione classica (1+4 vs 2+3) ha il costo minimo (o è a pari merito col minimo), la preferiamo per bilanciamento
    if (cost3 === minCost) {
        return {
            team1: [A.id, D.id],
            team2: [B.id, C.id],
            repetitionCost: cost3,
            combinationType: '1-4_vs_2-3'
        };
    }

    // Altrimenti scegliamo quella con costo strettamente inferiore
    if (cost1 < cost2) {
        return {
            team1: [A.id, B.id],
            team2: [C.id, D.id],
            repetitionCost: cost1,
            combinationType: '1-2_vs_3-4'
        };
    } else {
        return {
            team1: [A.id, C.id],
            team2: [B.id, D.id],
            repetitionCost: cost2,
            combinationType: '1-3_vs_2-4'
        };
    }
}

/**
 * Genera i match del Round 1 per il torneo Messicano secondo la modalità di sorteggio prescelta.
 */
export function generateFirstRoundMexicanMatches(
    players: Player[],
    mode: MexicanDrawMode,
    tournamentDate: string,
    manualAssignments?: { courtNumber: number; players: [string, string, string, string] }[]
): Match[] {
    if (players.length < 8 || players.length % 4 !== 0) {
        throw new Error(`Partecipanti non validi per Messicano: devono essere multipli di 4 (minimo 8). Ricevuti: ${players.length}`);
    }

    const matches: Match[] = [];
    const date = tournamentDate || new Date().toISOString();

    if (mode === 'Manual' && manualAssignments && manualAssignments.length > 0) {
        manualAssignments.forEach(ma => {
            const [p1, p2, p3, p4] = ma.players;
            matches.push({
                id: `mexican-r1-c${ma.courtNumber}`,
                date,
                team1: [p1, p4],
                team2: [p2, p3],
                sets: [{ team1: 0, team2: 0 }],
                winner: null,
                phase: 'group',
                roundNumber: 1,
                courtNumber: ma.courtNumber
            });
        });
        return matches;
    }

    let arrangedPlayers = [...players];

    if (mode === 'Seeded') {
        // ELO decrescente: i migliori 4 al Campo 1, i successivi 4 al Campo 2, ecc.
        arrangedPlayers.sort((a, b) => (b.currentElo ?? 1500) - (a.currentElo ?? 1500));
    } else if (mode === 'Balanced') {
        // Distribuzione a serpente per bilanciare la forza media dei campi
        arrangedPlayers.sort((a, b) => (b.currentElo ?? 1500) - (a.currentElo ?? 1500));
        const numCourts = arrangedPlayers.length / 4;
        const courtP: Player[][] = Array.from({ length: numCourts }, () => []);

        arrangedPlayers.forEach((player, idx) => {
            const cycle = Math.floor(idx / numCourts);
            const rem = idx % numCourts;
            const cIdx = cycle % 2 === 1 ? numCourts - 1 - rem : rem;
            courtP[cIdx].push(player);
        });
        arrangedPlayers = courtP.flat();
    } else {
        // 'Normal': mescolamento casuale con algoritmo Fisher-Yates
        for (let i = arrangedPlayers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arrangedPlayers[i], arrangedPlayers[j]] = [arrangedPlayers[j], arrangedPlayers[i]];
        }
    }

    const courts = segmentCourts(arrangedPlayers);

    courts.forEach((courtP, cIdx) => {
        const courtNumber = cIdx + 1;
        const [A, B, C, D] = courtP;
        matches.push({
            id: `mexican-r1-c${courtNumber}`,
            date,
            team1: [A.id, D.id],
            team2: [B.id, C.id],
            sets: [{ team1: 0, team2: 0 }],
            winner: null,
            phase: 'group',
            roundNumber: 1,
            courtNumber
        });
    });

    return matches;
}

/**
 * Genera i match JIT (Just-In-Time) per il Round N+1:
 * 1. Calcola la graduatoria provvisoria sui match completati
 * 2. Segmenta i campi per merito (Top, Mid, Flop)
 * 3. Ottimizza le coppie anti-ripetizione su storico giornata
 */
export function generateNextMexicanRoundMatches(
    completedMatches: Match[],
    allPlayers: Player[],
    nextRoundNumber: number,
    tournamentDate: string,
    scoringType: 'games-diff' | 'points' = 'games-diff'
): Match[] {
    const standings = calculateMexicanStandings(completedMatches, allPlayers, scoringType);
    const sortedPlayers = standings.map(s => s.player);
    const courts = segmentCourts(sortedPlayers);
    const partnerHistory = buildPartnerHistory(completedMatches);
    const date = tournamentDate || new Date().toISOString();

    const nextMatches: Match[] = [];

    courts.forEach((courtPlayers, idx) => {
        const courtNumber = idx + 1;
        const pairing = optimizeCourtPairings(courtPlayers, partnerHistory);

        nextMatches.push({
            id: `mexican-r${nextRoundNumber}-c${courtNumber}`,
            date,
            team1: pairing.team1,
            team2: pairing.team2,
            sets: [{ team1: 0, team2: 0 }],
            winner: null,
            phase: 'group',
            roundNumber: nextRoundNumber,
            courtNumber
        });
    });

    return nextMatches;
}
