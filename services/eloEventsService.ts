import { EloHistoryEntry, Match, Tournament, TeamTournamentMatchday } from '../types.ts';

export interface EloVariationEvent {
    key: string; // Unique grouping key
    date: string; // ISO date of the day (YYYY-MM-DD or date string)
    delta: number; // Sum of deltas for the day/event
    parentTournamentName: string | null; // Parent tournament series name
    dayLabel: string; // Specific giornata name/label
    isTeamTournament: boolean;
    playerId: string;
    sourceEvents: Array<{ id: string; type: EloHistoryEntry['type'] }>;
}

/** Somma la variazione ELO usando il collegamento autorevole all'evento. */
export function sumPlayerEventEloDelta(
    playerId: string,
    eventId: string,
    eloHistory: EloHistoryEntry[],
    relatedEventIds: string[] = []
): number {
    const validEventIds = new Set([eventId, ...relatedEventIds]);
    return eloHistory
        .filter(entry => entry.playerId === playerId && validEventIds.has(entry.eventId))
        .reduce((sum, entry) => sum + entry.delta, 0);
}

/**
 * Format a date object to it-IT locale (dd/mm/yyyy)
 */
export function formatDateIt(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/**
 * Resolves the parent tournament name and day label for an ELO history entry.
 */
export function resolveEventContext(
    entry: EloHistoryEntry,
    matches: Match[],
    tournaments: Tournament[],
    teamMatchdays: TeamTournamentMatchday[] = []
): { parentTournamentName: string | null; dayLabel: string; dateOfDay: string; isTeamTournament: boolean } {
    let parentTournamentName: string | null = null;
    let dayLabel = '';
    let dateOfDay = entry.date;
    let isTeamTournament = false;

    if (entry.type === 'manual') {
        dayLabel = 'Aggiornamento Manuale';
    } else if (entry.type === 'team_tournament_matchday') {
        isTeamTournament = true;
        dayLabel = 'Giornata';
        
        // Try to find the matchday in the teamMatchdays array
        const matchday = teamMatchdays.find(md => md.id === entry.eventId);
        if (matchday) {
            const rootTourn = tournaments.find(t => t.id === matchday.rootTournamentId);
            parentTournamentName = rootTourn ? rootTourn.name : 'Torneo a Squadre';
            dayLabel = `Giornata ${matchday.roundNumber || ''}`.trim();
            dateOfDay = matchday.date;
        } else if (entry.sourceLabel) {
            // Fallback parsing from sourceLabel: "Giornata (Nome Torneo), date"
            const match = entry.sourceLabel.match(/Giornata \(([^)]+)\)/);
            if (match) {
                parentTournamentName = match[1];
            } else {
                parentTournamentName = entry.sourceLabel.replace(/^Giornata\s+/i, '');
            }
        } else {
            parentTournamentName = 'Torneo a Squadre';
        }
    } else if (entry.type === 'tournament') {
        const tournament = tournaments.find(t => t.id === entry.eventId);
        if (tournament) {
            const isSingleOrCoppie = tournament.type !== 'Torneo a Squadre';
            parentTournamentName = tournament.parentTournamentName || tournament.giornataName || (isSingleOrCoppie ? tournament.name : null);
            
            // Se giornataName coincide con il parentTournamentName o con il name del torneo, usiamo type come nome giornata
            let computedDay = tournament.giornataName || tournament.type;
            if (isSingleOrCoppie && tournament.giornataName && (tournament.giornataName === tournament.parentTournamentName || tournament.giornataName === tournament.name)) {
                computedDay = tournament.type;
            }
            dayLabel = computedDay;
            dateOfDay = tournament.date;
        } else {
            // La data non è un'identità: due tornei possono svolgersi nello stesso giorno.
            // Se l'ID autorevole non è risolvibile, non attribuire l'ELO a un torneo casuale.
            parentTournamentName = entry.sourceLabel || null;
            dayLabel = entry.sourceLabel || 'Evento non associato';
        }
    } else if (entry.type === 'match') {
        const match = matches.find(m => m.id === entry.eventId);
        if (match && match.tournamentId) {
            const tournament = tournaments.find(t => t.id === match.tournamentId);
            if (tournament) {
                const isSingleOrCoppie = tournament.type !== 'Torneo a Squadre';
                parentTournamentName = tournament.parentTournamentName || tournament.giornataName || (isSingleOrCoppie ? tournament.name : null);
                
                let computedDay = tournament.giornataName || tournament.type;
                if (isSingleOrCoppie && tournament.giornataName && (tournament.giornataName === tournament.parentTournamentName || tournament.giornataName === tournament.name)) {
                    computedDay = tournament.type;
                }
                dayLabel = computedDay;
                dateOfDay = tournament.date;
            } else {
                dayLabel = 'Giornata Torneo';
            }
        } else {
            dayLabel = 'Partita Amichevole';
        }
    } else {
        dayLabel = entry.sourceLabel || 'Evento ELO';
    }

    return {
        parentTournamentName,
        dayLabel,
        dateOfDay,
        isTeamTournament
    };
}

