import { describe, it, expect } from 'vitest';
import { getTorneoLiberoMissingField } from './torneoLibero';

describe('getTorneoLiberoMissingField', () => {
    it('segnala il circolo mancante (caso del Torneo Libero con i singoli)', () => {
        expect(getTorneoLiberoMissingField('Sfida Serale', '', '2026-11-12')).toBe('Inserisci il nome del circolo.');
        expect(getTorneoLiberoMissingField('Sfida Serale', '   ', '2026-11-12')).toBe('Inserisci il nome del circolo.');
    });
    it('segnala nome e data mancanti, nell\'ordine nome, circolo, data', () => {
        expect(getTorneoLiberoMissingField('', 'Circolo', '2026-11-12')).toBe('Inserisci il nome del torneo libero.');
        expect(getTorneoLiberoMissingField('Sfida', 'Circolo', '')).toBe('Inserisci la data della giornata.');
    });
    it('ritorna null se tutto è compilato', () => {
        expect(getTorneoLiberoMissingField('Sfida', 'Circolo', '2026-11-12')).toBeNull();
    });
});

import { findIncompleteLiberoMatch, getLiberoWinner, isLiberoMatchComplete, LiberoMatchDraft } from './torneoLibero';

const empty = (): LiberoMatchDraft => ({
    team1: null, team2: null, team1Player1: null, team1Player2: null, team2Player1: null, team2Player2: null,
    scores: [{ team1: 0, team2: 0 }],
});

describe('Torneo Libero: partite incomplete', () => {
    it('una partita vuota non è incompleta (si ignora)', () => {
        expect(findIncompleteLiberoMatch([empty(), empty()], 'rotating')).toBeNull();
    });
    it('una partita con punteggio ma senza giocatori è incompleta e va segnalata', () => {
        const m = { ...empty(), scores: [{ team1: 6, team2: 3 }] };
        expect(findIncompleteLiberoMatch([empty(), m], 'rotating')).toBe(2);
    });
    it('una partita con soli alcuni giocatori scelti è incompleta', () => {
        const m = { ...empty(), team1Player1: 'a', team1Player2: 'b', team2Player1: 'c' };
        expect(findIncompleteLiberoMatch([m], 'rotating')).toBe(1);
        expect(isLiberoMatchComplete({ ...m, team2Player2: 'd' }, 'rotating')).toBe(true);
    });
    it('Coppie Fisse: serve la scelta di entrambe le squadre', () => {
        expect(findIncompleteLiberoMatch([{ ...empty(), team1: 'pair-0' }], 'fixed')).toBe(1);
        expect(findIncompleteLiberoMatch([{ ...empty(), team1: 'pair-0', team2: 'pair-1' }], 'fixed')).toBeNull();
    });
});

describe('Torneo Libero: esito dai game', () => {
    it('set in pareggio: nessuna vittoria (draw), non team2', () => {
        expect(getLiberoWinner([{ team1: 6, team2: 6 }])).toBe('draw');
        expect(getLiberoWinner([{ team1: 6, team2: 3 }, { team1: 3, team2: 6 }])).toBe('draw');
    });
    it('vince chi ha più game; 0-0 non assegna nulla', () => {
        expect(getLiberoWinner([{ team1: 6, team2: 3 }])).toBe('team1');
        expect(getLiberoWinner([{ team1: 2, team2: 7 }])).toBe('team2');
        expect(getLiberoWinner([{ team1: 0, team2: 0 }])).toBeNull();
    });
});
