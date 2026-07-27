import { Match, Player } from '../types.ts';

export interface BracketNode {
    id: string;
    round: number; // 0 = final, 1 = semifinal, 2 = quarter, etc.
    position: number;
    team1?: [Player, Player];
    team2?: [Player, Player];
    winner?: 'team1' | 'team2';
    match?: Match;
    isBye?: boolean;
}

export const generateTpraBracket = (pairs: [Player, Player][]): BracketNode[] => {
    // 1. Sort by combined ELO to assign seeds
    const sortedPairs = [...pairs].sort((a, b) => {
        const eloA = a[0].currentElo + a[1].currentElo;
        const eloB = b[0].currentElo + b[1].currentElo;
        return eloB - eloA;
    });

    const numPairs = sortedPairs.length;
    // Calculate nearest power of 2
    let bracketSize = 1;
    while (bracketSize < numPairs) {
        bracketSize *= 2;
    }

    const numByes = bracketSize - numPairs;
    
    // Seed placement logic (standard tennis bracket)
    // For 8: 1 vs 8, 4 vs 5, 3 vs 6, 2 vs 7
    // For simplicity, we can use a known standard array of positions or generate them.
    const seeds = generateSeedOrder(bracketSize);
    
    const firstRoundNodes: BracketNode[] = [];
    
    // Place pairs in the bracket according to seed order
    for (let i = 0; i < bracketSize / 2; i++) {
        const seed1 = seeds[i * 2];
        const seed2 = seeds[i * 2 + 1];
        
        const team1 = seed1 <= numPairs ? sortedPairs[seed1 - 1] : undefined;
        const team2 = seed2 <= numPairs ? sortedPairs[seed2 - 1] : undefined;
        
        const isBye = !team1 || !team2;
        
        firstRoundNodes.push({
            id: `r${Math.log2(bracketSize) - 1}_p${i}`,
            round: Math.log2(bracketSize) - 1,
            position: i,
            team1,
            team2,
            isBye,
            winner: isBye ? (team1 ? 'team1' : 'team2') : undefined
        });
    }

    return firstRoundNodes;
};

// Generates standard ATP seeding order where top seeds are placed in opposite halves/quarters
function generateSeedOrder(size: number): number[] {
    let order = [1, 2];
    while (order.length < size) {
        const nextOrder: number[] = [];
        const sum = order.length * 2 + 1;
        for (let i = 0; i < order.length; i += 2) {
            const first = order[i];
            const second = order[i + 1];
            nextOrder.push(first, sum - first);
            nextOrder.push(sum - second, second);
        }
        order = nextOrder;
    }
    return order;
}
