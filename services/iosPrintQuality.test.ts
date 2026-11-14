import { describe, it, expect } from 'vitest';
import {
    formatScoreBoxes,
    renderPrintDateBadge,
    getPrintStyles,
    PDF_ICONS,
} from './printService';
import { generateMexicanPdfHtml } from '../formats/messicano/printer';
import { Tournament, Match, Player, TournamentType } from '../types';

describe('Verifica Qualità Stampa iOS (Anti-Disallineamento & Anti-Crash Canvas)', () => {
    it('formatScoreBoxes genera box con display inline-block e line-height identico all\'altezza (senza nested flex)', () => {
        const sets = [{ team1: 6, team2: 4 }, { team1: 7, team2: 5 }];
        const html = formatScoreBoxes(sets, false);

        expect(html).toContain('6-4');
        expect(html).toContain('7-5');
        expect(html).toContain('display: inline-block');
        expect(html).toContain('height: 20px');
        expect(html).toContain('line-height: 20px');
        expect(html).toContain('background-color: #0284c7');
        expect(html).not.toContain('display: inline-flex');
        expect(html).not.toContain('line-height: 1');
        expect(html).not.toContain('linear-gradient');
    });

    it('formatScoreBoxes con scheduled o blank genera box vuoti e separatori inline-block centrati', () => {
        const html = formatScoreBoxes([], true);
        expect(html).toContain('score-box-blank');
        expect(html).toContain('display: inline-block');
        expect(html).toContain('line-height: 20px');
        expect(html).not.toContain('display: inline-flex');
    });

    it('renderPrintDateBadge genera una pillola inline-block centrata verticalmente senza nested flex', () => {
        const badgeHtml = renderPrintDateBadge('14.11.2026', 'Data:');

        expect(badgeHtml).toContain('Data: 14.11.2026');
        expect(badgeHtml).toContain('display: inline-block');
        expect(badgeHtml).toContain('height: 24px');
        expect(badgeHtml).toContain('line-height: 24px');
        expect(badgeHtml).toContain('background: #eff6ff');
        expect(badgeHtml).not.toContain('display: inline-flex');
        expect(badgeHtml).not.toContain('line-height: 1');
    });

    it('generateMexicanPdfHtml include wrapper section-block avoid-break per la classifica individuale (anti-scorporo)', () => {
        const mockTournament: Tournament = {
            id: 't-test',
            name: 'Mexicano Cup',
            club: 'Padel Club',
            date: '2026-11-14T10:00:00.000Z',
            type: TournamentType.Mexican,
            status: 'completed',
            mexicanFields: 2,
            mexicanScoringType: 'games-diff',
        } as Tournament;

        const p1: Player = { id: 'p1', name: 'Mario', surname: 'Rossi', currentElo: 1500, initialElo: 1500 } as Player;
        const p2: Player = { id: 'p2', name: 'Luigi', surname: 'Verdi', currentElo: 1500, initialElo: 1500 } as Player;
        const p3: Player = { id: 'p3', name: 'Paolo', surname: 'Bianchi', currentElo: 1500, initialElo: 1500 } as Player;
        const p4: Player = { id: 'p4', name: 'Giuseppe', surname: 'Neri', currentElo: 1500, initialElo: 1500 } as Player;

        const playersMap: Record<string, Player> = { p1, p2, p3, p4 };
        const matches: Match[] = [
            {
                id: 'm1',
                tournamentId: 't-test',
                roundNumber: 1,
                courtNumber: 1,
                team1: ['p1', 'p2'],
                team2: ['p3', 'p4'],
                sets: [{ team1: 6, team2: 3 }],
                winner: 'team1',
                date: '2026-11-14',
            } as Match,
        ];

        const html = generateMexicanPdfHtml(mockTournament, matches, (id) => playersMap[id]);

        // 1. Classifica racchiusa in blocco protetto
        expect(html).toContain('class="section-block avoid-break keep-together"');
        expect(html).toContain('class="section-title"');
        expect(html).toContain('CLASSIFICA INDIVIDUALE');

        // 2. Celle tabella con altezza e line-height simmetrici (anti-schiacciamento verso il basso)
        expect(html).toContain('line-height: 16px');
        expect(html).toContain('vertical-align: middle');
        expect(html).toContain('box-sizing: border-box');

        // 3. Risultati e pillola data centrate
        expect(html).toContain('Data: 14.11.2026');
        expect(html).toContain('height: 24px; line-height: 24px');
        expect(html).toContain('6-3');
    });

    it('getPrintStyles definisce regole standard per th, td con altezza, line-height e padding bilanciati', () => {
        const styles = getPrintStyles(false);
        expect(styles).toContain('line-height: 16px');
        expect(styles).toContain('vertical-align: middle');
        expect(styles).toContain('padding: 4px 6px');
    });
});
