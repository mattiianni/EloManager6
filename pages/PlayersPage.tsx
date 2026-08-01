import React, { useState, useEffect, useMemo } from 'react';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import { Player, FieldPosition } from '../types.ts';
import { SFIcon } from '../components/ui/SFIcon.tsx';
import HIGButton from '../components/ui/HIGButton.tsx';
import { HIGSheet } from '../components/ui/HIGSheet.tsx';
import HIGSegmentedControl from '../components/ui/HIGSegmentedControl.tsx';
import PlayerProfileModal from '../components/PlayerProfileModal.tsx';
import { printPlayerProfiles } from '../services/printService.ts';
import PlayerPrintModal from '../components/PlayerPrintModal.tsx';
import EloPlaytomicInput from '../components/EloPlaytomicInput.tsx';
import Card from '../components/ui/Card.tsx';
import { useAuth } from '../hooks/useAuth.tsx';
import { usePlayerSimilarity, SimilarityResult } from '../hooks/usePlayerSimilarity.ts';
import PlayerSimilarityModal from '../components/PlayerSimilarityModal.tsx';
import { HIGAlert } from '../components/ui/HIGAlert';
import PlayerAvatar from '../components/ui/PlayerAvatar.tsx';
import { showHIGAlert } from '../utils/higDialogService.ts';

