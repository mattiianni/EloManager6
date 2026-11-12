import { Match, Player } from '../types.ts';

export interface PlayoffSlotChange {
    teamKey: 'team1' | 'team2';
    playerIndex: 0 | 1;
    newPlayerId: string;
}

/**
 * Extracts all currently assigned player IDs across all matches in a playoff phase.
 */
export function getAssignedPlayerIdsInPhase(matches: Array<Pick<Match, 'team1' | 'team2'>>): string[] {
    const ids: string[] = [];
    matches.forEach(m => {
        (m.team1 || []).forEach(id => {
            if (id) ids.push(id);
        });
        (m.team2 || []).forEach(id => {
            if (id) ids.push(id);
        });
    });
    return ids;
}

/**
 * Checks if a candidate player is disabled for selection in a specific slot.
 * A player is disabled if they are already assigned elsewhere in the phase,
 * unless they are already the player currently in that slot.
 */
export function isPlayerDisabledForSlot(
    candidateId: string,
    currentSlotPlayerId: string | undefined,
    assignedPlayerIdsInPhase: string[]
): boolean {
    if (!candidateId) return false;
    if (candidateId === currentSlotPlayerId) return false;
    return assignedPlayerIdsInPhase.includes(candidateId);
}

/**
 * Validates that all matches in a playoff phase have valid, non-empty, non-duplicated teams.
 */
export function validatePlayoffPhaseTeams(
    matches: Array<Pick<Match, 'team1' | 'team2'>>,
    isSingles = false
): { isValid: boolean; error?: string } {
    if (!matches || matches.length === 0) {
        return { isValid: false, error: 'Nessuna partita presente nella fase' };
    }

    const assignedIds: string[] = [];
    const expectedPerTeam = isSingles ? 1 : 2;

    for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        if (!m.team1 || m.team1.length < expectedPerTeam || m.team1.some(id => !id)) {
            return { isValid: false, error: `Seleziona tutti i giocatori della Squadra A nella Partita ${i + 1}` };
        }
        if (!m.team2 || m.team2.length < expectedPerTeam || m.team2.some(id => !id)) {
            return { isValid: false, error: `Seleziona tutti i giocatori della Squadra B nella Partita ${i + 1}` };
        }

        const matchPlayerIds = [...m.team1.slice(0, expectedPerTeam), ...m.team2.slice(0, expectedPerTeam)];
        for (const pid of matchPlayerIds) {
            if (assignedIds.includes(pid)) {
                return { isValid: false, error: `Il giocatore con ID ${pid} è assegnato più volte nella fase finale` };
            }
            assignedIds.push(pid);
        }
    }

    return { isValid: true };
}

/**
 * Immutably updates a player in a match's team.
 */
export function updateMatchPlayer<T extends Pick<Match, 'team1' | 'team2'>>(
    match: T,
    teamKey: 'team1' | 'team2',
    playerIndex: 0 | 1,
    newPlayerId: string
): T {
    const currentTeam = [...(match[teamKey] || ['', ''])] as [string, string];
    currentTeam[playerIndex] = newPlayerId;

    return {
        ...match,
        [teamKey]: currentTeam,
    };
}

/**
 * Variante comoda per le UI: restituisce il messaggio d'errore oppure `null` se la fase è valida.
 * (Evita l'errore di trattare l'oggetto `{ isValid }` come se fosse un messaggio truthy.)
 */
export function getPlayoffPhaseTeamsError(
    matches: Array<Pick<Match, 'team1' | 'team2'>>,
    isSingles = false
): string | null {
    const result = validatePlayoffPhaseTeams(matches, isSingles);
    return result.isValid ? null : (result.error || 'Coppie non valide');
}
