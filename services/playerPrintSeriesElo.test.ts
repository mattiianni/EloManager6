import { describe, expect, it, vi } from 'vitest';
import type { Match } from '../types.ts';
import { calculateTournamentLocalElo } from '../utils/tournamentElo.ts';

/**
 * La stampa profili filtrata per torneo deve mostrare l'ELO di torneo ESATTAMENTE come Classifiche:
 * tutte le giornate della serie formano un'unica catena che parte da 1500 (pages/RankingPage.tsx).
 */
describe('printPlayerProfiles: ELO di torneo su serie con più giornate', () => {
    it('coincide con il calcolo di Classifiche (catena unica di serie) e non con la somma di giornate separate', async () => {
        let capturedHtml = '';
        const mockWindow = {
            document: { open: vi.fn(), write: vi.fn((html: string) => { capturedHtml += html; }), close: vi.fn() },
            focus: vi.fn(), print: vi.fn(),
        };
        (globalThis as any).window = { open: vi.fn(() => mockWindow), location: { origin: 'http://localhost' } };

        const players = ['p1', 'p2', 'p3', 'p4'].map((id, i) => ({
            id, name: `Nome${i + 1}`, surname: `Cognome${i + 1}`, currentElo: 1600 + i * 7, initialElo: 1500, position: 'Destra',
        }));
        const t = (id: string, date: string) => ({ id, name: id, giornataName: 'Serie X', type: 'Americano' as any, date, status: 'completed' as const, matchIds: [] });
        const tournaments = [t('t1', '2026-10-01T18:00:00.000Z'), t('t2', '2026-10-08T18:00:00.000Z')];
        const m = (id: string, tid: string, date: string, team1: string[], team2: string[], s1: number, s2: number): Match => ({
            id, tournamentId: tid, date, team1, team2, sets: [{ team1: s1, team2: s2 }], winner: s1 > s2 ? 'team1' : s2 > s1 ? 'team2' : 'draw',
        } as Match);
        const matches: Match[] = [
            m('m1', 't1', '2026-10-01T18:00:00.000Z', ['p1', 'p2'], ['p3', 'p4'], 6, 2),
            m('m2', 't1', '2026-10-01T19:00:00.000Z', ['p1', 'p3'], ['p2', 'p4'], 6, 4),
            m('m3', 't2', '2026-10-08T18:00:00.000Z', ['p1', 'p4'], ['p2', 'p3'], 6, 3),
            m('m4', 't2', '2026-10-08T19:00:00.000Z', ['p1', 'p2'], ['p3', 'p4'], 2, 6),
        ];

        try {
            const { printPlayerProfiles } = await import('./printService.ts');
            const ok = printPlayerProfiles(['p1'], players as any, matches, [], tournaments as any, {
                tournamentFilter: { tournamentId: 'Serie X', tournamentName: 'Serie X', tournamentIds: ['t1', 't2'], tournamentDate: '2026-10-01T18:00:00.000Z' },
            });
            expect(ok).toBe(true);

            // Come Classifiche: tutte le partite della serie in un unico gruppo
            const series = calculateTournamentLocalElo(matches.map(x => ({ ...x, tournamentId: 'series:Serie X' })));
            const expected = 1500 + (series.totalDeltas.get('p1') || 0);
            // Somma di giornate calcolate separatamente (il vecchio metodo, da NON usare)
            const separate = 1500 + ['t1', 't2'].reduce((sum, tid) =>
                sum + (calculateTournamentLocalElo(matches.filter(x => x.tournamentId === tid)).totalDeltas.get('p1') || 0), 0);

            expect(expected.toFixed(2)).not.toBe(separate.toFixed(2)); // il test ha senso solo se i due metodi differiscono
            expect(capturedHtml).toContain(`font-weight:bold;color:#1e3a6e;">${expected.toFixed(2)}</div>`);
            expect(capturedHtml).not.toContain(`font-weight:bold;color:#1e3a6e;">${separate.toFixed(2)}</div>`);
            expect(capturedHtml).toContain('>E1</text>');
            expect(capturedHtml).toContain('>E2</text>');
            expect(capturedHtml).toContain('ELO del torneo');
        } finally {
            delete (globalThis as any).window;
        }
    });
});
