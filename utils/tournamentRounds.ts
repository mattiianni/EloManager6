import { Match, TournamentType } from '../types.ts';

export interface NormalizedRoundMatch<TMatch extends Pick<Match, 'team1' | 'team2' | 'roundNumber'>> {
    match: TMatch;
    originalIndex: number;
    courtNumber: number;
}

export interface NormalizedTournamentRound<TMatch extends Pick<Match, 'team1' | 'team2' | 'roundNumber'>> {
    roundNumber: number;
    label: string;
    matches: NormalizedRoundMatch<TMatch>[];
    restingParticipantIds: string[];
}

interface NormalizeTournamentRoundsOptions {
    fields?: number;
    homeAway?: boolean;
    participantIds?: string[];
}

const defaultMatchesPerRound = (type: TournamentType, fields?: number): number => {
    if (type === TournamentType.TorneOtto) return 2;
    if (type === TournamentType.Americano || type === TournamentType.RoundRobinFinali) {
        return Math.max(1, fields || 2);
    }
    return 1;
};

const roundLabel = (
    type: TournamentType,
    roundNumber: number,
    totalRounds: number,
    homeAway: boolean,
): string => {
    if (type !== TournamentType.RoundRobinFinali) return `Turno ${roundNumber}`;
    if (homeAway && totalRounds > 1 && totalRounds % 2 === 0) {
        const legRounds = totalRounds / 2;
        return roundNumber <= legRounds
            ? `${roundNumber}ª Giornata di Andata`
            : `${roundNumber - legRounds}ª Giornata di Ritorno`;
    }
    return `Giornata ${roundNumber} di ${totalRounds}`;
};

export const normalizeTournamentRounds = <
    TMatch extends Pick<Match, 'team1' | 'team2' | 'roundNumber'> & Partial<Pick<Match, 'id' | 'date' | 'createdAt'>>,
>(
    matches: readonly TMatch[],
    type: TournamentType,
    options: NormalizeTournamentRoundsOptions = {},
): NormalizedTournamentRound<TMatch>[] => {
    const matchesPerRound = defaultMatchesPerRound(type, options.fields);
    const grouped = new Map<number, Array<{ match: TMatch; originalIndex: number }>>();

    matches.forEach((match, originalIndex) => {
        const roundNumber = match.roundNumber && match.roundNumber > 0
            ? match.roundNumber
            : Math.floor(originalIndex / matchesPerRound) + 1;
        if (!grouped.has(roundNumber)) grouped.set(roundNumber, []);
        grouped.get(roundNumber)!.push({ match, originalIndex });
    });

    const orderedGroups = Array.from(grouped.entries()).sort(([a], [b]) => a - b);
    const totalRounds = orderedGroups.length;
    const participantIds = Array.from(new Set(options.participantIds || []));

    return orderedGroups.map(([roundNumber, roundMatches]) => {
        const orderedMatches = [...roundMatches].sort((a, b) => {
            const dateComparison = String(a.match.createdAt || a.match.date || '').localeCompare(String(b.match.createdAt || b.match.date || ''));
            if (dateComparison !== 0) return dateComparison;
            const idComparison = String(a.match.id || '').localeCompare(String(b.match.id || ''));
            return idComparison !== 0 ? idComparison : a.originalIndex - b.originalIndex;
        });
        const activeIds = new Set(orderedMatches.flatMap(({ match }) => [...match.team1, ...match.team2]));

        return {
            roundNumber,
            label: roundLabel(type, roundNumber, totalRounds, !!options.homeAway),
            matches: orderedMatches.map(({ match, originalIndex }, index) => ({
                match,
                originalIndex,
                courtNumber: index + 1,
            })),
            restingParticipantIds: participantIds.filter(id => !activeIds.has(id)),
        };
    });
};
