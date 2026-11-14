import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    getPrintStyles,
    formatScoreBoxes,
    renderPrintDateBadge,
    printBeatTheBoxBlank,
    printPlayerProfiles,
    printRanking,
} from './printService.ts';
import {
    MAX_KEEP_TOGETHER_ROWS,
    PRINT_STYLE_FINGERPRINTS,
    fingerprint,
    extractStyleBlocks,
    normalizePrintBlocks,
    normalizePrintBlocksScript,
} from './printContract.ts';
import { Player, TournamentType } from '../types.ts';

/**
 * CONTRATTO DI STAMPA — vedi AGENTS.md § "Stampe PDF" e services/printContract.ts.
 * Se uno di questi test fallisce NON aggiornare l'impronta e NON indebolire il test: ripristina il codice.
 * Le impronte cambiano solo su richiesta esplicita del proprietario del progetto.
 */

const FROZEN = 'Stile di stampa congelato: modifica non autorizzata (AGENTS.md § Stampe PDF, Regola 1).';
const BREAKS = 'Regola sulle interruzioni di pagina violata (AGENTS.md § Stampe PDF, Regola 2).';

const players: Player[] = Array.from({ length: 8 }, (_, i) => ({
    id: `p${i + 1}`, name: `Nome${i + 1}`, surname: `Cognome${i + 1}`, currentElo: 1500, initialElo: 1500,
} as Player));
const getPlayer = (id: string) => players.find(p => p.id === id);

function capturePrintHtml(printFn: () => void): string {
    let captured = '';
    const mockDoc = { open: vi.fn(), write: vi.fn((html: string) => { captured = html; }), close: vi.fn() };
    const originalWindow = (globalThis as any).window;
    const originalDoc = (globalThis as any).document;
    (globalThis as any).window = {
        open: vi.fn().mockReturnValue({ document: mockDoc, focus: vi.fn(), close: vi.fn() }),
        navigator: { userAgent: 'Macintosh' },
    };
    (globalThis as any).document = mockDoc;
    try {
        printFn();
    } finally {
        if (originalWindow) (globalThis as any).window = originalWindow; else delete (globalThis as any).window;
        if (originalDoc) (globalThis as any).document = originalDoc; else delete (globalThis as any).document;
    }
    return captured;
}

const beatTheBoxBlankHtml = (name = 'Beat the Box') => capturePrintHtml(() => {
    printBeatTheBoxBlank(
        { name, club: 'Circolo Test', date: '2026-10-15', type: TournamentType.BeatTheBox },
        [1, 2].map(boxNumber => ({
            boxNumber,
            players: players.slice((boxNumber - 1) * 4, boxNumber * 4),
            matches: [{ date: '2026-10-15', team1: ['p1', 'p2'] as [string, string], team2: ['p3', 'p4'] as [string, string], sets: [], winner: null }],
        })),
        getPlayer,
        'semifinals',
    );
});

/** Elemento finto: basta ciò che normalizePrintBlocks legge e scrive. */
const fakeBlock = (tagName: string, rows: number) => {
    const style: Record<string, string> = {};
    return {
        tagName,
        style: { setProperty: (prop: string, value: string, priority?: string) => { style[prop] = `${value}${priority ? ' !' + priority : ''}`; } },
        querySelectorAll: (selector: string) => ({ length: selector === 'tr' ? rows : 0 }),
        applied: style,
    };
};
const fakeRoot = (blocks: ReturnType<typeof fakeBlock>[]) => ({ querySelectorAll: () => blocks }) as unknown as ParentNode;

describe('Contratto di stampa · Regola 1: stile congelato (riferimento: Beat the Box)', () => {
    it('getPrintStyles non è stato modificato', () => {
        expect(fingerprint(getPrintStyles(false)), FROZEN).toBe(PRINT_STYLE_FINGERPRINTS.baseStyles);
    });

    it('caselle punteggio non modificate', () => {
        const html = formatScoreBoxes([{ team1: 6, team2: 4 }], false) + formatScoreBoxes([], true);
        expect(fingerprint(html), FROZEN).toBe(PRINT_STYLE_FINGERPRINTS.scoreBoxes);
    });

    it('pillola data non modificata', () => {
        expect(fingerprint(renderPrintDateBadge('01.01.2026', 'Data:')), FROZEN).toBe(PRINT_STYLE_FINGERPRINTS.dateBadge);
    });

    it('foglio di stile della stampa Beat the Box non modificato e indipendente dai dati', () => {
        expect(fingerprint(extractStyleBlocks(beatTheBoxBlankHtml())), FROZEN).toBe(PRINT_STYLE_FINGERPRINTS.beatTheBoxBlank);
        expect(fingerprint(extractStyleBlocks(beatTheBoxBlankHtml('Altro torneo'))), FROZEN).toBe(PRINT_STYLE_FINGERPRINTS.beatTheBoxBlank);
    });
});

