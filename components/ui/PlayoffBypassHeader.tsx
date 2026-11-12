import React, { useState } from 'react';
import { MaterialIcon } from './Icons.tsx';
import { HIGAlert } from './HIGAlert.tsx';
import { SFIcon } from './SFIcon.tsx';
import Button from './Button.tsx';

export interface PlayoffBypassHeaderProps {
    title: string;
    subtitle?: string;
    isEditing: boolean;
    onStartBypass: () => void;
    onConfirmNewPairs: () => void;
    onCancelBypass: () => void;
    isCustomized?: boolean;
    className?: string;
}

export const PlayoffBypassHeader: React.FC<PlayoffBypassHeaderProps> = ({
    title,
    subtitle,
    isEditing,
    onStartBypass,
    onConfirmNewPairs,
    onCancelBypass,
    isCustomized,
    className = '',
}) => {
    const [showConfirmAlert, setShowConfirmAlert] = useState(false);

    return (
        <div className={`space-y-3 mb-4 ${className}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white truncate">
                            {title}
                        </h3>
                        {isCustomized && (
                            <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300/40">
                                Personalizzato
                            </span>
                        )}
                    </div>
                    {subtitle && (
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                            {subtitle}
                        </p>
                    )}
                </div>

                {!isEditing && (
                    <button
                        type="button"
                        onClick={() => setShowConfirmAlert(true)}
                        className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-600 hover:bg-rose-700 active:scale-95 text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Modifica manualmente le coppie delle partite della fase finale"
                    >
                        <SFIcon name="pencil" className="w-3.5 h-3.5" />
                        <span>Bypass / Modifica</span>
                    </button>
                )}
            </div>

            {/* Banner e controlli visibili esclusivamente in modalità di modifica (dopo il 2° clic) */}
            {isEditing && (
                <div className="p-3.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-300/60 dark:border-rose-900/40 space-y-3 animate-fadeIn">
                    <div className="flex items-start gap-2.5">
                        <MaterialIcon name="warning" className="text-[18px] text-rose-600 dark:text-rose-400 mt-0.5" />
                        <div className="text-xs text-rose-900 dark:text-rose-200">
                            <p className="font-bold">Modalità Modifica Attiva</p>
                            <p className="mt-0.5 text-rose-700 dark:text-rose-300">
                                Seleziona i giocatori per ciascuna partita. Ogni giocatore può essere assegnato una sola volta nella fase.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                        <Button
                            type="button"
                            variant="secondary"
                            size="small"
                            onClick={onCancelBypass}
                        >
                            Annulla
                        </Button>
                        <Button
                            type="button"
                            size="small"
                            onClick={onConfirmNewPairs}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                        >
                            Conferma Nuove Coppie
                        </Button>
                    </div>
                </div>
            )}

            {/* Popup Alert di Conferma Irreversibile (2° clic) */}
            <HIGAlert
                isOpen={showConfirmAlert}
                title="Modifica Fase Finale"
                message="Stai per modificare la fase finale del torneo. L'azione è irreversibile. Vuoi proseguire?"
                actions={[
                    {
                        label: 'No',
                        style: 'cancel',
                        onPress: () => setShowConfirmAlert(false),
                    },
                    {
                        label: 'Sì',
                        style: 'destructive',
                        onPress: () => {
                            setShowConfirmAlert(false);
                            onStartBypass();
                        },
                    },
                ]}
            />
        </div>
    );
};
