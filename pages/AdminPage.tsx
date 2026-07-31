
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthToken } from '../hooks/useAuth.tsx';
import Card from '../components/ui/Card.tsx';
import Button from '../components/ui/Button.tsx';
import { HIGSegmentedControl } from '../components/ui/HIGSegmentedControl.tsx';
import { requestHIGConfirmation, showHIGAlert } from '../utils/higDialogService.ts';

interface Workspace {
    id: string;
    name: string;
    owner_name: string | null;
    owner_email: string | null;
    is_active: boolean;
    created_at: string;
    player_count: string;
    tournament_count: string;
    active_codes: string;
}

interface AccessCode {
    id: string;
    label: string | null;
    code_plain: string | null;
    is_admin: boolean;
    is_active: boolean;
    created_at: string;
    expires_at: string | null;
    last_used_at: string | null;
    failed_attempts: number;
    workspace_name: string;
    workspace_id: string;
}

interface AuditLog {
    id: string;
    action: string;
    ip_address: string | null;
    details: any;
    created_at: string;
    workspace_name: string | null;
}

interface TransferTournament {
    id: string;
    name: string;
    type: string;
    date: string;
    club: string;
    status: string;
}

const CODE_EXPIRY_PRESETS = [
    { value: 'none', label: 'Nessuna scadenza' },
    { value: '8h', label: '8 ore' },
    { value: '24h', label: '24 ore' },
    { value: '48h', label: '48 ore' },
    { value: '7d', label: '7 giorni' },
] as const;

type CodeExpiryPreset = typeof CODE_EXPIRY_PRESETS[number]['value'];

async function adminApi<T>(url: string, options: RequestInit = {}): Promise<T> {
    const token = getAuthToken();
    const headers: Record<string, string> = {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers as Record<string, string> || {}),
    };

    if (options.body !== undefined && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
        ...options,
        headers,
    });

    const raw = await response.text();
    let data: any = null;
    if (raw) {
        try {
            data = JSON.parse(raw);
        } catch {
            data = null;
        }
    }

    if (!response.ok) {
        const fallbackMessage = raw
            ? raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)
            : 'Richiesta al server fallita';
        throw new Error(data?.message || fallbackMessage || 'Richiesta al server fallita');
    }

    return (data ?? ({} as T)) as T;
}

