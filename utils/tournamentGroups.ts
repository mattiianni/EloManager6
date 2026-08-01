import { Match } from '../types.ts';

const teamKey = (team: [string, string]) => [...team].sort().join('|');
const matchesForTeamCount = (teamCount: number) => teamCount * (teamCount - 1) / 2;

/**
 * Prima separa i gironi, poi lascia a ogni consumer il raggruppamento per turno.
 * I nuovi tornei usano groupNumber. Il fallback legacy usa l'ordine originale
 * di creazione, nel quale i calendari venivano salvati girone per girone.
 */
export const separateTournamentGroups = (matches: Match[], numberOfGroups: number): Match[][] => {
    const regularMatches = matches.filter(match => !match.phase || match.phase === 'group' || match.phase === 'ordinary');
    const explicitGroups = new Map<number, Match[]>();
    regularMatches.forEach(match => {
        if (!match.groupNumber || match.groupNumber < 1) return;
        const group = explicitGroups.get(match.groupNumber) || [];
        group.push(match);
        explicitGroups.set(match.groupNumber, group);
    });
    if (explicitGroups.size > 0 && regularMatches.every(match => !!match.groupNumber)) {
        return [...explicitGroups.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, group]) => group);
    }

    // Dati legacy: ogni girone è una componente indipendente perché una squadra
    // incontra soltanto squadre appartenenti allo stesso girone.
    const parent = new Map<string, string>();
    const find = (key: string): string => {
        if (!parent.has(key)) parent.set(key, key);
        const current = parent.get(key)!;
        if (current === key) return key;
        const root = find(current);
        parent.set(key, root);
        return root;
    };
    regularMatches.forEach(match => {
        const first = teamKey(match.team1);
        const second = teamKey(match.team2);
        const firstRoot = find(first);
        const secondRoot = find(second);
        if (firstRoot !== secondRoot) parent.set(secondRoot, firstRoot);
    });
    const connectedGroups = new Map<string, Match[]>();
    regularMatches.forEach(match => {
        const root = find(teamKey(match.team1));
        const group = connectedGroups.get(root) || [];
        group.push(match);
        connectedGroups.set(root, group);
    });
    const discoveredGroups = [...connectedGroups.values()];
    const requestedGroupCount = Number(numberOfGroups) || 0;
    if (discoveredGroups.length > 1 && (!requestedGroupCount || discoveredGroups.length === requestedGroupCount)) {
        return discoveredGroups;
    }

    const groupCount = Math.max(1, requestedGroupCount || discoveredGroups.length || 1);
    if (groupCount === 1) return [regularMatches];

    const uniqueTeams = new Set(regularMatches.flatMap(match => [teamKey(match.team1), teamKey(match.team2)]));
    const baseSize = Math.floor(uniqueTeams.size / groupCount);
    const largerGroups = uniqueTeams.size % groupCount;
    const expectedGroupSizes = Array.from(
        { length: groupCount },
        (_, index) => baseSize + (index < largerGroups ? 1 : 0),
    );
    const ordered = [...regularMatches].sort((a, b) =>
        String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || a.id.localeCompare(b.id)
    );
    const groups: Match[][] = [];
    let cursor = 0;
    expectedGroupSizes.forEach(size => {
        const count = matchesForTeamCount(size);
        groups.push(ordered.slice(cursor, cursor + count));
        cursor += count;
    });

    // Non inventare assegnazioni quando i dati legacy non bastano.
    if (cursor !== ordered.length || groups.some((group, index) => {
        const teams = new Set(group.flatMap(match => [teamKey(match.team1), teamKey(match.team2)]));
        return teams.size !== expectedGroupSizes[index];
    })) {
        // Non nascondere tutto il calendario se un vecchio record è ambiguo.
        return discoveredGroups.length > 1 ? discoveredGroups : [regularMatches];
    }

    return groups;
};

export const expectedRoundRobinMatches = (teamCount: number, homeAway = false): number =>
    matchesForTeamCount(teamCount) * (homeAway ? 2 : 1);
