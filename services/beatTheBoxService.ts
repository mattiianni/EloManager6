import { Player, Match, TournamentStandingEntry, SetScore } from '../types.ts';

/**
 * BEAT THE BOX SERVICE
 */

export interface BoxData {
    boxNumber: number;
    players: Player[];
    matches: Omit<Match, 'id' | 'tournamentId'>[];
}

export interface BoxStanding {
    boxNumber: number;
    standings: {
        player: Player;
        points: number;
        gamesWon: number;
        gamesLost: number;
        gameDifference: number;
        rank: number;
    }[];
}

export function distributePlayersIntoBoxes(pairs: [Player, Player][]): Player[][] {
    const numBoxes = pairs.length / 2;
    const boxes: Player[][] = Array(numBoxes).fill(null).map(() => []);
    
    for (let i = 0; i < numBoxes; i++) {
        const firstSeedPair = pairs[i];
        const lastSeedPair = pairs[pairs.length - 1 - i];
        boxes[i] = [...firstSeedPair, ...lastSeedPair];
    }
    
    return boxes;
}

export function createBoxMatches(boxPlayers: Player[], date: string): Omit<Match, 'id' | 'tournamentId'>[] {
    const [p1, p2, p3, p4] = boxPlayers;
    return [
        { date, team1: [p1.id, p2.id], team2: [p3.id, p4.id], sets: [], winner: null },
        { date, team1: [p1.id, p3.id], team2: [p2.id, p4.id], sets: [], winner: null },
        { date, team1: [p1.id, p4.id], team2: [p2.id, p3.id], sets: [], winner: null },
    ];
}

export function createAllBoxMatches(boxes: Player[][], date: string): BoxData[] {
    return boxes.map((boxPlayers, index) => ({
        boxNumber: index + 1,
        players: boxPlayers,
        matches: createBoxMatches(boxPlayers, date),
    }));
}

export function calculateBoxStandings(boxMatches: Match[], boxPlayers: Player[]): BoxStanding['standings'] {
    const playerStats = new Map<string, { player: Player; points: number; gamesWon: number; gamesLost: number; }>();
    
    boxPlayers.forEach(player => {
        playerStats.set(player.id, { player, points: 0, gamesWon: 0, gamesLost: 0 });
    });
    
    boxMatches.forEach(match => {
        if (!match.winner) return;
        const team1Games = match.sets.reduce((sum, set) => sum + set.team1, 0);
        const team2Games = match.sets.reduce((sum, set) => sum + set.team2, 0);
        
        match.team1.forEach(playerId => {
            const stats = playerStats.get(playerId);
            if (stats) {
                if (match.winner === 'team1') stats.points += 3;
                else if (match.winner === 'draw') stats.points += 1;
                stats.gamesWon += team1Games;
                stats.gamesLost += team2Games;
            }
        });
        
        match.team2.forEach(playerId => {
            const stats = playerStats.get(playerId);
            if (stats) {
                if (match.winner === 'team2') stats.points += 3;
                else if (match.winner === 'draw') stats.points += 1;
                stats.gamesWon += team2Games;
                stats.gamesLost += team1Games;
            }
        });
    });
    
    const standings = Array.from(playerStats.values())
        .map(stats => ({
            player: stats.player,
            points: stats.points,
            gamesWon: stats.gamesWon,
            gamesLost: stats.gamesLost,
            gameDifference: stats.gamesWon - stats.gamesLost,
            rank: 0,
        }))
        .sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            return b.gameDifference - a.gameDifference;
        });
    
    standings.forEach((standing, index) => {
        standing.rank = index + 1;
    });
    
    return standings;
}

export function groupMatchesByPlayerSets(matches: Match[]): { boxes: Map<number, Match[]>, phaseMatches: Match[] } {
    const quadGroups = new Map<string, Match[]>();

    matches.forEach(match => {
        const quadKey = [...match.team1, ...match.team2].sort().join(',');
        if (!quadGroups.has(quadKey)) {
            quadGroups.set(quadKey, []);
        }
        quadGroups.get(quadKey)!.push(match);
    });

    const boxes = new Map<number, Match[]>();
    const phaseMatches: Match[] = [];
    let boxNum = 1;

    quadGroups.forEach((groupMatches) => {
        const uniquePlayers = new Set(groupMatches.flatMap(m => [...m.team1, ...m.team2]));
        if (groupMatches.length >= 3 && uniquePlayers.size === 4) {
            boxes.set(boxNum++, groupMatches.slice(0, 3));
            if (groupMatches.length > 3) {
                phaseMatches.push(...groupMatches.slice(3));
            }
        } else {
            phaseMatches.push(...groupMatches);
        }
    });

    return { boxes, phaseMatches };
}

