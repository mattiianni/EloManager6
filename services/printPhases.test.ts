import { describe, expect, it, vi } from 'vitest';
import {
    partitionMatchesByPhase,
    printCustomTournamentBlank,
    printCustomTournamentComplete,
    printBeatTheBoxBlank,
    printBeatTheBoxComplete,
    printTournamentStatistics,
    printRanking
} from './printService.ts';
import { generateRoundRobinPdfHtml } from '../formats/roundRobinFinali/printer.ts';
import { Match, Player, FieldPosition, TournamentType, Tournament } from '../types.ts';

const match = (id: string, phase: Match['phase'], score: [number, number]): Match => ({
    id,
    date: '2026-08-01',
    team1: [`${id}-1`, `${id}-2`],
    team2: [`${id}-3`, `${id}-4`],
    sets: [{ team1: score[0], team2: score[1] }],
    winner: score[0] === score[1] ? 'draw' : score[0] > score[1] ? 'team1' : 'team2',
    phase,
});

const mockPlayer = (id: string, name: string, surname: string, elo = 1500): Player => ({
    id,
    name,
    surname,
    currentElo: elo,
    initialElo: elo,
    position: FieldPosition.Indifferente,
});

function capturePrintHtml(printFn: () => void): string {
    let captured = '';
    const mockDoc = {
        open: vi.fn(),
        write: vi.fn((html: string) => { captured = html; }),
        close: vi.fn(),
    };
    const mockWin = {
        document: mockDoc,
        focus: vi.fn(),
        close: vi.fn(),
        location: { replace: vi.fn() },
    };
    const originalWindow = (globalThis as any).window;
    const originalDoc = (globalThis as any).document;
    (globalThis as any).window = {
        open: vi.fn().mockReturnValue(mockWin),
        navigator: { userAgent: 'Macintosh' },
    };
    (globalThis as any).document = mockDoc;
    try {
        printFn();
    } finally {
        if (originalWindow) {
            (globalThis as any).window = originalWindow;
        } else {
            delete (globalThis as any).window;
        }
        if (originalDoc) {
            (globalThis as any).document = originalDoc;
        } else {
            delete (globalThis as any).document;
        }
    }
    return captured;
}

describe('PDF phase partition', () => {
    it('mantiene indipendenti gironi, quarti, semifinali e finali anche con risultati parziali', () => {
        const matches = [
            match('g1', 'group', [6, 4]),
            match('g2', 'group', [0, 0]),
            match('q1', 'quarterfinal', [6, 3]),
            match('q2', 'quarterfinal', [0, 0]),
            match('s1', 'semifinal', [0, 0]),
            match('f1', 'final_1_2', [0, 0]),
        ];
        const phases = partitionMatchesByPhase(matches);
        expect(phases.regular.map(item => item.id)).toEqual(['g1', 'g2']);
        expect(phases.quarterfinals.map(item => item.id)).toEqual(['q1', 'q2']);
        expect(phases.semifinals.map(item => item.id)).toEqual(['s1']);
        expect(phases.finals.map(item => item.id)).toEqual(['f1']);
    });
});

