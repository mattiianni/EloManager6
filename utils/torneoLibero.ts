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
