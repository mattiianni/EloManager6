export interface PlayerNameInput {
    name: string;
    surname: string;
}

export const formatPlayerName = (player?: PlayerNameInput | null): string => {
    if (!player) return '?';
    const name = (player.name || '').trim();
    const surname = (player.surname || '').trim();
    if (!surname) return name;
    return `${name} ${surname}`;
};

/**
 * Compact player label used wherever the UI previously displayed only the first name.
 * Example: "Alberto Piazzini" becomes "Alberto P".
 */
export const formatPlayerShortName = (player?: PlayerNameInput | null): string => {
    if (!player) return '?';
    const name = (player.name || '').trim();
    const surname = (player.surname || '').trim();
    if (!name) return surname || '?';
    if (!surname) return name;
    const initial = Array.from(surname)[0]?.toLocaleUpperCase('it-IT') || '';
    return initial ? `${name} ${initial}` : name;
};
