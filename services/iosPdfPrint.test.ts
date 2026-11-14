import { describe, it, expect } from 'vitest';
import {
    parsePageSetup,
    adaptCssForCapture,
    computePageBreaks,
    headerForPageStart,
    groupPagesIntoBands,
    sanitizePdfFileName,
} from './iosPdfPrint';

describe('iosPdfPrint · parsePageSetup', () => {
    it('usa A4 verticale 12mm/10mm come default', () => {
        const s = parsePageSetup('');
        expect(s.landscape).toBe(false);
        expect([s.pageWidthMm, s.pageHeightMm]).toEqual([210, 297]);
        expect([s.marginTopMm, s.marginRightMm, s.marginBottomMm, s.marginLeftMm]).toEqual([12, 10, 12, 10]);
    });

    it('l\'ultima regola @page vince (cascata) e riconosce landscape', () => {
        const s = parsePageSetup('@page { size: A4; margin: 12mm 10mm; } @page { size: A4 landscape; margin: 7.5mm; }');
        expect(s.landscape).toBe(true);
        expect([s.pageWidthMm, s.pageHeightMm]).toEqual([297, 210]);
        expect([s.marginTopMm, s.marginRightMm, s.marginBottomMm, s.marginLeftMm]).toEqual([7.5, 7.5, 7.5, 7.5]);
    });

    it('accetta margin: 0 e unità diverse dai mm', () => {
        expect(parsePageSetup('@page { margin: 0; }').marginLeftMm).toBe(0);
        expect(parsePageSetup('@page { margin: 1cm 0.5in; }').marginTopMm).toBe(10);
        expect(parsePageSetup('@page { margin: 1cm 0.5in; }').marginRightMm).toBeCloseTo(12.7, 5);
    });
});

describe('iosPdfPrint · adaptCssForCapture', () => {
    it('attiva @media print e scarta @media screen', () => {
        const css = 'a{color:red} @media screen { body{background:#f2f2f7} } @media print { body{color:#000} .x{margin:0} } b{top:0}';
        const out = adaptCssForCapture(css);
        expect(out).toContain('@media all { body{color:#000} .x{margin:0} }');
        expect(out).not.toContain('#f2f2f7');
        expect(out).toContain('a{color:red}');
        expect(out).toContain('b{top:0}');
    });

    it('lascia intatte le media query che non riguardano print/screen', () => {
        expect(adaptCssForCapture('@media (min-width: 10px) { a{b:c} }')).toContain('@media (min-width: 10px) { a{b:c} }');
    });
});

describe('iosPdfPrint · computePageBreaks', () => {
    it('documento più corto di una pagina → una sola pagina', () => {
        expect(computePageBreaks(500, 1000, [])).toEqual([0, 500]);
    });

    it('anticipa il taglio all\'inizio di una riga che verrebbe spezzata', () => {
        const rows = Array.from({ length: 100 }, (_, i) => ({ top: i * 24, bottom: i * 24 + 24 }));
        const cuts = computePageBreaks(2400, 1000, rows);
        expect(cuts).toEqual([0, 984, 1968, 2400]);
    });

    it('rispetta le interruzioni forzate (una scheda per pagina)', () => {
        expect(computePageBreaks(900, 1000, [], [300, 600])).toEqual([0, 300, 600, 900]);
    });

    it('ignora i riquadri più alti di una pagina invece di lasciare pagine vuote', () => {
        const cuts = computePageBreaks(3000, 1000, [{ top: 100, bottom: 2900 }]);
        expect(cuts).toEqual([0, 1000, 2000, 3000]);
    });

    it('una catena di break-after: avoid non trascina il taglio a inizio pagina', () => {
        const rows = Array.from({ length: 100 }, (_, i) => ({ top: i * 24, bottom: i * 24 + 24 }));
        const chain = rows.slice(0, -1).map(r => ({ top: r.top, bottom: r.bottom + 24, soft: true }));
        const cuts = computePageBreaks(2400, 1000, [...rows, ...chain]);
        expect(cuts.length).toBe(4);
        cuts.slice(1, -1).forEach((cut, i) => expect(cut - cuts[i]).toBeGreaterThanOrEqual(500));
    });

    it('il titolo di sezione non resta orfano a fondo pagina', () => {
        const title = { top: 960, bottom: 990 };
        const keepWithNext = { top: 960, bottom: 1046, soft: true };
        expect(computePageBreaks(1500, 1000, [title, keepWithNext])[1]).toBe(960);
    });
});

describe('iosPdfPrint · intestazione di tabella ripetuta', () => {
    const table = { top: 100, bottom: 3000, headTop: 100, headBottom: 124 };

    it('ripete l\'intestazione solo se la pagina riparte dentro il corpo della tabella', () => {
        expect(headerForPageStart(0, [table])).toBeUndefined();
        expect(headerForPageStart(100, [table])).toBeUndefined();
        expect(headerForPageStart(1000, [table])).toBe(table);
        expect(headerForPageStart(3000, [table])).toBeUndefined();
    });

    it('sceglie la tabella più interna', () => {
        const inner = { top: 900, bottom: 1500, headTop: 900, headBottom: 920 };
        expect(headerForPageStart(1000, [table, inner])).toBe(inner);
    });

    it('riserva in pagina lo spazio dell\'intestazione ripetuta e non taglia le righe', () => {
        const rows = Array.from({ length: 120 }, (_, i) => ({ top: 124 + i * 24, bottom: 148 + i * 24 }));
        const cuts = computePageBreaks(3100, 1000, rows, [], [table]);
        cuts.slice(1, -1).forEach(cut => expect((cut - 124) % 24).toBe(0));
        for (let i = 1; i < cuts.length - 1; i++) {
            const used = cuts[i + 1] - cuts[i] + (headerForPageStart(cuts[i], [table]) ? 24 : 0);
            expect(used).toBeLessThanOrEqual(1000);
        }
    });
});

describe('iosPdfPrint · groupPagesIntoBands', () => {
    it('nessuna banda supera il tetto di pixel del canvas iOS', () => {
        const cuts = Array.from({ length: 31 }, (_, i) => i * 1032);
        for (const scale of [2, 3]) {
            const bands = groupPagesIntoBands(cuts, 718, scale);
            expect(bands.reduce((n, b) => n + b.pages.length, 0)).toBe(30);
            bands.forEach(b => expect((b.end - b.start) * scale * 718 * scale).toBeLessThanOrEqual(16_777_216));
        }
    });
});

describe('iosPdfPrint · sanitizePdfFileName', () => {
    it('produce un nome file sicuro', () => {
        expect(sanitizePdfFileName('Mexicano, Riepilogo Torneo, 13/11/2026')).toBe('Mexicano_Riepilogo_Torneo_13_11_2026');
        expect(sanitizePdfFileName('')).toBe('Stampa');
    });
});