const PlayersPage: React.FC = () => {
    const { workspace } = useAuth();
    const workspaceId = workspace?.id;
    const { searchSimilarPlayer, isSearching } = usePlayerSimilarity(workspaceId);
    const { players, matches, tournaments, eloHistory, addPlayer, deletePlayer, updatePlayerAndElo, loading } = usePadelStore();
    
    // Sort State
    const [sortIndex, setSortIndex] = useState(0); // 0 = Name, 1 = Surname, 2 = ELO
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const sortOptions = ['Nome', 'Cognome', 'ELO'];

    // Add Player Sheet State
    const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
    const [name, setName] = useState('');
    const [surname, setSurname] = useState('');
    const [position, setPosition] = useState<FieldPosition>(FieldPosition.Indifferente);
    const [addElo, setAddElo] = useState<string>('1500');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Similarity Modal State
    const [similarityCandidates, setSimilarityCandidates] = useState<SimilarityResult[]>([]);
    const [isSimilarityModalOpen, setIsSimilarityModalOpen] = useState(false);

    // Edit Player Sheet State
    const [playerToEdit, setPlayerToEdit] = useState<Player | null>(null);
    const [editName, setEditName] = useState('');
    const [editSurname, setEditSurname] = useState('');
    const [editPosition, setEditPosition] = useState<FieldPosition>(FieldPosition.Indifferente);
    const [editElo, setEditElo] = useState('');
    const [editTournamentId, setEditTournamentId] = useState<string>('');
    const [editSurnameError, setEditSurnameError] = useState<string | null>(null);

    // Profile State
    const [profilePlayer, setProfilePlayer] = useState<Player | null>(null);

    useEffect(() => {
        if (playerToEdit) {
            setEditName(playerToEdit.name);
            setEditSurname(playerToEdit.surname);
            setEditPosition(playerToEdit.position);
            setEditElo(playerToEdit.currentElo.toFixed(2));
            setEditTournamentId('');
            setEditSurnameError(null);
        }
    }, [playerToEdit]);

    // Determine if the player being edited has played at least one match
    const playerHasMatches = playerToEdit
        ? matches.some(m =>
            m.team1.includes(playerToEdit.id) || m.team2.includes(playerToEdit.id)
          )
        : false;

    const executeAddPlayer = async () => {
        setIsSubmitting(true);
        try {
            await addPlayer(name.trim(), surname.trim(), position, parseFloat(addElo));
            setName('');
            setSurname('');
            setPosition(FieldPosition.Indifferente);
            setAddElo('1500');
            setIsAddSheetOpen(false);
            setIsSimilarityModalOpen(false);
        } catch (error) {
            console.error("Failed to add player:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const nName = name.trim();
        const nSurname = surname.trim();
        if (nName && nSurname) {
            if (nName.length < 2 || nSurname.length < 2) {
                showHIGAlert("Il nome e il cognome devono avere almeno 2 lettere.");
                return;
            }
            const isDuplicate = players.some(p => 
                p.name.toLowerCase() === nName.toLowerCase() && 
                p.surname.toLowerCase() === nSurname.toLowerCase()
            );
            if (isDuplicate) {
                showHIGAlert("Attenzione: Esiste già un giocatore con questo nome e cognome!");
                return;
            }
            const similar = await searchSimilarPlayer(nName, nSurname);
            if (similar.length > 0) {
                setSimilarityCandidates(similar);
                setIsSimilarityModalOpen(true);
            } else {
                await executeAddPlayer();
            }
        }
    };

    const [deleteAlert, setDeleteAlert] = useState<{
        isOpen: boolean;
        playerId: string | null;
        isDeleting?: boolean;
        progressPercent?: number;
        loadingText?: string;
    }>({ isOpen: false, playerId: null, isDeleting: false, progressPercent: 0, loadingText: '' });

    const handleDelete = (playerId: string) => {
        setDeleteAlert({ isOpen: true, playerId, isDeleting: false, progressPercent: 0, loadingText: '' });
    };

    const handleConfirmDeletePlayer = async () => {
        if (!deleteAlert.playerId) return;
        setDeleteAlert(prev => ({
            ...prev,
            isDeleting: true,
            progressPercent: 15,
            loadingText: "Eliminazione giocatore in corso..."
        }));

        try {
            const interval = setInterval(() => {
                setDeleteAlert(prev => {
                    if (prev.progressPercent && prev.progressPercent < 85) {
                        return { ...prev, progressPercent: prev.progressPercent + 20 };
                    }
                    return prev;
                });
            }, 100);

            await deletePlayer(deleteAlert.playerId);

            clearInterval(interval);
            setDeleteAlert(prev => ({ ...prev, progressPercent: 100, loadingText: "Completato!" }));
            
            setTimeout(() => {
                setDeleteAlert({ isOpen: false, playerId: null, isDeleting: false, progressPercent: 0, loadingText: '' });
            }, 300);
        } catch (error) {
            console.error("Errore eliminazione giocatore:", error);
            setDeleteAlert({ isOpen: false, playerId: null, isDeleting: false, progressPercent: 0, loadingText: '' });
        }
    };
    
    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newElo = parseFloat(editElo);
        const eName = editName.trim();
        const eSurname = editSurname.trim();
        if (playerToEdit && eName && eSurname && !isNaN(newElo)) {
            if (eName.length < 2 || eSurname.length < 2) {
                showHIGAlert("Il nome e il cognome devono avere almeno 2 lettere.");
                return;
            }
            const isDuplicate = players.some(p => 
                p.id !== playerToEdit.id &&
                p.name.toLowerCase() === eName.toLowerCase() && 
                p.surname.toLowerCase() === eSurname.toLowerCase()
            );
            if (isDuplicate) {
                showHIGAlert("Attenzione: Esiste già un altro giocatore con questo nome e cognome!");
                return;
            }
            setEditSurnameError(null);
            setIsSubmitting(true);
            try {
                await updatePlayerAndElo(playerToEdit.id, {
                    name: eName,
                    surname: eSurname,
                    position: editPosition,
                }, newElo, editTournamentId || undefined);
                setPlayerToEdit(null);
            } catch (error: any) {
                // Show the server's Levenshtein error message inline instead of crashing
                const msg = error?.message || String(error);
                if (msg.includes('cognome') || msg.includes('20%') || msg.includes('limite')) {
                    setEditSurnameError(msg);
                } else {
                    console.error("Failed to update player:", error);
                }
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    const sortedPlayers = useMemo(() => {
        return [...players].sort((a, b) => {
            if (sortIndex === 0) return a.name.localeCompare(b.name);
            if (sortIndex === 1) return a.surname.localeCompare(b.surname);
            return b.currentElo - a.currentElo; // ELO descending
        });
    }, [players, sortIndex]);

    return (
        <div className="px-0 py-4 space-y-5">
            {/* Header Actions */}
            <div style={{ padding: '0 0', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }} className="sm:flex-row sm:justify-between sm:items-center">
                <HIGSegmentedControl 
                    segments={sortOptions}
                    selectedIndex={sortIndex}
                    onChange={setSortIndex}
                    className="w-full sm:w-[300px]"
                />
                <div className="flex w-full sm:w-auto gap-2">
                    <HIGButton 
                        variant="gray"
                        onClick={() => setIsPrintModalOpen(true)}
                        disabled={loading || players.length === 0}
                        className="flex-1 sm:flex-none"
                    >
                        <SFIcon name="printer" size={18} />
                    </HIGButton>
                    <HIGButton 
                        variant="filled"
                        onClick={() => setIsAddSheetOpen(true)}
                        className="flex-1 sm:flex-none"
                    >
                        <SFIcon name="plus" size={18} />
                        <span className="ml-1">Nuovo</span>
                    </HIGButton>
                </div>
            </div>

            {/* Players List */}
            <Card title={`Roster (${players.length})`}>
                <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {loading ? (
                        <div className="py-6 text-center text-ios-label-secondary">Caricamento...</div>
                    ) : sortedPlayers.length === 0 ? (
                        <div className="py-6 text-center text-ios-label-secondary">Nessun giocatore registrato</div>
                    ) : (
                        sortedPlayers.map((player) => (
                            <div key={player.id} className="flex justify-between items-center py-2.5 first:pt-0 last:pb-0">
                                <div className="flex items-center gap-3 min-w-0">
                                    <PlayerAvatar name={player.name} surname={player.surname} id={player.id} elo={player.currentElo} size="md" />
                                    <div className="min-w-0">
                                        <div className="font-semibold text-ios-label text-[15px] truncate">
                                            {sortIndex === 1 ? `${player.surname} ${player.name}` : `${player.name} ${player.surname}`}
                                        </div>
                                        <div className="text-[12px] text-ios-label-secondary mt-0.5">{player.position}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="font-bold text-ios-blue text-[15px]">{player.currentElo.toFixed(0)}</span>
                                    <button onClick={(e) => { e.stopPropagation(); setProfilePlayer(player); }} className="text-ios-green p-1" aria-label="Profilo"><SFIcon name="info.circle" size={16}/></button>
                                    <button onClick={(e) => { e.stopPropagation(); setPlayerToEdit(player); }} className="text-ios-blue p-1" aria-label="Modifica"><SFIcon name="pencil" size={16}/></button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(player.id); }} className="text-ios-red p-1" aria-label="Elimina"><SFIcon name="trash" size={16}/></button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>

            {/* Add Player Sheet */}
            <HIGSheet 
                isOpen={isAddSheetOpen} 
                onClose={() => setIsAddSheetOpen(false)}
                title="Nuovo Giocatore"
            >
                <form onSubmit={handleAddSubmit} className="space-y-6 pt-4 pb-8">
                    <div className="bg-ios-bg-secondary rounded-xl overflow-hidden mx-4">
                        <div className="flex flex-col sm:flex-row sm:items-center px-4 py-5">
                            <label className="sm:w-1/3 text-sm font-medium text-ios-label-secondary mb-1 sm:mb-0">Nome</label>
                            <input
                                type="text"
                                placeholder="Inserisci il nome"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="sm:w-2/3 bg-transparent text-ios-label focus:outline-none"
                                required
                            />
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center px-4 py-5">
                            <label className="sm:w-1/3 text-sm font-medium text-ios-label-secondary mb-1 sm:mb-0">Cognome</label>
                            <input
                                type="text"
                                placeholder="Inserisci il cognome"
                                value={surname}
                                onChange={(e) => setSurname(e.target.value)}
                                className="sm:w-2/3 bg-transparent text-ios-label focus:outline-none"
                                required
                            />
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center px-4 py-5">
                            <label className="sm:w-1/3 text-sm font-medium text-ios-label-secondary mb-1 sm:mb-0">Posizione</label>
                            <select
                                value={position}
                                onChange={(e) => setPosition(e.target.value as FieldPosition)}
                                className="sm:w-2/3 bg-transparent text-ios-label focus:outline-none"
                            >
                                {Object.values(FieldPosition).map(pos => (
                                    <option key={pos} value={pos}>{pos}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    
                    <Card title="Impostazioni ELO">
                        <div className="px-4 py-4 border-b" style={{ borderColor: 'var(--ios-separator)' }}>
                            <EloPlaytomicInput
                                elo={parseFloat(addElo) || 0}
                                onEloChange={(elo) => setAddElo(elo.toString())}
                            />
                        </div>
                    </Card>

                    <div className="px-4">
                        <HIGButton type="submit" variant="filled" fullWidth disabled={isSubmitting || !name || !surname}>
                            {isSubmitting ? 'Salvataggio...' : 'Aggiungi Giocatore'}
                        </HIGButton>
                    </div>
                </form>
            </HIGSheet>

            {/* Edit Player Sheet */}
            <HIGSheet 
                isOpen={!!playerToEdit} 
                onClose={() => setPlayerToEdit(null)}
                title="Modifica Giocatore"
            >
                <form onSubmit={handleEditSubmit} className="space-y-6 pt-4 pb-8">
                    <div className="bg-ios-bg-secondary rounded-xl overflow-hidden mx-4">
                        <div className="flex flex-col sm:flex-row sm:items-center px-4 py-5">
                            <label className="sm:w-1/3 text-sm font-medium text-ios-label-secondary mb-1 sm:mb-0">Nome</label>
                            <input
                                type="text"
                                placeholder="Inserisci il nome"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="sm:w-2/3 bg-transparent text-ios-label focus:outline-none"
                                required
                            />
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center px-4 py-5">
                            <label className="sm:w-1/3 text-sm font-medium text-ios-label-secondary mb-1 sm:mb-0">
                                Cognome
                                {playerHasMatches && (
                                    <span className="ml-2 text-[10px] font-semibold text-ios-orange bg-orange-50 border border-orange-200 rounded px-1 py-0.5" title="Modifiche al cognome sono limitate al 20% per proteggere lo storico ELO">
                                        🔒 protetto
                                    </span>
                                )}
                            </label>
                            <div className="sm:w-2/3 flex flex-col gap-1">
                                <input
                                    type="text"
                                    placeholder="Inserisci il cognome"
                                    value={editSurname}
                                    onChange={(e) => { setEditSurname(e.target.value); setEditSurnameError(null); }}
                                    className={`bg-transparent text-ios-label focus:outline-none w-full ${editSurnameError ? 'text-ios-red' : ''}`}
                                    required
                                />
                                {editSurnameError && (
                                    <p className="text-xs text-ios-red leading-snug">{editSurnameError}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center px-4 py-5">
                            <label className="sm:w-1/3 text-sm font-medium text-ios-label-secondary mb-1 sm:mb-0">Posizione</label>
                            <select
                                value={editPosition}
                                onChange={(e) => setEditPosition(e.target.value as FieldPosition)}
                                className="sm:w-2/3 bg-transparent text-ios-label focus:outline-none"
                            >
                                {Object.values(FieldPosition).map(pos => (
                                    <option key={pos} value={pos}>{pos}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <Card title="Impostazioni ELO">
                        <div className="px-4 py-4 border-b" style={{ borderColor: 'var(--ios-separator)' }}>
                            <EloPlaytomicInput
                                elo={parseFloat(editElo) || 0}
                                onEloChange={(elo) => setEditElo(elo.toString())}
                            />
                        </div>
                        {parseFloat(editElo) !== playerToEdit?.currentElo && (
                            <div className="px-4 py-2">
                                <label className="text-xs text-ios-label-secondary mb-1 block">Aggiorna classifica in</label>
                                <select
                                    value={editTournamentId}
                                    onChange={(e) => setEditTournamentId(e.target.value)}
                                    className="w-full bg-transparent text-ios-label focus:outline-none"
                                >
                                    <option value="">Solo classifica generale</option>
                                    {Array.from(new Set(tournaments.map(t => t.giornataName || t.name))).map(seriesName => {
                                        const seriesTournaments = tournaments.filter(t => (t.giornataName || t.name) === seriesName);
                                        const lastTournament = seriesTournaments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                                        return (
                                            <option key={lastTournament.id} value={lastTournament.id}>
                                                {seriesName}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        )}
                    </Card>

                    <div className="px-4">
                        <HIGButton type="submit" variant="success" fullWidth disabled={isSubmitting}>
                            {isSubmitting ? 'Salvataggio...' : 'Salva Modifiche'}
                        </HIGButton>
                    </div>
                </form>
            </HIGSheet>

            <PlayerProfileModal player={profilePlayer} onClose={() => setProfilePlayer(null)} />

            <PlayerSimilarityModal
                isOpen={isSimilarityModalOpen}
                onClose={() => setIsSimilarityModalOpen(false)}
                candidates={similarityCandidates}
                inputName={name}
                inputSurname={surname}
                onCreateNew={executeAddPlayer}
                onSelect={(selectedPlayer) => {
                    setIsSimilarityModalOpen(false);
                    setIsAddSheetOpen(false);
                    const p = players.find(x => x.id === selectedPlayer.id);
                    if (p) setPlayerToEdit(p);
                }}
            />

            <PlayerPrintModal
                isOpen={isPrintModalOpen}
                onClose={() => setIsPrintModalOpen(false)}
                players={players}
                onPrintAll={() => {
                    printPlayerProfiles(players.map(p => p.id), players, matches, eloHistory, tournaments);
                }}
                onPrintSelected={(selectedIds) => {
                    printPlayerProfiles(selectedIds, players, matches, eloHistory, tournaments);
                }}
            />

            <HIGAlert
                isOpen={deleteAlert.isOpen}
                title="Elimina Giocatore"
                message="Sei sicuro di voler eliminare questo giocatore? Verranno eliminate anche tutte le sue partite e lo storico collegato."
                isLoading={deleteAlert.isDeleting}
                loadingText={deleteAlert.loadingText}
                progressPercent={deleteAlert.progressPercent}
                actions={[
                    {
                        label: "Elimina Giocatore",
                        style: "destructive",
                        onPress: handleConfirmDeletePlayer
                    },
                    {
                        label: "Annulla",
                        style: "cancel",
                        onPress: () => setDeleteAlert({ isOpen: false, playerId: null, isDeleting: false, progressPercent: 0, loadingText: '' })
                    }
                ]}
            />
        </div>
    );
};

export default PlayersPage;
