import React, { useState, useMemo, useEffect } from 'react';
import { Player, Tournament, Match, EloHistoryEntry, TournamentType } from '../types.ts';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import Modal from './ui/Modal.tsx';
import Button from './ui/Button.tsx';
import { printPlayerProfiles } from '../services/printService.ts';

export interface TournamentGroupOption {
    groupId: string;
    displayName: string;
    date: string;
    tournaments: Tournament[];
    tournamentIds: string[];
    totalMatchesPlayed: number;
    activePlayerIds: string[];
}

export interface PlayerPrintModalProps {
    isOpen: boolean;
    onClose: () => void;
    players: Player[];
    matches?: Match[];
    tournaments?: Tournament[];
    eloHistory?: EloHistoryEntry[];
    onPrintAll: () => void;
    onPrintSelected: (selectedIds: string[]) => void;
    onPrintTournament?: (tournamentGroup: TournamentGroupOption, playerIds: string[]) => void;
}

export default function PlayerPrintModal({
    isOpen,
    onClose,
    players,
    matches,
    tournaments,
    eloHistory,
    onPrintAll,
    onPrintSelected,
    onPrintTournament
}: PlayerPrintModalProps) {
    const store = usePadelStore();
    const effectiveMatches = matches || store.matches || [];
    const effectiveTournaments = tournaments || store.tournaments || [];
    const effectiveEloHistory = eloHistory || store.eloHistory || [];

    const [phase, setPhase] = useState<1 | 2 | 3>(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectedGroupId, setSelectedGroupId] = useState<string>('');

    // Calcolo dei tornei attivi e dei rispettivi giocatori partecipanti
    const tournamentGroups = useMemo<TournamentGroupOption[]>(() => {
        const groups: Record<string, Tournament[]> = {};
        const labels: Record<string, string> = {};

        effectiveTournaments.forEach(t => {
            const groupId =
                t.type === TournamentType.TorneoASquadre
                    ? (t.teamTournamentRootId || t.id)
                    : (t.giornataName || t.name);

            if (!groups[groupId]) {
                groups[groupId] = [];
            }
            groups[groupId].push(t);

            if (t.type === TournamentType.TorneoASquadre) {
                const root = t.teamTournamentRootId
                    ? effectiveTournaments.find(x => x.id === t.teamTournamentRootId) || t
                    : t;
                labels[groupId] = root.name;
            } else {
                labels[groupId] = t.giornataName || t.name;
            }
        });

        const list: TournamentGroupOption[] = Object.keys(groups).map(groupId => {
            const groupTournaments = groups[groupId];
            const tournamentIds = groupTournaments.map(t => t.id);
            const tSet = new Set(tournamentIds);

            // Filtra solo le partite con punteggio o vincitore registrato
            const groupMatches = effectiveMatches.filter(m => m.tournamentId && tSet.has(m.tournamentId));
            const playedMatches = groupMatches.filter(m =>
                m.winner || (m.sets && m.sets.some(s => Number(s.team1 || 0) > 0 || Number(s.team2 || 0) > 0))
            );

            // Estrai solo i giocatori con almeno 1 partita giocata
            const activePlayerIdsSet = new Set<string>();
            playedMatches.forEach(m => {
                [...(m.team1 || []), ...(m.team2 || [])].forEach(id => {
                    if (id) activePlayerIdsSet.add(id);
                });
            });

            // Data più recente tra le giornate
            const sortedDates = groupTournaments
                .map(t => t.date)
                .filter(Boolean)
                .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
            const latestDate = sortedDates[0] || new Date().toISOString();

            return {
                groupId,
                displayName: labels[groupId] || groupId,
                date: latestDate,
                tournaments: groupTournaments,
                tournamentIds,
                totalMatchesPlayed: playedMatches.length,
                activePlayerIds: Array.from(activePlayerIdsSet)
            };
        });

        // Ordina per data decrescente (i più recenti in alto)
        return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [effectiveTournaments, effectiveMatches]);

    // Torneo attualmente selezionato nella Fase 3
    const selectedGroup = useMemo(() => {
        return tournamentGroups.find(g => g.groupId === selectedGroupId) || null;
    }, [tournamentGroups, selectedGroupId]);

    const selectedGroupPlayers = useMemo(() => {
        if (!selectedGroup) return [];
        const idSet = new Set(selectedGroup.activePlayerIds);
        return players
            .filter(p => idSet.has(p.id))
            .sort((a, b) => b.currentElo - a.currentElo);
    }, [selectedGroup, players]);

    // Filter and sort players for Phase 2
    const filteredPlayers = useMemo(() => {
        return players
            .filter(p => `${p.name} ${p.surname}`.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => b.currentElo - a.currentElo);
    }, [players, searchTerm]);

    const handlePrintAllPhase1 = () => {
        onPrintAll();
        onClose();
    };

    const handleSelectAll = () => {
        const newSet = new Set(selectedIds);
        filteredPlayers.forEach(p => newSet.add(p.id));
        setSelectedIds(newSet);
    };

    const handleDeselectAll = () => {
        const newSet = new Set(selectedIds);
        filteredPlayers.forEach(p => newSet.delete(p.id));
        setSelectedIds(newSet);
    };

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const handlePrintSelected = () => {
        onPrintSelected(Array.from(selectedIds));
        onClose();
    };

    const handlePrintTournamentSelected = () => {
        if (!selectedGroup || selectedGroup.activePlayerIds.length === 0) return;
        if (onPrintTournament) {
            onPrintTournament(selectedGroup, selectedGroup.activePlayerIds);
        } else {
            printPlayerProfiles(
                selectedGroup.activePlayerIds,
                players,
                effectiveMatches,
                effectiveEloHistory,
                effectiveTournaments,
                {
                    tournamentFilter: {
                        tournamentId: selectedGroup.groupId,
                        tournamentName: selectedGroup.displayName,
                        tournamentIds: selectedGroup.tournamentIds,
                        tournamentDate: selectedGroup.date
                    }
                }
            );
        }
        onClose();
    };

    // Reset state when opening/closing
    useEffect(() => {
        if (isOpen) {
            setPhase(1);
            setSearchTerm('');
            setSelectedIds(new Set());
            setSelectedGroupId('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    // FASE 1: Scelta Principale (3 Opzioni)
    if (phase === 1) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Stampa Giocatori">
                <div className="flex flex-col space-y-3 pt-3">
                    <p className="text-gray-600 dark:text-gray-300 text-sm mb-1 text-center">
                        Cosa desideri stampare?
                    </p>
                    <Button onClick={handlePrintAllPhase1} variant="primary" fullWidth size="lg">
                        Tutti i Giocatori ({players.length})
                    </Button>
                    <Button onClick={() => setPhase(3)} variant="secondary" fullWidth size="lg">
                        Giocatori Singolo Torneo...
                    </Button>
                    <Button onClick={() => setPhase(2)} variant="secondary" fullWidth size="lg">
                        Scegli Giocatori...
                    </Button>
                </div>
            </Modal>
        );
    }

    // FASE 3: Selezione Singolo Torneo Attivo
    if (phase === 3) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Giocatori Singolo Torneo">
                <div className="flex flex-col space-y-4 pt-2">
                    <p className="text-gray-600 dark:text-gray-300 text-xs leading-relaxed">
                        Seleziona uno dei tornei attivi: verranno filtrati automaticamente solo i giocatori che hanno disputato almeno una partita in quel torneo e solo le statistiche relative.
                    </p>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                            Torneo Attivo
                        </label>
                        <select
                            value={selectedGroupId}
                            onChange={e => setSelectedGroupId(e.target.value)}
                            className="block w-full bg-slate-50/70 dark:bg-slate-800/80 border border-slate-200/60 dark:border-white/10 rounded-xl shadow-sm py-2.5 px-3.5 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-base sm:text-sm font-medium text-slate-900 dark:text-white transition-all"
                        >
                            <option value="">-- Seleziona un Torneo ({tournamentGroups.length} disponibili) --</option>
                            {tournamentGroups.map(g => (
                                <option key={g.groupId} value={g.groupId}>
                                    {g.displayName} ({new Date(g.date).toLocaleDateString('it-IT')}) — {g.activePlayerIds.length} giocatori
                                </option>
                            ))}
                        </select>
                    </div>

                    {selectedGroup && (
                        <div className="bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200/60 dark:border-sky-800/40 rounded-xl p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-sky-900 dark:text-sky-200">
                                    {selectedGroup.displayName}
                                </span>
                                <span className="text-sky-600 dark:text-sky-400 font-medium">
                                    {selectedGroup.tournaments.length > 1
                                        ? `${selectedGroup.tournaments.length} Giornate`
                                        : 'Giornata Singola'}
                                </span>
                            </div>

                            <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                                <div>Partite giocate: <strong className="text-slate-900 dark:text-white">{selectedGroup.totalMatchesPlayed}</strong></div>
                                <div>Giocatori attivi: <strong className="text-slate-900 dark:text-white">{selectedGroupPlayers.length}</strong></div>
                            </div>

                            {selectedGroupPlayers.length === 0 ? (
                                <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                                    Nessuna partita con punteggio registrato trovata per questo torneo.
                                </p>
                            ) : (
                                <div>
                                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                                        Giocatori che hanno partecipato:
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                                        {selectedGroupPlayers.map(p => (
                                            <span
                                                key={p.id}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/80 dark:bg-slate-800/80 text-xs font-semibold text-slate-900 dark:text-white border border-slate-200/60 dark:border-white/10 shadow-sm"
                                            >
                                                <span>{p.name} {p.surname}</span>
                                                <span className="text-[10px] text-sky-600 dark:text-sky-400 font-mono">
                                                    {p.currentElo.toFixed(0)}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="pt-2 flex flex-col space-y-2">
                        <Button
                            onClick={handlePrintTournamentSelected}
                            variant="primary"
                            fullWidth
                            size="lg"
                            disabled={!selectedGroup || selectedGroupPlayers.length === 0}
                        >
                            Stampa Giocatori del Torneo ({selectedGroupPlayers.length})
                        </Button>
                        <Button onClick={() => setPhase(1)} variant="outline" fullWidth>
                            Indietro
                        </Button>
                    </div>
                </div>
            </Modal>
        );
    }

    // FASE 2: Scelta Manuale Giocatori
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Scegli Giocatori">
            <div className="flex flex-col space-y-4 pt-2">
                <input
                    type="text"
                    placeholder="Cerca giocatori..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="block w-full bg-slate-50/70 dark:bg-slate-800/80 border border-slate-200/60 dark:border-white/10 rounded-xl shadow-sm py-2.5 px-3.5 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-base sm:text-sm transition-all"
                />

                <div className="flex justify-between items-center text-xs font-semibold px-1">
                    <button onClick={handleSelectAll} className="text-sky-600 dark:text-sky-400 hover:underline py-1.5">
                        Seleziona Tutti
                    </button>
                    <button onClick={handleDeselectAll} className="text-slate-500 dark:text-slate-400 hover:underline py-1.5">
                        Deseleziona Tutti
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-y-1.5 max-h-[48vh] overflow-y-auto pr-1">
                    {filteredPlayers.length === 0 ? (
                        <p className="text-center text-slate-500 dark:text-slate-400 py-6 text-sm">Nessun giocatore trovato.</p>
                    ) : (
                        filteredPlayers.map(p => (
                            <label key={p.id} className={`flex items-center justify-between cursor-pointer p-3 rounded-xl border transition-all ${selectedIds.has(p.id) ? 'border-sky-500/50 bg-sky-500/10' : 'border-slate-200/60 dark:border-white/10 bg-white/60 dark:bg-slate-800/40 hover:bg-slate-100/70 dark:hover:bg-white/5'}`}>
                                <div className="flex items-center space-x-3">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedIds.has(p.id)} 
                                        onChange={() => toggleSelection(p.id)} 
                                        className="h-4 w-4 rounded text-sky-500 border-slate-300 dark:border-slate-600 focus:ring-sky-500" 
                                    />
                                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{p.name} {p.surname}</span>
                                </div>
                                <span className="text-xs font-bold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">ELO {p.currentElo.toFixed(0)}</span>
                            </label>
                        ))
                    )}
                </div>

                <div className="pt-2 flex flex-col space-y-2">
                    <Button 
                        onClick={handlePrintSelected} 
                        variant="primary" 
                        fullWidth 
                        size="lg"
                        disabled={selectedIds.size === 0}
                    >
                        Stampa Selezionati ({selectedIds.size})
                    </Button>
                    <Button onClick={() => setPhase(1)} variant="outline" fullWidth>
                        Indietro
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
