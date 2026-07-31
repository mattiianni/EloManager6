import { describe, expect, it } from 'vitest';
import { formatPlayerName, formatPlayerShortName } from './format.ts';

describe('player name formatting', () => {
    it('adds the surname initial without a period to compact first-name labels', () => {
        expect(formatPlayerShortName({ name: 'Alberto', surname: 'Piazzini' })).toBe('Alberto P');
    });

    it('normalizes spaces and uppercases the surname initial', () => {
        expect(formatPlayerShortName({ name: '  Alberto ', surname: ' piazzini ' })).toBe('Alberto P');
    });

    it('does not invent an initial when the surname is missing', () => {
        expect(formatPlayerShortName({ name: 'Alberto', surname: '' })).toBe('Alberto');
    });

    it('keeps the existing complete-name formatter unchanged', () => {
        expect(formatPlayerName({ name: 'Alberto', surname: 'Piazzini' })).toBe('Alberto Piazzini');
    });
});
