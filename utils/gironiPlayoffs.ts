export type GironiPlayoffType = 'semifinals' | 'quarterfinals';

export interface GironiStandingLike<TPair = [unknown, unknown]> {
    pair: TPair;
    punti: number;
    gamesWon: number;
    gamesLost: number;
    matchesPlayed?: number;
}

export interface GironiQualifier<TEntry extends GironiStandingLike = GironiStandingLike> {
    entry: TEntry;
    groupIndex: number; // 0 for Girone A, 1 for Girone B, 2 for Girone C, etc.
    groupRank: number;  // 1 for 1st in group, 2 for 2nd in group, etc.
}

export const normalizedCompare = <TEntry extends GironiStandingLike>(
    a: GironiQualifier<TEntry>,
    b: GironiQualifier<TEntry>
): number => {
    const aMatches = Math.max(1, a.entry.matchesPlayed || 0);
    const bMatches = Math.max(1, b.entry.matchesPlayed || 0);
    const pointsDiff = (b.entry.punti / bMatches) - (a.entry.punti / aMatches);
    if (pointsDiff !== 0) return pointsDiff;
    const gameDiff = ((b.entry.gamesWon - b.entry.gamesLost) / bMatches)
        - ((a.entry.gamesWon - a.entry.gamesLost) / aMatches);
    if (gameDiff !== 0) return gameDiff;
    return (b.entry.gamesWon / bMatches) - (a.entry.gamesWon / aMatches);
};

export const selectGironiQualifiers = <TEntry extends GironiStandingLike>(
    standings: TEntry[][],
    playoffType: GironiPlayoffType,
): GironiQualifier<TEntry>[] => {
    const numGroups = standings.length;
    const target = playoffType === 'quarterfinals' ? 8 : 4;
    if (standings.flat().length < target) return [];

    // ==========================================
    // FASE 1: SEMIFINALI (4 qualificate)
    // ==========================================
    if (playoffType === 'semifinals') {
        if (numGroups === 2) {
            // 2 Gironi: passano le prime 2 di ogni girone (1°A, 2°A, 1°B, 2°B)
            const qualifiers: GironiQualifier<TEntry>[] = [];
            standings.forEach((group, groupIndex) => {
                group.slice(0, 2).forEach((entry, rankIndex) => {
                    qualifiers.push({
                        entry,
                        groupIndex,
                        groupRank: rankIndex + 1,
                    });
                });
            });
            return qualifiers;
        }

        if (numGroups === 3) {
            // 3 Gironi: passano le 3 prime + la migliore seconda (wildcard)
            const firsts: GironiQualifier<TEntry>[] = standings.map((group, groupIndex) => ({
                entry: group[0],
                groupIndex,
                groupRank: 1,
            })).filter(q => Boolean(q.entry));

            const seconds: GironiQualifier<TEntry>[] = standings.map((group, groupIndex) => ({
                entry: group[1],
                groupIndex,
                groupRank: 2,
            })).filter(q => Boolean(q.entry)).sort(normalizedCompare);

            const bestSecond = seconds.slice(0, 1);
            return [...firsts, ...bestSecond];
        }

        if (numGroups >= 4) {
            // 4+ Gironi: passano le 4 migliori prime classificate
            const firsts: GironiQualifier<TEntry>[] = standings.map((group, groupIndex) => ({
                entry: group[0],
                groupIndex,
                groupRank: 1,
            })).filter(q => Boolean(q.entry)).sort(normalizedCompare);

            return firsts.slice(0, 4);
        }
    }

    // ==========================================
    // FASE 2: QUARTI DI FINALE (8 qualificate)
    // ==========================================
    if (playoffType === 'quarterfinals') {
        if (numGroups === 2) {
            // 2 Gironi: passano le prime 4 di ciascun girone (4 da A, 4 da B)
            const qualifiers: GironiQualifier<TEntry>[] = [];
            standings.forEach((group, groupIndex) => {
                group.slice(0, 4).forEach((entry, rankIndex) => {
                    qualifiers.push({
                        entry,
                        groupIndex,
                        groupRank: rankIndex + 1,
                    });
                });
            });
            return qualifiers;
        }

        if (numGroups === 3) {
            // 3 Gironi: passano 3 prime + 3 seconde + 2 migliori terze
            const firsts: GironiQualifier<TEntry>[] = standings.map((group, groupIndex) => ({
                entry: group[0],
                groupIndex,
                groupRank: 1,
            })).filter(q => Boolean(q.entry));

            const seconds: GironiQualifier<TEntry>[] = standings.map((group, groupIndex) => ({
                entry: group[1],
                groupIndex,
                groupRank: 2,
            })).filter(q => Boolean(q.entry));

            const thirds: GironiQualifier<TEntry>[] = standings.map((group, groupIndex) => ({
                entry: group[2],
                groupIndex,
                groupRank: 3,
            })).filter(q => Boolean(q.entry)).sort(normalizedCompare);

            return [...firsts, ...seconds, ...thirds.slice(0, 2)];
        }

        if (numGroups >= 4) {
            // 4 Gironi: passano le prime 2 di ciascuno dei 4 gironi
            const qualifiers: GironiQualifier<TEntry>[] = [];
            standings.slice(0, 4).forEach((group, groupIndex) => {
                group.slice(0, 2).forEach((entry, rankIndex) => {
                    qualifiers.push({
                        entry,
                        groupIndex,
                        groupRank: rankIndex + 1,
                    });
                });
            });
            return qualifiers;
        }
    }

    return [];
};