/**
 * Builds the aggregated ELO timeline for a player.
 * Sums deltas for events on the same day/tournament.
 */
export function buildPlayerEloTimeline(
    playerId: string,
    eloHistory: EloHistoryEntry[],
    matches: Match[],
    tournaments: Tournament[],
    teamMatchdays: TeamTournamentMatchday[] = [],
    scope: { parentTournamentName?: string | null } = {}
): EloVariationEvent[] {
    // 1. Get ONLY the entries for this player
    const playerEntries = eloHistory.filter(e => e.playerId === playerId);

    const groupedMap = new Map<string, EloVariationEvent>();

    playerEntries.forEach(entry => {
        // 2. Resolve event context
        const { parentTournamentName, dayLabel, dateOfDay, isTeamTournament } = resolveEventContext(
            entry,
            matches,
            tournaments,
            teamMatchdays
        );

        // Apply scoping/filtering if requested
        if (scope.parentTournamentName) {
            const normScope = scope.parentTournamentName.trim().toLowerCase();
            const matchesScope = 
                (parentTournamentName && parentTournamentName.trim().toLowerCase() === normScope) ||
                (dayLabel && dayLabel.trim().toLowerCase() === normScope);
            if (!matchesScope) {
                return;
            }
        }

        const dateKey = new Date(dateOfDay).toISOString().split('T')[0];
        
        // 3. Define unique grouping key: parentTournamentName (or type fallback) + normalized date
        let typePrefix = 'friendly';
        if (entry.type === 'manual') typePrefix = 'manual';
        else if (isTeamTournament) typePrefix = 'team';
        else if (parentTournamentName) typePrefix = parentTournamentName;

        const key = `${typePrefix}|${dateKey}`;

        if (!groupedMap.has(key)) {
            groupedMap.set(key, {
                key,
                date: dateOfDay,
                delta: 0,
                parentTournamentName,
                dayLabel,
                isTeamTournament,
                playerId,
                sourceEvents: []
            });
        }

        const group = groupedMap.get(key)!;
        group.delta += entry.delta;
        if (!group.sourceEvents.some(source => source.id === entry.eventId && source.type === entry.type)) {
            group.sourceEvents.push({ id: entry.eventId, type: entry.type });
        }
    });

    // 5. Sort by date descending
    return Array.from(groupedMap.values()).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
}

/**
 * Formats the event label according to target rules.
 */
export function formatLabel(event: EloVariationEvent, isGeneralView: boolean): string {
    if (event.isTeamTournament) {
        return `Giornata ${event.parentTournamentName || 'Torneo a Squadre'} del ${formatDateIt(event.date)}`;
    }
    if (event.parentTournamentName) {
        return isGeneralView
            ? `${event.parentTournamentName} · ${event.dayLabel}`
            : event.dayLabel;
    }
    if (event.dayLabel === 'Aggiornamento Manuale') {
        return 'Aggiornamento Manuale';
    }
    if (event.dayLabel && event.dayLabel !== 'Partita Amichevole') {
        return event.dayLabel;
    }
    return 'Partita Amichevole';
}