describe('Verifica Completezza PDF - Singoli e Coppie (Tutte le fasi incluse)', () => {
    const players: Player[] = Array.from({ length: 8 }, (_, i) =>
        mockPlayer(`p${i + 1}`, `Player`, `${i + 1}`, 1500 + i * 20)
    );
    const getPlayer = (id: string) => players.find(p => p.id === id);

    it('1. printCustomTournamentBlank (Singoli, 2 Box): include Box, Semifinali, Finali e notazione A1..A4/B1..B4', () => {
        const boxes = [
            {
                boxNumber: 1,
                players: players.slice(0, 4),
                matches: [
                    { date: '2026-10-15', team1: ['p1', 'p2'] as [string, string], team2: ['p3', 'p4'] as [string, string], sets: [], winner: null },
                    { date: '2026-10-15', team1: ['p1', 'p3'] as [string, string], team2: ['p2', 'p4'] as [string, string], sets: [], winner: null },
                ]
            },
            {
                boxNumber: 2,
                players: players.slice(4, 8),
                matches: [
                    { date: '2026-10-15', team1: ['p5', 'p6'] as [string, string], team2: ['p7', 'p8'] as [string, string], sets: [], winner: null },
                    { date: '2026-10-15', team1: ['p5', 'p7'] as [string, string], team2: ['p6', 'p8'] as [string, string], sets: [], winner: null },
                ]
            }
        ];

        const html = capturePrintHtml(() => {
            printCustomTournamentBlank(
                { name: 'Torneo Personale Singoli', club: 'Circolo Test', date: '2026-10-15' },
                { phases: ['box', 'semifinali', 'finali'], playerMode: 'singles', numCampi: 2 },
                boxes,
                getPlayer
            );
        });

        // Verifica che tutte le fasi siano presenti
        expect(html).toContain('BOX 1');
        expect(html).toContain('BOX 2');
        expect(html).toContain('CLASSIFICA BOX 1');
        expect(html).toContain('CLASSIFICA BOX 2');
        // Badge canonici A1..A4 e B1..B4
        expect(html).toContain('A1');
        expect(html).toContain('A2');
        expect(html).toContain('B1');
        expect(html).toContain('B2');
        // Sezione Semifinali completa con accoppiamenti canonici 2vs2
        expect(html).toContain('SEMIFINALI');
        expect(html).toContain('A1 + B2');
        expect(html).toContain('A2 + B1');
        expect(html).toContain('A3 + B4');
        expect(html).toContain('A4 + B3');
        // Sezione Finali
        expect(html).toContain('FINALI');
        expect(html).toContain('FINALE 1°/2° POSTO');
        expect(html).toContain('FINALINA 3°/4° POSTO');
    });

    it('2. printBeatTheBoxBlank (2 Box): include Box, Semifinali con A1+B2/A2+B1 e Finali', () => {
        const boxes = [
            {
                boxNumber: 1,
                players: players.slice(0, 4),
                matches: [
                    { date: '2026-10-15', team1: ['p1', 'p2'] as [string, string], team2: ['p3', 'p4'] as [string, string], sets: [], winner: null },
                ]
            },
            {
                boxNumber: 2,
                players: players.slice(4, 8),
                matches: [
                    { date: '2026-10-15', team1: ['p5', 'p6'] as [string, string], team2: ['p7', 'p8'] as [string, string], sets: [], winner: null },
                ]
            }
        ];

        const html = capturePrintHtml(() => {
            printBeatTheBoxBlank(
                { name: 'Beat the Box', club: 'Circolo Test', date: '2026-10-15', type: TournamentType.BeatTheBox },
                boxes,
                getPlayer,
                'semifinals'
            );
        });

        // Verifica fasi Box e Classifica Box con badge
        expect(html).toContain('BOX 1');
        expect(html).toContain('BOX 2');
        expect(html).toContain('CLASSIFICA BOX 1');
        expect(html).toContain('CLASSIFICA BOX 2');
        expect(html).toContain('A1');
        expect(html).toContain('B1');
        // Verifica Semifinali con accoppiamenti 2vs2 (non 1vs1)
        expect(html).toContain('SEMIFINALI');
        expect(html).toContain('A1 + B2');
        expect(html).toContain('A2 + B1');
        // Verifica Finali
        expect(html).toContain('FASE FINALE - 1°/2° POSTO');
        expect(html).toContain('FASE FINALE - 3°/4° POSTO');

        // Verifica assenza di vecchie emoji e presenza icone SVG moderne Apple HIG
        expect(html).not.toContain('📦');
        expect(html).not.toContain('🏆');
        expect(html).not.toContain('🥉');
        expect(html).toContain('<svg');
        expect(html).toContain('#0055D4');
    });

    it('3. printCustomTournamentComplete: include tutte le fasi con punteggi e classifica individuale', () => {
        const boxes = [
            {
                boxNumber: 1,
                players: players.slice(0, 4),
                matches: [
                    { id: 'm1', date: '2026-10-15', team1: ['p1', 'p2'] as [string, string], team2: ['p3', 'p4'] as [string, string], sets: [{ team1: 6, team2: 2 }], winner: 'team1' as const, tournamentId: 't1' },
                ]
            },
            {
                boxNumber: 2,
                players: players.slice(4, 8),
                matches: [
                    { id: 'm2', date: '2026-10-15', team1: ['p5', 'p6'] as [string, string], team2: ['p7', 'p8'] as [string, string], sets: [{ team1: 6, team2: 3 }], winner: 'team1' as const, tournamentId: 't1' },
                ]
            }
        ];

        const boxStandings = [
            {
                boxNumber: 1,
                standings: [
                    { player: players[0], points: 3, gameDifference: 4 },
                    { player: players[1], points: 3, gameDifference: 4 },
                ]
            },
            {
                boxNumber: 2,
                standings: [
                    { player: players[4], points: 3, gameDifference: 3 },
                    { player: players[5], points: 3, gameDifference: 3 },
                ]
            }
        ];

        const sfMatches: Match[] = [
            { id: 'sf1', date: '2026-10-15', team1: ['p1', 'p6'], team2: ['p2', 'p5'], sets: [{ team1: 6, team2: 4 }], winner: 'team1', tournamentId: 't1', phase: 'semifinal' },
        ];
        const finalMatches: Match[] = [
            { id: 'f1', date: '2026-10-15', team1: ['p1', 'p6'], team2: ['p3', 'p8'], sets: [{ team1: 6, team2: 2 }], winner: 'team1', tournamentId: 't1', phase: 'final_1_2' },
        ];

        const individualStandings = players.map((p, i) => ({
            player: p,
            eloChange: 15 - i * 4,
            rank: i + 1,
            gamesWon: 18 - i * 2,
            gamesLost: 10 + i * 2,
            winPercentage: 60 - i * 5,
        }));

        const html = capturePrintHtml(() => {
            printCustomTournamentComplete(
                { id: 't1', name: 'Torneo Personale Singoli', club: 'Circolo Test', date: '2026-10-15', type: TournamentType.TorneoPersonale, status: 'completed', matchIds: ['m1', 'm2', 'sf1', 'f1'] },
                { phases: ['box', 'semifinali', 'finali'], playerMode: 'singles', numCampi: 2 },
                boxes,
                boxStandings,
                sfMatches,
                finalMatches,
                individualStandings,
                getPlayer
            );
        });

        expect(html).toContain('BOX 1');
        expect(html).toContain('BOX 2');
        expect(html).toContain('SEMIFINALI');
        expect(html).toContain('FINALI');
        expect(html).toContain('CLASSIFICA INDIVIDUALE GENERALE');
        expect(html).not.toContain('📦');
        expect(html).not.toContain('🏆');
        expect(html).not.toContain('🥉');
        expect(html).toContain('<svg');
    });

    it('4. printBeatTheBoxComplete: include tutte le fasi, classifica individuale, classifica squadre con icone SVG e senza emoji old', () => {
        const boxes = [
            {
                boxNumber: 1,
                players: players.slice(0, 4),
                matches: [
                    { id: 'm1', date: '2026-10-15', team1: ['p1', 'p2'] as [string, string], team2: ['p3', 'p4'] as [string, string], sets: [{ team1: 6, team2: 2 }], winner: 'team1' as const, tournamentId: 't1' },
                ]
            },
            {
                boxNumber: 2,
                players: players.slice(4, 8),
                matches: [
                    { id: 'm2', date: '2026-10-15', team1: ['p5', 'p6'] as [string, string], team2: ['p7', 'p8'] as [string, string], sets: [{ team1: 6, team2: 3 }], winner: 'team1' as const, tournamentId: 't1' },
                ]
            }
        ];

        const boxStandings = [
            {
                boxNumber: 1,
                standings: [
                    { player: players[0], points: 3, gameDifference: 4 },
                    { player: players[1], points: 3, gameDifference: 4 },
                ]
            },
            {
                boxNumber: 2,
                standings: [
                    { player: players[4], points: 3, gameDifference: 3 },
                    { player: players[5], points: 3, gameDifference: 3 },
                ]
            }
        ];

        const sfMatches: Match[] = [
            { id: 'sf1', date: '2026-10-15', team1: ['p1', 'p6'], team2: ['p2', 'p5'], sets: [{ team1: 6, team2: 4 }], winner: 'team1', tournamentId: 't1', phase: 'semifinal' },
        ];
        const finalMatches: Match[] = [
            { id: 'f1', date: '2026-10-15', team1: ['p1', 'p6'], team2: ['p3', 'p8'], sets: [{ team1: 6, team2: 2 }], winner: 'team1', tournamentId: 't1', phase: 'final_1_2' },
        ];

        const individualStandings = players.map((p, i) => ({
            player: p,
            eloChange: 15 - i * 4,
            rank: i + 1,
            gamesWon: 18 - i * 2,
            gamesLost: 10 + i * 2,
            winPercentage: 60 - i * 5,
        }));

        const html = capturePrintHtml(() => {
            printBeatTheBoxComplete(
                { id: 't1', name: 'Beat the Box', club: 'Circolo Test', date: '2026-10-15', type: TournamentType.BeatTheBox, status: 'completed', matchIds: ['m1', 'm2', 'sf1', 'f1'] },
                boxes,
                boxStandings,
                sfMatches,
                finalMatches,
                individualStandings,
                getPlayer
            );
        });

        expect(html).toContain('BOX 1');
        expect(html).toContain('BOX 2');
        expect(html).toContain('SEMIFINALI');
        expect(html).toContain('FINALI');
        expect(html).toContain('CLASSIFICA SQUADRE FINALE');
        expect(html).toContain('CLASSIFICA INDIVIDUALE GENERALE');
        // Verifica assenza di vecchie emoji e presenza icone SVG moderne
        expect(html).not.toContain('📦');
        expect(html).not.toContain('🏆');
        expect(html).not.toContain('🥉');
        expect(html).not.toContain('🥇');
        expect(html).not.toContain('🥈');
        expect(html).not.toContain('📊');
        expect(html).toContain('<svg');
        expect(html).toContain('#0055D4');
    });

    it('5. generateRoundRobinPdfHtml: include icone SVG moderne, Apple HIG palette e zero emoji legacy', () => {
        const tournament: Tournament = {
            id: 'rr-1',
            name: 'Torneo Round Robin Test',
            club: 'Circolo Padel',
            date: '2026-10-15',
            type: TournamentType.RoundRobinFinali,
            status: 'completed',
            matchIds: ['m1', 'm2', 'sf1', 'f1'],
            roundRobinFields: 2,
            roundRobinPlayoffType: 'semifinals',
        };

        const matches: Match[] = [
            { id: 'm1', date: '2026-10-15', team1: ['p1', 'p2'], team2: ['p3', 'p4'], sets: [{ team1: 6, team2: 4 }], winner: 'team1', tournamentId: 'rr-1', roundNumber: 1 },
            { id: 'm2', date: '2026-10-15', team1: ['p5', 'p6'], team2: ['p7', 'p8'], sets: [{ team1: 6, team2: 3 }], winner: 'team1', tournamentId: 'rr-1', roundNumber: 1 },
            { id: 'sf1', date: '2026-10-15', team1: ['p1', 'p2'], team2: ['p5', 'p6'], sets: [{ team1: 6, team2: 2 }], winner: 'team1', tournamentId: 'rr-1', phase: 'semifinal' },
            { id: 'f1', date: '2026-10-15', team1: ['p1', 'p2'], team2: ['p3', 'p4'], sets: [{ team1: 6, team2: 1 }], winner: 'team1', tournamentId: 'rr-1', phase: 'final_1_2' },
        ];

        const html = generateRoundRobinPdfHtml(tournament, matches, getPlayer);

        expect(html).toContain('PARTITE ROUND ROBIN');
        expect(html).toContain('CLASSIFICA ROUND ROBIN');
        expect(html).toContain('SEMIFINALI');
        expect(html).toContain('FINALI');
        expect(html).toContain('CLASSIFICA DEFINITIVA');

        // Verifica icone SVG moderne e assenza di emoji legacy
        expect(html).not.toContain('⚡');
        expect(html).not.toContain('🏆');
        expect(html).not.toContain('🥇');
        expect(html).not.toContain('🥈');
        expect(html).not.toContain('🥉');
        expect(html).not.toContain('🎾');
        expect(html).not.toContain('📊');
        expect(html).toContain('<svg');
        expect(html).toContain('#0055D4');
        expect(html).not.toContain('#1e3a6e');
    });

    it('6. printTournamentStatistics: include icone SVG moderne, Apple HIG palette e zero colore legacy 1e3a6e', () => {
        const stats = {
            tournament: { name: 'Torneo Autunno', club: 'Padel Club Roma' },
            isPartial: false,
            periodo: { inizio: '01.10.2026', fine: '15.10.2026' },
            numeroGiornate: 4,
            totalePartite: 24,
            totaleGamesDisputati: 210,
            mediaGamesPerPartita: 8.75,
            giocatoriPartecipanti: 8,
            top5: [
                { player: players[0], eloTorneo: 1620, variazioneElo: 45, gamesWon: 36, gamesLost: 18 },
                { player: players[1], eloTorneo: 1580, variazioneElo: 25, gamesWon: 32, gamesLost: 20 },
            ],
            giocatoreConPiuGamesVinti: [{ player: players[0], games: 36 }],
            giocatoreConPiuGamesPersi: [{ player: players[7], games: 35 }],
            coppiaFrequente: [{ players: [players[0], players[1]], partite: 5 }],
            serieVittorie: [{ player: players[0], vittorie: 6 }],
            upset: [{ count: 1, details: ['Mario Rossi b. Luigi Verdi'] }],
            maggiorGuadagnoElo: [{ player: players[0], guadagno: 45 }],
            peggiorPerditaElo: [{ player: players[7], perdita: 30 }],
            mvp: [{ player: players[0], vittorieGiornate: 3 }],
            gameWinRate: [{ player: players[0], percentage: 66.7 }],
            gameRatio: [{ player: players[0], ratio: 2.0 }],
            partiteVinte: [{ player: players[0], wins: 6 }],
            eloPerPartita: [{ player: players[0], eloPerMatch: 7.5 }],
            upsetPercentage: [{ player: players[0], percentage: 20.0 }],
            migliorCoppiaWinRate: [{ players: [players[0], players[1]], winRate: 80.0, partite: 5 }],
            serieSconfitte: [{ player: players[7], sconfitte: 4 }],
            resilienza: [{ player: players[7], perditaMedia: 5.0 }],
            form: [{ player: players[0], form: 'V-V-V' }],
            clutchPerformance: [{ player: players[0], clutchMatches: 3, clutchWinRate: 100 }],
            difesaFerrea: [{ player: players[0], wins: 6, avgGameDifference: 3.0 }],
        };

        const html = capturePrintHtml(() => {
            printTournamentStatistics(stats);
        });

        expect(html).toContain('Statistiche Torneo');
        expect(html).toContain('INFORMAZIONI GENERALI');
        expect(html).toContain('GIOCATORI • TOP 5');
        expect(html).toContain('STATISTICHE DETTAGLIATE');
        expect(html).toContain('PREMI SIMBOLICI');

        // Nessun colore legacy #1e3a6e e presenza icone SVG moderne
        expect(html).not.toContain('#1e3a6e');
        expect(html).toContain('<svg');
        expect(html).toContain('#0055D4');
        expect(html).toContain('#059669');
    });

    it('7. printRanking: include icone SVG moderne, Apple HIG palette, rank badges e zero icone old/emoji/#1e3a6e', () => {
        const rankingData = players.map((p, idx) => ({
            ...p,
            rank: idx + 1,
            lastDelta: idx === 0 ? 12.5 : idx === 1 ? -8.2 : null,
            matchesPlayed: 10,
            matchesWon: 7,
            matchesLost: 3,
            gamesWon: 54,
            gamesLost: 32,
            winPercentage: 70,
            presencePercentage: 100,
        }));

        const html = capturePrintHtml(() => {
            printRanking(
                rankingData as any,
                [],
                [],
                [],
                null,
                0,
                undefined
            );
        });

        expect(html).toContain('Classifica Generale ELO');
        expect(html).toContain('Tutti i Giocatori Attivi');
        expect(html).toContain('1°');
        expect(html).toContain('2°');
        expect(html).toContain('3°');

        // Zero emoji o icone old
        expect(html).not.toContain('🥇');
        expect(html).not.toContain('🥈');
        expect(html).not.toContain('🥉');
        expect(html).not.toContain('⬇️');
        expect(html).not.toContain('📊');

        // Presenza icone SVG moderne e stili Apple HIG
        expect(html).toContain('<svg');
        expect(html).toContain('#0055D4');
        expect(html).not.toContain('#1e3a6e');
    });
});