const AdminPage: React.FC = () => {
    const { isAdmin, workspace } = useAuth();
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [codes, setCodes] = useState<AccessCode[]>([]);
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [activeTab, setActiveTab] = useState<'workspaces' | 'codes' | 'transfer' | 'logs'>('workspaces');
    const [loading, setLoading] = useState(true);

    // New workspace form
    const [newWsName, setNewWsName] = useState('');
    const [newWsOwner, setNewWsOwner] = useState('');

    // New code form
    const [newCodeWsId, setNewCodeWsId] = useState('');
    const [newCodeValue, setNewCodeValue] = useState('');
    const [newCodeLabel, setNewCodeLabel] = useState('');
    const [newCodeIsAdmin, setNewCodeIsAdmin] = useState(false);
    const [newCodeExpiryPreset, setNewCodeExpiryPreset] = useState<CodeExpiryPreset>('none');
    const [generatedCode, setGeneratedCode] = useState<string | null>(null);

    // Transfer form
    const [transferSourceWsId, setTransferSourceWsId] = useState('');
    const [transferDestinationWsId, setTransferDestinationWsId] = useState('');
    const [transferTournaments, setTransferTournaments] = useState<TransferTournament[]>([]);
    const [transferTournamentId, setTransferTournamentId] = useState('');
    const [transferBusy, setTransferBusy] = useState(false);
    const [transferResult, setTransferResult] = useState<any>(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [wsData, codesData, logsData] = await Promise.all([
                adminApi<{ workspaces: Workspace[] }>('/api/admin/workspaces'),
                adminApi<{ codes: AccessCode[] }>('/api/admin/codes'),
                adminApi<{ logs: AuditLog[] }>('/api/admin/audit-logs?limit=50'),
            ]);
            setWorkspaces(wsData.workspaces);
            setCodes(codesData.codes);
            setLogs(logsData.logs);
            if (wsData.workspaces.length > 0 && !newCodeWsId) {
                setNewCodeWsId(wsData.workspaces[0].id);
            }
            if (wsData.workspaces.length > 0 && !transferSourceWsId) {
                setTransferSourceWsId(wsData.workspaces[0].id);
            }
            if (wsData.workspaces.length > 1 && !transferDestinationWsId) {
                setTransferDestinationWsId(wsData.workspaces[1].id);
            } else if (wsData.workspaces.length === 1 && !transferDestinationWsId) {
                setTransferDestinationWsId('');
            }
        } catch (error) {
            console.error('Failed to fetch admin data:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isAdmin) fetchAll();
    }, [isAdmin, fetchAll]);

    if (!isAdmin) {
        return (
            <div className="text-center py-20">
                <p className="text-gray-500 dark:text-gray-400 text-lg">Accesso riservato agli amministratori</p>
            </div>
        );
    }

    const handleCreateWorkspace = async () => {
        if (!newWsName.trim()) return;
        try {
            await adminApi('/api/admin/workspaces', {
                method: 'POST',
                body: JSON.stringify({ name: newWsName, ownerName: newWsOwner }),
            });
            setNewWsName('');
            setNewWsOwner('');
            await fetchAll();
        } catch (error: any) {
            showHIGAlert(error.message);
        }
    };

    const handleGenerateCode = async () => {
        if (!newCodeWsId || !newCodeValue || !/^\d{6}$/.test(newCodeValue)) {
            showHIGAlert('Inserisci un codice valido di 6 cifre');
            return;
        }

        const now = new Date();
        const expiresAt = (() => {
            if (newCodeExpiryPreset === 'none') return null;
            const expiryDate = new Date(now);
            if (newCodeExpiryPreset === '8h') expiryDate.setHours(expiryDate.getHours() + 8);
            if (newCodeExpiryPreset === '24h') expiryDate.setHours(expiryDate.getHours() + 24);
            if (newCodeExpiryPreset === '48h') expiryDate.setHours(expiryDate.getHours() + 48);
            if (newCodeExpiryPreset === '7d') expiryDate.setDate(expiryDate.getDate() + 7);
            return expiryDate.toISOString();
        })();

        try {
            const result = await adminApi<{ accessCode: any; code: string }>('/api/admin/codes/generate', {
                method: 'POST',
                body: JSON.stringify({
                    workspaceId: newCodeWsId,
                    code: newCodeValue,
                    label: newCodeLabel,
                    isAdmin: newCodeIsAdmin,
                    expiresAt,
                }),
            });
            setGeneratedCode(result.code);
            setNewCodeValue('');
            setNewCodeLabel('');
            setNewCodeIsAdmin(false);
            setNewCodeExpiryPreset('none');
            await fetchAll();
        } catch (error: any) {
            showHIGAlert(error.message);
        }
    };

    const [settingPlainId, setSettingPlainId] = useState<string | null>(null);
    const [plainInput, setPlainInput] = useState('');

    const handleSetPlain = async (codeId: string) => {
        if (!/^\d{6}$/.test(plainInput)) {
            showHIGAlert('Inserisci il codice a 6 cifre');
            return;
        }
        try {
            await adminApi(`/api/admin/codes/${codeId}/set-plain`, {
                method: 'PUT',
                body: JSON.stringify({ code: plainInput }),
            });
            setSettingPlainId(null);
            setPlainInput('');
            await fetchAll();
        } catch (error: any) {
            showHIGAlert(error.message);
        }
    };

    const handleImpersonate = async (workspaceId: string) => {
        try {
            const result = await adminApi<{ token: string; workspace: { id: string; name: string } }>('/api/admin/impersonate', {
                method: 'POST',
                body: JSON.stringify({ workspaceId }),
            });
            localStorage.setItem('padel_elo_token', result.token);
            localStorage.setItem('padel_elo_workspace', JSON.stringify(result.workspace));
            window.location.href = '/';
        } catch (error: any) {
            showHIGAlert(error.message);
        }
    };

    const [recalculating, setRecalculating] = useState(false);
    const [recalcResult, setRecalcResult] = useState<{ corrected: number; changes: { name: string; oldElo: number; newElo: number; diff: number }[] } | null>(null);

    const handleRecalculateElos = async () => {
        if (!await requestHIGConfirmation(
            'Ricalcolare l’ELO dallo storico per tutti i workspace? I valori correnti verranno allineati alla somma delle variazioni registrate.',
            { title: 'Ricalcola ELO', confirmLabel: 'Ricalcola' },
        )) return;
        setRecalculating(true);
        setRecalcResult(null);
        try {
            const result = await adminApi<{ corrected: number; changes: any[] }>('/api/admin/recalculate-elos', {
                method: 'POST',
                body: JSON.stringify({}),
            });
            setRecalcResult(result);
        } catch (error: any) {
            showHIGAlert(error.message);
        } finally {
            setRecalculating(false);
        }
    };

    const [fullRecalculating, setFullRecalculating] = React.useState(false);
    const [fullRecalcResult, setFullRecalcResult] = React.useState<{ events: number; totalMatches: number; processed: number; skippedIncompleteMatches: number; skippedUnplayedMatches: number } | null>(null);

    const handleFullRecalculateElos = async () => {
        if (!await requestHIGConfirmation(
            'Questa operazione azzera gli ELO, cancella la cronologia e ricalcola tutte le partite in ordine cronologico. Può richiedere diversi minuti.',
            { title: 'Ricalcolo ELO completo', confirmLabel: 'Ricalcola tutto', destructive: true },
        )) return;
        setFullRecalculating(true);
        setFullRecalcResult(null);
        try {
            const result = await adminApi<{ events: number; totalMatches: number; processed: number; skippedIncompleteMatches: number; skippedUnplayedMatches: number }>('/api/admin/recalculate-elos-full', {
                method: 'POST',
                body: JSON.stringify({}),
            });
            setFullRecalcResult(result);
        } catch (error: any) {
            showHIGAlert(error.message);
        } finally {
            setFullRecalculating(false);
        }
    };

    const handleDeactivateCode = async (codeId: string) => {
        if (!await requestHIGConfirmation('Sei sicuro di voler disattivare questo codice?', {
            title: 'Disattiva codice', confirmLabel: 'Disattiva', destructive: true,
        })) return;
        try {
            await adminApi(`/api/admin/codes/${codeId}`, { method: 'DELETE' });
            await fetchAll();
        } catch (error: any) {
            showHIGAlert(error.message);
        }
    };

    const handleDeleteCode = async (codeId: string) => {
        if (!await requestHIGConfirmation('Sei sicuro di voler cancellare definitivamente questo codice disattivato?', {
            title: 'Elimina codice', confirmLabel: 'Elimina', destructive: true,
        })) return;
        try {
            await adminApi(`/api/admin/codes/${codeId}/permanent`, { method: 'DELETE' });
            await fetchAll();
        } catch (error: any) {
            showHIGAlert(error.message);
        }
    };

    const handleDeleteWorkspace = async (ws: Workspace) => {
        const isCurrentWorkspace = workspace?.id === ws.id;
        if (isCurrentWorkspace) {
            showHIGAlert('Non puoi cancellare il workspace attualmente in uso.');
            return;
        }

        const confirmation = `Sei sicuro di voler cancellare definitivamente il workspace "${ws.name}"?\n\nVerranno eliminati anche:\n- ${ws.player_count} giocatori\n- ${ws.tournament_count} tornei\n- ${ws.active_codes} codici attivi\n\nTutti i codici creati per questo workspace verranno cancellati automaticamente.\n\nQuesta operazione è irreversibile.`;
        if (!await requestHIGConfirmation(confirmation, {
            title: 'Elimina workspace', confirmLabel: 'Elimina definitivamente', destructive: true,
        })) return;

        try {
            await adminApi(`/api/admin/workspaces/${encodeURIComponent(ws.id)}`, { method: 'DELETE' });
            await fetchAll();
        } catch (error: any) {
            showHIGAlert(error.message);
        }
    };

    const formatDate = (d: string | null) => {
        if (!d) return '-';
        return new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const isCodeExpired = (code: AccessCode) => !!code.expires_at && new Date(code.expires_at).getTime() <= Date.now();

    const fetchTransferTournaments = useCallback(async (wsId: string) => {
        if (!wsId) {
            setTransferTournaments([]);
            setTransferTournamentId('');
            return;
        }
        try {
            const data = await adminApi<{ tournaments: TransferTournament[] }>(`/api/admin/workspaces/${encodeURIComponent(wsId)}/tournaments`);
            setTransferTournaments(data.tournaments || []);
            if (data.tournaments?.length) {
                setTransferTournamentId(prev => prev || data.tournaments[0].id);
            } else {
                setTransferTournamentId('');
            }
        } catch (error) {
            console.error('Failed to fetch transfer tournaments:', error);
            setTransferTournaments([]);
            setTransferTournamentId('');
        }
    }, []);

    useEffect(() => {
        if (!isAdmin) return;
        if (!transferSourceWsId) return;
        fetchTransferTournaments(transferSourceWsId);
    }, [isAdmin, transferSourceWsId, fetchTransferTournaments]);

    useEffect(() => {
        if (!transferSourceWsId) return;
        if (transferDestinationWsId && transferDestinationWsId === transferSourceWsId) {
            const next = workspaces.find(w => w.id !== transferSourceWsId)?.id || '';
            setTransferDestinationWsId(next);
        }
    }, [transferSourceWsId, transferDestinationWsId, workspaces]);

    const handleTransferTournament = async () => {
        if (!transferSourceWsId || !transferDestinationWsId || !transferTournamentId) return;
        const src = workspaces.find(w => w.id === transferSourceWsId);
        const dst = workspaces.find(w => w.id === transferDestinationWsId);
        const t = transferTournaments.find(tt => tt.id === transferTournamentId);
        if (!src || !dst || !t) return;

        const confirmText =
            `Inviare i dati di questo torneo?\n\n` +
            `Torneo: ${t.name}\n` +
            `Sorgente: ${src.name}\n` +
            `Destinatario: ${dst.name}\n\n` +
            `Verranno duplicati (senza merge):\n` +
            `- torneo e dati collegati\n` +
            `- match/risultati (se presenti)\n` +
            `- giocatori coinvolti (se presenti)\n` +
            `- ELO (solo per i dati copiati)\n\n` +
            `Dopo l'invio i dati saranno indipendenti nei due workspace.`;
        if (!await requestHIGConfirmation(confirmText, {
            title: 'Invia torneo', confirmLabel: 'Invia dati',
        })) return;

        setTransferBusy(true);
        setTransferResult(null);
        try {
            const result = await adminApi<any>('/api/admin/transfer/tournament', {
                method: 'POST',
                body: JSON.stringify({
                    sourceWorkspaceId: transferSourceWsId,
                    destinationWorkspaceId: transferDestinationWsId,
                    tournamentId: transferTournamentId,
                }),
            });
            setTransferResult(result);
        } catch (error: any) {
            showHIGAlert(error.message);
        } finally {
            setTransferBusy(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-48"></div>
                <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="px-3 md:px-4 pt-3 mb-4">
                <h2 className="text-[1.62rem] font-black leading-none tracking-tight text-sky-500 dark:text-sky-300 sm:text-[1.78rem] md:text-[2.25rem]">Pannello Admin</h2>
            </div>

            {/* Tabs */}
            <div className="mb-6 px-4 md:px-0 max-w-2xl mx-auto">
                <HIGSegmentedControl 
                    segments={['Workspace', 'Accessi', 'Invia dati', 'Audit Log']}
                    selectedIndex={
                        activeTab === 'workspaces' ? 0 :
                        activeTab === 'codes' ? 1 :
                        activeTab === 'transfer' ? 2 : 3
                    }
                    onChange={(idx) => {
                        setActiveTab(idx === 0 ? 'workspaces' : idx === 1 ? 'codes' : idx === 2 ? 'transfer' : 'logs');
                    }}
                />
            </div>

            {/* Workspaces Tab */}
            {activeTab === 'workspaces' && (
                <div className="space-y-4">
                    <Card title="Crea Nuovo Workspace">
                        <div className="flex flex-col sm:flex-row gap-3">
                            <input
                                type="text"
                                value={newWsName}
                                onChange={e => setNewWsName(e.target.value)}
                                placeholder="Nome workspace"
                                className="flex-1 px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white"
                            />
                            <input
                                type="text"
                                value={newWsOwner}
                                onChange={e => setNewWsOwner(e.target.value)}
                                placeholder="Nome proprietario"
                                className="flex-1 px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white"
                            />
                            <Button variant="primary" onClick={handleCreateWorkspace}>Crea</Button>
                        </div>
                    </Card>

                    <Card title={`Workspace (${workspaces.length})`}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                                        <th className="pb-2 pr-4">Nome</th>
                                        <th className="pb-2 pr-4">Proprietario</th>
                                        <th className="pb-2 pr-4">Giocatori</th>
                                        <th className="pb-2 pr-4">Tornei</th>
                                        <th className="pb-2 pr-4">Codici</th>
                                        <th className="pb-2 pr-4">Creato</th>
                                        <th className="pb-2">Azioni</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-900 dark:text-gray-100">
                                    {workspaces.map(ws => (
                                        <tr key={ws.id} className="border-b dark:border-gray-700">
                                            <td className="py-2 pr-4 font-medium">{ws.name}</td>
                                            <td className="py-2 pr-4">{ws.owner_name || '-'}</td>
                                            <td className="py-2 pr-4">{ws.player_count}</td>
                                            <td className="py-2 pr-4">{ws.tournament_count}</td>
                                            <td className="py-2 pr-4">{ws.active_codes}</td>
                                            <td className="py-2 pr-4">{formatDate(ws.created_at)}</td>
                                            <td className="py-2">
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        onClick={() => handleImpersonate(ws.id)}
                                                        className="text-xs text-sky-500 hover:text-sky-700 dark:hover:text-sky-400 font-medium"
                                                    >
                                                        Entra &rarr;
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteWorkspace(ws)}
                                                        disabled={workspace?.id === ws.id}
                                                        className="text-xs text-red-600 hover:text-red-800 disabled:text-gray-400 disabled:cursor-not-allowed dark:hover:text-red-400 font-medium"
                                                        title={workspace?.id === ws.id ? 'Non puoi cancellare il workspace attualmente in uso' : 'Cancella definitivamente il workspace'}
                                                    >
                                                        Cancella
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* Ricalcola ELO */}
                    <Card title="🔧 Ricalcola ELO da Storico">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                            Allinea il <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">current_elo</code> di ogni atleta alla somma reale di tutti i suoi delta in <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">elo_history</code>, inclusi i tornei disputati in workspace differenti.
                            Non ricalcola le partite: corregge soltanto eventuali disallineamenti tra storico e valore globale. L’aggiornamento è atomico e si applica a <strong>tutti i workspace</strong>.
                        </p>
                        <button
                            onClick={handleRecalculateElos}
                            disabled={recalculating}
                            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            {recalculating ? 'Ricalcolo in corso...' : '⚡ Ricalcola ELO (tutti i workspace)'}
                        </button>
                        {recalcResult !== null && (
                            <div className="mt-3">
                                {recalcResult.corrected === 0 ? (
                                    <p className="text-sm text-green-600 dark:text-green-400 font-medium">✅ Tutto allineato, nessuna correzione necessaria.</p>
                                ) : (
                                    <>
                                        <p className="text-sm text-orange-600 dark:text-orange-400 font-medium mb-2">⚡ Corretti {recalcResult.corrected} giocatori:</p>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs border-collapse">
                                                <thead>
                                                    <tr className="bg-gray-100 dark:bg-gray-700">
                                                        <th className="text-left p-2">Giocatore</th>
                                                        <th className="text-right p-2">ELO Precedente</th>
                                                        <th className="text-right p-2">ELO Corretto</th>
                                                        <th className="text-right p-2">Diff</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {recalcResult.changes.map((c, i) => (
                                                        <tr key={i} className="border-t border-gray-200 dark:border-gray-600">
                                                            <td className="p-2">{c.name}</td>
                                                            <td className="text-right p-2">{c.oldElo.toFixed(2)}</td>
                                                            <td className="text-right p-2">{c.newElo.toFixed(2)}</td>
                                                            <td className={`text-right p-2 font-medium ${c.diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                {c.diff > 0 ? '+' : ''}{c.diff.toFixed(2)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </Card>

                    {/* Ricalcolo ELO COMPLETO */}
                    <Card title="⚡ Ricalcolo ELO Completo da Zero">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                            Ricostruisce da 1500 l’ELO locale di ogni torneo, mantiene la continuità tra le sue giornate e somma tutti i delta nell’ELO globale. Prima valida tutte le partite; soltanto dopo azzera gli ELO, sostituisce la cronologia e ripercorre tornei normali e tornei a squadre. L’operazione è atomica e si applica a <strong>tutti i workspace</strong>.
                        </p>
                        <div className="p-3 mb-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                            ⚠️ Operazione lenta (può richiedere alcuni minuti). Non usare se non necessario.
                        </div>
                        <button
                            onClick={handleFullRecalculateElos}
                            disabled={fullRecalculating}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            {fullRecalculating ? '⏳ Ricalcolo completo in corso...' : '🔄 Ricalcolo ELO Completo (tutti i workspace)'}
                        </button>
                        {fullRecalcResult !== null && (
                            <div className="mt-3">
                                <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                                    ✅ Completato! Processate {fullRecalcResult.processed} partite valide in {fullRecalcResult.events} eventi ({fullRecalcResult.totalMatches} record esaminati).
                                    {fullRecalcResult.skippedIncompleteMatches > 0 && ` ${fullRecalcResult.skippedIncompleteMatches} partite senza squadre complete sono state escluse dall’ELO.`}
                                    {fullRecalcResult.skippedUnplayedMatches > 0 && ` ${fullRecalcResult.skippedUnplayedMatches} partite senza risultato sono state ignorate.`}
                                </p>
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {/* Codes Tab */}
            {activeTab === 'codes' && (
                <div className="space-y-4">
                    <Card title="Genera Nuovo Codice">
                        <div className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
                                <div className="space-y-1">
                                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Workspace
                                    </label>
                                    <select
                                        value={newCodeWsId}
                                        onChange={e => setNewCodeWsId(e.target.value)}
                                        className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white"
                                    >
                                        {workspaces.map(ws => (
                                            <option key={ws.id} value={ws.id}>{ws.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Codice
                                    </label>
                                    <input
                                        type="text"
                                        value={newCodeValue}
                                        onChange={e => setNewCodeValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="000000"
                                        maxLength={6}
                                        inputMode="numeric"
                                        className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white text-center font-mono text-lg tracking-wider"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    Nome Utilizzatore
                                </label>
                                <input
                                    type="text"
                                    value={newCodeLabel}
                                    onChange={e => setNewCodeLabel(e.target.value)}
                                    placeholder="Es. Marco Rossi"
                                    className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                <div className="space-y-1">
                                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Scadenza
                                    </label>
                                    <select
                                        value={newCodeExpiryPreset}
                                        onChange={e => setNewCodeExpiryPreset(e.target.value as CodeExpiryPreset)}
                                        className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white"
                                    >
                                        {CODE_EXPIRY_PRESETS.map(option => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <label className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={newCodeIsAdmin}
                                        onChange={e => setNewCodeIsAdmin(e.target.checked)}
                                        className="rounded"
                                    />
                                    Accesso Admin
                                </label>
                            </div>
                            <div className="flex justify-stretch sm:justify-end">
                                <Button variant="primary" onClick={handleGenerateCode} className="w-full sm:w-auto">
                                    Genera
                                </Button>
                            </div>
                        </div>
                        {generatedCode && (
                            <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg">
                                <p className="text-green-800 dark:text-green-300 text-sm">
                                    Codice creato con successo: <span className="font-mono font-bold text-lg">{generatedCode}</span>
                                </p>
                                <p className="text-green-600 dark:text-green-400 text-xs mt-1">Comunica questo codice al destinatario. Potrai sempre rivederlo nella tabella qui sotto.</p>
                            </div>
                        )}
                    </Card>

                    <Card title={`Codici Accesso (${codes.length})`}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                                        <th className="pb-2 pr-4">Etichetta</th>
                                        <th className="pb-2 pr-4">Codice</th>
                                        <th className="pb-2 pr-4">Workspace</th>
                                        <th className="pb-2 pr-4">Admin</th>
                                        <th className="pb-2 pr-4">Scade il</th>
                                        <th className="pb-2 pr-4">Stato</th>
                                        <th className="pb-2 pr-4">Ultimo uso</th>
                                        <th className="pb-2">Azioni</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-900 dark:text-gray-100">
                                    {codes.map(code => {
                                        const expired = isCodeExpired(code);
                                        const visualState = !code.is_active ? 'disabled' : expired ? 'expired' : 'active';
                                        return (
                                        <tr key={code.id} className={`border-b dark:border-gray-700 ${visualState === 'disabled' ? 'opacity-50' : ''}`}>
                                            <td className="py-2 pr-4">{code.label || '-'}</td>
                                            <td className="py-2 pr-4 font-mono font-bold tracking-wider">
                                                {code.code_plain ? (
                                                    <span className="text-sky-600 dark:text-sky-400">{code.code_plain}</span>
                                                ) : settingPlainId === code.id ? (
                                                    <span className="flex items-center gap-1">
                                                        <input
                                                            type="text"
                                                            value={plainInput}
                                                            onChange={e => setPlainInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                            placeholder="000000"
                                                            maxLength={6}
                                                            inputMode="numeric"
                                                            className="w-20 px-1 py-0.5 text-sm border rounded bg-white dark:bg-gray-700 dark:border-gray-600 text-center"
                                                            autoFocus
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') handleSetPlain(code.id);
                                                                if (e.key === 'Escape') { setSettingPlainId(null); setPlainInput(''); }
                                                            }}
                                                        />
                                                        <button onClick={() => handleSetPlain(code.id)} className="text-xs text-green-600 hover:text-green-800">OK</button>
                                                        <button onClick={() => { setSettingPlainId(null); setPlainInput(''); }} className="text-xs text-gray-400 hover:text-gray-600">X</button>
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => { setSettingPlainId(code.id); setPlainInput(''); }}
                                                        className="text-gray-400 hover:text-sky-500 cursor-pointer"
                                                        title="Clicca per impostare il codice in chiaro"
                                                    >••••••</button>
                                                )}
                                            </td>
                                            <td className="py-2 pr-4">{code.workspace_name}</td>
                                            <td className="py-2 pr-4">
                                                {code.is_admin && <span className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded">Admin</span>}
                                            </td>
                                            <td className="py-2 pr-4">
                                                <span className="text-xs">{code.expires_at ? formatDate(code.expires_at) : 'Nessuna'}</span>
                                            </td>
                                            <td className="py-2 pr-4">
                                                <span className={`text-xs px-2 py-0.5 rounded ${
                                                    visualState === 'active'
                                                        ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                                                        : visualState === 'expired'
                                                            ? 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200'
                                                            : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                                                }`}>
                                                    {visualState === 'active' ? 'Attivo' : visualState === 'expired' ? 'Scaduto' : 'Disattivato'}
                                                </span>
                                            </td>
                                            <td className="py-2 pr-4 text-xs">{formatDate(code.last_used_at)}</td>
                                            <td className="py-2 flex items-center gap-3">
                                                {code.is_active && (
                                                    <>
                                                    <button
                                                        onClick={() => handleImpersonate(code.workspace_id)}
                                                        className="text-xs text-sky-500 hover:text-sky-700 dark:hover:text-sky-400 font-medium"
                                                    >
                                                        Entra &rarr;
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeactivateCode(code.id)}
                                                        className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                                                    >
                                                        Disattiva
                                                    </button>
                                                    </>
                                                )}
                                                {!code.is_active && (
                                                    <button
                                                        onClick={() => handleDeleteCode(code.id)}
                                                        className="text-xs text-red-600 hover:text-red-800 dark:hover:text-red-400 font-medium"
                                                    >
                                                        Cancella
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    )})}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* Transfer Tab */}
            {activeTab === 'transfer' && (
                <div className="space-y-4">
                    <Card title="Invia Dati Torneo">
                        <div className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Workspace sorgente
                                    </label>
                                    <select
                                        value={transferSourceWsId}
                                        onChange={e => { setTransferSourceWsId(e.target.value); setTransferResult(null); }}
                                        className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white"
                                    >
                                        {workspaces.map(ws => (
                                            <option key={ws.id} value={ws.id}>{ws.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        Workspace destinatario
                                    </label>
                                    <select
                                        value={transferDestinationWsId}
                                        onChange={e => { setTransferDestinationWsId(e.target.value); setTransferResult(null); }}
                                        className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Seleziona...</option>
                                        {workspaces.filter(ws => ws.id !== transferSourceWsId).map(ws => (
                                            <option key={ws.id} value={ws.id}>{ws.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    Torneo
                                </label>
                                <select
                                    value={transferTournamentId}
                                    onChange={e => { setTransferTournamentId(e.target.value); setTransferResult(null); }}
                                    className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-900 dark:text-white"
                                >
                                    {transferTournaments.length === 0 && (
                                        <option value="">Nessun torneo disponibile</option>
                                    )}
                                    {transferTournaments.map(t => (
                                        <option key={t.id} value={t.id}>
                                            {t.name} • {new Date(t.date).toLocaleDateString('it-IT')} • {t.type}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Nota: per “Torneo a Squadre” vengono mostrati solo i tornei root (il trasferimento include automaticamente tutte le giornate collegate).
                                </p>
                            </div>

                            <div className="flex justify-stretch sm:justify-end">
                                <Button
                                    variant="primary"
                                    onClick={handleTransferTournament}
                                    disabled={transferBusy || !transferSourceWsId || !transferDestinationWsId || !transferTournamentId}
                                    className="w-full sm:w-auto"
                                >
                                    {transferBusy ? 'Invio in corso…' : 'Invia'}
                                </Button>
                            </div>
                        </div>

                        {transferResult && (
                            <div className="mt-3 p-3 border rounded-lg bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800">
                                <p className="text-sky-900 dark:text-sky-100 font-medium">
                                    {transferResult.message || 'Invio completato'}
                                </p>
                                {transferResult.counts && (
                                    <p className="text-sky-700 dark:text-sky-200 text-sm mt-1">
                                        Copiati: {transferResult.counts.tournaments} tornei, {transferResult.counts.players} giocatori, {transferResult.counts.matches} match, {transferResult.counts.eloHistory} record ELO.
                                        {transferResult.isTeamTournament ? ` (Team: ${transferResult.counts.teamTeams} squadre, ${transferResult.counts.teamMatchdays} giornate, ${transferResult.counts.teamMatchdayMatches} submatch.)` : ''}
                                    </p>
                                )}
                                {transferResult.txId && (
                                    <p className="text-xs text-sky-600 dark:text-sky-300 mt-1 font-mono">TX: {transferResult.txId}</p>
                                )}
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {/* Audit Logs Tab */}
            {activeTab === 'logs' && (
                <Card title={`Audit Log (ultimi 50)`}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                                    <th className="pb-2 pr-4">Data</th>
                                    <th className="pb-2 pr-4">Azione</th>
                                    <th className="pb-2 pr-4">Workspace</th>
                                    <th className="pb-2 pr-4">IP</th>
                                    <th className="pb-2">Dettagli</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-900 dark:text-gray-100">
                                {logs.map(log => (
                                    <tr key={log.id} className="border-b dark:border-gray-700">
                                        <td className="py-2 pr-4 text-xs whitespace-nowrap">{formatDate(log.created_at)}</td>
                                        <td className="py-2 pr-4">
                                            <span className={`text-xs px-2 py-0.5 rounded ${
                                                log.action === 'login_success'
                                                    ? (log.details && log.details.isAdmin === false
                                                        ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                                                        : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200')
                                                    : log.action === 'login_failed'
                                                    ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                                            }`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="py-2 pr-4 text-xs">{log.workspace_name || '-'}</td>
                                        <td className="py-2 pr-4 text-xs font-mono">{log.ip_address || '-'}</td>
                                        <td className="py-2 text-xs text-gray-500 dark:text-gray-400">
                                            {log.details && typeof log.details === 'object' ? JSON.stringify(log.details) : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default AdminPage;
