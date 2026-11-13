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
    printInWindow,
    extractPrintBodyAndStyles,
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

    it('extractPrintBodyAndStyles sanifica frammenti HTML con tag html/head/body/doctype annidati ed estrae stili', () => {
        const nestedHtml = `
            <!DOCTYPE html>
            <html lang="it">
            <head>
                <style>.custom-test { color: blue; }</style>
            </head>
            <body>
                <div class="report-content">Riepilogo Partite</div>
            </body>
            </html>
        `;
        const { body, styles } = extractPrintBodyAndStyles(nestedHtml);
        expect(body).not.toContain('<!DOCTYPE');
        expect(body).not.toContain('<html');
        expect(body).not.toContain('</html>');
        expect(body).not.toContain('<head');
        expect(body).not.toContain('</head>');
        expect(body).not.toContain('<body');
        expect(body).not.toContain('</body>');
        expect(body).toContain('Riepilogo Partite');
        expect(styles).toContain('.custom-test { color: blue; }');
    });

    it('printInWindow gestisce in sicurezza ambienti senza DOM (SSR / Node)', () => {
        expect(printInWindow('Test Stampa', '<div>Contenuto</div>')).toBe(false);
    });

    it('printInWindow inserisce il nodo di stampa temporaneo, applica gli stili print e ripulisce su afterprint', () => {
        const mockPrint = vi.fn();
        const listeners: Record<string, () => void> = {};
        const elements: Record<string, any> = {};

        const mockHead = {
            appendChild: vi.fn((el) => { elements[el.id] = el; }),
        };
        const mockBody = {
            appendChild: vi.fn((el) => { elements[el.id] = el; }),
        };

        const mockDocument = {
            title: 'Initial Title',
            head: mockHead,
            body: mockBody,
            getElementById: vi.fn((id: string) => elements[id] || null),
            createElement: vi.fn((tag: string) => {
                const el: any = {
                    tagName: tag,
                    id: '',
                    innerHTML: '',
                    textContent: '',
                    remove: vi.fn(() => {
                        delete elements[el.id];
                    }),
                };
                return el;
            }),
        };

        const mockWindow = {
            print: mockPrint,
            addEventListener: vi.fn((event: string, cb: () => void) => {
                listeners[event] = cb;
            }),
            removeEventListener: vi.fn((event: string) => {
                delete listeners[event];
            }),
        };

        (globalThis as any).window = mockWindow;
        (globalThis as any).document = mockDocument;

        try {
            const success = printInWindow('Test Stampa iOS', '<div id="test-content">Contenuto Test iOS</div>', '@page { size: A4; }');
            expect(success).toBe(true);

            // Container #padel-print-root deve essere creato e aggiunto
            expect(elements['padel-print-root']).toBeDefined();
            expect(elements['padel-print-root'].innerHTML).toContain('Contenuto Test iOS');

            // Stile #padel-print-style deve essere creato con le regole
            expect(elements['padel-print-style']).toBeDefined();
            expect(elements['padel-print-style'].textContent).toContain('#padel-print-root');
            expect(elements['padel-print-style'].textContent).toContain('display: none !important');
            expect(elements['padel-print-style'].textContent).toContain('size: A4');

            // In @media print deve mostrare #padel-print-root e nascondere #root
            expect(elements['padel-print-style'].textContent).toContain('#root {\n                    display: none !important;\n                }');
            expect(elements['padel-print-style'].textContent).toContain('#padel-print-root {\n                    display: block !important;');

            // Il titolo deve essere aggiornato
            expect(mockDocument.title).toBe('Test Stampa iOS');

            // Simuliamo afterprint per verificare il cleanup
            expect(listeners['afterprint']).toBeDefined();
            listeners['afterprint']();

            // Il titolo viene ripristinato e gli elementi rimossi
            expect(mockDocument.title).toBe('Initial Title');
            expect(elements['padel-print-root']).toBeUndefined();
            expect(elements['padel-print-style']).toBeUndefined();
        } finally {
            delete (globalThis as any).window;
            delete (globalThis as any).document;
        }
    });

    // === Stampa iOS / iPadOS: delega a printInWindow senza aprire schede/pagine HTML ===
    const IOS_DEVICES: Array<[string, string, string, number]> = [
        ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5],
        ['iPad', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 'iPad', 5],
        ['iPadOS (UA desktop)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5],
    ];

    IOS_DEVICES.forEach(([label, ua, platform, touch]) => {
        it(`${label}: openPrintWindow chiama direttamente printInWindow senza aprire nuove schede in Safari`, () => {
            const origUA = navigator.userAgent;
            const origPlatform = navigator.platform;
            const origTouch = navigator.maxTouchPoints;

            const mockOpen = vi.fn();
            const elements: Record<string, any> = {};
            const mockHead = { appendChild: vi.fn((el) => { elements[el.id] = el; }) };
            const mockBody = { appendChild: vi.fn((el) => { elements[el.id] = el; }) };
            const mockDocument = {
                title: 'Test',
                head: mockHead,
                body: mockBody,
                getElementById: vi.fn((id: string) => elements[id] || null),
                createElement: vi.fn((tag: string) => ({ id: '', tagName: tag, innerHTML: '', textContent: '', remove: vi.fn() })),
            };
            const mockWindow = {
                open: mockOpen,
                print: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            };

            (globalThis as any).window = mockWindow;
            (globalThis as any).document = mockDocument;

            try {
                Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
                Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
                Object.defineProperty(navigator, 'maxTouchPoints', { value: touch, configurable: true });

                const res = openPrintWindow('Titolo Giornata', '<div>Dati Giornata</div>', '@page { size: A4; }');
                expect(res).toBe(true);

                // NESSUNA nuova scheda/finestra deve essere aperta via window.open
                expect(mockOpen).not.toHaveBeenCalled();

                // Il contenuto deve essere iniettato in-window
                expect(elements['padel-print-root']).toBeDefined();
                expect(elements['padel-print-root'].innerHTML).toContain('Dati Giornata');
            } finally {
                delete (globalThis as any).window;
                delete (globalThis as any).document;
                Object.defineProperty(navigator, 'userAgent', { value: origUA, configurable: true });
                Object.defineProperty(navigator, 'platform', { value: origPlatform, configurable: true });
                Object.defineProperty(navigator, 'maxTouchPoints', { value: origTouch, configurable: true });
            }
        });
    });

    it('iPhone Standalone PWA: openPrintWindow apre Safari con Blob e barra AirPrint', () => {
        const origUA = navigator.userAgent;
        const origPlatform = navigator.platform;
        const origTouch = navigator.maxTouchPoints;
        const origStandalone = (navigator as any).standalone;

        const mockOpen = vi.fn().mockReturnValue({});
        const mockWindow = {
            open: mockOpen,
            matchMedia: vi.fn().mockReturnValue({ matches: true }),
        };
        const mockDocument = {
            getElementById: vi.fn().mockReturnValue(null),
        };

        (globalThis as any).window = mockWindow;
        (globalThis as any).document = mockDocument;

        try {
            Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', configurable: true });
            Object.defineProperty(navigator, 'platform', { value: 'iPhone', configurable: true });
            Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
            Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });

            const res = openPrintWindow('Classifica ELO', '<div>Tabella Dati</div>');
            expect(res).toBe(true);

            // Su iPhone Standalone PWA deve aprire Safari con il blob URL
            expect(mockOpen).toHaveBeenCalledTimes(1);
            expect(mockOpen.mock.calls[0][0]).toMatch(/^blob:/);
            expect(mockOpen.mock.calls[0][1]).toBe('_blank');
        } finally {
            delete (globalThis as any).window;
            delete (globalThis as any).document;
            Object.defineProperty(navigator, 'userAgent', { value: origUA, configurable: true });
            Object.defineProperty(navigator, 'platform', { value: origPlatform, configurable: true });
            Object.defineProperty(navigator, 'maxTouchPoints', { value: origTouch, configurable: true });
            if (origStandalone !== undefined) {
                Object.defineProperty(navigator, 'standalone', { value: origStandalone, configurable: true });
            } else {
                delete (navigator as any).standalone;
            }
        }
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
