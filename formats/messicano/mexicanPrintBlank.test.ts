import { describe, it, expect } from 'vitest';
import { generateMexicanPdfHtml, generateFirstRoundMexicanMatches } from './index';
import { Player, Tournament, TournamentType } from '../../types';

const makePlayers = (n: number): Player[] =>
    Array.from({ length: n }, (_, i) => ({
        id: `p${i + 1}`, name: `Nome${i + 1}`, surname: `Cognome${i + 1}`, position: 'Indifferente',
        initialElo: 1500 + i, currentElo: 1500 + i,
    } as Player));

describe('Messicano - stampa in bianco', () => {
    it('stampa tutti i turni previsti, con segnaposto per quelli non ancora generati', () => {
        const players = makePlayers(8);
        const matches = generateFirstRoundMexicanMatches(players, 'Normal', new Date().toISOString());
        const tournament = {
            id: 't1', name: 'Test', type: TournamentType.Mexican, date: new Date().toISOString(),
            club: 'Circolo', matchIds: [], status: 'scheduled', mexicanRounds: 6, mexicanFields: 2,
        } as Tournament;
        const html = generateMexicanPdfHtml(tournament, matches, id => players.find(p => p.id === id), 'Test', true);
        for (let r = 1; r <= 6; r++) expect(html).toContain(`Turno ${r}`);
        expect(html).toContain('[1° Class.]');
        // Turno 1: nomi reali
        expect(html).toContain('Cognome');
    });
});