export function calculateAllBoxStandings(allMatches: Match[], boxesData: BoxData[]): BoxStanding[] {
    return boxesData.map((boxData, boxIdx) => {
        const boxPlayerIds = new Set(boxData.players.map(p => p.id));
        const boxMatches = allMatches.filter(m => {
            const matchPlayerIds = [...m.team1, ...m.team2];
            return matchPlayerIds.every(id => boxPlayerIds.has(id));
        });
        const standings = calculateBoxStandings(boxMatches, boxData.players);
        return { boxNumber: boxData.boxNumber, standings };
    });
}

// ==========================================
// 2 BOX (4 COPPIE)
// ==========================================
export function createFinalsFor2Boxes(boxStandings: BoxStanding[], date: string): Omit<Match, 'id' | 'tournamentId'>[] {
    const box1 = boxStandings[0].standings;
    const box2 = boxStandings[1].standings;
    
    return [
        {
            date,
            team1: [box1[0].player.id, box2[1].player.id],
            team2: [box2[0].player.id, box1[1].player.id],
            sets: [], winner: null,
        },
        {
            date,
            team1: [box1[2].player.id, box2[3].player.id],
            team2: [box2[2].player.id, box1[3].player.id],
            sets: [], winner: null,
        }
    ];
}

// ==========================================
// 3 BOX (6 COPPIE)
// ==========================================
export function createFinalsOnlyFor3Boxes(boxStandings: BoxStanding[], date: string): Omit<Match, 'id' | 'tournamentId'>[] {
    const getSafeId = (boxIdx: number, rankIdx: number) => {
        const p = boxStandings[boxIdx]?.standings[rankIdx]?.player;
        return p ? p.id : `dummy-${boxIdx}-${rankIdx}`;
    };

    const firsts = [0, 1, 2].map(i => ({ player: { id: getSafeId(i, 0) }, points: boxStandings[i]?.standings[0]?.points || 0, diff: boxStandings[i]?.standings[0]?.gameDifference || 0 }));
    const seconds = [0, 1, 2].map(i => ({ player: { id: getSafeId(i, 1) }, points: boxStandings[i]?.standings[1]?.points || 0, diff: boxStandings[i]?.standings[1]?.gameDifference || 0 }));
    const thirds = [0, 1, 2].map(i => ({ player: { id: getSafeId(i, 2) }, points: boxStandings[i]?.standings[2]?.points || 0, diff: boxStandings[i]?.standings[2]?.gameDifference || 0 }));
    const fourths = [0, 1, 2].map(i => ({ player: { id: getSafeId(i, 3) } }));

    seconds.sort((a, b) => (b.points !== a.points ? b.points - a.points : b.diff - a.diff));
    thirds.sort((a, b) => (b.points !== a.points ? b.points - a.points : b.diff - a.diff));
    
    const shuffledFirsts = [...firsts].sort(() => Math.random() - 0.5);
    
    return [
        {
            date,
            team1: [shuffledFirsts[0].player.id, seconds[0].player.id],
            team2: [shuffledFirsts[1].player.id, shuffledFirsts[2].player.id],
            sets: [], winner: null,
        },
        {
            date,
            team1: [seconds[1].player.id, thirds[2].player.id],
            team2: [seconds[2].player.id, thirds[0].player.id],
            sets: [], winner: null,
        },
        {
            date,
            team1: [fourths[0].player.id, thirds[1].player.id],
            team2: [fourths[1].player.id, fourths[2].player.id],
            sets: [], winner: null,
        }
    ];
}

