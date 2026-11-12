
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Player, Match, Tournament, EloHistoryEntry, FieldPosition, SetScore, TeamTournamentConfig, TeamTournamentTeam, TeamTournamentPlayerEntry, TeamTournamentMatchday, TeamTournamentSubMatch, TeamTournamentPlayerStatsRow, TeamTournamentFixture } from '../types.ts';
import { getAuthToken } from './useAuth.tsx';

interface PadelStore {
    players: Player[];
    matches: Match[];
    tournaments: Tournament[];
    eloHistory: EloHistoryEntry[];
    loading: boolean;
    fetchData: () => Promise<void>;
    addPlayer: (name: string, surname: string, position: FieldPosition, currentElo?: number) => Promise<void>;
    updatePlayerAndElo: (playerId: string, updatedData: Pick<Player, 'name' | 'surname' | 'position'>, newElo: number, tournamentId?: string) => Promise<void>;
    deletePlayer: (playerId: string) => Promise<void>;
    addMatch: (match: Omit<Match, 'id'>) => Promise<void>;
    // FIX: Changed `newTournament` type to `Omit<Tournament, 'id'>` to match the implementation and the caller's data structure.
    // FIX: Match type for addMultipleMatches should exclude 'tournamentId' since backend assigns it
    addMultipleMatches: (matches: Omit<Match, 'id' | 'tournamentId'>[], newTournament: Omit<Tournament, 'id'>) => Promise<void>;
    deleteMatch: (matchId: string) => Promise<void>;
    updateTournamentMatches: (matchUpdates: Array<{ matchId: string; sets: SetScore[]; winner?: Match['winner']; team1?: string[]; team2?: string[] }>, skipRefresh?: boolean) => Promise<void>;
    cascadeResetTournament: (tournamentId: string, phaseMatchIds: string[], skipRefresh?: boolean) => Promise<void>;
    completeTournament: (tournamentId: string) => Promise<void>;
    createMexicanTournament: (matches: Omit<Match, 'tournamentId'>[], tournament: Omit<Tournament, 'id'>) => Promise<{ tournamentId: string; matches: Array<{ id: string; roundNumber: number | null; groupNumber: number | null }> }>;
    saveMexicanProgress: (tournamentId: string, updates: Array<{ matchId: string; sets: SetScore[] }>, newMatches: Array<Pick<Match, 'id' | 'date' | 'team1' | 'team2' | 'roundNumber' | 'sets'> & { groupNumber?: number }>) => Promise<Array<{ clientId: string | null; id: string }>>;
    addTournament: (tournament: Omit<Tournament, 'id'>) => Promise<Tournament>;
    createTeamTournament: (payload: {
        name: string;
        club: string;
        initialTeamCount: number;
        defaultPlayersPerTeam: number;
        format: TeamTournamentConfig['format'];
        matchesPerDay: TeamTournamentConfig['matchesPerDay'];
        roundRobinFinalPhase: TeamTournamentConfig['roundRobinFinalPhase'];
        scoringType: TeamTournamentConfig['scoringType'];
        date?: string;
    }) => Promise<{ tournament: Tournament; config: TeamTournamentConfig }>;
    getTeamTournamentConfig: (tournamentId: string) => Promise<TeamTournamentConfig>;
    updateTeamTournamentConfig: (tournamentId: string, payload: {
        initialTeamCount: number;
        defaultPlayersPerTeam: number;
        format: TeamTournamentConfig['format'];
        matchesPerDay: TeamTournamentConfig['matchesPerDay'];
        roundRobinFinalPhase: TeamTournamentConfig['roundRobinFinalPhase'];
        scoringType: TeamTournamentConfig['scoringType'];
    }) => Promise<TeamTournamentConfig>;
    completeTeamTournamentConfiguration: (tournamentId: string) => Promise<void>;
    getTeamTournamentTeams: (tournamentId: string) => Promise<TeamTournamentTeam[]>;
    updateTeamTournamentTeam: (tournamentId: string, teamId: string, payload: {
        name: string;
        players: TeamTournamentPlayerEntry[];
        isSeeded?: boolean;
    }) => Promise<TeamTournamentTeam>;
    createTeamTournamentMatchday: (rootTournamentId: string, payload: {
        date: string;
        team1Number: number;
        team2Number: number;
        subMatches: Array<{
            team1Players: TeamTournamentPlayerEntry[];
            team2Players: TeamTournamentPlayerEntry[];
        }>;
        fixtureId?: string;
    }) => Promise<Tournament>;
    getTeamTournamentMatchdayByTournamentDayId: (tournamentDayId: string) => Promise<TeamTournamentMatchday>;
    saveTeamTournamentMatchdayResults: (matchdayId: string, payload: {
        status: 'scheduled' | 'completed';
        subMatches: Array<Pick<TeamTournamentSubMatch, 'matchIndex' | 'sets' | 'cancelled'> & { team1Players?: TeamTournamentPlayerEntry[], team2Players?: TeamTournamentPlayerEntry[] }>;
    }) => Promise<any>;
    getTeamTournamentMatchdays: (rootTournamentId: string) => Promise<TeamTournamentMatchday[]>;
    getTeamTournamentPlayerStats: (rootTournamentId: string) => Promise<TeamTournamentPlayerStatsRow[]>;
    getTeamTournamentFixtures: (rootTournamentId: string) => Promise<TeamTournamentFixture[]>;
    updateTournament: (tournamentId: string, updatedData: Pick<Tournament, 'club' | 'date' | 'name'>) => Promise<void>;
    updateTournamentSeriesName: (oldName: string, newName: string) => Promise<void>;
    deleteTournament: (tournamentId: string, deleteIsolatedPlayers?: boolean) => Promise<void>;
    deleteTournamentSeries: (giornataName: string, deleteIsolatedPlayers?: boolean) => Promise<void>;
    getPlayerById: (id: string) => Player | undefined;
}