export const buildSemifinalPairings = <TEntry extends GironiStandingLike>(
    qualifiers: GironiQualifier<TEntry>[],
): Array<[GironiQualifier<TEntry>, GironiQualifier<TEntry>]> => {
    if (qualifiers.length !== 4) return [];

    const groupMap = new Map<number, GironiQualifier<TEntry>[]>();
    qualifiers.forEach(q => {
        if (!groupMap.has(q.groupIndex)) groupMap.set(q.groupIndex, []);
        groupMap.get(q.groupIndex)!.push(q);
    });

    // CASO 1: 2 Gironi (Girone A e Girone B con 1° e 2°)
    if (groupMap.size === 2) {
        const groupA = (groupMap.get(0) || []).sort((a, b) => a.groupRank - b.groupRank);
        const groupB = (groupMap.get(1) || []).sort((a, b) => a.groupRank - b.groupRank);
        if (groupA.length >= 2 && groupB.length >= 2) {
            // Incrocio Classico: 1°A vs 2°B, 1°B vs 2°A
            return [
                [groupA[0], groupB[1]], // Semi 1: 1° Girone A vs 2° Girone B
                [groupB[0], groupA[1]], // Semi 2: 1° Girone B vs 2° Girone A
            ];
        }
    }

    // CASO 2: 3 Gironi (3 Prime + 1 Migliore Seconda)
    if (groupMap.size === 3) {
        const firsts = qualifiers.filter(q => q.groupRank === 1).sort(normalizedCompare);
        const wildcard = qualifiers.find(q => q.groupRank === 2);

        if (firsts.length === 3 && wildcard) {
            // Se la wildcard proviene dal girone della 1ª prima, la accoppiamo con la 2ª prima per evitare rematch
            if (wildcard.groupIndex === firsts[0].groupIndex) {
                return [
                    [firsts[1], wildcard],
                    [firsts[0], firsts[2]],
                ];
            } else {
                return [
                    [firsts[0], wildcard],
                    [firsts[1], firsts[2]],
                ];
            }
        }
    }

    // CASO 3: 4 Gironi (4 Prime) o Fallback
    const firsts = [...qualifiers].sort(normalizedCompare);
    return [
        [firsts[0], firsts[3]],
        [firsts[1], firsts[2]],
    ];
};

export const buildQuarterfinalPairings = <TEntry extends GironiStandingLike>(
    qualifiers: GironiQualifier<TEntry>[],
): Array<[GironiQualifier<TEntry>, GironiQualifier<TEntry>]> => {
    if (qualifiers.length !== 8) return [];

    const groupMap = new Map<number, GironiQualifier<TEntry>[]>();
    qualifiers.forEach(q => {
        if (!groupMap.has(q.groupIndex)) groupMap.set(q.groupIndex, []);
        groupMap.get(q.groupIndex)!.push(q);
    });

    // CASO 1: 2 Gironi (4 qualificate per girone)
    if (groupMap.size === 2) {
        const groupA = (groupMap.get(0) || []).sort((a, b) => a.groupRank - b.groupRank);
        const groupB = (groupMap.get(1) || []).sort((a, b) => a.groupRank - b.groupRank);
        if (groupA.length >= 4 && groupB.length >= 4) {
            return [
                [groupA[0], groupB[3]], // Q1: 1°A vs 4°B
                [groupA[1], groupB[2]], // Q2: 2°A vs 3°B
                [groupB[0], groupA[3]], // Q3: 1°B vs 4°A
                [groupB[1], groupA[2]], // Q4: 2°B vs 3°A
            ];
        }
    }

    // CASO 2: 4 Gironi (2 qualificate per girone: 1° e 2°)
    if (groupMap.size === 4) {
        const g0 = (groupMap.get(0) || []).sort((a, b) => a.groupRank - b.groupRank);
        const g1 = (groupMap.get(1) || []).sort((a, b) => a.groupRank - b.groupRank);
        const g2 = (groupMap.get(2) || []).sort((a, b) => a.groupRank - b.groupRank);
        const g3 = (groupMap.get(3) || []).sort((a, b) => a.groupRank - b.groupRank);

        if (g0.length >= 2 && g1.length >= 2 && g2.length >= 2 && g3.length >= 2) {
            return [
                [g0[0], g1[1]], // Q1: 1°A vs 2°B
                [g2[0], g3[1]], // Q2: 1°C vs 2°D
                [g1[0], g0[1]], // Q3: 1°B vs 2°A
                [g3[0], g2[1]], // Q4: 1°D vs 2°C
            ];
        }
    }

    // CASO 3: 3 Gironi o Fallback a incrocio semi-guidato
    const seeded = [...qualifiers].sort((a, b) => {
        if (a.groupRank !== b.groupRank) return a.groupRank - b.groupRank;
        return normalizedCompare(a, b);
    });
    const available = [...seeded];
    const pairings: Array<[GironiQualifier<TEntry>, GironiQualifier<TEntry>]> = [];
    while (available.length > 0) {
        const top = available.shift()!;
        let opponentIndex = -1;
        for (let index = available.length - 1; index >= 0; index--) {
            if (available[index].groupIndex !== top.groupIndex) {
                opponentIndex = index;
                break;
            }
        }
        if (opponentIndex < 0) opponentIndex = available.length - 1;
        pairings.push([top, available.splice(opponentIndex, 1)[0]]);
    }
    return pairings;
};
