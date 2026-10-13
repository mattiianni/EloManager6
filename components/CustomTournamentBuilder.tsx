import React, { useState, useMemo } from 'react';
import Card from './ui/Card.tsx';
import Button from './ui/Button.tsx';
import { MaterialIcon } from './ui/Icons.tsx';
import {
  PhaseBlockId,
  PlayerMode,
  ALL_PHASE_BLOCKS,
  CustomTournamentFlowConfig
} from '../types/customTournament.ts';
import { validateCustomFlow } from '../utils/customTournamentValidator.ts';

interface CustomTournamentBuilderProps {
  onConfirm: (config: CustomTournamentFlowConfig) => void;
  onBack: () => void;
  initialPlayerMode?: PlayerMode;
  initialCampi?: number;
  initialPhases?: PhaseBlockId[];
  numPartecipanti?: number; // Quante coppie o quanti giocatori se già noti
  hidePlayerModeToggle?: boolean; // Se true (es. da +inserisci giornata), non mostra il toggle coppie/singoli
}

const CustomTournamentBuilder: React.FC<CustomTournamentBuilderProps> = ({
  onConfirm,
  onBack,
  initialPlayerMode = 'pairs',
  initialCampi = 2,
  initialPhases = [],
  numPartecipanti = 0,
  hidePlayerModeToggle = false,
}) => {
  const [playerMode, setPlayerMode] = useState<PlayerMode>(initialPlayerMode);
  const [numCampi, setNumCampi] = useState<number>(initialCampi);
  const [selectedPhases, setSelectedPhases] = useState<PhaseBlockId[]>(initialPhases);
  const [draggedBlockId, setDraggedBlockId] = useState<PhaseBlockId | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Helper per calcolare partecipanti di default in base a modalità e campi
  const getDefaultPartecipanti = (mode: PlayerMode, campi: number) => {
    if (mode === 'singles') {
      return campi * 4;
    }
    return Math.max(3, campi * 3);
  };

  const [selectedPartecipanti, setSelectedPartecipanti] = useState<number>(() => {
    if (hidePlayerModeToggle && numPartecipanti > 0) {
      return numPartecipanti;
    }
    return numPartecipanti > 0 ? numPartecipanti : getDefaultPartecipanti(initialPlayerMode as PlayerMode, initialCampi);
  });

  const effectivePartecipanti = hidePlayerModeToggle && numPartecipanti > 0 ? numPartecipanti : selectedPartecipanti;

  const [isCustomPartecipanti, setIsCustomPartecipanti] = useState<boolean>(() => {
    return effectivePartecipanti >= 9;
  });
  const [customPartecipantiInput, setCustomPartecipantiInput] = useState<string>(() => {
    return String(effectivePartecipanti);
  });

  // Filtra blocchi disponibili in base a playerMode
  const availableBlocks = useMemo(() => {
    return ALL_PHASE_BLOCKS.filter(b => b.compatiblePlayerModes.includes(playerMode));
  }, [playerMode]);

  // Validazione flusso in tempo reale
  const validation = useMemo(() => {
    return validateCustomFlow(selectedPhases, playerMode, effectivePartecipanti, numCampi);
  }, [selectedPhases, playerMode, effectivePartecipanti, numCampi]);

  // Aggiungi blocco in fondo
  const handleAddBlock = (blockId: PhaseBlockId) => {
    setSelectedPhases(prev => [...prev, blockId]);
  };

  // Rimuovi blocco per indice
  const handleRemoveBlock = (index: number) => {
    setSelectedPhases(prev => prev.filter((_, i) => i !== index));
  };

  // Sposta blocco verso l'alto
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setSelectedPhases(prev => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  // Sposta blocco verso il basso
  const handleMoveDown = (index: number) => {
    if (index === selectedPhases.length - 1) return;
    setSelectedPhases(prev => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  // Drag & drop handlers
  const handleDragStartBlock = (e: React.DragEvent, blockId: PhaseBlockId) => {
    setDraggedBlockId(blockId);
    e.dataTransfer.setData('text/plain', blockId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOverDropzone = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDropOnZone = (e: React.DragEvent) => {
    e.preventDefault();
    const blockId = e.dataTransfer.getData('text/plain') as PhaseBlockId;
    if (blockId && ALL_PHASE_BLOCKS.some(b => b.id === blockId)) {
      if (dragOverIndex !== null && dragOverIndex <= selectedPhases.length) {
        setSelectedPhases(prev => {
          const next = [...prev];
          next.splice(dragOverIndex, 0, blockId);
          return next;
        });
      } else {
        setSelectedPhases(prev => [...prev, blockId]);
      }
    }
    setDraggedBlockId(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedBlockId(null);
    setDragOverIndex(null);
  };

  const handleContinue = () => {
    if (!validation.isValid) return;
    onConfirm({
      phases: selectedPhases,
      playerMode,
      numCampi,
      numPartecipanti: effectivePartecipanti,
    });
  };

  const partecipantiOptions = useMemo(() => {
    if (playerMode === 'singles') {
      return [4, 5, 6, 7, 8];
    }
    return [3, 4, 5, 6, 7, 8];
  }, [playerMode]);

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-2">
      <Card title="Crea Torneo Personale">
        <div className="space-y-6">
          <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
            Costruisci il tuo flusso personalizzato trascinando o cliccando i campi torneo disponibili.
          </p>

          {/* Opzioni base: Modalità Partecipanti, Campi & Numero Partecipanti */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50/80 dark:bg-white/5 border border-slate-200/60 dark:border-white/10">
            {/* Toggle Coppie Fisse / Singoli (nascosto se già scelto in precedenza, es. da +inserisci giornata) */}
            {!hidePlayerModeToggle ? (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Modalità Partecipanti
                </label>
                <div className="flex rounded-xl bg-slate-200/80 dark:bg-white/10 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPlayerMode('pairs');
                      setSelectedPhases(prev => prev.filter(id => id !== 'americano'));
                      const nextP = Math.max(3, numCampi * 3);
                      setSelectedPartecipanti(nextP);
                      setIsCustomPartecipanti(nextP >= 9);
                      setCustomPartecipantiInput(String(nextP));
                    }}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                      playerMode === 'pairs'
                        ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[17px] leading-none">group</span>
                    <span>Coppie Fisse</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPlayerMode('singles');
                      setSelectedPhases(prev => prev.filter(id => !['girone', 'torneotto', 'ritorno'].includes(id)));
                      const nextP = numCampi * 4;
                      setSelectedPartecipanti(nextP);
                      setIsCustomPartecipanti(nextP >= 9);
                      setCustomPartecipantiInput(String(nextP));
                    }}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                      playerMode === 'singles'
                        ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[17px] leading-none">person</span>
                    <span>Singoli</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-700 dark:text-sky-300 font-semibold self-center">
                <span>ℹ️</span>
                <span>
                  Partecipanti già scelti: <strong>{effectivePartecipanti} {playerMode === 'singles' ? 'Giocatori' : 'Coppie'}</strong>
                </span>
              </div>
            )}

            {/* Selezione Campi Disponibili */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Campi a Disposizione
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5, 6].map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setNumCampi(c);
                      if (!hidePlayerModeToggle) {
                        const nextP = playerMode === 'singles' ? c * 4 : Math.max(3, c * 3);
                        setSelectedPartecipanti(nextP);
                        setIsCustomPartecipanti(nextP >= 9);
                        setCustomPartecipantiInput(String(nextP));
                      }
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                      numCampi === c
                        ? 'bg-sky-500 text-white shadow-sm'
                        : 'bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-white/20'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Selettore Numero Partecipanti (nel flusso diretto) */}
            {!hidePlayerModeToggle && (
              <div className="sm:col-span-2 pt-2 border-t border-slate-200/60 dark:border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {playerMode === 'singles' ? 'Numero Giocatori' : 'Numero Coppie'}
                  </label>
                  <span className="text-xs font-bold text-sky-600 dark:text-sky-400">
                    {effectivePartecipanti} {playerMode === 'singles' ? 'giocatori selezionati' : 'coppie selezionate'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {partecipantiOptions.map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setIsCustomPartecipanti(false);
                        setSelectedPartecipanti(n);
                        setCustomPartecipantiInput(String(n));
                      }}
                      className={`min-w-[38px] py-1.5 px-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                        !isCustomPartecipanti && effectivePartecipanti === n
                          ? 'bg-sky-500 text-white shadow-sm'
                          : 'bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-white/20'
                      }`}
                    >
                      {n}
                    </button>
                  ))}

                  {/* Pulsante 9+ per scelta manuale come in DrawPage */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomPartecipanti(true);
                      const nextVal = Math.max(9, effectivePartecipanti);
                      setSelectedPartecipanti(nextVal);
                      setCustomPartecipantiInput(String(nextVal));
                    }}
                    className={`min-w-[42px] py-1.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                      isCustomPartecipanti
                        ? 'bg-sky-500 text-white shadow-sm'
                        : 'bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-white/20'
                    }`}
                  >
                    9+
                  </button>

                  {/* Counter manuale visibile SOLO se è selezionato 9+ */}
                  {isCustomPartecipanti && (
                    <div className="flex items-center gap-1 ml-auto">
                      <button
                        type="button"
                        aria-label={playerMode === 'singles' ? 'Diminuisci numero di giocatori' : 'Diminuisci numero di coppie'}
                        onClick={() => {
                          const nextVal = Math.max(9, effectivePartecipanti - 1);
                          setSelectedPartecipanti(nextVal);
                          setCustomPartecipantiInput(String(nextVal));
                        }}
                        disabled={effectivePartecipanti <= 9}
                        className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-bold text-slate-700 dark:text-white disabled:opacity-40 cursor-pointer"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min={9}
                        max={64}
                        value={customPartecipantiInput}
                        onChange={e => {
                          const rawValue = e.target.value.replace(/\D/g, '');
                          setCustomPartecipantiInput(rawValue);
                          const val = parseInt(rawValue, 10);
                          if (!isNaN(val) && val >= 9 && val <= 64) {
                            setSelectedPartecipanti(val);
                          }
                        }}
                        onBlur={() => {
                          let nextVal = parseInt(customPartecipantiInput, 10);
                          if (Number.isNaN(nextVal) || nextVal < 9) nextVal = 9;
                          if (nextVal > 64) nextVal = 64;
                          setSelectedPartecipanti(nextVal);
                          setCustomPartecipantiInput(String(nextVal));
                        }}
                        className="h-8 w-14 text-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        aria-label={playerMode === 'singles' ? 'Aumenta numero di giocatori' : 'Aumenta numero di coppie'}
                        onClick={() => {
                          const nextVal = Math.min(64, effectivePartecipanti + 1);
                          setSelectedPartecipanti(nextVal);
                          setCustomPartecipantiInput(String(nextVal));
                        }}
                        disabled={effectivePartecipanti >= 64}
                        className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-bold text-slate-700 dark:text-white disabled:opacity-40 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* DROP ZONE SUPERIORE: IL FLUSSO ATTIVO */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Flusso del Torneo ({selectedPhases.length} {selectedPhases.length === 1 ? 'fase' : 'fasi'})
              </span>
              {selectedPhases.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedPhases([])}
                  className="text-xs font-semibold text-rose-500 hover:text-rose-600 cursor-pointer"
                >
                  Svuota flusso
                </button>
              )}
            </div>

            <div
              onDragOver={handleDragOverDropzone}
              onDrop={handleDropOnZone}
              className={`min-h-[140px] p-4 rounded-2xl border-2 transition-all flex flex-col justify-center ${
                selectedPhases.length === 0
                  ? 'border-dashed border-sky-300 dark:border-sky-500/40 bg-sky-50/50 dark:bg-sky-950/20 items-center'
                  : 'border-slate-200 dark:border-white/10 bg-white/40 dark:bg-slate-900/40'
              }`}
            >
              {selectedPhases.length === 0 ? (
                <div className="text-center py-4">
                  <span className="material-symbols-outlined text-4xl text-sky-400 dark:text-sky-500 mb-1">
                    drag_indicator
                  </span>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    Trascina qui i campi torneo
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    Oppure clicca su un blocco qui sotto per aggiungerlo in coda
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 w-full">
                  {selectedPhases.map((phaseId, index) => {
                    const block = ALL_PHASE_BLOCKS.find(b => b.id === phaseId);
                    if (!block) return null;

                    return (
                      <div
                        key={`${phaseId}-${index}`}
                        className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-white/10 shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-black flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <div className={`p-2 rounded-lg text-white ${block.bgColorClass} shrink-0`}>
                            <span className="material-symbols-outlined text-lg leading-none flex items-center justify-center">
                              {block.iconName}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {block.label}
                            </h4>
                            <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                              {block.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            type="button"
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                            title="Sposta su"
                          >
                            <span className="material-symbols-outlined text-base">arrow_upward</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveDown(index)}
                            disabled={index === selectedPhases.length - 1}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                            title="Sposta giù"
                          >
                            <span className="material-symbols-outlined text-base">arrow_downward</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveBlock(index)}
                            className="p-1 rounded text-rose-400 hover:text-rose-600 cursor-pointer"
                            title="Rimuovi"
                          >
                            <span className="material-symbols-outlined text-base">close</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Feedback di validazione / Errori / Warning */}
          {(!validation.isValid || validation.warnings.length > 0 || validation.distributionInfo) && (
            <div className="space-y-2">
              {validation.errors.map((err, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/40 text-xs font-semibold text-rose-700 dark:text-rose-300"
                >
                  <span className="material-symbols-outlined text-base shrink-0 mt-0.5">error</span>
                  <span>{err}</span>
                </div>
              ))}

              {validation.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 text-xs font-semibold text-amber-700 dark:text-amber-300"
                >
                  <span className="material-symbols-outlined text-base shrink-0 mt-0.5">info</span>
                  <span>{w}</span>
                </div>
              ))}

              {validation.distributionInfo && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/40 text-xs font-semibold text-sky-700 dark:text-sky-300">
                  <span className="material-symbols-outlined text-base shrink-0 mt-0.5">sports_tennis</span>
                  <span>{validation.distributionInfo}</span>
                </div>
              )}
            </div>
          )}

          {/* BLOCCHI TORNEO DISPONIBILI */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Campi Torneo Disponibili
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {availableBlocks.map(block => (
                <div
                  key={block.id}
                  draggable
                  onDragStart={e => handleDragStartBlock(e, block.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleAddBlock(block.id)}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/70 dark:bg-slate-800/80 border border-slate-200/60 dark:border-white/10 hover:border-sky-400 dark:hover:border-sky-400 shadow-sm cursor-grab active:cursor-grabbing hover:-translate-y-0.5 transition-all text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div className={`p-2 rounded-lg text-white ${block.bgColorClass} shrink-0`}>
                      <span className="material-symbols-outlined text-lg leading-none flex items-center justify-center">
                        {block.iconName}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">
                        {block.label}
                      </span>
                      <span className="block text-xs text-slate-400 dark:text-slate-500 truncate leading-snug">
                        {block.description}
                      </span>
                    </div>
                  </div>
                  <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-white/10 text-slate-400 hover:text-sky-500 flex items-center justify-center font-bold text-xs shrink-0">
                    +
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pulsanti Azione */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200/60 dark:border-white/10">
            <Button variant="outline" onClick={onBack} className="text-xs sm:text-sm font-medium">
              Indietro
            </Button>
            <Button
              variant="primary"
              onClick={handleContinue}
              disabled={!validation.isValid}
              className="text-xs sm:text-sm font-bold"
            >
              {hidePlayerModeToggle
                ? `Avvia Torneo (${effectivePartecipanti} ${playerMode === 'singles' ? 'giocatori' : 'coppie'}) →`
                : `Avanti: Scegli ${playerMode === 'singles' ? 'Giocatori' : 'Coppie'} (${effectivePartecipanti}) →`}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default CustomTournamentBuilder;