export function createSemifinalsAndFinalsFor3Boxes(
    boxStandings: BoxStanding[],
    date: string,
    semifinalResults?: { sf1Winner: 'team1' | 'team2', sf2Winner: 'team1' | 'team2' }
): { semifinals: Omit<Match, 'id' | 'tournamentId'>[]; finals: Omit<Match, 'id' | 'tournamentId'>[] } {
    
    const getSafeId = (boxIdx: number, rankIdx: number) => {
        const p = boxStandings[boxIdx]?.standings[rankIdx]?.player;
        return p ? p.id : `dummy-${boxIdx}-${rankIdx}`;
    };

    // Semifinali
    const semifinals: Omit<Match, 'id' | 'tournamentId'>[] = [
        {
            date,
            team1: [getSafeId(0, 0), getSafeId(1, 1)],
            team2: [getSafeId(1, 0), getSafeId(2, 1)],
            sets: [], winner: null,
        },
        {
            date,
            team1: [getSafeId(2, 0), getSafeId(0, 1)],
            team2: [
                [0, 1, 2].map(i => ({ id: getSafeId(i, 2), points: boxStandings[i]?.standings[2]?.points || 0, diff: boxStandings[i]?.standings[2]?.gameDifference || 0 })).sort((a, b) => b.points - a.points || b.diff - a.diff)[0].id,
                [0, 1, 2].map(i => ({ id: getSafeId(i, 2), points: boxStandings[i]?.standings[2]?.points || 0, diff: boxStandings[i]?.standings[2]?.gameDifference || 0 })).sort((a, b) => b.points - a.points || b.diff - a.diff)[1].id
            ],
            sets: [], winner: null,
        }
    ];

    const finals: Omit<Match, 'id' | 'tournamentId'>[] = [];
    
    // Consolazione (incrociata per evitare compagni dello stesso box)
    const thirdsList = [0, 1, 2].map(i => ({ id: getSafeId(i, 2), boxIdx: i, points: boxStandings[i]?.standings[2]?.points || 0, diff: boxStandings[i]?.standings[2]?.gameDifference || 0 }));
    thirdsList.sort((a, b) => b.points - a.points || b.diff - a.diff);
    const worstThird = thirdsList[2];
    
    const fourths = [0, 1, 2].map(i => ({ id: getSafeId(i, 3), boxIdx: i }));
    const worstThirdBoxIdx = worstThird.boxIdx;
    
    const fourthSameBox = fourths.find(f => f.boxIdx === worstThirdBoxIdx) || fourths[0];
    const fourthsOtherBoxes = fourths.filter(f => f.boxIdx !== worstThirdBoxIdx);
    
    const randomIndex = Math.random() < 0.5 ? 0 : 1;
    const partnerForWorstThird = fourthsOtherBoxes[randomIndex] || fourthsOtherBoxes[0];
    const remainingFourth = fourthsOtherBoxes[1 - randomIndex] || fourthsOtherBoxes[0];
    
    const consolationTeam1 = [worstThird.id, partnerForWorstThird.id];
    const consolationTeam2 = [fourthSameBox.id, remainingFourth.id];

    if (!semifinalResults) {
        finals.push({
            date,
            team1: consolationTeam1,
            team2: consolationTeam2,
            sets: [], winner: null,
        });
    }

    if (semifinalResults) {
        const sf1 = semifinals[0];
        const sf2 = semifinals[1];
        
        finals.push({
            date,
            team1: semifinalResults.sf1Winner === 'team1' ? sf1.team1 : sf1.team2,
            team2: semifinalResults.sf2Winner === 'team1' ? sf2.team1 : sf2.team2,
            sets: [], winner: null,
        });
        
        finals.push({
            date,
            team1: semifinalResults.sf1Winner === 'team1' ? sf1.team2 : sf1.team1,
            team2: semifinalResults.sf2Winner === 'team1' ? sf2.team2 : sf2.team1,
            sets: [], winner: null,
        });

        finals.push({
            date,
            team1: consolationTeam1,
            team2: consolationTeam2,
            sets: [], winner: null,
        });
    }

    return { semifinals, finals };
}

// ==========================================
// 4+ BOX (8+ COPPIE)
// ==========================================
export function createFinalsOnlyFor4Boxes(boxStandings: BoxStanding[], date: string): Omit<Match, 'id' | 'tournamentId'>[] {
    const getSafePlayerId = (boxIdx: number, rankIdx: number) => {
        const p = boxStandings[boxIdx]?.standings[rankIdx]?.player;
        return p ? p.id : `dummy-${boxIdx}-${rankIdx}`;
    };

    const firsts = [0, 1, 2, 3].map(i => getSafePlayerId(i, 0));
    const seconds = [0, 1, 2, 3].map(i => getSafePlayerId(i, 1));
    const thirds = [0, 1, 2, 3].map(i => getSafePlayerId(i, 2));
    const fourths = [0, 1, 2, 3].map(i => getSafePlayerId(i, 3));
    
    return [
        {
            date,
            team1: [firsts[0], firsts[1]],
            team2: [firsts[2], firsts[3]],
            sets: [], winner: null,
        },
        {
            date,
            team1: [seconds[0], seconds[1]],
            team2: [seconds[2], seconds[3]],
            sets: [], winner: null,
        },
        {
            date,
            team1: [thirds[0], thirds[1]],
            team2: [thirds[2], thirds[3]],
            sets: [], winner: null,
        },
        {
            date,
            team1: [fourths[0], fourths[1]],
            team2: [fourths[2], fourths[3]],
            sets: [], winner: null,
        }
    ];
}

