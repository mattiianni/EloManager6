import { describe, it, expect } from 'vitest';
import { Player, Tournament, TournamentType, Match, FieldPosition } from '../../types';
import {
    calculateMexicanStandings,
    segmentCourts,
    optimizeCourtPairings,
    generateFirstRoundMexicanMatches,
    generateNextMexicanRoundMatches,
    buildPartnerHistory,
    pairKey
} from './jitEngine';
import { MexicanEngine } from './engine';
import { generateMexicanPdfHtml } from './printer';
import { calculateTournamentLocalElo, TournamentEloMatchInput } from '../../utils/tournamentElo';

const createMockPlayer = (id: string, name: string, surname: string, currentElo: number): Player => ({
    id,
    name,
    surname,
    position: FieldPosition.Indifferente,
    initialElo: 1500,
    currentElo
});

// Helper regex per rilevare qualsiasi emoji Unicode
const EMOJI_REGEX = /[\u{1F300}-\u{1FAD6}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

describe('Collaudo e Simulazione End-to-End Torneo Messicano Individuale', () => {

    // =========================================================================
    // 1. SIMULAZIONE TORNEO 8 PARTECIPANTI (2 CAMPI - 3 TURNI)
    // =========================================================================
    describe('1. Torneo a 8 Partecipanti (2 Campi, 3 Turni JIT)', () => {
        const players8: Player[] = [
            createMockPlayer('p1', 'Alessandro', 'Rossi', 2150),
            createMockPlayer('p2', 'Matteo', 'Bianchi', 2050),
            createMockPlayer('p3', 'Luca', 'Verdi', 1950),
            createMockPlayer('p4', 'Davide', 'Ferrari', 1850),
            createMockPlayer('p5', 'Marco', 'Esposito', 1750),
            createMockPlayer('p6', 'Simone', 'Russo', 1650),
            createMockPlayer('p7', 'Andrea', 'Romano', 1550),
            createMockPlayer('p8', 'Federico', 'Gallo', 1450),
        ];
        const getPlayer8 = (id: string) => players8.find(p => p.id === id);

        it('1.1 Generazione Round 1 (Seeded) e composizione corretta dei campi', () => {
            const r1Matches = generateFirstRoundMexicanMatches(players8, 'Seeded', '2026-11-09');
            expect(r1Matches.length).toBe(2);

            // Campo 1: Top 4 (p1, p2, p3, p4) con incrocio (p1+p4) vs (p2+p3)
            const c1 = r1Matches.find(m => m.courtNumber === 1);
            expect(c1).toBeDefined();
            expect(c1?.team1).toEqual(['p1', 'p4']);
            expect(c1?.team2).toEqual(['p2', 'p3']);

            // Campo 2: Flop 4 (p5, p6, p7, p8) con incrocio (p5+p8) vs (p6+p7)
            const c2 = r1Matches.find(m => m.courtNumber === 2);
            expect(c2).toBeDefined();
            expect(c2?.team1).toEqual(['p5', 'p8']);
            expect(c2?.team2).toEqual(['p6', 'p7']);
        });

        it('1.2 Verifica blocco UI avanzamento e aggiornamento classifica in tempo reale', () => {
            const r1Matches = generateFirstRoundMexicanMatches(players8, 'Seeded', '2026-11-09');

            // Stato iniziale: nessun match giocato
            const isRound1CompleteInitially = r1Matches.every(m => {
                const hasScore = m.sets && m.sets.length > 0 && m.sets.some(s => (s.team1 || 0) > 0 || (s.team2 || 0) > 0);
                return hasScore || m.winner !== null;
            });
            expect(isRound1CompleteInitially).toBe(false);

            // Inseriamo il punteggio solo sul Campo 1: 6-2 per team1
            r1Matches[0].sets = [{ team1: 6, team2: 2 }];
            r1Matches[0].winner = 'team1';

            // Verifica che il round 1 NON è ancora completato (Campo 2 in corso)
            const isRound1CompletePartial = r1Matches.every(m => {
                const hasScore = m.sets && m.sets.length > 0 && m.sets.some(s => (s.team1 || 0) > 0 || (s.team2 || 0) > 0);
                return hasScore || m.winner !== null;
            });
            expect(isRound1CompletePartial).toBe(false);

            // La classifica in tempo reale riflette già la vittoria di p1 e p4 (3 pt ciascuno)
            const liveStandingsPartial = calculateMexicanStandings(r1Matches, players8, 'games-diff');
            expect(liveStandingsPartial[0].player.id).toBe('p1');
            expect(liveStandingsPartial[0].points).toBe(3);
            expect(liveStandingsPartial[1].player.id).toBe('p4');
            expect(liveStandingsPartial[1].points).toBe(3);
            expect(liveStandingsPartial[2].points).toBe(0); // Gli altri hanno 0 punti

            // Ora inseriamo il punteggio sul Campo 2: 6-3 per team1
            r1Matches[1].sets = [{ team1: 6, team2: 3 }];
            r1Matches[1].winner = 'team1';

            // Ora tutte le partite del turno 1 sono complete: avanzamento sbloccato!
            const isRound1CompleteFinal = r1Matches.every(m => {
                const hasScore = m.sets && m.sets.length > 0 && m.sets.some(s => (s.team1 || 0) > 0 || (s.team2 || 0) > 0);
                return hasScore || m.winner !== null;
            });
            expect(isRound1CompleteFinal).toBe(true);

            const liveStandingsFullR1 = calculateMexicanStandings(r1Matches, players8, 'games-diff');
            // Primi 4: p1 (+4 diff, elo 2150), p4 (+4 diff, elo 1850), p5 (+3 diff, elo 1750), p8 (+3 diff, elo 1450)
            expect(liveStandingsFullR1.slice(0, 4).map(s => s.player.id)).toEqual(['p1', 'p4', 'p5', 'p8']);
        });

        it('1.3 Generazione JIT Round 2, anti-ripetizione e pareggio (draw)', () => {
            const r1Matches = generateFirstRoundMexicanMatches(players8, 'Seeded', '2026-11-09');
            r1Matches[0].sets = [{ team1: 6, team2: 2 }];
            r1Matches[0].winner = 'team1';
            r1Matches[1].sets = [{ team1: 6, team2: 3 }];
            r1Matches[1].winner = 'team1';

            // Generazione JIT Turno 2
            const r2Matches = generateNextMexicanRoundMatches(r1Matches, players8, 2, '2026-11-09', 'games-diff');
            expect(r2Matches.length).toBe(2);

            // Sul Campo 1 salgono i 4 vincitori: p1, p4, p5, p8
            const court1Players = new Set([...r2Matches[0].team1, ...r2Matches[0].team2]);
            expect(court1Players.has('p1')).toBe(true);
            expect(court1Players.has('p4')).toBe(true);
            expect(court1Players.has('p5')).toBe(true);
            expect(court1Players.has('p8')).toBe(true);

            // Anti-ripetizione: p1 non deve rigiocare in coppia con p4 e p5 con p8
            expect(pairKey(r2Matches[0].team1[0], r2Matches[0].team1[1])).not.toBe(pairKey('p1', 'p4'));
            expect(pairKey(r2Matches[0].team2[0], r2Matches[0].team2[1])).not.toBe(pairKey('p5', 'p8'));

            // Sul Campo 2 scendono i 4 sconfitti: p2, p3, p6, p7
            const court2Players = new Set([...r2Matches[1].team1, ...r2Matches[1].team2]);
            expect(court2Players.has('p2')).toBe(true);
            expect(court2Players.has('p3')).toBe(true);
            expect(court2Players.has('p6')).toBe(true);
            expect(court2Players.has('p7')).toBe(true);

            // Simuliamo un pareggio sul Campo 1 (5-5) e una vittoria sul Campo 2 (6-2)
            r2Matches[0].sets = [{ team1: 5, team2: 5 }];
            r2Matches[0].winner = 'draw';
            r2Matches[1].sets = [{ team1: 6, team2: 2 }];
            r2Matches[1].winner = 'team1';

            const allSoFar = [...r1Matches, ...r2Matches];
            const standingsAfterR2 = calculateMexicanStandings(allSoFar, players8, 'games-diff');

            // Nel pareggio, tutti i 4 giocatori di quel match ricevono 1 punto ciascuno (3 + 1 = 4 pt)
            const p1Stats = standingsAfterR2.find(s => s.player.id === 'p1');
            const p4Stats = standingsAfterR2.find(s => s.player.id === 'p4');
            const p5Stats = standingsAfterR2.find(s => s.player.id === 'p5');
            const p8Stats = standingsAfterR2.find(s => s.player.id === 'p8');
            expect(p1Stats?.points).toBe(4);
            expect(p4Stats?.points).toBe(4);
            expect(p5Stats?.points).toBe(4);
            expect(p8Stats?.points).toBe(4);
        });

        it('1.4 Generazione Turno 3, completamento torneo e calcolo delta ELO con K=16', () => {
            const r1Matches = generateFirstRoundMexicanMatches(players8, 'Seeded', '2026-11-09');
            r1Matches[0].sets = [{ team1: 6, team2: 2 }];
            r1Matches[0].winner = 'team1';
            r1Matches[1].sets = [{ team1: 6, team2: 3 }];
            r1Matches[1].winner = 'team1';

            const r2Matches = generateNextMexicanRoundMatches(r1Matches, players8, 2, '2026-11-09', 'games-diff');
            r2Matches[0].sets = [{ team1: 5, team2: 5 }];
            r2Matches[0].winner = 'draw';
            r2Matches[1].sets = [{ team1: 6, team2: 2 }];
            r2Matches[1].winner = 'team1';

            const r3Matches = generateNextMexicanRoundMatches([...r1Matches, ...r2Matches], players8, 3, '2026-11-09', 'games-diff');
            expect(r3Matches.length).toBe(2);
            r3Matches[0].sets = [{ team1: 6, team2: 3 }];
            r3Matches[0].winner = 'team1';
            r3Matches[1].sets = [{ team1: 6, team2: 4 }];
            r3Matches[1].winner = 'team1';

            const allMatches = [...r1Matches, ...r2Matches, ...r3Matches];

            // 1. Calcolo classifica finale via MexicanEngine
            const tourn: Tournament = {
                id: 'tourn-8p',
                name: 'Messicano 8P Collaudo',
                type: TournamentType.Mexican,
                date: '2026-11-09',
                club: 'Padel Club Collaudo',
                matchIds: [],
                status: 'completed',
                mexicanFields: 2,
                mexicanRounds: 3,
                mexicanScoringType: 'games-diff'
            };

            const finalStandings = MexicanEngine.calculateStandings(allMatches, tourn, getPlayer8);
            expect(finalStandings.length).toBe(8);
            expect(finalStandings[0].rank).toBe(1);
            expect(finalStandings[1].rank).toBe(2);
            expect(finalStandings[2].rank).toBe(3);

            // 2. Calcolo Delta ELO con K=16 standard
            const eloInputs: TournamentEloMatchInput[] = allMatches.map(m => ({
                id: m.id,
                tournamentId: 'tourn-8p',
                date: m.date,
                roundNumber: m.roundNumber,
                team1: m.team1,
                team2: m.team2,
                winner: m.winner
            }));

            const { totalDeltas, matchSnapshots } = calculateTournamentLocalElo(eloInputs, 16);

            // Verifica che ogni match snapshot sia a somma zero
            matchSnapshots.forEach((snap, matchId) => {
                expect(Math.abs(snap.team1Delta + snap.team2Delta)).toBeLessThan(0.0001);
            });

            // Verifica specifica per il match con pareggio (draw): score = 0.5
            const drawMatch = r2Matches[0];
            const drawSnap = matchSnapshots.get(drawMatch.id);
            expect(drawSnap).toBeDefined();
            // Se le squadre hanno elo simile, il delta in caso di pareggio è vicino a 0
            expect(drawSnap!.team1Delta).toBeCloseTo(-drawSnap!.team2Delta, 4);

            // Verifica che tutti i giocatori abbiano un delta calcolato
            expect(totalDeltas.size).toBe(8);
            const totalSum = Array.from(totalDeltas.values()).reduce((a, b) => a + b, 0);
            expect(Math.abs(totalSum)).toBeLessThan(0.0001); // Somma globale delle variazioni = 0 (zero-sum)
        });

        it('1.5 Verifica PDF Stampa Torneo 8P (sia in bianco che completato, stile Apple HIG e zero emoji)', () => {
            const tourn: Tournament = {
                id: 'tourn-8p-print',
                name: 'Sociale Messicano 8P',
                type: TournamentType.Mexican,
                date: '2026-11-09',
                club: 'Padel Arena Milano',
                matchIds: [],
                status: 'completed',
                mexicanFields: 2,
                mexicanRounds: 3,
                mexicanScoringType: 'games-diff'
            };

            const r1Matches = generateFirstRoundMexicanMatches(players8, 'Seeded', '2026-11-09');

            // --- A. PDF IN BIANCO ---
            const blankHtml = generateMexicanPdfHtml(tourn, r1Matches, getPlayer8, 'Sociale Messicano 8P', true);
            expect(blankHtml).toContain('Tabellone Vuoto');
            expect(blankHtml).toContain('Sociale Messicano 8P');
            expect(blankHtml).toContain('Padel Arena Milano');
            expect(blankHtml).toContain('score-box');
            expect(blankHtml).toContain('score-box-blank');
            expect(blankHtml).not.toContain('[1° Class.]');
            expect(blankHtml).not.toContain('[2° Class.]');
            // Nel tabellone in bianco la classifica finale non deve apparire
            expect(blankHtml).not.toContain('CLASSIFICA INDIVIDUALE');
            // Nessuna emoji
            expect(EMOJI_REGEX.test(blankHtml)).toBe(false);
            // Icone SVG moderne
            expect(blankHtml).toContain('<svg');
            expect(blankHtml).toContain('#0055D4'); // Apple blue

            // --- B. PDF COMPLETATO ---
            r1Matches[0].sets = [{ team1: 6, team2: 2 }];
            r1Matches[0].winner = 'team1';
            r1Matches[1].sets = [{ team1: 6, team2: 4 }];
            r1Matches[1].winner = 'team1';

            const completedHtml = generateMexicanPdfHtml(tourn, r1Matches, getPlayer8, 'Sociale Messicano 8P', false);
            expect(completedHtml).toContain('Riepilogo');
            expect(completedHtml).toContain('CLASSIFICA INDIVIDUALE');
            expect(completedHtml).toContain('Alessandro Rossi');
            expect(completedHtml).toContain('Matteo Bianchi');
            // Badges podio HIG presenti
            expect(completedHtml).toContain('1°</span>');
            expect(completedHtml).toContain('2°</span>');
            expect(completedHtml).toContain('3°</span>');
            // Nessuna emoji né icona old
            expect(EMOJI_REGEX.test(completedHtml)).toBe(false);
            expect(completedHtml).toContain('<svg');
        });
    });

    // =========================================================================
    // 2. SIMULAZIONE TORNEO 12 PARTECIPANTI (3 CAMPI - 3 TURNI)
    // =========================================================================
    describe('2. Torneo a 12 Partecipanti (3 Campi, 3 Turni JIT)', () => {
        const players12: Player[] = Array.from({ length: 12 }, (_, i) =>
            createMockPlayer(`p${i + 1}`, `Giocatore`, `${i + 1}`, 2200 - i * 60)
        );
        const getPlayer12 = (id: string) => players12.find(p => p.id === id);

        it('2.1 Segmentazione su 3 campi: Campo 1 (Top), Campo 2 (Mid), Campo 3 (Flop)', () => {
            const courts = segmentCourts(players12);
            expect(courts.length).toBe(3);
            expect(courts[0].map(p => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);     // Top Court
            expect(courts[1].map(p => p.id)).toEqual(['p5', 'p6', 'p7', 'p8']);     // Mid Court
            expect(courts[2].map(p => p.id)).toEqual(['p9', 'p10', 'p11', 'p12']);  // Flop Court
        });

        it('2.2 Promozioni e retrocessioni dinamiche tra Top, Mid e Flop Court nel Turno 2', () => {
            const r1Matches = generateFirstRoundMexicanMatches(players12, 'Seeded', '2026-11-09');
            expect(r1Matches.length).toBe(3);

            // Campo 1 (Top): p1+p4 battono p2+p3 (6-1)
            r1Matches[0].sets = [{ team1: 6, team2: 1 }];
            r1Matches[0].winner = 'team1';

            // Campo 2 (Mid): p5+p8 battono p6+p7 (6-2)
            r1Matches[1].sets = [{ team1: 6, team2: 2 }];
            r1Matches[1].winner = 'team1';

            // Campo 3 (Flop): p9+p12 battono p10+p11 (6-3)
            r1Matches[2].sets = [{ team1: 6, team2: 3 }];
            r1Matches[2].winner = 'team1';

            // Genera Round 2 JIT
            const r2Matches = generateNextMexicanRoundMatches(r1Matches, players12, 2, '2026-11-09', 'games-diff');
            expect(r2Matches.length).toBe(3);

            // Al Campo 1 (Top) devono accedere i 4 migliori per differenza games
            // p1 (+5), p4 (+5), p5 (+4), p8 (+4)
            const court1Round2 = new Set([...r2Matches[0].team1, ...r2Matches[0].team2]);
            expect(court1Round2.has('p1')).toBe(true);
            expect(court1Round2.has('p4')).toBe(true);
            expect(court1Round2.has('p5')).toBe(true); // Promosso dal Campo 2 al Campo 1!
            expect(court1Round2.has('p8')).toBe(true); // Promosso dal Campo 2 al Campo 1!

            // Al Campo 2 (Mid) vanno:
            // I vincitori del Flop Court (p9, p12) salgono al Mid Court!
            // I perdenti del Campo 1 (p2, p3) scendono al Mid Court!
            const court2Round2 = new Set([...r2Matches[1].team1, ...r2Matches[1].team2]);
            expect(court2Round2.has('p9')).toBe(true);  // Promosso dal Campo 3 al Campo 2!
            expect(court2Round2.has('p12')).toBe(true); // Promosso dal Campo 3 al Campo 2!
            expect(court2Round2.has('p2')).toBe(true);  // Retrocesso dal Campo 1 al Campo 2!
            expect(court2Round2.has('p3')).toBe(true);  // Retrocesso dal Campo 1 al Campo 2!

            // Al Campo 3 (Flop) rimangono i peggiori 4 (p6, p7, p10, p11)
            const court3Round2 = new Set([...r2Matches[2].team1, ...r2Matches[2].team2]);
            expect(court3Round2.has('p6')).toBe(true);
            expect(court3Round2.has('p7')).toBe(true);
            expect(court3Round2.has('p10')).toBe(true);
            expect(court3Round2.has('p11')).toBe(true);
        });

        it('2.3 Modalità a Punti (scoringType: points) per 12 giocatori', () => {
            const r1Matches = generateFirstRoundMexicanMatches(players12, 'Seeded', '2026-11-09');
            r1Matches[0].sets = [{ team1: 24, team2: 16 }]; // Padel americano/messicano a punti totali
            r1Matches[0].winner = 'team1';
            r1Matches[1].sets = [{ team1: 22, team2: 18 }];
            r1Matches[1].winner = 'team1';
            r1Matches[2].sets = [{ team1: 20, team2: 20 }];
            r1Matches[2].winner = 'draw';

            const standingsPoints = calculateMexicanStandings(r1Matches, players12, 'points');
            expect(standingsPoints[0].points).toBe(24);
            expect(standingsPoints[0].gamesWon).toBe(24);
            expect(standingsPoints[0].gamesLost).toBe(16);

            // Generazione PDF con scoringType points
            const tourn: Tournament = {
                id: 'tourn-12p-points',
                name: 'Messicano 12P Punti',
                type: TournamentType.Mexican,
                date: '2026-11-09',
                club: 'Milano City Padel',
                matchIds: [],
                status: 'completed',
                mexicanFields: 3,
                mexicanRounds: 3,
                mexicanScoringType: 'points'
            };

            const html = generateMexicanPdfHtml(tourn, r1Matches, getPlayer12, 'Messicano 12P Punti', false);
            expect(html).toContain('Punti Fatti');
            expect(html).toContain('Punti Subiti');
            expect(EMOJI_REGEX.test(html)).toBe(false);
        });
    });

    // =========================================================================
    // 3. SIMULAZIONE TORNEO 16 PARTECIPANTI (4 CAMPI - 4 TURNI)
    // =========================================================================
    describe('3. Torneo a 16 Partecipanti (4 Campi, 4 Turni JIT)', () => {
        const players16: Player[] = Array.from({ length: 16 }, (_, i) =>
            createMockPlayer(`p${i + 1}`, `Atleta`, `${i + 1}`, 2400 - i * 50)
        );
        const getPlayer16 = (id: string) => players16.find(p => p.id === id);

        it('3.1 Simulazione completa su 4 turni con 4 campi (16 partite totali)', () => {
            // Round 1
            const r1 = generateFirstRoundMexicanMatches(players16, 'Balanced', '2026-11-09');
            expect(r1.length).toBe(4);
            r1.forEach((m, idx) => {
                m.sets = [{ team1: 6, team2: 3 }];
                m.winner = 'team1';
            });

            // Round 2
            const r2 = generateNextMexicanRoundMatches(r1, players16, 2, '2026-11-09', 'games-diff');
            expect(r2.length).toBe(4);
            r2.forEach((m, idx) => {
                m.sets = [{ team1: 6, team2: 4 }];
                m.winner = 'team1';
            });

            // Round 3
            const r3 = generateNextMexicanRoundMatches([...r1, ...r2], players16, 3, '2026-11-09', 'games-diff');
            expect(r3.length).toBe(4);
            r3.forEach((m, idx) => {
                m.sets = [{ team1: 6, team2: 2 }];
                m.winner = 'team1';
            });

            // Round 4
            const r4 = generateNextMexicanRoundMatches([...r1, ...r2, ...r3], players16, 4, '2026-11-09', 'games-diff');
            expect(r4.length).toBe(4);
            r4.forEach((m, idx) => {
                m.sets = [{ team1: 6, team2: 5 }];
                m.winner = 'team1';
            });

            const all16Matches = [...r1, ...r2, ...r3, ...r4];
            expect(all16Matches.length).toBe(16);

            // Verifica classifica finale
            const tourn: Tournament = {
                id: 'tourn-16p',
                name: 'Gran Torneo Messicano 16P',
                type: TournamentType.Mexican,
                date: '2026-11-09',
                club: 'Country Club Padel',
                matchIds: [],
                status: 'completed',
                mexicanFields: 4,
                mexicanRounds: 4,
                mexicanScoringType: 'games-diff'
            };

            const standings = MexicanEngine.calculateStandings(all16Matches, tourn, getPlayer16);
            expect(standings.length).toBe(16);
            expect(standings.every(s => s.matchesPlayed === 4)).toBe(true);

            // Verifica tie-breaker: nessun rank duplicato da 1 a 16
            const ranks = standings.map(s => s.rank);
            expect(new Set(ranks).size).toBe(16);
            expect(Math.min(...ranks)).toBe(1);
            expect(Math.max(...ranks)).toBe(16);

            // Verifica Delta ELO totale a somma zero
            const eloInputs: TournamentEloMatchInput[] = all16Matches.map(m => ({
                id: m.id,
                tournamentId: 'tourn-16p',
                date: m.date,
                roundNumber: m.roundNumber,
                team1: m.team1,
                team2: m.team2,
                winner: m.winner
            }));

            const { totalDeltas } = calculateTournamentLocalElo(eloInputs, 16);
            expect(totalDeltas.size).toBe(16);
            const totalSum = Array.from(totalDeltas.values()).reduce((sum, d) => sum + d, 0);
            expect(Math.abs(totalSum)).toBeLessThan(0.0001);

            // Verifica PDF per 16 giocatori (4 campi) sia in bianco che completato
            const blankPdf = generateMexicanPdfHtml(tourn, r1, getPlayer16, undefined, true);
            expect(blankPdf).toContain('TURNI E PARTITE SUI CAMPI (4 CAMPI)');
            expect(EMOJI_REGEX.test(blankPdf)).toBe(false);

            const completePdf = generateMexicanPdfHtml(tourn, all16Matches, getPlayer16, undefined, false);
            expect(completePdf).toContain('TURNI E PARTITE SUI CAMPI (4 CAMPI)');
            expect(completePdf).toContain('CLASSIFICA INDIVIDUALE');
            expect(EMOJI_REGEX.test(completePdf)).toBe(false);
        });

        it('3.2 Verifica che la cronologia delle coppie minimizzi le ripetizioni', () => {
            const matches: Match[] = [
                { id: 'm1', date: '2026-11-09', team1: ['p1', 'p2'], team2: ['p3', 'p4'], sets: [{ team1: 6, team2: 0 }], winner: 'team1' },
                { id: 'm2', date: '2026-11-09', team1: ['p1', 'p3'], team2: ['p2', 'p4'], sets: [{ team1: 6, team2: 0 }], winner: 'team1' },
            ];

            const history = buildPartnerHistory(matches);
            expect(history.get(pairKey('p1', 'p2'))).toBe(1);
            expect(history.get(pairKey('p3', 'p4'))).toBe(1);
            expect(history.get(pairKey('p1', 'p3'))).toBe(1);
            expect(history.get(pairKey('p2', 'p4'))).toBe(1);

            // Se i 4 giocatori si ritrovano di nuovo assieme, l'unica coppia inedita è (p1+p4) e (p2+p3)
            const pairing = optimizeCourtPairings(players16.slice(0, 4), history);
            expect(pairing.repetitionCost).toBe(0);
            expect(pairing.team1).toEqual(['p1', 'p4']);
            expect(pairing.team2).toEqual(['p2', 'p3']);
        });
    });

    // =========================================================================
    // 4. VERIFICA FORMULA DELTA ELO (K=16, VITTORIA > 50% PUNTI O DRAW)
    // =========================================================================
    describe('4. Calcolo Delta ELO Rigoroso (K=16 Standard)', () => {
        it('4.1 Vittoria netta con ELO uguali (1500 vs 1500) -> Delta = +8 e -8', () => {
            const matches: TournamentEloMatchInput[] = [
                {
                    id: 'elo-test-1',
                    tournamentId: 't-elo',
                    team1: ['playerA', 'playerB'], // media 1500
                    team2: ['playerC', 'playerD'], // media 1500
                    winner: 'team1', // Vittoria >50% dei punti
                }
            ];

            const { totalDeltas, matchSnapshots } = calculateTournamentLocalElo(matches, 16);
            const snap = matchSnapshots.get('elo-test-1');
            expect(snap).toBeDefined();

            // Attesa = 0.5. Vittoria: score = 1. Delta = 16 * (1 - 0.5) = +8
            expect(snap!.team1Delta).toBeCloseTo(8, 4);
            expect(snap!.team2Delta).toBeCloseTo(-8, 4);

            expect(totalDeltas.get('playerA')).toBeCloseTo(8, 4);
            expect(totalDeltas.get('playerB')).toBeCloseTo(8, 4);
            expect(totalDeltas.get('playerC')).toBeCloseTo(-8, 4);
            expect(totalDeltas.get('playerD')).toBeCloseTo(-8, 4);
        });

        it('4.2 Pareggio con ELO uguali (1500 vs 1500) -> Delta = 0', () => {
            const matches: TournamentEloMatchInput[] = [
                {
                    id: 'elo-test-2',
                    tournamentId: 't-elo',
                    team1: ['playerA', 'playerB'],
                    team2: ['playerC', 'playerD'],
                    winner: 'draw', // Pareggio (50% dei punti)
                }
            ];

            const { totalDeltas, matchSnapshots } = calculateTournamentLocalElo(matches, 16);
            const snap = matchSnapshots.get('elo-test-2');
            expect(snap).toBeDefined();

            // Attesa = 0.5. Pareggio: score = 0.5. Delta = 16 * (0.5 - 0.5) = 0
            expect(snap!.team1Delta).toBeCloseTo(0, 4);
            expect(snap!.team2Delta).toBeCloseTo(0, 4);
            expect(totalDeltas.get('playerA')).toBeCloseTo(0, 4);
        });

        it('4.3 Pareggio con ELO sbilanciati -> Favorito cede punti all sfavorito', () => {
            // Se una squadra è favorita (media 1600 vs media 1400), in caso di pareggio la sfavorita guadagna punti
            const matches: TournamentEloMatchInput[] = [
                // Turno 1 per stabilire i punteggi locali
                {
                    id: 'setup-1',
                    tournamentId: 't-elo-2',
                    roundNumber: 1,
                    team1: ['strongA', 'strongB'],
                    team2: ['dummy1', 'dummy2'],
                    winner: 'team1',
                },
                {
                    id: 'setup-2',
                    tournamentId: 't-elo-2',
                    roundNumber: 1,
                    team1: ['weakA', 'weakB'],
                    team2: ['dummy3', 'dummy4'],
                    winner: 'team2',
                },
                // Turno 2: strong (media ~1508) vs weak (media ~1492) -> Pareggio
                {
                    id: 'draw-unbalanced',
                    tournamentId: 't-elo-2',
                    roundNumber: 2,
                    team1: ['strongA', 'strongB'],
                    team2: ['weakA', 'weakB'],
                    winner: 'draw',
                }
            ];

            const { matchSnapshots } = calculateTournamentLocalElo(matches, 16);
            const snap = matchSnapshots.get('draw-unbalanced');
            expect(snap).toBeDefined();
            // Poiché strong ha ELO maggiore di weak, score=0.5 < expectedScore -> delta1 è negativo e delta2 è positivo
            expect(snap!.team1Delta).toBeLessThan(0);
            expect(snap!.team2Delta).toBeGreaterThan(0);
            expect(snap!.team1Delta + snap!.team2Delta).toBeCloseTo(0, 4);
        });
    });
});