const PadelStoreContext = createContext<PadelStore | null>(null);

// Helper to make API requests with auth and error handling
async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
    const token = getAuthToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        ...options,
        cache: 'no-store',
        headers,
    });

    if (response.status === 401) {
        // Token expired or invalid — trigger logout
        window.dispatchEvent(new Event('auth:expired'));
        throw new Error('Sessione scaduta');
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'An unknown error occurred' }));
        throw new Error(errorData.message || 'API request failed');
    }
    return response.json();
}

export const PadelStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [players, setPlayers] = useState<Player[]>([]);
    const [ghostPlayers, setGhostPlayers] = useState<(Player & { isDeleted?: boolean })[]>([]);
    const [matches, setMatches] = useState<Match[]>([]);
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [eloHistory, setEloHistory] = useState<EloHistoryEntry[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const bulkSaveInFlightRef = useRef<Map<string, Promise<void>>>(new Map());
    // Chiave di idempotenza stabile per firma: un retry dopo errore di rete riusa la stessa chiave
    // e il server riconosce il torneo già salvato invece di duplicarlo.
    const bulkSaveKeysRef = useRef<Map<string, string>>(new Map());
    const fetchSeqRef = useRef(0);

    const fetchData = useCallback(async () => {
        const fetchSeq = ++fetchSeqRef.current;
        setLoading(true);
        try {
            // Fetch all data from a single bootstrap endpoint
            const data = await apiRequest<{
                players: Player[];
                ghostPlayers?: any[];
                matches: Match[];
                tournaments: Tournament[];
                eloHistory: EloHistoryEntry[];
            }>('/api/data');

            // Risposta superata da una richiesta più recente: ignorala (evita stato vecchio sopra quello nuovo)
            if (fetchSeq !== fetchSeqRef.current) return;
            
            setPlayers(data.players);
            if (!data.ghostPlayers) setGhostPlayers([]);
            if (data.ghostPlayers) {
                const normalizedGhosts: (Player & { isDeleted?: boolean })[] = data.ghostPlayers.map(gp => ({
                    id: gp.id,
                    name: gp.name || 'Giocatore',
                    surname: gp.surname || 'Eliminato',
                    currentElo: Number(gp.currentElo ?? gp.current_elo ?? 1500),
                    initialElo: Number(gp.initialElo ?? gp.initial_elo ?? 1500),
                    position: gp.position || FieldPosition.Indifferente,
                    isDeleted: true,
                }));
                setGhostPlayers(normalizedGhosts);
            }
            setMatches(data.matches);
            setTournaments(data.tournaments);
            setEloHistory(data.eloHistory);

        } catch (error) {
            console.error("Failed to fetch initial data:", error);
            // Optionally set an error state to show in the UI
        } finally {
            if (fetchSeq === fetchSeqRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const addPlayer = async (name: string, surname: string, position: FieldPosition, currentElo?: number): Promise<void> => {
        await apiRequest('/api/players', {
            method: 'POST',
            body: JSON.stringify({ name, surname, position, currentElo }),
        });
        await fetchData(); // Refetch all data to get the new state from the server
    };
    
    const updatePlayerAndElo = async (playerId: string, updatedData: Pick<Player, 'name' | 'surname' | 'position'>, newElo: number, tournamentId?: string): Promise<void> => {
        await apiRequest(`/api/players`, {
             method: 'PUT',
             body: JSON.stringify({ id: playerId, ...updatedData, currentElo: newElo, tournamentId }),
        });
        await fetchData();
    };

    const deletePlayer = async (playerId: string): Promise<void> => {
        await apiRequest(`/api/players`, {
            method: 'DELETE',
            body: JSON.stringify({ id: playerId }),
        });
        await fetchData();
    };

    const addMatch = async (matchData: Omit<Match, 'id'>): Promise<void> => {
        await apiRequest('/api/matches', {
            method: 'POST',
            body: JSON.stringify(matchData),
        });
        await fetchData(); // The backend will have recalculated ELOs, so refetch everything.
    };
    
    const addMultipleMatches = async (matchDataList: Omit<Match, 'id'>[], newTournamentData: Omit<Tournament, 'id'>): Promise<void> => {
        const sortedMatches = matchDataList.map(match => ({
            groupNumber: match.groupNumber ?? null,
            phase: match.phase ?? null,
            roundNumber: match.roundNumber ?? null,
            team1: [...(match.team1 || [])].sort(),
            team2: [...(match.team2 || [])].sort(),
        }));
        const signature = JSON.stringify({
            date: newTournamentData.date,
            matches: sortedMatches,
            name: newTournamentData.name,
            type: newTournamentData.type,
        });
        const pending = bulkSaveInFlightRef.current.get(signature);
        if (pending) return pending;

        const requestId = bulkSaveKeysRef.current.get(signature)
            || globalThis.crypto?.randomUUID?.()
            || `save-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        bulkSaveKeysRef.current.set(signature, requestId);
        const operation = (async () => {
            try {
                await apiRequest('/api/tournaments/bulk-matches', {
                    method: 'POST',
                    headers: { 'Idempotency-Key': requestId },
                    body: JSON.stringify({ matches: matchDataList, tournament: newTournamentData, requestId }),
                });
                bulkSaveKeysRef.current.delete(signature);
                await fetchData();
            } catch (error) {
                console.error('Failed to add multiple matches:', error);
                throw error;
            } finally {
                bulkSaveInFlightRef.current.delete(signature);
            }
        })();
        bulkSaveInFlightRef.current.set(signature, operation);
        return operation;
    };

    const updateTournamentMatches = async (matchUpdates: Array<{ matchId: string; sets: SetScore[]; winner?: Match['winner']; team1?: string[]; team2?: string[] }>, skipRefresh = false): Promise<void> => {
         await apiRequest('/api/matches', {
            method: 'PUT',
            body: JSON.stringify({ matchUpdates }),
        });
        if (!skipRefresh) await fetchData();
    };

    const cascadeResetTournament = async (tournamentId: string, phaseMatchIds: string[], skipRefresh = false): Promise<void> => {
        await apiRequest('/api/tournaments/cascade-reset', {
            method: 'POST',
            body: JSON.stringify({ tournamentId, phaseMatchIds }),
        });
        if (!skipRefresh) await fetchData();
    };

    const addTournament = async (tournamentData: Omit<Tournament, 'id'>): Promise<Tournament> => {
        // This is now slightly different. We call the bulk endpoint which handles everything.
        // We'll return a temporary object since the real one will be fetched.
        const tempTournament = { ...tournamentData, id: crypto.randomUUID(), matchIds: [] };
        // The actual logic is handled by addMultipleMatches, so this function is now more of a placeholder
        // in the context of the tournament flow. The main call is the bulk one.
        return tempTournament;
    };

    const createTeamTournament = async (payload: {
        name: string;
        club: string;
        initialTeamCount: number;
        defaultPlayersPerTeam: number;
        format: TeamTournamentConfig['format'];
        matchesPerDay: TeamTournamentConfig['matchesPerDay'];
        roundRobinFinalPhase: TeamTournamentConfig['roundRobinFinalPhase'];
        scoringType: TeamTournamentConfig['scoringType'];
        date?: string;
    }): Promise<{ tournament: Tournament; config: TeamTournamentConfig }> => {
        const response = await apiRequest<{
            tournament: Tournament;
            config: TeamTournamentConfig;
        }>('/api/team-tournaments', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        await fetchData();
        return response;
    };

    const getTeamTournamentConfig = async (tournamentId: string): Promise<TeamTournamentConfig> => {
        const response = await apiRequest<{ config: TeamTournamentConfig }>(`/api/team-tournaments/${tournamentId}/config`);
        return response.config;
    };

    const updateTeamTournamentConfig = async (tournamentId: string, payload: {
        initialTeamCount: number;
        defaultPlayersPerTeam: number;
        format: TeamTournamentConfig['format'];
        matchesPerDay: TeamTournamentConfig['matchesPerDay'];
        roundRobinFinalPhase: TeamTournamentConfig['roundRobinFinalPhase'];
        scoringType: TeamTournamentConfig['scoringType'];
    }): Promise<TeamTournamentConfig> => {
        const response = await apiRequest<{ config: TeamTournamentConfig }>(`/api/team-tournaments/${tournamentId}/config`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
        await fetchData();
        return response.config;
    };

    const completeTeamTournamentConfiguration = async (tournamentId: string): Promise<void> => {
        await apiRequest(`/api/team-tournaments/${tournamentId}/complete-configuration`, {
            method: 'POST',
        });
        await fetchData();
    };

    const getTeamTournamentTeams = async (tournamentId: string): Promise<TeamTournamentTeam[]> => {
        const response = await apiRequest<{ teams: TeamTournamentTeam[] }>(`/api/team-tournaments/${tournamentId}/teams`);
        return response.teams;
    };

    const updateTeamTournamentTeam = async (tournamentId: string, teamId: string, payload: {
        name: string;
        players: TeamTournamentPlayerEntry[];
        isSeeded?: boolean;
    }): Promise<TeamTournamentTeam> => {
        const response = await apiRequest<{ team: TeamTournamentTeam }>(`/api/team-tournaments/${tournamentId}/teams/${teamId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
        await fetchData();
        return response.team;
    };

    const createTeamTournamentMatchday = async (rootTournamentId: string, payload: {
        date: string;
        team1Number: number;
        team2Number: number;
        subMatches: Array<{
            team1Players: TeamTournamentPlayerEntry[];
            team2Players: TeamTournamentPlayerEntry[];
        }>;
        fixtureId?: string;
    }): Promise<Tournament> => {
        const response = await apiRequest<{ tournamentDay: Tournament }>(`/api/team-tournaments/${rootTournamentId}/matchdays`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        await fetchData();
        return response.tournamentDay;
    };

    const getTeamTournamentMatchdayByTournamentDayId = async (tournamentDayId: string): Promise<TeamTournamentMatchday> => {
        const response = await apiRequest<{ matchday: TeamTournamentMatchday }>(`/api/team-tournament-matchdays/by-tournament/${tournamentDayId}`);
        return response.matchday;
    };

    const saveTeamTournamentMatchdayResults = async (matchdayId: string, payload: {
        status: 'scheduled' | 'completed';
        subMatches: Array<Pick<TeamTournamentSubMatch, 'matchIndex' | 'sets' | 'cancelled'> & { team1Players?: TeamTournamentPlayerEntry[], team2Players?: TeamTournamentPlayerEntry[] }>;
    }): Promise<any> => {
        const response = await apiRequest<{ success: boolean; summary?: any }>(`/api/team-tournament-matchdays/${matchdayId}/results`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
        await fetchData();
        return response.summary || null;
    };

    const getTeamTournamentMatchdays = async (rootTournamentId: string): Promise<TeamTournamentMatchday[]> => {
        const response = await apiRequest<{ matchdays: TeamTournamentMatchday[] }>(`/api/team-tournaments/${rootTournamentId}/matchdays`);
        return response.matchdays || [];
    };

    const getTeamTournamentPlayerStats = async (rootTournamentId: string): Promise<TeamTournamentPlayerStatsRow[]> => {
        const response = await apiRequest<{ stats: TeamTournamentPlayerStatsRow[] }>(`/api/team-tournaments/${rootTournamentId}/player-stats`);
        return response.stats || [];
    };

    const getTeamTournamentFixtures = async (rootTournamentId: string): Promise<TeamTournamentFixture[]> => {
        const response = await apiRequest<{ fixtures: TeamTournamentFixture[] }>(`/api/team-tournaments/${rootTournamentId}/fixtures`);
        return response.fixtures || [];
    };
    
    const deleteMatch = async (matchId: string): Promise<void> => {
        await apiRequest(`/api/matches`, {
            method: 'DELETE',
            body: JSON.stringify({ id: matchId }),
        });
        await fetchData();
    };

    const updateTournament = async (tournamentId: string, updatedData: Pick<Tournament, 'club' | 'date' | 'name'>): Promise<void> => {
        await apiRequest(`/api/tournaments`, {
            method: 'PUT',
            body: JSON.stringify({ id: tournamentId, ...updatedData }),
        });
        await fetchData();
    };

    const updateTournamentSeriesName = async (oldName: string, newName: string): Promise<void> => {
        await apiRequest('/api/tournaments/series/name', {
            method: 'PUT',
            body: JSON.stringify({ oldName, newName }),
        });
        await fetchData();
    };
    
    // Torneo Messicano: creazione (stato 'scheduled') con idempotenza e salvataggio incrementale JIT.
    const mexicanCreateKeyRef = useRef<string | null>(null);
    const createMexicanTournament = async (matchDataList: Omit<Match, 'tournamentId'>[], tournamentData: Omit<Tournament, 'id'>) => {
        const requestId = mexicanCreateKeyRef.current
            || globalThis.crypto?.randomUUID?.()
            || `mex-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        mexicanCreateKeyRef.current = requestId;
        const data = await apiRequest<{ tournamentId: string; matches?: Array<{ id: string; roundNumber: number | null; groupNumber: number | null }> }>('/api/tournaments/bulk-matches', {
            method: 'POST',
            headers: { 'Idempotency-Key': requestId },
            body: JSON.stringify({ matches: matchDataList, tournament: tournamentData, requestId }),
        });
        mexicanCreateKeyRef.current = null;
        await fetchData(); // il torneo "In Programma" compare subito nella lista Tornei
        return { tournamentId: data.tournamentId, matches: data.matches || [] };
    };

    const saveMexicanProgress = async (tournamentId: string, updates: Array<{ matchId: string; sets: SetScore[] }>, newMatches: Array<any>) => {
        const data = await apiRequest<{ created: Array<{ clientId: string | null; id: string }> }>('/api/tournaments/mexican-progress', {
            method: 'PUT',
            body: JSON.stringify({ tournamentId, updates, newMatches }),
        });
        await fetchData();
        return data.created || [];
    };

    const completeTournament = async (tournamentId: string): Promise<void> => {
        await apiRequest(`/api/tournaments/complete`, {
            method: 'PUT',
            body: JSON.stringify({ tournamentId }),
        });
        await fetchData();
    };
    
    const deleteTournament = async (tournamentId: string, deleteIsolatedPlayers?: boolean): Promise<void> => {
        await apiRequest(`/api/tournaments`, {
            method: 'DELETE',
            body: JSON.stringify({ id: tournamentId, deleteIsolatedPlayers }),
        });
        await fetchData();
    };

    const deleteTournamentSeries = async (giornataName: string, deleteIsolatedPlayers?: boolean): Promise<void> => {
        await apiRequest(`/api/tournaments/series`, {
            method: 'DELETE',
            body: JSON.stringify({ giornataName, deleteIsolatedPlayers }),
        });
        await fetchData();
    };

    const getPlayerById = (id: string): Player | undefined => players.find(p => p.id === id) || ghostPlayers.find(p => p.id === id);

    return (
        <PadelStoreContext.Provider value={{
            players,
            matches,
            tournaments,
            eloHistory,
            loading,
            fetchData,
            addPlayer,
            updatePlayerAndElo,
            deletePlayer,
            addMatch,
            addMultipleMatches,
            deleteMatch,
            updateTournamentMatches,
            cascadeResetTournament,
            addTournament,
            deleteTournament,
            deleteTournamentSeries,
            createTeamTournament,
            getTeamTournamentConfig,
            updateTeamTournamentConfig,
            completeTeamTournamentConfiguration,
            getTeamTournamentTeams,
            updateTeamTournamentTeam,
            createTeamTournamentMatchday,
            getTeamTournamentMatchdayByTournamentDayId,
            saveTeamTournamentMatchdayResults,
            getTeamTournamentMatchdays,
            getTeamTournamentPlayerStats,
            getTeamTournamentFixtures,
            updateTournament,
            completeTournament,
            createMexicanTournament,
            saveMexicanProgress,
            getPlayerById
        }}>
            {children}
        </PadelStoreContext.Provider>
    );
};

export const usePadelStore = (): PadelStore => {
    const context = useContext(PadelStoreContext);
    if (!context) {
        throw new Error('usePadelStore must be used within a PadelStoreProvider');
    }
    return context;
};
