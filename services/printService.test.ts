import { describe, expect, it, vi } from 'vitest';
import type { Match } from '../types.ts';
import { calculateTournamentLocalElo } from '../utils/tournamentElo.ts';
import {
    MANROPE_PRINT_STYLESHEET,
    escapeHtml,
    formatScoreBoxes,
    getPrintStyles,
    partitionMatchesByPhase,
    printableTeamName,
    waitForPrintFontsScript,
    isIOS,
    openPrintWindow,
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

    it('identifica correttamente i dispositivi iOS tramite isIOS()', () => {
        const originalUserAgent = navigator.userAgent;
        const originalPlatform = navigator.platform;
        const originalMaxTouchPoints = navigator.maxTouchPoints;

        try {
            // iPhone user agent
            Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', configurable: true });
            Object.defineProperty(navigator, 'platform', { value: 'iPhone', configurable: true });
            Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
            expect(isIOS()).toBe(true);

            // iPad user agent
            Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', configurable: true });
            expect(isIOS()).toBe(true);

            // iPad running iPadOS desktop user agent (MacIntel with touch points)
            Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', configurable: true });
            Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
            Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
            expect(isIOS()).toBe(true);

            // Real Mac desktop (MacIntel with 0 touch points)
            Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
            expect(isIOS()).toBe(false);

            // Windows Chrome desktop
            Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', configurable: true });
            Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
            Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
            expect(isIOS()).toBe(false);
        } finally {
            Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true });
            Object.defineProperty(navigator, 'platform', { value: originalPlatform, configurable: true });
            Object.defineProperty(navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true });
        }
    });

    it('include le regole CSS per la print-toolbar che scompare in @media print', () => {
        const styles = getPrintStyles();
        expect(styles).toContain('.print-toolbar');
        expect(styles).toContain('position: sticky');
        expect(styles).toContain('background: #0055D4');
        expect(styles).toContain('.print-btn-primary');
        expect(styles).toContain('.print-btn-secondary');
        expect(styles).toMatch(/@media print[\s\S]*\.print-toolbar\s*\{\s*display:\s*none\s*!important/);
    });

    // === Stampa iOS / iPadOS: sistema della 6.10.4 (pagina Blob + auto-stampa) ===
    const runIOSPrint = (ua: string, platform: string, touch: number, openResult: any, call: () => boolean) => {
        const OrigBlob = globalThis.Blob;
        const OrigURL = globalThis.URL;
        const origUA = navigator.userAgent;
        const origPlatform = navigator.platform;
        const origTouch = navigator.maxTouchPoints;
        let blobText = '';
        const open = vi.fn((_url?: string, _target?: string) => openResult);
        (globalThis as any).Blob = class { constructor(parts: any[]) { blobText = parts.join(''); } };
        (globalThis as any).URL = { createObjectURL: () => 'blob:test', revokeObjectURL: vi.fn() };
        (globalThis as any).window = { open, print: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() };
        (globalThis as any).document = { body: { appendChild: vi.fn() }, head: { appendChild: vi.fn() }, getElementById: vi.fn(() => null), createElement: vi.fn(() => ({})) };
        try {
            Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
            Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
            Object.defineProperty(navigator, 'maxTouchPoints', { value: touch, configurable: true });
            const result = call();
            return { result, open, blobText, doc: (globalThis as any).document, win: (globalThis as any).window };
        } finally {
            (globalThis as any).Blob = OrigBlob;
            (globalThis as any).URL = OrigURL;
            delete (globalThis as any).window;
            delete (globalThis as any).document;
            Object.defineProperty(navigator, 'userAgent', { value: origUA, configurable: true });
            Object.defineProperty(navigator, 'platform', { value: origPlatform, configurable: true });
            Object.defineProperty(navigator, 'maxTouchPoints', { value: origTouch, configurable: true });
        }
    };

    const IOS_DEVICES: Array<[string, string, string, number]> = [
        ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5],
        ['iPad', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 'iPad', 5],
        ['iPadOS (UA desktop)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5],
    ];

    IOS_DEVICES.forEach(([label, ua, platform, touch]) => {
        it(`${label}: openPrintWindow apre in modo sincrono una pagina Blob con auto-stampa, identica alla 6.10.4`, () => {
            const { result, open, blobText, doc } = runIOSPrint(ua, platform, touch, {}, () => openPrintWindow('Titolo', '<div>Contenuto</div>', '@page { size: A4; }'));
            expect(result).toBe(true);
            expect(open).toHaveBeenCalledTimes(1);
            expect(open.mock.calls[0][0]).toBe('blob:test');
            expect(blobText).toContain('width=1024, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
            expect(blobText).toContain('window.print();');
            expect(blobText).toMatch(/\}, 300\);/);
            expect(blobText).toContain('Contenuto');
            expect(blobText).not.toContain('print-toolbar no-print'); // nessuna barra nella pagina iOS
            expect(blobText).not.toContain('window.close()');          // su iOS la pagina non si chiude da sola
            expect(doc.body.appendChild).not.toHaveBeenCalled();       // niente stampa dentro l'app
        });
    });

    it('iOS, popup bloccato: avviso e nessuna stampa dentro l\'app (come nella 6.10.4)', () => {
        const { result, open, doc, win } = runIOSPrint(IOS_DEVICES[0][1], 'iPhone', 5, null, () => openPrintWindow('Titolo', '<div>X</div>'));
        expect(result).toBe(false);
        expect(open).toHaveBeenCalledTimes(1);
        expect(win.dispatchEvent).toHaveBeenCalledTimes(1); // avviso: impossibile aprire la finestra di stampa
        expect(doc.body.appendChild).not.toHaveBeenCalled();
    });

    it('iOS, finestra pre-aperta (tornei a squadre): carica la pagina Blob con location.replace', () => {
        const replace = vi.fn();
        const pre = { location: { replace }, document: { open: vi.fn(), write: vi.fn(), close: vi.fn() } };
        const { result, open } = runIOSPrint(IOS_DEVICES[1][1], 'iPad', 5, {}, () => openPrintWindow('Titolo', '<div>X</div>', '', pre as any));
        expect(result).toBe(true);
        expect(open).not.toHaveBeenCalled();
        expect(replace).toHaveBeenCalledWith('blob:test');
        expect(pre.document.write).not.toHaveBeenCalled();
    });

    it('iPhone: grafico ELO apre una pagina Blob con lo script di stampa iniettato (200 ms), come nella 6.10.4', async () => {
        const { printEloChart } = await import('./printService.ts');
        const { result, open, blobText } = runIOSPrint(IOS_DEVICES[0][1], 'iPhone', 5, {}, () =>
            printEloChart(
                [{ eventIndex: 0, sourceLabel: 'Start', p1: 1500 }, { eventIndex: 1, sourceLabel: 'E1', p1: 1516 }],
                ['p1'],
                [{ id: 'p1', name: 'Mario', surname: 'Rossi', currentElo: 1516, initialElo: 1500 } as any],
            ));
        expect(result).toBe(true);
        expect(open).toHaveBeenCalledTimes(1);
        expect(open.mock.calls[0][0]).toBe('blob:test');
        expect(blobText).toContain('window.print();');
        expect(blobText).toMatch(/\}, 200\);/);
        expect(blobText).not.toContain('window.close()');
    });

    it('GUARDIA: il codice non contiene più la stampa dentro l\'app (printInWindow / #padel-print-root)', async () => {
        const fs = await import('node:fs');
        const src = fs.readFileSync(new URL('./printService.ts', import.meta.url), 'utf8');
        expect(src).not.toContain('printInWindow');
        expect(src).not.toContain('padel-print-root');
        expect(src).not.toContain('usesInAppPrint');
        expect(src).not.toContain('isIPhone');
    });

    it('printPlayerProfiles con tournamentFilter: isola le partite del torneo, imposta etichette ELO Start/E1 e personalizza header/footer', async () => {
        const { printPlayerProfiles } = vi.importActual('./printService.ts') as any;
        // Mock window per catturare l'HTML di openPrintWindow
        let capturedTitle = '';
        let capturedHtml = '';

        const mockWindow = {
            document: {
                open: vi.fn(),
                write: vi.fn((html: string) => {
                    capturedHtml += html;
                }),
                close: vi.fn(),
            },
            focus: vi.fn(),
            print: vi.fn(),
        };

        const originalOpen = (globalThis as any).window?.open;
        (globalThis as any).window = {
            open: vi.fn((url: string, name: string) => {
                capturedTitle = name;
                return mockWindow;
            }),
            location: { origin: 'http://localhost:3000' }
        };

        const mockPlayers = [
            { id: 'p1', name: 'Alessio', surname: 'Campinoti', currentElo: 1510, initialElo: 1500, position: 'Destra' },
            { id: 'p2', name: 'Francesco', surname: 'Silenzi', currentElo: 1520, initialElo: 1500, position: 'Sinistra' },
            { id: 'p3', name: 'Roberto', surname: 'Monti', currentElo: 1490, initialElo: 1500, position: 'Sinistra' },
            { id: 'p4', name: 'Mirko', surname: 'Manetti', currentElo: 1480, initialElo: 1500, position: 'Destra' },
            { id: 'p99', name: 'Giocatore', surname: 'Esterno', currentElo: 1500, initialElo: 1500, position: 'Indifferente' },
        ];

        const mockTournaments = [
            {
                id: 't-mex-1',
                name: 'Sociale Messicano',
                type: 'Mexicano' as any,
                date: '2026-11-09T18:00:00.000Z',
                status: 'completed' as const,
                matchIds: ['m1', 'm2']
            },
            {
                id: 't-other',
                name: 'Altro Torneo Esterno',
                type: 'Americano' as any,
                date: '2026-10-01T18:00:00.000Z',
                status: 'completed' as const,
                matchIds: ['m99']
            }
        ];

        const mockMatches: Match[] = [
            {
                id: 'm1',
                tournamentId: 't-mex-1',
                date: '2026-11-09T18:00:00.000Z',
                team1: ['p1', 'p2'],
                team2: ['p3', 'p4'],
                sets: [{ team1: 6, team2: 3 }],
                winner: 'team1',
            } as Match,
            {
                id: 'm2',
                tournamentId: 't-mex-1',
                date: '2026-11-09T19:00:00.000Z',
                team1: ['p1', 'p4'],
                team2: ['p2', 'p3'],
                sets: [{ team1: 6, team2: 4 }],
                winner: 'team1',
            } as Match,
            {
                id: 'm99',
                tournamentId: 't-other',
                date: '2026-10-01T18:00:00.000Z',
                team1: ['p1', 'p99'],
                team2: ['p2', 'p3'],
                sets: [{ team1: 2, team2: 6 }],
                winner: 'team2',
            } as Match
        ];

        const mockEloHistory = [
            {
                id: 'h1',
                playerId: 'p1',
                eventId: 't-mex-1',
                eloBefore: 1500,
                eloAfter: 1516,
                delta: 16,
                date: '2026-11-09T18:00:00.000Z',
                type: 'tournament' as const,
                sourceLabel: 'Sociale Messicano'
            }
        ];

        try {
            // Esegui la stampa per p1 filtrando per il torneo Sociale Messicano
            const { printPlayerProfiles: actualPrint } = await import('./printService.ts');
            const result = actualPrint(
                ['p1'],
                mockPlayers as any,
                mockMatches,
                mockEloHistory as any,
                mockTournaments as any,
                {
                    tournamentFilter: {
                        tournamentId: 't-mex-1',
                        tournamentName: 'Sociale Messicano',
                        tournamentIds: ['t-mex-1'],
                        tournamentDate: '2026-11-09T18:00:00.000Z'
                    }
                }
            );

            expect(result).toBe(true);
            expect(capturedHtml).toContain('Alessio Campinoti');
            expect(capturedHtml).toContain('TORNEO: Sociale Messicano');
            // Regressione pagine bianche: nessun divisore .page-break e nessun break-after sulle schede
            expect(capturedHtml).not.toContain('class="page-break"');
            expect(capturedHtml).toContain('.player-page + .player-page');
            // GUARDIA iOS: break-inside: avoid su una scheda più alta di una pagina impedisce a iOS di aprire
            // il foglio di stampa (stampa profili giocatori su iPhone). Non va mai rimesso sulle schede.
            expect(capturedHtml).not.toMatch(/\.player-page[^{}]*\{[^{}]*(page-)?break-inside\s*:\s*avoid/);
            expect(capturedHtml).not.toMatch(/class="player-page"[^>]*break-inside/);
            expect(capturedHtml).toContain('nel torneo');

            // ELO DI TORNEO (non generale): 1500 + delta locale delle partite del torneo, come in Classifiche
            const expectedLocal = 1500 + (calculateTournamentLocalElo(mockMatches.filter(m => m.tournamentId === 't-mex-1')).totalDeltas.get('p1') || 0);
            expect(capturedHtml).toContain(`font-weight:bold;color:#1e3a6e;">${expectedLocal.toFixed(2)}</div>`);
            expect(capturedHtml).not.toContain('font-weight:bold;color:#1e3a6e;">1510.00</div>'); // ELO generale del giocatore
            expect(capturedHtml).toContain('ELO del torneo');

            // Partite filtrate: solo le 2 partite del torneo Sociale Messicano (non m99 dell'altro torneo)
            // p1 ha vinto entrambe le partite (m1 e m2) in Sociale Messicano -> 2 vinte, 0 perse (100%)
            expect(capturedHtml).toContain('Partite</div>');
            expect(capturedHtml).toContain('>2</div>'); // total matches = 2
            expect(capturedHtml).toContain('Vinte</div>');

            // Grafico ELO: etichette Start e E1
            expect(capturedHtml).toContain('>Start</text>');
            expect(capturedHtml).toContain('>E1</text>');

            // Footer con il nome del torneo
            expect(capturedHtml).toContain('Sociale Messicano');
        } finally {
            if (originalOpen) {
                (globalThis as any).window.open = originalOpen;
            } else {
                delete (globalThis as any).window;
            }
        }
    });
});
