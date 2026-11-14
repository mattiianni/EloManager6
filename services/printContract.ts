/**
 * printContract.ts — CONTRATTO DI STAMPA (regole permanenti, vedi AGENTS.md § "Stampe PDF").
 *
 * REGOLA 1 · STILE CONGELATO
 *   Il foglio di stile di stampa è congelato. Il riferimento visivo è la stampa "Beat the Box":
 *   ogni stampa, esistente o nuova, usa le stesse primitive (getPrintStyles, formatScoreBoxes,
 *   renderPrintDateBadge, PDF_ICONS, .section-block, .section-title, .footer) e NON introduce
 *   varianti di font, colori, bordi, altezze riga o padding.
 *   Le impronte qui sotto falliscono in test se qualcuno modifica quegli stili.
 *   Si aggiornano SOLO su richiesta esplicita del proprietario del progetto (Mattia Ianniello).
 *
 * REGOLA 2 · INTERRUZIONI DI PAGINA
 *   a) L'unità indivisibile è la RIGA: una riga di tabella non viene mai tagliata a metà.
 *   b) Un GRUPPO PICCOLO resta unito: fino a MAX_KEEP_TOGETHER_ROWS righe (le partite di un turno,
 *      le partite di un box, una classifica di box). Se non entra, passa intero a pagina nuova.
 *   c) Un BLOCCO LUNGO (round robin di 12 partite, classifica di 20 giocatori) NON è indivisibile:
 *      scorre da una pagina all'altra spezzandosi solo tra una riga e l'altra. Niente pagine vuote.
 *   d) Il TITOLO di un blocco non resta mai solo a fondo pagina: segue le sue prime righe.
 *      L'intestazione di colonna della tabella viene ripetuta in cima alla pagina successiva.
 *   e) PROFILI GIOCATORE: ogni giocatore inizia sempre su una pagina nuova.
 *
 *   I punti a-d sono applicati in modo centralizzato da normalizePrintBlocks() su TUTTE le
 *   piattaforme, quindi valgono anche per le stampe future senza che il singolo printer debba
 *   fare nulla: un contenitore marcato "avoid-break" con troppe righe viene reso scorrevole.
 */

/** Numero massimo di righe (intestazione inclusa) che un contenitore può tenere unite. */
export const MAX_KEEP_TOGETHER_ROWS = 9;

/** Impronte congelate. NON aggiornare senza richiesta esplicita del proprietario. */
export const PRINT_STYLE_FINGERPRINTS = {
    baseStyles: '12ac4e4e',
    scoreBoxes: '32d1ecf0',
    dateBadge: 'de12d10f',
    beatTheBoxBlank: '3b932840',
} as const;

/** Impronta stabile di un testo CSS/HTML (FNV-1a a 32 bit, spazi normalizzati). */
export const fingerprint = (text: string): string => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    let hash = 0x811c9dc5;
    for (let i = 0; i < normalized.length; i++) {
        hash ^= normalized.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
};

/** Concatena il contenuto di tutti i tag <style> di un documento di stampa. */
export const extractStyleBlocks = (html: string): string => {
    let css = '';
    const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) css += '\n' + m[1];
    return css;
};

/**
 * Applica la Regola 2 al documento di stampa già montato (finestra desktop, radice iPad, iframe iPhone).
 * Ogni contenitore che chiede di restare unito ma contiene più di `maxRows` righe di tabella viene
 * reso scorrevole: si spezzerà solo tra una riga e l'altra (le righe restano indivisibili via CSS).
 * Restituisce il numero di contenitori resi scorrevoli.
 *
 * ATTENZIONE: la funzione è anche serializzata con toString() dentro la finestra di stampa desktop,
 * quindi deve restare autosufficiente (nessun riferimento a variabili o import esterni).
 */
export const normalizePrintBlocks = (root: ParentNode, maxRows: number = 9): number => {
    if (!root || typeof root.querySelectorAll !== 'function') return 0;
    let released = 0;
    const candidates = root.querySelectorAll(
        '.avoid-break, .keep-together, .section-block, [style*="break-inside"]',
    );
    for (let i = 0; i < candidates.length; i++) {
        const el = candidates[i] as HTMLElement;
        const tag = (el.tagName || '').toUpperCase();
        if (tag === 'TR' || tag === 'THEAD' || tag === 'TFOOT' || tag === 'TD' || tag === 'TH') continue;
        if (el.querySelectorAll('tr').length <= maxRows) continue;
        el.style.setProperty('break-inside', 'auto', 'important');
        el.style.setProperty('page-break-inside', 'auto', 'important');
        released++;
    }
    return released;
};

/** Sorgente JS da incorporare nella finestra di stampa desktop (stessa funzione, stesso comportamento). */
export const normalizePrintBlocksScript = `(${normalizePrintBlocks.toString()})(document, ${MAX_KEEP_TOGETHER_ROWS});`;
