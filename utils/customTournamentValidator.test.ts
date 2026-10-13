import { describe, it, expect } from 'vitest';
import { validateCustomFlow } from './customTournamentValidator.ts';

describe('validateCustomFlow', () => {
  it('dovrebbe segnalare errore se il flusso è vuoto', () => {
    const res = validateCustomFlow([], 'pairs', 4, 2);
    expect(res.isValid).toBe(false);
    expect(res.errors[0]).toContain('almeno un blocco');
  });

  it('dovrebbe vietare Americano con Coppie Fisse', () => {
    const res = validateCustomFlow(['americano', 'finali'], 'pairs', 4, 2);
    expect(res.isValid).toBe(false);
    expect(res.errors[0]).toContain('Americano');
  });

  it('dovrebbe vietare Girone Italiano e TorneOtto con Singoli', () => {
    const res = validateCustomFlow(['girone', 'finali'], 'singles', 8, 2);
    expect(res.isValid).toBe(false);
    expect(res.errors[0]).toContain('Girone Italiano');
  });

  it('dovrebbe vietare Quarti di finale se le coppie sono meno di 8', () => {
    const res = validateCustomFlow(['girone', 'quarti', 'semifinali', 'finali'], 'pairs', 6, 2);
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('almeno 8 coppie'))).toBe(true);
  });

  it('dovrebbe approvare Quarti di finale con 8 coppie', () => {
    const res = validateCustomFlow(['girone', 'quarti', 'semifinali', 'finali'], 'pairs', 8, 2);
    expect(res.isValid).toBe(true);
    expect(res.errors.length).toBe(0);
  });

  it('dovrebbe validare il blocco box a coppie solo con 3 o 4 coppie per campo (rifiuta 5 coppie per campo)', () => {
    // 10 coppie su 2 campi = 5 coppie a campo -> vietato
    const res = validateCustomFlow(['box', 'finali'], 'pairs', 10, 2);
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('3 o 4 coppie'))).toBe(true);

    // 8 coppie su 2 campi = 4 coppie a campo -> valido
    const validRes = validateCustomFlow(['box', 'finali'], 'pairs', 8, 2);
    expect(validRes.isValid).toBe(true);
  });

  it('dovrebbe validare il box singolo con 4 o 5 giocatori per campo (e rifiutare fuori range)', () => {
    // 2 campi: supporta da 8 (4+4) a 10 (5+5)
    expect(validateCustomFlow(['box', 'finali'], 'singles', 8, 2).isValid).toBe(true);
    expect(validateCustomFlow(['box', 'finali'], 'singles', 9, 2).isValid).toBe(true);
    expect(validateCustomFlow(['box', 'finali'], 'singles', 10, 2).isValid).toBe(true);

    const resTooFew = validateCustomFlow(['box', 'finali'], 'singles', 7, 2);
    expect(resTooFew.isValid).toBe(false);
    expect(resTooFew.errors.some(e => e.includes('supporta tra 8 e 10'))).toBe(true);

    const resTooMany = validateCustomFlow(['box', 'finali'], 'singles', 11, 2);
    expect(resTooMany.isValid).toBe(false);
    expect(resTooMany.errors.some(e => e.includes('supporta tra 8 e 10'))).toBe(true);
  });

  it('dovrebbe validare Americano con almeno 6 giocatori', () => {
    const res5 = validateCustomFlow(['americano', 'finali'], 'singles', 5, 2);
    expect(res5.isValid).toBe(false);
    expect(res5.errors.some(e => e.includes('almeno 6 giocatori'))).toBe(true);

    const res6 = validateCustomFlow(['americano', 'finali'], 'singles', 6, 2);
    expect(res6.isValid).toBe(true);

    const res7 = validateCustomFlow(['americano', 'finali'], 'singles', 7, 2);
    expect(res7.isValid).toBe(true);
  });

  it('dovrebbe richiedere almeno 4 coppie per il Girone Italiano', () => {
    const res3 = validateCustomFlow(['girone', 'finali'], 'pairs', 3, 2);
    expect(res3.isValid).toBe(false);
    expect(res3.errors.some(e => e.includes('almeno 4 coppie'))).toBe(true);

    const res4 = validateCustomFlow(['girone', 'finali'], 'pairs', 4, 2);
    expect(res4.isValid).toBe(true);

    const res5 = validateCustomFlow(['girone', 'finali'], 'pairs', 5, 2);
    expect(res5.isValid).toBe(true);
  });

  it('dovrebbe consentire per TorneOtto solo esattamente 4 coppie', () => {
    expect(validateCustomFlow(['torneotto', 'finali'], 'pairs', 4, 2).isValid).toBe(true);
    const res5 = validateCustomFlow(['torneotto', 'finali'], 'pairs', 5, 2);
    expect(res5.isValid).toBe(false);
    expect(res5.errors.some(e => e.includes('esattamente 4 coppie'))).toBe(true);
  });

  it('dovrebbe segnalare errore se le Semifinali sono posizionate dopo le Finali', () => {
    const res = validateCustomFlow(['box', 'finali', 'semifinali'], 'pairs', 6, 2);
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('Semifinali devono essere posizionate prima delle Finali'))).toBe(true);
  });
});
