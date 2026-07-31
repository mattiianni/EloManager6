import { describe, expect, it } from 'vitest';
import type { Match } from '../types.ts';
import {
    MANROPE_PRINT_STYLESHEET,
    escapeHtml,
    formatScoreBoxes,
    getPrintStyles,
    partitionMatchesByPhase,
    printableTeamName,
    waitForPrintFontsScript,
} from './printService.ts';

const match = (id: string, phase?: string): Match => ({
    id,
    date: '2026-07-31T10:00:00.000Z',
    team1: ['a', 'b'],
    team2: ['c', 'd'],
    sets: [{ team1: 0, team2: 0 }],
    winner: null,
    ...(phase ? { phase } : {}),
} as Match);

describe('printService document helpers', () => {
    it('include realmente Manrope e prepara l’attesa dei pesi usati', () => {
        const styles = getPrintStyles(true);
        expect(styles).toContain(MANROPE_PRINT_STYLESHEET);
        expect(styles).toContain("font-family: 'Manrope'");
        expect(waitForPrintFontsScript).toContain("document.fonts.load('400 12px Manrope')");
        expect(waitForPrintFontsScript).toContain("document.fonts.load('700 12px Manrope')");
    });

    it('non rende indivisibili tutte le card e le sezioni lunghe', () => {
        const styles = getPrintStyles();
        expect(styles).not.toMatch(/\.section-block\s*,[\s\S]*break-inside:\s*avoid/);
        expect(styles).not.toContain('div[style*="border-radius"]');
        expect(styles).toContain('tr, thead, tfoot');
    });

    it('escapa testo utente e mostra Da definire per una squadra incompleta', () => {
        expect(escapeHtml('Club <A> & "B"')).toBe('Club &lt;A&gt; &amp; &quot;B&quot;');
        expect(printableTeamName([{ name: 'Mario', surname: 'Rossi' }, undefined])).toBe('Da definire');
        expect(printableTeamName([
            { name: 'Mario', surname: 'Rossi & Figli' },
            { name: 'Luca', surname: '<Verdi>' },
        ])).toBe('Mario Rossi &amp; Figli &amp; Luca &lt;Verdi&gt;');
    });

    it('stampa caselle vuote, non 0-0, per risultati non inseriti', () => {
        const html = formatScoreBoxes([{ team1: 0, team2: 0 }], false);
        expect(html).not.toContain('0-0');
        expect(html).toContain('&nbsp;');
    });

    it('usa la fase esplicita anche se le righe non sono in ordine', () => {
        const matches = [
            match('final', 'final_1_2'),
            match('round-2', 'round_robin'),
            match('semi', 'semifinal'),
            match('round-1', 'round_robin'),
        ];
        const result = partitionMatchesByPhase(matches);
        expect(result.hasExplicitPhases).toBe(true);
        expect(result.regular.map(item => item.id)).toEqual(['round-2', 'round-1']);
        expect(result.semifinals.map(item => item.id)).toEqual(['semi']);
        expect(result.finals.map(item => item.id)).toEqual(['final']);
    });
});
