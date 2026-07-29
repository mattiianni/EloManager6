import React, { useState, useMemo } from 'react';
import { Player } from '../types.ts';
import Modal from './ui/Modal.tsx';
import Button from './ui/Button.tsx';

interface PlayerPrintModalProps {
    isOpen: boolean;
    onClose: () => void;
    players: Player[];
    onPrintAll: () => void;
    onPrintSelected: (selectedIds: string[]) => void;
}

export default function PlayerPrintModal({
    isOpen,
    onClose,
    players,
    onPrintAll,
    onPrintSelected
}: PlayerPrintModalProps) {
    const [phase, setPhase] = useState<1 | 2>(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Filter and sort players identically to other parts of the app
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

    // Reset state when opening/closing
    React.useEffect(() => {
        if (isOpen) {
            setPhase(1);
            setSearchTerm('');
            setSelectedIds(new Set());
        }
    }, [isOpen]);

    if (!isOpen) return null;

    if (phase === 1) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Stampa Giocatori">
                <div className="flex flex-col space-y-4 pt-4">
                    <p className="text-gray-600 dark:text-gray-300 text-sm mb-2 text-center">
                        Cosa desideri stampare?
                    </p>
                    <Button onClick={handlePrintAllPhase1} variant="primary" fullWidth size="lg">
                        Tutti i Giocatori ({players.length})
                    </Button>
                    <Button onClick={() => setPhase(2)} variant="secondary" fullWidth size="lg">
                        Scegli Giocatori...
                    </Button>
                </div>
            </Modal>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Scegli Giocatori">
            <div className="flex flex-col space-y-4 pt-2">
                <input
                    type="text"
                    placeholder="Cerca giocatori..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="block w-full bg-slate-50/70 dark:bg-slate-800/80 border border-slate-200/60 dark:border-white/10 rounded-xl shadow-sm py-2.5 px-3.5 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-sm transition-all"
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
                    <Button onClick={() => setPhase(1)} variant="secondary" fullWidth>
                        Indietro
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