export function createSemifinalsAndFinalsFor4PlusBoxes(
    boxStandings: BoxStanding[],
    date: string,
    semifinalResults?: { sf1Winner: 'team1' | 'team2', sf2Winner: 'team1' | 'team2' }
): { semifinals: Omit<Match, 'id' | 'tournamentId'>[]; finals: Omit<Match, 'id' | 'tournamentId'>[] } {
    
    // Extraggo tutti i giocatori validi e li ordino per punti e differenza reti
    const allPlayersRanked = boxStandings.flatMap(b => b.standings).filter(s => s && s.player);
    allPlayersRanked.sort((a, b) => b.points - a.points || b.gameDifference - a.gameDifference);
    
    // Prendo i migliori 8 giocatori (4 coppie per le semifinali principali)
    const top8 = allPlayersRanked.slice(0, 8);
    
    // Prendo i successivi 8 (dal 9° al 16°) per eventuali semifinali di consolazione
    const next8 = allPlayersRanked.slice(8, 16);
    
    const getSafeId = (arr: typeof allPlayersRanked, index: number) => {
        return arr[index] ? arr[index].player.id : `dummy-${index}`;
    };

    const semifinals: Omit<Match, 'id' | 'tournamentId'>[] = [];
    
    // SF1: 1st & 8th vs 4th & 5th
    // SF2: 2nd & 7th vs 3rd & 6th
    semifinals.push({
        date,
        team1: [getSafeId(top8, 0), getSafeId(top8, 7)],
        team2: [getSafeId(top8, 3), getSafeId(top8, 4)],
        sets: [], winner: null,
    });
    
    semifinals.push({
        date,
        team1: [getSafeId(top8, 1), getSafeId(top8, 6)],
        team2: [getSafeId(top8, 2), getSafeId(top8, 5)],
        sets: [], winner: null,
    });
    
    const finals: Omit<Match, 'id' | 'tournamentId'>[] = [];
    
    if (semifinalResults) {
        const sf1 = semifinals[0];
        const sf2 = semifinals[1];
        
        // Final 1st/2nd place
        finals.push({
            date,
            team1: semifinalResults.sf1Winner === 'team1' ? sf1.team1 : sf1.team2,
            team2: semifinalResults.sf2Winner === 'team1' ? sf2.team1 : sf2.team2,
            sets: [], winner: null,
        });
        
        // Final 3rd/4th place
        finals.push({
            date,
            team1: semifinalResults.sf1Winner === 'team1' ? sf1.team2 : sf1.team1,
            team2: semifinalResults.sf2Winner === 'team1' ? sf2.team2 : sf2.team1,
            sets: [], winner: null,
        });

        // Partita Consolazione: uso il next8 per generare una finale di consolazione "secca"
        if (next8.length >= 4) {
             finals.push({
                 date,
                 team1: [getSafeId(next8, 0), getSafeId(next8, 3)],
                 team2: [getSafeId(next8, 1), getSafeId(next8, 2)],
                 sets: [], winner: null,
             });
        }
    }
    
    return { semifinals, finals };
}

// ==========================================
// MAIN ENTRY POINT
// ==========================================
export type PlayoffType = 'finals_only' | 'semifinals';

export function createFinalsMatches(
    numBoxes: number,
    boxStandings: BoxStanding[],
    date: string,
    semifinalResults?: { sf1Winner: 'team1' | 'team2', sf2Winner: 'team1' | 'team2' },
    playoffType: PlayoffType = 'finals_only'
): { semifinals?: Omit<Match, 'id' | 'tournamentId'>[]; finals: Omit<Match, 'id' | 'tournamentId'>[] } {
    
    if (numBoxes === 2) {
        return { finals: createFinalsFor2Boxes(boxStandings, date) };
    } 
    
    if (numBoxes === 3) {
        if (playoffType === 'semifinals') {
            return createSemifinalsAndFinalsFor3Boxes(boxStandings, date, semifinalResults);
        } else {
            return { finals: createFinalsOnlyFor3Boxes(boxStandings, date) };
        }
    } 
    
    if (numBoxes === 4 && playoffType === 'finals_only') {
        return { finals: createFinalsOnlyFor4Boxes(boxStandings, date) };
    }
    
    return createSemifinalsAndFinalsFor4PlusBoxes(boxStandings, date, semifinalResults);
}

export function isValidPairsCount(pairsCount: number): boolean {
    return pairsCount >= 4 && pairsCount % 2 === 0;
}

export function calculateNumBoxes(pairsCount: number): number {
    return pairsCount / 2;
}

export function sortPairsByElo(pairs: [Player, Player][]): [Player, Player][] {
    return [...pairs].sort((a, b) => {
        const eloA = (a[0].currentElo + a[1].currentElo) / 2;
        const eloB = (b[0].currentElo + b[1].currentElo) / 2;
        return eloB - eloA;
    });
}

export function createIndividualStandings(
    allPlayers: Player[],
    eloChanges: Map<string, number>
): Array<{ player: Player; eloChange: number; rank: number }> {
    return allPlayers
        .map(player => ({ player, eloChange: eloChanges.get(player.id) || 0, rank: 0 }))
        .sort((a, b) => b.eloChange - a.eloChange)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function getAllPlayersFromBoxes(boxes: Player[][]): Player[] {
    return boxes.flat();
}
