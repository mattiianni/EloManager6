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
