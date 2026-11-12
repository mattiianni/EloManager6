/**
 * Dati obbligatori del Torneo Libero (nome, circolo, data).
 * Ritorna il messaggio d'errore del primo dato mancante, oppure `null` se è tutto compilato.
 */
export const getTorneoLiberoMissingField = (name: string, club: string, date: string): string | null => {
    if (!String(name ?? '').trim()) return 'Inserisci il nome del torneo libero.';
    if (!String(club ?? '').trim()) return 'Inserisci il nome del circolo.';
    if (!String(date ?? '').trim()) return 'Inserisci la data della giornata.';
    return null;
};

export interface LiberoMatchDraft {
    team1: string | null;
    team2: string | null;
    team1Player1: string | null;
    team1Player2: string | null;
    team2Player1: string | null;
    team2Player2: string | null;
    scores: Array<{ team1: number; team2: number }>;
}

type LiberoMode = 'fixed' | 'rotating';

/** Partita con tutte le squadre (Coppie Fisse) o tutti e 4 i giocatori (Coppie a Girare) scelti. */
export const isLiberoMatchComplete = (m: LiberoMatchDraft, mode: LiberoMode): boolean =>
    mode === 'fixed'
        ? !!(m.team1 && m.team2)
        : !!(m.team1Player1 && m.team1Player2 && m.team2Player1 && m.team2Player2);

/** Partita toccata dall'utente: almeno una squadra/un giocatore scelto o un punteggio inserito. */
export const isLiberoMatchTouched = (m: LiberoMatchDraft, mode: LiberoMode): boolean => {
    const hasSelection = mode === 'fixed'
        ? !!(m.team1 || m.team2)
        : !!(m.team1Player1 || m.team1Player2 || m.team2Player1 || m.team2Player2);
    const hasScore = (m.scores || []).some(s => (s.team1 || 0) > 0 || (s.team2 || 0) > 0);
    return hasSelection || hasScore;
};

/**
 * Numero (da 1) della prima partita toccata ma incompleta, oppure `null`.
 * Una partita con punteggio ma senza tutti i giocatori non deve essere scartata in silenzio.
 */
export const findIncompleteLiberoMatch = (matches: LiberoMatchDraft[], mode: LiberoMode): number | null => {
    const idx = matches.findIndex(m => isLiberoMatchTouched(m, mode) && !isLiberoMatchComplete(m, mode));
    return idx === -1 ? null : idx + 1;
};

/**
 * Esito dalla somma dei game (come fa il server): nessuna vittoria se i game sono pari.
 * `null` se nessun punteggio è stato inserito (0-0).
 */
export const getLiberoWinner = (scores: Array<{ team1: number; team2: number }>): 'team1' | 'team2' | 'draw' | null => {
    const t1 = (scores || []).reduce((sum, s) => sum + (s.team1 || 0), 0);
    const t2 = (scores || []).reduce((sum, s) => sum + (s.team2 || 0), 0);
    if (t1 === 0 && t2 === 0) return null;
    if (t1 > t2) return 'team1';
    if (t2 > t1) return 'team2';
    return 'draw';
};