describe('Contratto di stampa · Regola 1: stampa Classifica', () => {
    const rankingHtml = (count: number) => capturePrintHtml(() => {
        printRanking(
            players.slice(0, count).map((p, i) => ({ ...p, rank: i + 1, matchesPlayed: 1, matchesWon: 1, gamesWon: 6, gamesLost: 3, winPercentage: 100, lastDelta: 1 })) as any,
            [], [], [],
        );
    });

    it('foglio di stile della Classifica non modificato e indipendente dai dati', () => {
        expect(fingerprint(extractStyleBlocks(rankingHtml(8))), FROZEN).toBe(PRINT_STYLE_FINGERPRINTS.rankingPrint);
        expect(fingerprint(extractStyleBlocks(rankingHtml(3))), FROZEN).toBe(PRINT_STYLE_FINGERPRINTS.rankingPrint);
    });

    it('la medaglia di posizione non va mai a capo ("1" sopra, "°" sotto)', () => {
        const html = rankingHtml(8);
        const cells = html.match(/<td style="text-align: center; white-space: nowrap;">/g) || [];
        expect(cells.length, FROZEN).toBe(8);
    });
});

describe('Contratto di stampa · Regola 1: medaglie di posizione', () => {
    it('in ogni stampa la cella della medaglia ha white-space: nowrap (mai "1" sopra e "°" sotto)', () => {
        const root = join(dirname(fileURLToPath(import.meta.url)), '..');
        const sources = [
            join(root, 'services', 'printService.ts'),
            ...readdirSync(join(root, 'formats'), { withFileTypes: true })
                .filter(entry => entry.isDirectory())
                .map(entry => join(root, 'formats', entry.name, 'printer.ts')),
        ];
        let cells = 0;
        for (const file of sources) {
            let source = '';
            try { source = readFileSync(file, 'utf8'); } catch { continue; }
            const all = source.match(/<td style="[^"]*">\$\{rankBadge\}<\/td>/g) || [];
            cells += all.length;
            all.forEach(cell => expect(cell, `${FROZEN} File: ${file}`).toContain('white-space: nowrap'));
        }
        expect(cells).toBeGreaterThanOrEqual(7);
    });
});

describe('Contratto di stampa · Regola 2: interruzioni di pagina', () => {
    it('a) le righe di tabella non si tagliano mai a metà', () => {
        expect(getPrintStyles(false), BREAKS).toMatch(/tr, thead, tfoot\s*\{\s*break-inside: avoid;\s*page-break-inside: avoid;/);
    });

    it('b) un gruppo piccolo (turno, box, classifica di box) resta unito', () => {
        const small = fakeBlock('DIV', MAX_KEEP_TOGETHER_ROWS);
        expect(normalizePrintBlocks(fakeRoot([small]), MAX_KEEP_TOGETHER_ROWS)).toBe(0);
        expect(small.applied, BREAKS).toEqual({});
    });

    it('c) un blocco lungo scorre tra le pagine invece di lasciare pagine vuote', () => {
        const roundRobin = fakeBlock('DIV', 13); // 12 partite + intestazione
        expect(normalizePrintBlocks(fakeRoot([roundRobin]), MAX_KEEP_TOGETHER_ROWS)).toBe(1);
        expect(roundRobin.applied, BREAKS).toEqual({ 'break-inside': 'auto !important', 'page-break-inside': 'auto !important' });
    });

    it('c) le righe non vengono mai rese divisibili', () => {
        const row = fakeBlock('TR', 50);
        expect(normalizePrintBlocks(fakeRoot([row]), MAX_KEEP_TOGETHER_ROWS)).toBe(0);
        expect(row.applied, BREAKS).toEqual({});
    });

    it('d) il titolo di un blocco resta unito alle righe che seguono', () => {
        expect(getPrintStyles(false), BREAKS).toMatch(/h2,\s*h3,\s*\.section-title\s*\{\s*break-after: avoid;\s*page-break-after: avoid;/);
    });

    it('la stessa regola è incorporata nella finestra di stampa desktop', () => {
        expect(normalizePrintBlocksScript).toContain('break-inside');
        expect(normalizePrintBlocksScript.trim().endsWith(`(document, ${MAX_KEEP_TOGETHER_ROWS});`)).toBe(true);
        const html = beatTheBoxBlankHtml();
        expect(html, BREAKS).toContain(normalizePrintBlocksScript);
    });

    it('e) profili giocatore: ogni giocatore inizia su una pagina nuova', () => {
        const html = capturePrintHtml(() => {
            printPlayerProfiles(['p1', 'p2'], players, [], [], []);
        });
        expect(html, BREAKS).toMatch(/\.player-page \+ \.player-page\s*\{\s*page-break-before: always !important;\s*break-before: page !important;/);
        expect((html.match(/class="player-page"/g) || []).length).toBe(2);
    });
});
