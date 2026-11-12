import { describe, it, expect } from 'vitest';
import { normalizeScoreInput, scoreDisplayValue } from './scoreInput';

describe('scoreInput', () => {
    it('elimina zeri iniziali e caratteri non numerici', () => {
        expect(normalizeScoreInput('02')).toBe(2);
        expect(normalizeScoreInput('6')).toBe(6);
        expect(normalizeScoreInput('')).toBe(0);
        expect(normalizeScoreInput('a7')).toBe(7);
        expect(normalizeScoreInput('123')).toBe(12);
    });
    it('mostra vuoto per 0-0 e 0 solo se l\'altro lato ha punti', () => {
        expect(scoreDisplayValue(0, 0)).toBe('');
        expect(scoreDisplayValue(0, 6)).toBe('0');
        expect(scoreDisplayValue(6, 0)).toBe('6');
    });
});
