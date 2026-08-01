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
    groupIndex: number;
    groupRank: number;
}

const normalizedCompare = <TEntry extends GironiStandingLike>(a: GironiQualifier<TEntry>, b: GironiQualifier<TEntry>) => {
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
    const target = playoffType === 'quarterfinals' ? 8 : 4;
    if (standings.flat().length < target) return [];

    const directPerGroup = playoffType === 'quarterfinals'
        ? (standings.length === 2 ? 4 : 2)
        : 1;
    const direct = standings.flatMap((group, groupIndex) =>
        group.slice(0, directPerGroup).map((entry, rankIndex) => ({
            entry,
            groupIndex,
            groupRank: rankIndex + 1,
        })),
    );
    const selected = direct.slice(0, target);
    if (selected.length < target) {
        const wildcards = standings.flatMap((group, groupIndex) =>
            group.slice(directPerGroup).map((entry, rankIndex) => ({
                entry,
                groupIndex,
                groupRank: directPerGroup + rankIndex + 1,
            })),
        ).sort(normalizedCompare);
        selected.push(...wildcards.slice(0, target - selected.length));
    }
    return selected;
};

export const buildQuarterfinalPairings = <TEntry extends GironiStandingLike>(
    qualifiers: GironiQualifier<TEntry>[],
): Array<[GironiQualifier<TEntry>, GironiQualifier<TEntry>]> => {
    if (qualifiers.length !== 8) return [];
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

