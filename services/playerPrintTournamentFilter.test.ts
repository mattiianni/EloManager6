import { describe, it, expect, vi } from 'vitest';
import { printPlayerProfiles } from './printService.ts';
import { buildPlayerEloTimeline } from './eloEventsService.ts';
import { Player, Match, Tournament, EloHistoryEntry, FieldPosition, TournamentType } from '../types.ts';

const createPlayer = (id: string, name: string, surname: string, currentElo: number = 1500): Player => ({
    id,
    name,
    surname,
    currentElo,
    initialElo: 1500,
    position: FieldPosition.Destra
});

describe('Stampa Giocatori Singolo Torneo - Filtri e Andamento ELO', () => {
    const p1 = createPlayer('p1', 'Alessio', 'Campinoti', 1516);
    const p2 = createPlayer('p2', 'Francesco', 'Silenzi', 1516);
    const p3 = createPlayer('p3', 'Roberto', 'Monti', 1484);
    const p4 = createPlayer('p4', 'Mirko', 'Manetti', 1484);
    const pGhost = createPlayer('pGhost', 'Inattivo', 'NessunaPartita', 1500);

    const allPlayers = [p1, p2, p3, p4, pGhost];

    // Torneo target: "Campionato Invernale" su 2 giornate (t1 e t2)
    const tDay1: Tournament = {
        id: 't-inv-day1',
        name: 'Campionato Invernale - 1^ Giornata',
        giornataName: 'Campionato Invernale',
        date: '2026-10-15T18:00:00.000Z',
        club: 'Padel Club Milano',
        type: TournamentType.Americano,
        status: 'completed',
        matchIds: ['m1']
    };

    const tDay2: Tournament = {
        id: 't-inv-day2',
        name: 'Campionato Invernale - 2^ Giornata',
        giornataName: 'Campionato Invernale',
        date: '2026-10-22T18:00:00.000Z',
        club: 'Padel Club Milano',
        type: TournamentType.Americano,
        status: 'completed',
        matchIds: ['m2']
    };

    // Altro torneo non correlato
    const tOther: Tournament = {
        id: 't-other',
        name: 'Torneo Esterno',
        date: '2026-09-01T18:00:00.000Z',
        club: 'Circolo Esterno',
        type: TournamentType.TorneOtto,
        status: 'completed',
        matchIds: ['m-other']
    };

    const allTournaments = [tDay1, tDay2, tOther];

    const matches: Match[] = [
        // Giornata 1
        {
            id: 'm1',
            tournamentId: 't-inv-day1',
            date: '2026-10-15T18:00:00.000Z',
            team1: ['p1', 'p2'],
            team2: ['p3', 'p4'],
            sets: [{ team1: 6, team2: 2 }],
            winner: 'team1',
            roundNumber: 1
        } as Match,
        // Giornata 2
        {
            id: 'm2',
            tournamentId: 't-inv-day2',
            date: '2026-10-22T18:00:00.000Z',
            team1: ['p1', 'p3'],
            team2: ['p2', 'p4'],
            sets: [{ team1: 6, team2: 4 }],
            winner: 'team1',
            roundNumber: 2
        } as Match,
        // Match altro torneo (p1 perde)
        {
            id: 'm-other',
            tournamentId: 't-other',
            date: '2026-09-01T18:00:00.000Z',
            team1: ['p1', 'pGhost'],
            team2: ['p3', 'p4'],
            sets: [{ team1: 1, team2: 6 }],
            winner: 'team2'
        } as Match
    ];

    const eloHistory: EloHistoryEntry[] = [
        {
            playerId: 'p1',
            eventId: 't-inv-day1',
            eloBefore: 1500,
            eloAfter: 1508,
            delta: 8,
            date: '2026-10-15T18:00:00.000Z',
            type: 'tournament',
            sourceLabel: 'Campionato Invernale'
        },
        {
            playerId: 'p1',
            eventId: 't-inv-day2',
            eloBefore: 1508,
            eloAfter: 1516,
            delta: 8,
            date: '2026-10-22T18:00:00.000Z',
            type: 'tournament',
            sourceLabel: 'Campionato Invernale'
        },
        {
            playerId: 'p1',
            eventId: 't-other',
            eloBefore: 1520,
            eloAfter: 1500,
            delta: -20,
            date: '2026-09-01T18:00:00.000Z',
            type: 'tournament',
            sourceLabel: 'Torneo Esterno'
        }
    ];

    it('1. buildPlayerEloTimeline con scope.tournamentIds isola esattamente le sole giornate del torneo scelto', () => {
        const timeline = buildPlayerEloTimeline(
            'p1',
            eloHistory,
            matches,
            allTournaments,
            [],
            {
                parentTournamentName: 'Campionato Invernale',
                tournamentIds: ['t-inv-day1', 't-inv-day2']
            }
        );

        // Deve contenere esattamente 2 eventi (Giornata 1 e Giornata 2), escludendo t-other
        expect(timeline.length).toBe(2);
        const deltas = timeline.map(e => e.delta);
        expect(deltas).toEqual([8, 8]); // 2 giornate da +8 ciascuna
    });

    it('2. printPlayerProfiles con tournamentFilter genera report fedele con solo le partite del torneo e timeline Start/E1/E2', () => {
        let capturedHtml = '';
        const mockWindow = {
            document: {
                open: vi.fn(),
                write: vi.fn((html: string) => { capturedHtml += html; }),
                close: vi.fn()
            },
            focus: vi.fn(),
            print: vi.fn()
        };

        const originalOpen = (globalThis as any).window?.open;
        (globalThis as any).window = {
            open: vi.fn(() => mockWindow),
            location: { origin: 'http://localhost:3000' }
        };

        try {
            const printed = printPlayerProfiles(
                ['p1'],
                allPlayers,
                matches,
                eloHistory,
                allTournaments,
                {
                    tournamentFilter: {
                        tournamentId: 'Campionato Invernale',
                        tournamentName: 'Campionato Invernale',
                        tournamentIds: ['t-inv-day1', 't-inv-day2'],
                        tournamentDate: '2026-10-22T18:00:00.000Z'
                    }
                }
            );

            expect(printed).toBe(true);

            // Verifica presenza del badge torneo
            expect(capturedHtml).toContain('TORNEO: Campionato Invernale');
            expect(capturedHtml).toContain('nel torneo');

            // Verifica conteggio partite: SOLO 2 partite (m1 e m2), m-other è esclusa!
            // Entrambe vinte -> 2 partite, 2 vinte, 0 perse, 100% win rate
            expect(capturedHtml).toContain('>2</div>'); // Stat box partite
            expect(capturedHtml).toContain('100%');

            // Verifica grafico: 2 giornate -> etichette Start, E1, E2
            expect(capturedHtml).toContain('>Start</text>');
            expect(capturedHtml).toContain('>E1</text>');
            expect(capturedHtml).toContain('>E2</text>');

            // Verifica compagni: in m1 ha giocato con Francesco Silenzi, in m2 con Roberto Monti
            expect(capturedHtml).toContain('Francesco Silenzi');
            expect(capturedHtml).toContain('Roberto Monti');
            // pGhost non ha giocato con p1 nel torneo -> non deve apparire come compagno
            expect(capturedHtml).not.toContain('Inattivo NessunaPartita');

            // Footer con il nome del torneo
            expect(capturedHtml).toContain('Profilo Alessio Campinoti &middot; Campionato Invernale');
        } finally {
            if (originalOpen) {
                (globalThis as any).window.open = originalOpen;
            } else {
                delete (globalThis as any).window;
            }
        }
    });

    it('3. Torneo a 1 sola giornata genera grafico con Start ed E1 coerente con lo screenshot utente', () => {
        let capturedHtml = '';
        const mockWindow = {
            document: {
                open: vi.fn(),
                write: vi.fn((html: string) => { capturedHtml += html; }),
                close: vi.fn()
            },
            focus: vi.fn(),
            print: vi.fn()
        };

        const originalOpen = (globalThis as any).window?.open;
        (globalThis as any).window = {
            open: vi.fn(() => mockWindow),
            location: { origin: 'http://localhost:3000' }
        };

        try {
            const printed = printPlayerProfiles(
                ['p1'],
                allPlayers,
                matches,
                eloHistory,
                allTournaments,
                {
                    tournamentFilter: {
                        tournamentId: 't-inv-day1',
                        tournamentName: 'Campionato Invernale - 1^ Giornata',
                        tournamentIds: ['t-inv-day1']
                    }
                }
            );

            expect(printed).toBe(true);
            expect(capturedHtml).toContain('>Start</text>');
            expect(capturedHtml).toContain('>E1</text>');
            expect(capturedHtml).not.toContain('>E2</text>');
        } finally {
            if (originalOpen) {
                (globalThis as any).window.open = originalOpen;
            } else {
                delete (globalThis as any).window;
            }
        }
    });
});
