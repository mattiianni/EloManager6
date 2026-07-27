// utils/eloPlaytomicUtils.ts — condiviso frontend e backend

type EloRange = { eloMin: number; eloMax: number; ptMin: number; ptMax: number };

const RANGES: EloRange[] = [
    { eloMin: 0, eloMax: 1000, ptMin: 1.0, ptMax: 2.0 },
    { eloMin: 1000, eloMax: 1500, ptMin: 2.0, ptMax: 3.0 },
    { eloMin: 1500, eloMax: 2000, ptMin: 3.0, ptMax: 4.0 },
    { eloMin: 2000, eloMax: 2500, ptMin: 4.0, ptMax: 5.0 },
    { eloMin: 2500, eloMax: Infinity, ptMin: 5.0, ptMax: 6.0 },
];

// ELO -> Playtomic (interpolazione lineare per fascia)
export function eloToPlaytomic(elo: number): number {
    const range = RANGES.find(r => elo >= r.eloMin && elo < r.eloMax) ?? RANGES[RANGES.length - 1];
    const ratio = (elo - range.eloMin) / (range.eloMax - range.eloMin);
    const pt = range.ptMin + ratio * (range.ptMax - range.ptMin);
    return Math.min(6.0, Math.round(pt * 100) / 100);
}

// Playtomic -> ELO (interpolazione lineare inversa)
export function playtomicToElo(pt: number): number {
    const clamped = Math.max(1.0, Math.min(6.0, pt));
    const range = RANGES.find(r => clamped >= r.ptMin && clamped < r.ptMax) ?? RANGES[RANGES.length - 1];
    
    let elo;
    if (range.eloMax === Infinity || range.ptMax === Infinity) {
        const ratio = (clamped - range.ptMin) / (6.0 - range.ptMin);
        elo = range.eloMin + ratio * 500; // Arbitrary 500 step for the last range
    } else {
        const ratio = (clamped - range.ptMin) / (range.ptMax - range.ptMin);
        elo = range.eloMin + ratio * (range.eloMax - range.eloMin);
    }
    return Math.round(elo); // ELO sempre intero
}

export function playtomicLabel(pt: number): string {
    if (pt < 2) return 'Principiante';
    if (pt < 3) return 'Base';
    if (pt < 4) return 'Intermedio';
    if (pt < 5) return 'Avanzato';
    return 'Elite';
}

// Calcolo ELO dinamico reale di una partita (con aspettativa di vittoria basata sulla differenza ELO delle due coppie)
export function calculateMatchEloDelta(
    team1EloAvg: number,
    team2EloAvg: number,
    winner: 'team1' | 'team2' | 'draw',
    kFactor: number = 16
): { deltaTeam1: number; deltaTeam2: number; expectedTeam1: number; expectedTeam2: number } {
    const expectedTeam1 = 1 / (1 + Math.pow(10, (team2EloAvg - team1EloAvg) / 400));
    const expectedTeam2 = 1 - expectedTeam1;
    
    let score1 = 0.5;
    if (winner === 'team1') score1 = 1;
    if (winner === 'team2') score1 = 0;
    const score2 = 1 - score1;

    const deltaTeam1 = kFactor * (score1 - expectedTeam1);
    const deltaTeam2 = kFactor * (score2 - expectedTeam2);

    return { deltaTeam1, deltaTeam2, expectedTeam1, expectedTeam2 };
}
