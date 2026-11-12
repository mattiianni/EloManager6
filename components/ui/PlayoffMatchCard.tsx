import React from 'react';
import { Match, Player, SetScore } from '../../types.ts';
import { formatPlayerName } from '../../utils/format.ts';
import MatchScoreInput from './MatchScoreInput.tsx';
import { isPlayerDisabledForSlot } from '../../utils/playoffBypass.ts';

export interface PlayoffMatchCardProps {
    title?: string;
    matchIndex: number;
    team1: [string, string];
    team2: [string, string];
    sets: SetScore[];
    onSetsChange?: (sets: SetScore[]) => void;
    isEditing: boolean;
    tournamentPlayers: Player[];
    selectedPlayerIdsInPhase: string[];
    onPlayerChange?: (matchIndex: number, teamKey: 'team1' | 'team2', playerIndex: 0 | 1, newPlayerId: string) => void;
    isSingles?: boolean;
    getPlayerById: (id: string) => Player | undefined;
    bgColor?: string;
    titleColor?: string;
    scoreDisabled?: boolean;
}

export const PlayoffMatchCard: React.FC<PlayoffMatchCardProps> = ({
    title,
    matchIndex,
    team1,
    team2,
    sets,
    onSetsChange,
    isEditing,
    tournamentPlayers,
    selectedPlayerIdsInPhase,
    onPlayerChange,
    isSingles = false,
    getPlayerById,
    bgColor = 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 shadow-sm',
    titleColor = 'text-gray-800 dark:text-gray-200',
    scoreDisabled = false,
}) => {
    const t1p1 = getPlayerById(team1[0]);
    const t1p2 = getPlayerById(team1[1]);
    const t2p1 = getPlayerById(team2[0]);
    const t2p2 = getPlayerById(team2[1]);

    const selectClass = "block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-xs py-1.5 px-2.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-40 disabled:cursor-not-allowed";

    return (
        <div className={`p-3.5 rounded-xl space-y-2 mb-3 ${bgColor}`}>
            {title && (
                <div className="text-center pb-1 border-b border-black/5 dark:border-white/5">
                    <h4 className={`font-bold text-xs sm:text-sm ${titleColor}`}>
                        {title}
                    </h4>
                </div>
            )}

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                {/* Squadra A */}
                <div className="min-w-0 text-left space-y-1.5">
                    <div className="text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400">
                        Squadra A
                    </div>

                    {!isEditing ? (
                        <div className="space-y-0.5">
                            <p className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-gray-100 truncate">
                                {t1p1 ? formatPlayerName(t1p1) : (team1[0] || 'Da definire')}
                            </p>
                            {!isSingles && (
                                <p className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-gray-100 truncate">
                                    {t1p2 ? formatPlayerName(t1p2) : (team1[1] || 'Da definire')}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <select
                                value={team1[0] || ''}
                                onChange={(e) => onPlayerChange?.(matchIndex, 'team1', 0, e.target.value)}
                                className={selectClass}
                                aria-label={`Partita ${matchIndex + 1} - Squadra A Giocatore 1`}
                            >
                                <option value="">Seleziona Giocatore 1</option>
                                {tournamentPlayers.map((p) => (
                                    <option
                                        key={p.id}
                                        value={p.id}
                                        disabled={isPlayerDisabledForSlot(p.id, team1[0], selectedPlayerIdsInPhase)}
                                    >
                                        {p.name} {p.surname}
                                    </option>
                                ))}
                            </select>

                            {!isSingles && (
                                <select
                                    value={team1[1] || ''}
                                    onChange={(e) => onPlayerChange?.(matchIndex, 'team1', 1, e.target.value)}
                                    className={selectClass}
                                    aria-label={`Partita ${matchIndex + 1} - Squadra A Giocatore 2`}
                                >
                                    <option value="">Seleziona Giocatore 2</option>
                                    {tournamentPlayers.map((p) => (
                                        <option
                                            key={p.id}
                                            value={p.id}
                                            disabled={isPlayerDisabledForSlot(p.id, team1[1], selectedPlayerIdsInPhase)}
                                        >
                                            {p.name} {p.surname}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}
                </div>

                {/* VS Badge */}
                <div className="shrink-0 px-2 py-0.5 rounded-full bg-slate-200/60 dark:bg-white/10 text-[11px] font-black text-slate-500">
                    VS
                </div>

                {/* Squadra B */}
                <div className="min-w-0 text-right space-y-1.5">
                    <div className="text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400">
                        Squadra B
                    </div>

                    {!isEditing ? (
                        <div className="space-y-0.5">
                            <p className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-gray-100 truncate">
                                {t2p1 ? formatPlayerName(t2p1) : (team2[0] || 'Da definire')}
                            </p>
                            {!isSingles && (
                                <p className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-gray-100 truncate">
                                    {t2p2 ? formatPlayerName(t2p2) : (team2[1] || 'Da definire')}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <select
                                value={team2[0] || ''}
                                onChange={(e) => onPlayerChange?.(matchIndex, 'team2', 0, e.target.value)}
                                className={selectClass}
                                aria-label={`Partita ${matchIndex + 1} - Squadra B Giocatore 1`}
                            >
                                <option value="">Seleziona Giocatore 1</option>
                                {tournamentPlayers.map((p) => (
                                    <option
                                        key={p.id}
                                        value={p.id}
                                        disabled={isPlayerDisabledForSlot(p.id, team2[0], selectedPlayerIdsInPhase)}
                                    >
                                        {p.name} {p.surname}
                                    </option>
                                ))}
                            </select>

                            {!isSingles && (
                                <select
                                    value={team2[1] || ''}
                                    onChange={(e) => onPlayerChange?.(matchIndex, 'team2', 1, e.target.value)}
                                    className={selectClass}
                                    aria-label={`Partita ${matchIndex + 1} - Squadra B Giocatore 2`}
                                >
                                    <option value="">Seleziona Giocatore 2</option>
                                    {tournamentPlayers.map((p) => (
                                        <option
                                            key={p.id}
                                            value={p.id}
                                            disabled={isPlayerDisabledForSlot(p.id, team2[1], selectedPlayerIdsInPhase)}
                                        >
                                            {p.name} {p.surname}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Score Input */}
            {onSetsChange && (
                <div className="pt-2 flex justify-center border-t border-black/5 dark:border-white/5">
                    <MatchScoreInput
                        sets={sets || []}
                        onSetsChange={onSetsChange}
                        disabled={scoreDisabled || isEditing}
                    />
                </div>
            )}
        </div>
    );
};
