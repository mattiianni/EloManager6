/**
 * Normalizza il testo digitato in un campo punteggio: solo cifre, niente zeri iniziali
 * ("02" → 2), campo vuoto → 0.
 */
export const normalizeScoreInput = (raw: string): number => {
    const digits = String(raw ?? '').replace(/\D/g, '').slice(0, 2);
    if (!digits) return 0;
    return parseInt(digits, 10);
};

/**
 * Testo da mostrare nel campo: vuoto se la partita non è ancora stata inserita (0-0),
 * altrimenti il valore (anche 0, es. 6-0).
 */
export const scoreDisplayValue = (own: number, other: number): string =>
    (own || other) ? String(own) : '';
