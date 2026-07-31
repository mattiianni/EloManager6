
import React, { useState, useEffect } from 'react';
import { usePadelStore } from '../hooks/usePadelStore.tsx';
import { Player, TeamTournamentConfig, TeamTournamentFixture, TeamTournamentTeam, TournamentType, TeamTournamentMatchday } from '../types.ts';
import { generatePairs, DrawMode } from '../services/drawService.ts';
import Card from '../components/ui/Card.tsx';
import Button from '../components/ui/Button.tsx';
import { HIGSheet } from '../components/ui/HIGSheet';
import TournamentFlow from '../components/TournamentFlow.tsx';
import ShuffleAnimation from '../components/ui/ShuffleAnimation.tsx';
import { ShuffleIcon, ChevronDownIcon, PencilIcon, CalendarIcon, UsersIcon, TrophyIcon, PlusIcon, ArrowUpRightIcon, ArrowLeftIcon } from '../components/ui/Icons.tsx';
import { useAuth } from '../hooks/useAuth.tsx';
import { usePlayerSimilarity, SimilarityResult } from '../hooks/usePlayerSimilarity.ts';
import PlayerSimilarityModal from '../components/PlayerSimilarityModal.tsx';
import EloPlaytomicInput from '../components/EloPlaytomicInput.tsx';
import TournamentFormatSelector, { SingleTournamentFormat } from '../components/TournamentFormatSelector.tsx';
import PlayerAvatar from '../components/ui/PlayerAvatar.tsx';

interface DrawPageProps {
    setActivePage: (page: 'Dashboard' | 'Ranking' | 'Players' | 'Matches' | 'Draw' | 'Tournaments') => void;
    newGiornataForTournament: string | null;
    setNewGiornataForTournament: (name: string | null) => void;
    teamTournamentToConfigure: string | null;
    clearTeamTournamentToConfigure: () => void;
    launchMode?: 'launcher' | null;
    clearLaunchMode?: () => void;
    isNavigationOverlayOpen?: boolean;
}

type DrawFlow = 'pairs' | 'team-tournament' | 'single-tournament-format-first';
type DrawEntryChoice = 'menu' | 'pairs' | 'team' | 'existing';
type TeamTournamentFormat = 'ROUND ROBIN' | 'ANDATA E RITORNO' | 'ELIMINAZIONE DIRETTA';
type TeamTournamentMatchesPerDay = 3 | 5;
type RoundRobinFinalPhase = 'FINALI' | 'SEMIFINALI E FINALI' | 'QUARTI, SEMIFINALI E FINALI';
type TeamTournamentScoringType = 'Punti' | 'Differenza Games' | 'Punti + Resilienza';
type TeamTournamentConfigView = 'config' | 'summary';

const TEAM_TOURNAMENT_FORMAT_LABELS: Record<TeamTournamentFormat, string> = {
    'ROUND ROBIN': 'Round Robin',
    'ANDATA E RITORNO': 'Andata e ritorno',
    'ELIMINAZIONE DIRETTA': 'Eliminazione diretta',
};

const TEAM_TOURNAMENT_FINAL_PHASE_LABELS: Record<RoundRobinFinalPhase, string> = {
    'FINALI': 'Finali',
    'SEMIFINALI E FINALI': 'Semifinali e finali',
    'QUARTI, SEMIFINALI E FINALI': 'Quarti, semifinali e finali',
};

const levenshtein = (a: string, b: string): number => {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

const ParticipantListSkeleton = () => (
    <div className="space-y-2 animate-pulse pr-2 max-h-96 overflow-y-auto">
        {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center space-x-3 p-2">
                <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            </div>
        ))}
    </div>
);

const DrawPage: React.FC<DrawPageProps> = ({
    setActivePage,
    newGiornataForTournament,
    setNewGiornataForTournament,
    teamTournamentToConfigure,
    clearTeamTournamentToConfigure,
    launchMode = null,
    clearLaunchMode,
    isNavigationOverlayOpen = false,
}) => {
    const { workspace } = useAuth();
    const workspaceId = workspace?.id;
    const { searchSimilarPlayer, isSearching } = usePlayerSimilarity(workspaceId);
    const {
        players,
        loading,
        createTeamTournament,
        tournaments,
        getTeamTournamentConfig,
        updateTeamTournamentConfig,
        completeTeamTournamentConfiguration,
        getTeamTournamentTeams,
        getTeamTournamentFixtures,
        getTeamTournamentMatchdays,
        updateTeamTournamentTeam,
        updateTournament
    } = usePadelStore();
    const [activeFlow, setActiveFlow] = useState<DrawFlow>('pairs');
    const [entryChoice, setEntryChoice] = useState<DrawEntryChoice>('pairs');
    const [participants, setParticipants] = useState<string[]>([]);
    const [seeds, setSeeds] = useState<string[]>([]);
    const [mode, setMode] = useState<DrawMode>('Normal');
    const [numPairs, setNumPairs] = useState(2);
    const [isCustomNumPairs, setIsCustomNumPairs] = useState(false);
    const [selectedFormatForNewFlow, setSelectedFormatForNewFlow] = useState<SingleTournamentFormat | null>(null);
    const [drawnPairs, setDrawnPairs] = useState<[Player, Player][] | null>(null);
    const [manualPairs, setManualPairs] = useState<[string, string][]>([]);
    const [isShuffling, setIsShuffling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showTournamentFlow, setShowTournamentFlow] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedExistingTournamentName, setSelectedExistingTournamentName] = useState('');
    const [teamTournamentName, setTeamTournamentName] = useState('');
    const [teamTournamentClub, setTeamTournamentClub] = useState('');
    const [teamTournamentCount, setTeamTournamentCount] = useState(2);
    const [teamTournamentPlayersPerTeam, setTeamTournamentPlayersPerTeam] = useState(2);
    const [teamTournamentFormat, setTeamTournamentFormat] = useState<TeamTournamentFormat>('ROUND ROBIN');
    const [teamTournamentMatchesPerDay, setTeamTournamentMatchesPerDay] = useState<TeamTournamentMatchesPerDay>(3);
    const [teamTournamentRoundRobinFinalPhase, setTeamTournamentRoundRobinFinalPhase] = useState<RoundRobinFinalPhase>('FINALI');
    const [teamTournamentScoringType, setTeamTournamentScoringType] = useState<TeamTournamentScoringType>('Punti');
    const [isCreatingTeamTournament, setIsCreatingTeamTournament] = useState(false);
    const [teamTournamentConfig, setTeamTournamentConfig] = useState<TeamTournamentConfig | null>(null);
    const [teamTournamentTeams, setTeamTournamentTeams] = useState<TeamTournamentTeam[]>([]);
    const [teamTournamentFixtures, setTeamTournamentFixtures] = useState<TeamTournamentFixture[]>([]);
    const [teamTournamentMatchdays, setTeamTournamentMatchdays] = useState<TeamTournamentMatchday[]>([]);
    const [isLoadingTeamTournamentConfig, setIsLoadingTeamTournamentConfig] = useState(false);
    const [isLoadingTeamTournamentTeams, setIsLoadingTeamTournamentTeams] = useState(false);
    const [isLoadingTeamTournamentMatchdays, setIsLoadingTeamTournamentMatchdays] = useState(false);
    const [isEditTeamTournamentModalOpen, setIsEditTeamTournamentModalOpen] = useState(false);
    const [editTeamTournamentName, setEditTeamTournamentName] = useState('');
    const [editTeamTournamentClub, setEditTeamTournamentClub] = useState('');
    const [editTeamTournamentCount, setEditTeamTournamentCount] = useState(2);
    const [editTeamTournamentPlayersPerTeam, setEditTeamTournamentPlayersPerTeam] = useState(2);
    const [editTeamTournamentFormat, setEditTeamTournamentFormat] = useState<TeamTournamentFormat>('ROUND ROBIN');
    const [editTeamTournamentMatchesPerDay, setEditTeamTournamentMatchesPerDay] = useState<TeamTournamentMatchesPerDay>(3);
    const [editTeamTournamentRoundRobinFinalPhase, setEditTeamTournamentRoundRobinFinalPhase] = useState<RoundRobinFinalPhase>('FINALI');
    const [editTeamTournamentScoringType, setEditTeamTournamentScoringType] = useState<TeamTournamentScoringType>('Punti');
    const [isSavingTeamTournamentConfig, setIsSavingTeamTournamentConfig] = useState(false);
    const [teamTournamentTeamToEdit, setTeamTournamentTeamToEdit] = useState<TeamTournamentTeam | null>(null);
    const [editTeamName, setEditTeamName] = useState('');
    const [editTeamPlayers, setEditTeamPlayers] = useState<{ id?: string; name: string; surname: string; currentElo?: number; }[]>([]);
    const [editTeamIsSeeded, setEditTeamIsSeeded] = useState(false);
    const [isSavingTeamTournamentTeam, setIsSavingTeamTournamentTeam] = useState(false);
    const [isCompletingTeamTournamentConfiguration, setIsCompletingTeamTournamentConfiguration] = useState(false);
    const [teamTournamentConfigView, setTeamTournamentConfigView] = useState<TeamTournamentConfigView>('config');

    // Similarity Check State
    const [similarityCheckQueue, setSimilarityCheckQueue] = useState<{index: number, name: string, surname: string}[]>([]);
    const [currentSimilarityCandidates, setCurrentSimilarityCandidates] = useState<SimilarityResult[]>([]);
    const [similarityCheckCurrentPlayers, setSimilarityCheckCurrentPlayers] = useState<typeof editTeamPlayers>([]);
    const [isSimilarityModalOpen, setIsSimilarityModalOpen] = useState(false);
    
    const sortedPlayers = [...players].sort((a,b) => a.name.localeCompare(b.name));
    const participantPlayers = players.filter(p => participants.includes(p.id));
    const isNewGiornataFlow = !!newGiornataForTournament;
    const isLauncherContext = launchMode === 'launcher';
    const isTeamTournamentFlow = activeFlow === 'team-tournament';
    const teamTournamentToConfigureData = teamTournamentToConfigure
        ? tournaments.find(t => t.id === teamTournamentToConfigure) || null
        : null;

    const requiredParticipants = numPairs * 2;
    const canSelectMore = participants.length < requiredParticipants;

    const filteredSortedPlayers = sortedPlayers.filter(p => 
        `${p.name} ${p.surname}`.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const existingTournamentSeriesNames = Array.from(
        new Set(
            tournaments
                .filter(t => !t.giornataName && t.type !== TournamentType.TorneoASquadre)
                .map(t => t.name)
        )
    ).sort((a, b) => a.localeCompare(b));
    
    // Auto-select seeds for Seeded mode
    useEffect(() => {
        if (mode === 'Seeded' && participants.length > 0) {
            const topSeeds = players
                .filter(p => participants.includes(p.id))
                .sort((a, b) => b.currentElo - a.currentElo)
                .slice(0, numPairs)
                .map(p => p.id);
            setSeeds(topSeeds);
        } else {
            setSeeds([]);
        }
    }, [participants, mode, numPairs, players]);

    // Reset everything when mode changes
    useEffect(() => {
        setParticipants([]);
        setSeeds([]);
        setDrawnPairs(null);
        setError(null);
        if (mode === 'Manual') {
            setManualPairs(Array.from({ length: numPairs }, () => ['', '']));
        } else {
            setManualPairs([]);
        }
    }, [mode]); // Only trigger on mode change, NOT numPairs!
    
    // Handle numPairs changes separately to preserve manual pairs
    useEffect(() => {
        // Always reset drawn pairs when numPairs changes
        setDrawnPairs(null);
        
        if (mode === 'Manual') {
            setManualPairs(currentPairs => {
                const newSize = numPairs;
                const oldSize = currentPairs.length;
                if (newSize > oldSize) {
                    return [
                        ...currentPairs,
                        ...Array.from({ length: newSize - oldSize }, () => ['', ''] as [string, string])
                    ];
                }
                return currentPairs.slice(0, newSize);
            });
        }
    }, [numPairs, mode]);

    useEffect(() => {
        if (teamTournamentToConfigure) return;
        if (isNewGiornataFlow) {
            setEntryChoice('pairs');
            setActiveFlow('pairs');
            return;
        }
        if (launchMode === 'launcher') {
            setEntryChoice('menu');
            setActiveFlow('pairs');
        }
    }, [teamTournamentToConfigure, isNewGiornataFlow, launchMode]);

    useEffect(() => {
        if (isNewGiornataFlow && activeFlow === 'team-tournament') {
            setActiveFlow('pairs');
        }
    }, [activeFlow, isNewGiornataFlow]);

    // Rule: 5 matches per giornata requires at least 8 players per team.
    useEffect(() => {
        if (teamTournamentPlayersPerTeam < 8 && teamTournamentMatchesPerDay === 5) {
            setTeamTournamentMatchesPerDay(3);
        }
    }, [teamTournamentPlayersPerTeam, teamTournamentMatchesPerDay]);

    useEffect(() => {
        if (editTeamTournamentPlayersPerTeam < 8 && editTeamTournamentMatchesPerDay === 5) {
            setEditTeamTournamentMatchesPerDay(3);
        }
    }, [editTeamTournamentPlayersPerTeam, editTeamTournamentMatchesPerDay]);

    useEffect(() => {
        if (!teamTournamentToConfigure) {
            setTeamTournamentConfig(null);
            setTeamTournamentTeams([]);
            setTeamTournamentFixtures([]);
            setTeamTournamentConfigView('config');
            return;
        }

        let cancelled = false;

        const loadConfig = async () => {
            setIsLoadingTeamTournamentConfig(true);
            setError(null);
            try {
                const config = await getTeamTournamentConfig(teamTournamentToConfigure);
                if (!cancelled) {
                    setTeamTournamentConfig({
                        initialTeamCount: config.initialTeamCount,
                        defaultPlayersPerTeam: config.defaultPlayersPerTeam,
                        format: config.format,
                        matchesPerDay: config.matchesPerDay,
                        roundRobinFinalPhase: config.roundRobinFinalPhase,
                        scoringType: config.scoringType,
                        schedule: config.schedule || null,
                        hasResults: !!config.hasResults
                    });
                }
            } catch (err: any) {
                if (!cancelled) {
                    setError(err.message || 'Errore nel recupero configurazione torneo a squadre.');
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingTeamTournamentConfig(false);
                }
            }
        };

        loadConfig();

        return () => {
            cancelled = true;
        };
    }, [teamTournamentToConfigure, getTeamTournamentConfig]);

    useEffect(() => {
        if (!teamTournamentToConfigure) {
            setTeamTournamentTeams([]);
            return;
        }

        let cancelled = false;

        const loadTeams = async () => {
            setIsLoadingTeamTournamentTeams(true);
            try {
                const teams = await getTeamTournamentTeams(teamTournamentToConfigure);
                if (!cancelled) {
                    setTeamTournamentTeams(teams);
                }
            } catch (err: any) {
                if (!cancelled) {
                    setError(err.message || 'Errore nel recupero delle squadre.');
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingTeamTournamentTeams(false);
                }
            }
        };

        loadTeams();

        return () => {
            cancelled = true;
        };
    }, [teamTournamentToConfigure, getTeamTournamentTeams]);

    useEffect(() => {
        if (!teamTournamentToConfigure) {
            setTeamTournamentMatchdays([]);
            return;
        }

        let cancelled = false;

        const loadMatchdays = async () => {
            setIsLoadingTeamTournamentMatchdays(true);
            try {
                const matchdays = await getTeamTournamentMatchdays(teamTournamentToConfigure);
                if (!cancelled) {
                    setTeamTournamentMatchdays(matchdays);
                }
            } catch (err: any) {
                if (!cancelled) {
                    setError(err.message || 'Errore nel recupero delle giornate.');
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingTeamTournamentMatchdays(false);
                }
            }
        };

        loadMatchdays();

        return () => {
            cancelled = true;
        };
    }, [teamTournamentToConfigure, getTeamTournamentMatchdays]);

    useEffect(() => {
        if (!teamTournamentToConfigure) {
            setTeamTournamentFixtures([]);
            return;
        }

        let cancelled = false;

        const loadFixtures = async () => {
            try {
                const fixtures = await getTeamTournamentFixtures(teamTournamentToConfigure);
                if (!cancelled) {
                    setTeamTournamentFixtures(fixtures);
                }
            } catch {
                if (!cancelled) {
                    setTeamTournamentFixtures([]);
                }
            }
        };

        loadFixtures();
        return () => {
            cancelled = true;
        };
    }, [teamTournamentToConfigure, getTeamTournamentFixtures]);

    const handleParticipantToggle = (playerId: string) => {
        setParticipants(prev => {
            if (prev.includes(playerId)) {
                return prev.filter(id => id !== playerId);
            }
            if (prev.length < requiredParticipants) {
                return [...prev, playerId];
            }
            return prev;
        });
    };

    const handleSeedToggle = (playerId: string) => {
        setSeeds(prev =>
            prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]
        );
    };
    
    const handleManualPairChange = (pairIndex: number, playerIndex: 0 | 1, playerId: string) => {
        setManualPairs(currentPairs => {
            const newPairs = [...currentPairs];
            const newPair = [...newPairs[pairIndex]] as [string, string];
            newPair[playerIndex] = playerId;
            newPairs[pairIndex] = newPair;
            return newPairs;
        });
    };

    const handleDraw = () => {
        if (isTeamTournamentFlow) return;
        console.log('handleDraw called', { mode, participants: participants.length, requiredParticipants, manualPairs });
        setError(null);
        setDrawnPairs(null);
        setShowTournamentFlow(false);
        
        if (mode !== 'Manual' && participants.length < requiredParticipants) {
            setError(`Partecipanti insufficienti. Richiesti: ${requiredParticipants}, Selezionati: ${participants.length}.`);
            return;
        }

        if (mode === 'Manual') {
            const selectedManualPlayers = manualPairs.flat().filter(Boolean);
            if (selectedManualPlayers.length < requiredParticipants) {
                setError('Per favore, riempi tutti gli slot dei giocatori.');
                return;
            }
            if (new Set(selectedManualPlayers).size !== selectedManualPlayers.length) {
                setError('Ogni giocatore può essere selezionato una sola volta tra tutte le coppie manuali.');
                return;
            }
            
            // No shuffling animation for manual mode - just confirm the pairs
            try {
                const pairs: [Player, Player][] = manualPairs.map(pairIds => {
                    console.log('Processing pair:', pairIds, 'Available players:', players.length);
                    const p1 = players.find(p => p.id === pairIds[0]);
                    const p2 = players.find(p => p.id === pairIds[1]);
                    console.log('Found players:', { p1: p1?.name, p2: p2?.name });
                    if (!p1 || !p2) {
                        throw new Error(`Player not found in pair: ${pairIds[0]} or ${pairIds[1]}`);
                    }
                    return [p1, p2];
                });
                setDrawnPairs(pairs);
            } catch (e: any) {
                setError(e.message);
            }
        } else {
            setIsShuffling(true);
            setTimeout(() => {
                try {
                    const pairs = generatePairs(participantPlayers, mode, numPairs, seeds);
                    setDrawnPairs(pairs);
                } catch (e: any) {
                    setError(e.message);
                } finally {
                    setIsShuffling(false);
                }
            }, 3000);
        }
    };
    
    const isFull = participants.length === requiredParticipants;

    const participantsTitle = (
        <div className="flex justify-between items-center w-full">
            <span>Seleziona Partecipanti</span>
            <span className={`font-mono text-base font-bold px-3 py-1 rounded-full transition-colors ${
                isFull 
                ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400' 
                : 'bg-green-100 dark:bg-green-800/50 text-green-600 dark:text-green-400'
            }`}>
                {String(participants.length).padStart(2, '0')}/{String(requiredParticipants).padStart(2, '0')}
            </span>
        </div>
    );

    const handleFlowChange = (flow: DrawFlow) => {
        setActiveFlow(flow);
        setError(null);
        setDrawnPairs(null);
        setShowTournamentFlow(false);
    };

    const openPairsFlow = () => {
        setEntryChoice('pairs');
        setSelectedFormatForNewFlow(null);
        handleFlowChange('pairs');
        setNewGiornataForTournament(null);
    };

    const openTeamFlow = () => {
        setEntryChoice('team');
        handleFlowChange('team-tournament');
        setNewGiornataForTournament(null);
    };

    const openExistingTournamentDayFlow = () => {
        setEntryChoice('existing');
        handleFlowChange('pairs');
        setNewGiornataForTournament(null);
        setSelectedExistingTournamentName('');
    };

    const confirmExistingTournamentSelection = () => {
        if (!selectedExistingTournamentName) {
            setError('Seleziona prima un torneo esistente.');
            return;
        }
        setError(null);
        setNewGiornataForTournament(selectedExistingTournamentName);
        setEntryChoice('pairs');
        setSelectedFormatForNewFlow(null);
        setActiveFlow('pairs');
    };

    const handleCreateTeamTournament = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!teamTournamentName.trim() || !teamTournamentClub.trim()) {
            setError('Inserisci nome torneo e circolo.');
            return;
        }

        if (teamTournamentCount < 2) {
            setError('Il torneo a squadre richiede almeno 2 squadre.');
            return;
        }

        if (teamTournamentPlayersPerTeam < 1) {
            setError('Inserisci almeno 1 giocatore per squadra.');
            return;
        }

        setIsCreatingTeamTournament(true);
        try {
            await createTeamTournament({
                name: teamTournamentName.trim(),
                club: teamTournamentClub.trim(),
                initialTeamCount: teamTournamentCount,
                defaultPlayersPerTeam: teamTournamentPlayersPerTeam,
                format: teamTournamentFormat,
                matchesPerDay: teamTournamentMatchesPerDay,
                roundRobinFinalPhase: teamTournamentRoundRobinFinalPhase,
                scoringType: teamTournamentScoringType,
            });

            setTeamTournamentName('');
            setTeamTournamentClub('');
            setTeamTournamentCount(2);
            setTeamTournamentPlayersPerTeam(2);
            setTeamTournamentFormat('ROUND ROBIN');
            setTeamTournamentMatchesPerDay(3);
            setTeamTournamentRoundRobinFinalPhase('FINALI');
            setTeamTournamentScoringType('Punti');
            setActivePage('Tournaments');
        } catch (err: any) {
            setError(err.message || 'Errore nella creazione del torneo a squadre.');
        } finally {
            setIsCreatingTeamTournament(false);
        }
    };

    const openEditTeamTournamentModal = () => {
        if (!teamTournamentConfig || !teamTournamentToConfigureData) return;
        setEditTeamTournamentName(teamTournamentToConfigureData.name);
        setEditTeamTournamentClub(teamTournamentToConfigureData.club);
        setEditTeamTournamentCount(teamTournamentConfig.initialTeamCount);
        setEditTeamTournamentPlayersPerTeam(teamTournamentConfig.defaultPlayersPerTeam);
        setEditTeamTournamentFormat(teamTournamentConfig.format);
        setEditTeamTournamentMatchesPerDay(teamTournamentConfig.matchesPerDay);
        setEditTeamTournamentRoundRobinFinalPhase(teamTournamentConfig.roundRobinFinalPhase || 'FINALI');
        setEditTeamTournamentScoringType(teamTournamentConfig.scoringType);
        setIsEditTeamTournamentModalOpen(true);
    };

    const openTeamTournamentTeamEditor = (team: TeamTournamentTeam) => {
        const fallbackCount = teamTournamentConfig?.defaultPlayersPerTeam || 1;
        const playerCount = Math.max(team.players.length, team.targetPlayerCount || fallbackCount);
        const normalizedPlayers = Array.from({ length: playerCount }, (_, index) => {
            const existingPlayer = team.players[index];
            return {
                id: existingPlayer?.id,
                name: existingPlayer?.name || '',
                surname: existingPlayer?.surname || '',
                currentElo: existingPlayer?.currentElo
            };
        });

        setEditTeamName(team.name);
        setEditTeamPlayers(normalizedPlayers);
        setEditTeamIsSeeded(!!team.isSeeded);
        setTeamTournamentTeamToEdit(team);
        setError(null);
    };

    const handleTeamPlayerChange = (index: number, field: 'name' | 'surname' | 'currentElo', value: string | number) => {
        setError(null);
        setEditTeamPlayers(currentPlayers =>
            currentPlayers.map((player, playerIndex) =>
                playerIndex === index ? { ...player, [field]: value } : player
            )
        );
    };

    const handleUpdateTeamTournamentConfig = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!teamTournamentToConfigure) return;

        if (!editTeamTournamentName.trim() || !editTeamTournamentClub.trim()) {
            setError('Inserisci nome torneo e circolo.');
            return;
        }

        if (editTeamTournamentCount < 2) {
            setError('Il torneo a squadre richiede almeno 2 squadre.');
            return;
        }

        if (editTeamTournamentPlayersPerTeam < 1) {
            setError('Inserisci almeno 1 giocatore per squadra.');
            return;
        }

        setIsSavingTeamTournamentConfig(true);
        setError(null);
        try {
            await updateTournament(teamTournamentToConfigure, {
                name: editTeamTournamentName.trim(),
                club: editTeamTournamentClub.trim(),
                date: teamTournamentToConfigureData?.date || new Date().toISOString()
            });

            const config = await updateTeamTournamentConfig(teamTournamentToConfigure, {
                initialTeamCount: editTeamTournamentCount,
                defaultPlayersPerTeam: editTeamTournamentPlayersPerTeam,
                format: editTeamTournamentFormat,
                matchesPerDay: editTeamTournamentMatchesPerDay,
                roundRobinFinalPhase: editTeamTournamentRoundRobinFinalPhase,
                scoringType: editTeamTournamentScoringType
            });

            setTeamTournamentConfig({
                initialTeamCount: config.initialTeamCount,
                defaultPlayersPerTeam: config.defaultPlayersPerTeam,
                format: config.format,
                matchesPerDay: config.matchesPerDay,
                roundRobinFinalPhase: config.roundRobinFinalPhase,
                scoringType: config.scoringType,
                schedule: config.schedule || null,
                hasResults: !!config.hasResults
            });
            const teams = await getTeamTournamentTeams(teamTournamentToConfigure);
            setTeamTournamentTeams(teams);
            setIsEditTeamTournamentModalOpen(false);
        } catch (err: any) {
            setError(err.message || 'Errore nell\'aggiornamento configurazione torneo a squadre.');
        } finally {
            setIsSavingTeamTournamentConfig(false);
        }
    };

    const checkPlayerPlayed = (index: number) => {
        if (!teamTournamentTeamToEdit) return false;
        const originalPlayer = teamTournamentTeamToEdit.players[index];
        if (!originalPlayer) return false;
        
        const name = (originalPlayer.name || '').trim().toLowerCase();
        const surname = (originalPlayer.surname || '').trim().toLowerCase();
        if (!name && !surname) return false;

        const teamNumber = teamTournamentTeamToEdit.teamNumber;

        for (const md of teamTournamentMatchdays) {
            if (md.team1Number !== teamNumber && md.team2Number !== teamNumber) continue;
            
            for (const sm of (md.subMatches || [])) {
                const players = md.team1Number === teamNumber ? sm.team1Players : sm.team2Players;
                if (!players) continue;
                if (players.some(p => {
                    const pn = (p.name || '').trim().toLowerCase();
                    const ps = (p.surname || '').trim().toLowerCase();
                    return pn === name && ps === surname;
                })) {
                    return true;
                }
            }
        }
        return false;
    };

    const processNextSimilarityCheck = async (queue: {index: number, name: string, surname: string}[], currentPlayers: typeof editTeamPlayers) => {
        if (queue.length === 0) {
            // Queue empty, proceed to save with the final players array
            await executeSaveTeamTournamentTeam(currentPlayers);
            return;
        }

        const next = queue[0];
        const similar = await searchSimilarPlayer(next.name, next.surname);
        
        if (similar.length > 0) {
            setCurrentSimilarityCandidates(similar);
            setSimilarityCheckQueue(queue);
            // Salva anche lo stato corrente dei giocatori in modo che il modale possa usarlo
            setSimilarityCheckCurrentPlayers(currentPlayers);
            setIsSimilarityModalOpen(true);
        } else {
            // No similarities for this one, proceed to next
            processNextSimilarityCheck(queue.slice(1), currentPlayers);
        }
    };

    const handleUpdateTeamTournamentTeam = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!teamTournamentToConfigure || !teamTournamentTeamToEdit) return;

        if (!editTeamName.trim()) {
            setError('Inserisci il nome squadra.');
            return;
        }
        
        // Verifica frontend Levenshtein prima del submit per giocatori protetti
        for (let i = 0; i < editTeamPlayers.length; i++) {
            if (checkPlayerPlayed(i)) {
                const orig = teamTournamentTeamToEdit.players[i]?.surname?.trim().toLowerCase() || '';
                const curr = editTeamPlayers[i].surname.trim().toLowerCase();
                const dist = levenshtein(orig, curr);
                const limit = Math.max(2, Math.floor(orig.length * 0.20));
                if (dist > limit) {
                    setError(`La modifica del cognome per il giocatore ${i+1} supera il 20% consentito.`);
                    return;
                }
            }
        }

        // Build queue for similarity check
        const queue: {index: number, name: string, surname: string}[] = [];
        for (let i = 0; i < editTeamPlayers.length; i++) {
            const p = editTeamPlayers[i];
            if (!p.id && p.name.trim() && p.surname.trim()) {
                // If it's a new player (no ID assigned yet), check for similarities
                queue.push({ index: i, name: p.name.trim(), surname: p.surname.trim() });
            }
        }

        try {
            await processNextSimilarityCheck(queue, editTeamPlayers);
        } catch (err: any) {
            setError(err.message || 'Errore durante la verifica omonimia. Riprova.');
            setIsSavingTeamTournamentTeam(false);
        }
    };

    const executeSaveTeamTournamentTeam = async (finalPlayers?: typeof editTeamPlayers) => {
        if (!teamTournamentToConfigure || !teamTournamentTeamToEdit) return;

        setIsSavingTeamTournamentTeam(true);
        setError(null);
        try {
            const playersToSave = finalPlayers || editTeamPlayers;
            const updatedTeam = await updateTeamTournamentTeam(teamTournamentToConfigure, teamTournamentTeamToEdit.id, {
                name: editTeamName.trim(),
                players: playersToSave,
                isSeeded: editTeamIsSeeded,
            });

            setTeamTournamentTeams(currentTeams =>
                currentTeams.map(team => team.id === updatedTeam.id ? updatedTeam : team)
            );
            try {
                const fixtures = await getTeamTournamentFixtures(teamTournamentToConfigure);
                setTeamTournamentFixtures(fixtures);
            } catch {
                // Non-blocking while editing teams.
            }
            setTeamTournamentTeamToEdit(null);
        } catch (err: any) {
            setError(err.message || 'Errore nell\'aggiornamento della squadra.');
        } finally {
            setIsSavingTeamTournamentTeam(false);
        }
    };

    const handleTeamTournamentFormatChange = async (format: TeamTournamentFormat) => {
        if (!teamTournamentToConfigure || !teamTournamentConfig) return;

        setIsSavingTeamTournamentConfig(true);
        setError(null);
        try {
            const config = await updateTeamTournamentConfig(teamTournamentToConfigure, {
                initialTeamCount: teamTournamentConfig.initialTeamCount,
                defaultPlayersPerTeam: teamTournamentConfig.defaultPlayersPerTeam,
                format,
                matchesPerDay: teamTournamentConfig.matchesPerDay,
                roundRobinFinalPhase: teamTournamentConfig.roundRobinFinalPhase || 'FINALI',
                scoringType: teamTournamentConfig.scoringType
            });

            setTeamTournamentConfig({
                initialTeamCount: config.initialTeamCount,
                defaultPlayersPerTeam: config.defaultPlayersPerTeam,
                format: config.format,
                matchesPerDay: config.matchesPerDay,
                roundRobinFinalPhase: config.roundRobinFinalPhase,
                scoringType: config.scoringType,
                schedule: config.schedule || null,
                hasResults: !!config.hasResults
            });
        } catch (err: any) {
            setError(err.message || 'Errore nell\'aggiornamento del tipo torneo.');
        } finally {
            setIsSavingTeamTournamentConfig(false);
        }
    };

    const handleTeamTournamentRoundRobinFinalPhaseChange = async (roundRobinFinalPhase: RoundRobinFinalPhase) => {
        if (!teamTournamentToConfigure || !teamTournamentConfig) return;
        if (teamTournamentConfig.format === 'ELIMINAZIONE DIRETTA') return;

        setIsSavingTeamTournamentConfig(true);
        setError(null);
        try {
            const config = await updateTeamTournamentConfig(teamTournamentToConfigure, {
                initialTeamCount: teamTournamentConfig.initialTeamCount,
                defaultPlayersPerTeam: teamTournamentConfig.defaultPlayersPerTeam,
                format: teamTournamentConfig.format,
                matchesPerDay: teamTournamentConfig.matchesPerDay,
                roundRobinFinalPhase,
                scoringType: teamTournamentConfig.scoringType
            });

            setTeamTournamentConfig({
                initialTeamCount: config.initialTeamCount,
                defaultPlayersPerTeam: config.defaultPlayersPerTeam,
                format: config.format,
                matchesPerDay: config.matchesPerDay,
                roundRobinFinalPhase: config.roundRobinFinalPhase,
                scoringType: config.scoringType,
                schedule: config.schedule || null,
                hasResults: !!config.hasResults
            });
        } catch (err: any) {
            setError(err.message || 'Errore nell\'aggiornamento della fase finale.');
        } finally {
            setIsSavingTeamTournamentConfig(false);
        }
    };

    const handleTeamTournamentScoringTypeChange = async (scoringType: TeamTournamentScoringType) => {
        if (!teamTournamentToConfigure || !teamTournamentConfig) return;

        setIsSavingTeamTournamentConfig(true);
        setError(null);
        try {
            const config = await updateTeamTournamentConfig(teamTournamentToConfigure, {
                initialTeamCount: teamTournamentConfig.initialTeamCount,
                defaultPlayersPerTeam: teamTournamentConfig.defaultPlayersPerTeam,
                format: teamTournamentConfig.format,
                matchesPerDay: teamTournamentConfig.matchesPerDay,
                roundRobinFinalPhase: teamTournamentConfig.roundRobinFinalPhase || 'FINALI',
                scoringType
            });

            setTeamTournamentConfig({
                initialTeamCount: config.initialTeamCount,
                defaultPlayersPerTeam: config.defaultPlayersPerTeam,
                format: config.format,
                matchesPerDay: config.matchesPerDay,
                roundRobinFinalPhase: config.roundRobinFinalPhase,
                scoringType: config.scoringType,
                schedule: config.schedule || null,
                hasResults: !!config.hasResults
            });
        } catch (err: any) {
            setError(err.message || 'Errore nell\'aggiornamento del tipo punteggio.');
        } finally {
            setIsSavingTeamTournamentConfig(false);
        }
    };

    const getConfiguredPlayersCount = (team: TeamTournamentTeam) =>
        team.players.filter(player => player.name.trim() && player.surname.trim()).length;

    const getTeamCardClassName = (team: TeamTournamentTeam) => {
        const configuredPlayers = getConfiguredPlayersCount(team);
        const hasCustomName = team.name.trim() !== `Squadra ${team.teamNumber}`;
        const hasMinimumSetup = hasCustomName && configuredPlayers >= 2;
        const isComplete = hasCustomName && configuredPlayers >= team.targetPlayerCount;

        if (isComplete) {
            return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
        }

        if (hasMinimumSetup) {
            return 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800';
        }

        return 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800';
    };

    const getTeamNameByNumber = (teamNumber: number) => {
        const team = teamTournamentTeams.find(t => t.teamNumber === teamNumber);
        return team?.name || `Squadra ${teamNumber}`;
    };

    const totalTargetPlayers = teamTournamentTeams.reduce((sum, team) => sum + team.targetPlayerCount, 0);
    const totalConfiguredPlayers = teamTournamentTeams.reduce((sum, team) => sum + getConfiguredPlayersCount(team), 0);
    const seededTeams = teamTournamentTeams.filter(team => !!team.isSeeded);
    const maxSeededTeams = Math.floor((teamTournamentConfig?.initialTeamCount || teamTournamentTeams.length || 0) / 2);
    const allTeamsNamed = teamTournamentTeams.length > 0 && teamTournamentTeams.every(team => team.name.trim() && team.name.trim() !== `Squadra ${team.teamNumber}`);
    const minPlayersPerTeamForMatchday = (teamTournamentConfig?.matchesPerDay || 3) * 2;
    const hasEnoughPlayersPerTeam = teamTournamentTeams.length > 0 && teamTournamentTeams.every(team => getConfiguredPlayersCount(team) >= minPlayersPerTeamForMatchday);
    const hasRequiredChoices = !!teamTournamentConfig?.format
        && !!teamTournamentConfig?.matchesPerDay
        && !!teamTournamentConfig?.scoringType
        && (teamTournamentConfig?.format === 'ELIMINAZIONE DIRETTA' || !!teamTournamentConfig?.roundRobinFinalPhase);
    const canCompleteTeamTournamentConfiguration = allTeamsNamed && hasRequiredChoices && hasEnoughPlayersPerTeam;
    const eliminationBracketPhaseOrder: Array<TeamTournamentFixture['phase']> = ['round_of_32', 'round_of_16', 'quarterfinal', 'semifinal', 'final_1_2'];
    const bracketPhaseLabel = (phase: TeamTournamentFixture['phase'], slot: number) => {
        if (phase === 'round_of_32') return `${slot}° Trentaduesimo`;
        if (phase === 'round_of_16') return `${slot}° Ottavo`;
        if (phase === 'quarterfinal') return `${slot}° Quarto di Finale`;
        if (phase === 'semifinal') return `${slot}^ Semifinale`;
        if (phase === 'final_1_2') return 'Finale 1° e 2° Posto';
        if (phase === 'final_3_4') return 'Finale 3° e 4° Posto';
        return phase;
    };

    const handleCompleteTeamTournamentConfiguration = async () => {
        if (!teamTournamentToConfigure || !canCompleteTeamTournamentConfiguration) return;

        setIsCompletingTeamTournamentConfiguration(true);
        setError(null);
        try {
            await completeTeamTournamentConfiguration(teamTournamentToConfigure);
            const [config, teams, fixtures] = await Promise.all([
                getTeamTournamentConfig(teamTournamentToConfigure),
                getTeamTournamentTeams(teamTournamentToConfigure),
                getTeamTournamentFixtures(teamTournamentToConfigure),
            ]);
            setTeamTournamentConfig({
                initialTeamCount: config.initialTeamCount,
                defaultPlayersPerTeam: config.defaultPlayersPerTeam,
                format: config.format,
                matchesPerDay: config.matchesPerDay,
                roundRobinFinalPhase: config.roundRobinFinalPhase,
                scoringType: config.scoringType,
                schedule: config.schedule || null,
                hasResults: !!config.hasResults
            });
            setTeamTournamentTeams(teams);
            setTeamTournamentFixtures(fixtures);
            setTeamTournamentConfigView('summary');
        } catch (err: any) {
            setError(err.message || 'Errore nel completamento della configurazione.');
        } finally {
            setIsCompletingTeamTournamentConfiguration(false);
        }
    };

    if (showTournamentFlow && drawnPairs) {
        return <TournamentFlow
            pairs={drawnPairs}
            onFinish={() => {
                setShowTournamentFlow(false);
                setDrawnPairs(null);
                setActivePage('Tournaments');
            }}
            preselectedTournamentName={newGiornataForTournament}
            clearPreselectedTournament={() => setNewGiornataForTournament(null)}
            forceExistingTournament={entryChoice === 'existing' && !newGiornataForTournament}
            initialFormat={selectedFormatForNewFlow || undefined}
        />;
    }

    if (activeFlow === 'single-tournament-format-first' && !selectedFormatForNewFlow) {
        return (
            <TournamentFormatSelector
                onSelectFormat={(format) => {
                    setSelectedFormatForNewFlow(format);
                    setActiveFlow('pairs');
                }}
                onBack={() => {
                    setActiveFlow('pairs');
                    setEntryChoice('menu');
                }}
            />
        );
    }

    if (drawnPairs && !isShuffling) {
        const totalTournamentElo = drawnPairs.reduce((sum, p) => sum + p[0].currentElo + p[1].currentElo, 0);
        const avgTournamentElo = (totalTournamentElo / (drawnPairs.length * 2)).toFixed(0);

        return (
            <div className="mx-auto max-w-3xl space-y-6 py-2 pb-24 relative min-h-[calc(100vh-6rem)] flex flex-col justify-between">
                <div>
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 px-1">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="px-3 py-1 text-xs font-black uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-full border border-sky-500/20">
                                    {mode === 'Manual' ? 'Selezione Manuale' : 'Sorteggio completato'}
                                </span>
                                {selectedFormatForNewFlow && (
                                    <span className="px-3 py-1 text-xs font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-500/20">
                                        {selectedFormatForNewFlow}
                                    </span>
                                )}
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                                {mode === 'Manual' ? 'Coppie Confermate' : 'Risultati Sorteggio'}
                            </h2>
                            <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
                                {drawnPairs.length} coppie formate • ELO Medio Torneo: <span className="font-bold text-sky-600 dark:text-sky-400">{avgTournamentElo}</span>
                            </p>
                        </div>
                    </div>

                    {/* Pairs Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {drawnPairs.map((pair, index) => {
                            const pairAvgElo = ((pair[0].currentElo + pair[1].currentElo) / 2).toFixed(0);
                            return (
                                <div key={index} className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-3xl bg-white/70 dark:bg-slate-900/80 bg-gradient-to-br from-sky-500/5 via-transparent to-blue-600/5 border border-slate-200/70 dark:border-white/10 shadow-md hover:shadow-xl hover:border-sky-500/50 backdrop-blur-2xl transition-all duration-300">
                                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/60 dark:border-white/10">
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm">
                                            Coppia {index + 1}
                                        </span>
                                        <div className="flex items-center gap-1.5 bg-sky-500/10 px-2.5 py-1 rounded-full border border-sky-500/20">
                                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">ELO</span>
                                            <span className="text-xs font-black text-sky-600 dark:text-sky-400">{pairAvgElo}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-2.5 my-1">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <PlayerAvatar name={pair[0].name} surname={pair[0].surname} id={pair[0].id} elo={pair[0].currentElo} size="lg" />
                                                <span className="font-bold text-slate-900 dark:text-white text-lg leading-tight">
                                                    {pair[0].name} {pair[0].surname}
                                                </span>
                                            </div>
                                            <span className="text-sm font-bold text-slate-400 shrink-0">{pair[0].currentElo.toFixed(0)}</span>
                                        </div>

                                        <div className="flex items-center justify-center py-1">
                                            <div className="w-full border-t border-dashed border-slate-200 dark:border-slate-800 relative">
                                                <span className="absolute left-1/2 -top-2.5 -translate-x-1/2 bg-slate-100 dark:bg-slate-800 text-[11px] font-extrabold text-slate-400 px-2 rounded-full">
                                                    &
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <PlayerAvatar name={pair[1].name} surname={pair[1].surname} id={pair[1].id} elo={pair[1].currentElo} size="lg" />
                                                <span className="font-bold text-slate-900 dark:text-white text-lg leading-tight">
                                                    {pair[1].name} {pair[1].surname}
                                                </span>
                                            </div>
                                            <span className="text-sm font-bold text-slate-400 shrink-0">{pair[1].currentElo.toFixed(0)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Fixed Floating Bottom Action Bar */}
                <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-auto sm:w-[736px] bg-white/80 dark:bg-slate-900/90 backdrop-blur-xl p-3.5 rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-2xl z-40 flex items-center gap-3">
                    <Button 
                        variant="secondary" 
                        onClick={() => setDrawnPairs(null)}
                        className="flex-1 h-12 text-sm font-bold rounded-2xl"
                    >
                        {mode === 'Manual' ? 'Modifica Coppie' : 'Ripeti Sorteggio'}
                    </Button>
                    <Button 
                        onClick={() => setShowTournamentFlow(true)}
                        className="flex-1 h-12 text-sm font-bold bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-2xl shadow-lg shadow-sky-500/25"
                    >
                        {selectedFormatForNewFlow ? 'Avanti - Impostazioni Torneo' : 'Avanti - Scelta Torneo'}
                    </Button>
                </div>
            </div>
        );
    }

    if (!teamTournamentToConfigure && entryChoice === 'menu') {
        return (
            <div className="mx-auto max-w-3xl space-y-6 py-2">
                <div className="text-left mb-2 px-1">
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Cosa vuoi organizzare oggi?</h2>
                    <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Seleziona la tipologia di evento per avviare il sorteggio e la configurazione</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* Card 1: Multi Giornata */}
                    <div
                        onClick={openPairsFlow}
                        className="group relative flex flex-col justify-between p-5 rounded-3xl bg-white/70 dark:bg-slate-900/80 bg-gradient-to-br from-sky-500/10 via-transparent to-blue-600/5 border border-slate-200/70 dark:border-white/10 hover:border-sky-500/80 dark:hover:border-sky-400/80 shadow-md hover:shadow-xl hover:shadow-sky-500/10 backdrop-blur-2xl transition-all duration-300 cursor-pointer hover:-translate-y-1 active:scale-[0.98] min-h-[170px]"
                    >
                        <div className="flex justify-between items-start">
                            <div className="p-3 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/30">
                                <CalendarIcon className="w-6 h-6" />
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-400 group-hover:text-sky-500 group-hover:bg-sky-500/10 transition-colors">
                                <ArrowUpRightIcon className="w-4 h-4" />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-black text-lg text-slate-900 dark:text-white leading-tight group-hover:text-sky-500 dark:group-hover:text-sky-400 transition-colors">Multi Giornata</h3>
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">Tornei a coppie distribuiti su più giornate di gioco</p>
                        </div>
                    </div>

                    {/* Card 2: Torneo Squadre */}
                    <div
                        onClick={openTeamFlow}
                        className="group relative flex flex-col justify-between p-5 rounded-3xl bg-white/70 dark:bg-slate-900/80 bg-gradient-to-br from-indigo-500/10 via-transparent to-purple-600/5 border border-slate-200/70 dark:border-white/10 hover:border-indigo-500/80 dark:hover:border-indigo-400/80 shadow-md hover:shadow-xl hover:shadow-indigo-500/10 backdrop-blur-2xl transition-all duration-300 cursor-pointer hover:-translate-y-1 active:scale-[0.98] min-h-[170px]"
                    >
                        <div className="flex justify-between items-start">
                            <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30">
                                <UsersIcon className="w-6 h-6" />
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-400 group-hover:text-indigo-500 group-hover:bg-indigo-500/10 transition-colors">
                                <ArrowUpRightIcon className="w-4 h-4" />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-black text-lg text-slate-900 dark:text-white leading-tight group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">Torneo a Squadre</h3>
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">Campionati e tornei per club a squadre</p>
                        </div>
                    </div>

                    {/* Card 3: Torneo Singolo */}
                    <div
                        onClick={() => { setEntryChoice('pairs'); setSelectedFormatForNewFlow(null); setActiveFlow('single-tournament-format-first'); }}
                        className="group relative flex flex-col justify-between p-5 rounded-3xl bg-white/70 dark:bg-slate-900/80 bg-gradient-to-br from-amber-500/10 via-transparent to-orange-600/5 border border-slate-200/70 dark:border-white/10 hover:border-amber-500/80 dark:hover:border-amber-400/80 shadow-md hover:shadow-xl hover:shadow-amber-500/10 backdrop-blur-2xl transition-all duration-300 cursor-pointer hover:-translate-y-1 active:scale-[0.98] min-h-[170px]"
                    >
                        <div className="flex justify-between items-start">
                            <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/30">
                                <TrophyIcon className="w-6 h-6" />
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-400 group-hover:text-amber-500 group-hover:bg-amber-500/10 transition-colors">
                                <ArrowUpRightIcon className="w-4 h-4" />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-black text-lg text-slate-900 dark:text-white leading-tight group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">Torneo Singolo</h3>
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">Eventi ed esibizioni in un singolo appuntamento</p>
                        </div>
                    </div>

                    {/* Card 4: Nuova Giornata */}
                    <div
                        onClick={openExistingTournamentDayFlow}
                        className="group relative flex flex-col justify-between p-5 rounded-3xl bg-white/70 dark:bg-slate-900/80 bg-gradient-to-br from-emerald-500/10 via-transparent to-teal-600/5 border border-slate-200/70 dark:border-white/10 hover:border-emerald-500/80 dark:hover:border-emerald-400/80 shadow-md hover:shadow-xl hover:shadow-emerald-500/10 backdrop-blur-2xl transition-all duration-300 cursor-pointer hover:-translate-y-1 active:scale-[0.98] min-h-[170px]"
                    >
                        <div className="flex justify-between items-start">
                            <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30">
                                <PlusIcon className="w-6 h-6" />
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-400 group-hover:text-emerald-500 group-hover:bg-emerald-500/10 transition-colors">
                                <ArrowUpRightIcon className="w-4 h-4" />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-black text-lg text-slate-900 dark:text-white leading-tight group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors">Nuova Giornata</h3>
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">Aggiungi nuove giornate ai tornei attivi</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!teamTournamentToConfigure && entryChoice === 'existing' && !newGiornataForTournament) {
        return (
            <div className="mx-auto max-w-3xl">
                <Card title="Aggancia Giornata a Torneo Esistente">
                    <div className="space-y-5">
                        <p className="text-sm text-app-muted">
                            Scegli il torneo a cui vuoi agganciare la nuova giornata.
                        </p>
                        <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                                Torneo esistente
                            </label>
                            <select
                                value={selectedExistingTournamentName}
                                onChange={e => {
                                    setSelectedExistingTournamentName(e.target.value);
                                    if (error) {
                                        setError(null);
                                    }
                                }}
                                className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                            >
                                <option value="">Seleziona un torneo</option>
                                {existingTournamentSeriesNames.map(name => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                            {existingTournamentSeriesNames.length === 0 && (
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    Non ci sono tornei disponibili a cui agganciare una giornata.
                                </p>
                            )}
                        </div>
                        {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}
                        <div className="flex gap-3 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEntryChoice('menu')}
                                className="flex-1"
                            >
                                Torna alla scelta iniziale
                            </Button>
                            <Button
                                type="button"
                                onClick={confirmExistingTournamentSelection}
                                className="flex-1"
                                disabled={!selectedExistingTournamentName || existingTournamentSeriesNames.length === 0}
                            >
                                Continua
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>
        );
    }

    const teamTournamentForm = (
        <Card title="Torneo a Squadre">
            <form onSubmit={handleCreateTeamTournament} className="space-y-5">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Questo flusso crea subito un nuovo <strong>Torneo a Squadre</strong> nel database e lo rende disponibile nella pagina Tornei.
                </p>

                <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Nome Torneo</label>
                    <input
                        type="text"
                        value={teamTournamentName}
                        onChange={e => setTeamTournamentName(e.target.value)}
                        className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                        placeholder="Es. Campionato Primavera"
                        disabled={isCreatingTeamTournament}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Circolo</label>
                    <input
                        type="text"
                        value={teamTournamentClub}
                        onChange={e => setTeamTournamentClub(e.target.value)}
                        className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                        placeholder="Es. Padel Club Roma"
                        disabled={isCreatingTeamTournament}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Numero Squadre</label>
                        <input
                            type="number"
                            min={2}
                            value={teamTournamentCount}
                            onChange={e => setTeamTournamentCount(Number(e.target.value))}
                            className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                            disabled={isCreatingTeamTournament}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Giocatori per Squadra</label>
                        <input
                            type="number"
                            min={1}
                            value={teamTournamentPlayersPerTeam}
                            onChange={e => setTeamTournamentPlayersPerTeam(Number(e.target.value))}
                            className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                            disabled={isCreatingTeamTournament}
                        />
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            Questo valore e' solo di partenza e potra' essere modificato in seguito.
                        </p>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Tipo Torneo</label>
                    <select
                        value={teamTournamentFormat}
                        onChange={e => setTeamTournamentFormat(e.target.value as TeamTournamentFormat)}
                        className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                        disabled={isCreatingTeamTournament}
                    >
                        <option value="ROUND ROBIN">Round Robin</option>
                        <option value="ANDATA E RITORNO" disabled>Andata e ritorno</option>
                        <option value="ELIMINAZIONE DIRETTA">Eliminazione diretta</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Partite per giornata</label>
                    <select
                        value={teamTournamentMatchesPerDay}
                        onChange={e => setTeamTournamentMatchesPerDay(Number(e.target.value) as TeamTournamentMatchesPerDay)}
                        className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                        disabled={isCreatingTeamTournament}
                    >
                        <option value={3}>3</option>
                        <option value={5} disabled={teamTournamentPlayersPerTeam < 8}>5</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Fase Finale</label>
                    <select
                        value={teamTournamentFormat === 'ELIMINAZIONE DIRETTA' ? '' : teamTournamentRoundRobinFinalPhase}
                        onChange={e => setTeamTournamentRoundRobinFinalPhase(e.target.value as RoundRobinFinalPhase)}
                        className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                        disabled={isCreatingTeamTournament || teamTournamentFormat === 'ELIMINAZIONE DIRETTA'}
                    >
                        <option value="">Non applicabile</option>
                        <option value="FINALI">Finali</option>
                        <option value="SEMIFINALI E FINALI">Semifinali e finali</option>
                        <option value="QUARTI, SEMIFINALI E FINALI" disabled={teamTournamentCount < 8}>Quarti, semifinali e finali</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Tipo Punteggio</label>
                    <select
                        value={teamTournamentScoringType}
                        onChange={e => setTeamTournamentScoringType(e.target.value as TeamTournamentScoringType)}
                        className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                        disabled={isCreatingTeamTournament}
                    >
                        <option value="Punti">Punti</option>
                        <option value="Differenza Games">Differenza Games</option>
                        <option value="Punti + Resilienza">Punti + Resilienza</option>
                    </select>
                </div>

                {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}

                <div className="flex gap-3 pt-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            if (isLauncherContext) {
                                setEntryChoice('menu');
                                setActiveFlow('pairs');
                                return;
                            }
                            setEntryChoice('pairs');
                            setActiveFlow('pairs');
                        }}
                        className="flex-1"
                        disabled={isCreatingTeamTournament}
                    >
                        {isLauncherContext ? 'Torna alla scelta iniziale' : 'Torna al sorteggio'}
                    </Button>
                    <Button
                        type="submit"
                        className="flex-1"
                        disabled={isCreatingTeamTournament}
                    >
                        {isCreatingTeamTournament ? 'Creazione...' : 'Crea Torneo a Squadre'}
                    </Button>
                </div>
            </form>
        </Card>
    );

    if (!teamTournamentToConfigure && entryChoice === 'team') {
        return (
            <div className="mx-auto max-w-3xl">
                {teamTournamentForm}
            </div>
        );
    }

    if (teamTournamentToConfigure && teamTournamentTeamToEdit) {
        return (
            <div className="max-w-4xl mx-auto">
                <Card title={`Modifica ${teamTournamentTeamToEdit.name}`}>
                    <form onSubmit={handleUpdateTeamTournamentTeam} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Nome Squadra</label>
                            <input
                                type="text"
                                value={editTeamName}
                                onChange={e => setEditTeamName(e.target.value)}
                                className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                disabled={isSavingTeamTournamentTeam}
                            />
                        </div>

                        {teamTournamentConfig?.format === 'ELIMINAZIONE DIRETTA' && (
                            <div className="rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="font-semibold text-gray-900 dark:text-white">Testa di Serie</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            Le teste di serie vengono distribuite nei diversi lati del tabellone. Massimo consentito: {maxSeededTeams}.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={editTeamIsSeeded}
                                        onClick={() => setEditTeamIsSeeded(current => !current)}
                                        disabled={isSavingTeamTournamentTeam}
                                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                                            editTeamIsSeeded ? 'bg-sky-500' : 'bg-gray-300 dark:bg-gray-700'
                                        } ${isSavingTeamTournamentTeam ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    >
                                        <span
                                            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                                                editTeamIsSeeded ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                        />
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 space-y-4">
                            <p className="font-semibold text-gray-900 dark:text-white">Giocatori</p>
                            {editTeamPlayers.map((player, index) => {
                                const isPlayed = checkPlayerPlayed(index);
                                let surnameError = '';
                                let isSurnameValid = false;
                                if (isPlayed && teamTournamentTeamToEdit) {
                                    const orig = teamTournamentTeamToEdit.players[index]?.surname?.trim().toLowerCase() || '';
                                    const curr = player.surname.trim().toLowerCase();
                                    const dist = levenshtein(orig, curr);
                                    const limit = Math.max(2, Math.floor(orig.length * 0.20));
                                    if (dist > limit) {
                                        surnameError = `Modifica troppo ampia (max ${limit} caratteri)`;
                                    } else if (dist > 0) {
                                        isSurnameValid = true; // Modificato ma valido
                                    }
                                }

                                return (
                                <div key={index} className="space-y-2">
                                    <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                                        {index + 1}.
                                        {index === 0 ? ' (Capitano)' : ''}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Nome</label>
                                            <input
                                                type="text"
                                                value={player.name}
                                                onChange={e => handleTeamPlayerChange(index, 'name', e.target.value)}
                                                className="mt-1 block w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-800"
                                                disabled={isSavingTeamTournamentTeam || !!player.id}
                                            />
                                        </div>
                                        <div>
                                            <div className="flex items-center justify-between">
                                                <label className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400">
                                                    Cognome
                                                    {isPlayed && (
                                                        <span className="ml-1 inline-flex items-center text-amber-600 dark:text-amber-500" title="Il cognome è protetto perché il giocatore ha già disputato partite nel torneo. Sono permesse solo piccole correzioni (max 20%).">
                                                            <svg className="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                                                            protetto
                                                        </span>
                                                    )}
                                                </label>
                                            </div>
                                            <div className="relative mt-1">
                                                <input
                                                    type="text"
                                                    value={player.surname}
                                                    onChange={e => handleTeamPlayerChange(index, 'surname', e.target.value)}
                                                    className={`block w-full bg-white dark:bg-gray-700 border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-800 ${
                                                        surnameError ? 'border-red-500 focus:ring-red-500 focus:border-red-500 text-red-600' : 'border-gray-300 dark:border-gray-600'
                                                    }`}
                                                    disabled={isSavingTeamTournamentTeam || !!player.id}
                                                />
                                                {isSurnameValid && !surnameError && (
                                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                                        <span className="text-sky-500 flex items-center bg-sky-50 dark:bg-sky-900/30 px-1.5 py-0.5 rounded text-xs font-medium border border-sky-200 dark:border-sky-700">
                                                            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                                            Valido
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            {surnameError && (
                                                <p className="mt-1 text-xs text-red-600 dark:text-red-400 font-medium">{surnameError}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                        <EloPlaytomicInput 
                                            elo={player.currentElo || 1500} 
                                            onEloChange={(newElo) => handleTeamPlayerChange(index, 'currentElo', newElo)} 
                                            disabled={isSavingTeamTournamentTeam || !!player.id}
                                        />
                                    </div>
                                </div>
                                );
                            })}
                            
                            <div className="pt-2 flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => setEditTeamPlayers(prev => [...prev, { name: '', surname: '' }])}
                                    className="flex items-center space-x-2 text-sm font-medium text-ios-blue hover:text-ios-blue/80 active:opacity-70 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[20px]">add_circle</span>
                                    <span>Aggiungi Giocatore (9+)</span>
                                </button>
                            </div>
                        </div>

                        {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}

                        <div className="flex gap-3 pt-2">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setTeamTournamentTeamToEdit(null)}
                                disabled={isSavingTeamTournamentTeam}
                            >
                                Torna alle Squadre
                            </Button>
                            <Button type="submit" disabled={isSavingTeamTournamentTeam}>
                                {isSavingTeamTournamentTeam ? 'Salvataggio...' : 'Conferma'}
                            </Button>
                        </div>
                    </form>
                </Card>
            </div>
        );
    }

    if (teamTournamentToConfigure) {
        if (teamTournamentConfigView === 'summary') {
            const schedule = teamTournamentConfig?.schedule;
            const roundRobinSchedule = schedule && schedule.kind === 'round_robin' ? schedule : null;
            const totalDays = roundRobinSchedule?.days.length || 0;

            return (
                <div className="max-w-4xl mx-auto">
                    <Card title="Riepilogo Torneo a Squadre">
                        <div className="space-y-4">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                    {teamTournamentToConfigureData?.name || 'Torneo a Squadre'}
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    {teamTournamentToConfigureData?.club || ''}
                                </p>
                            </div>

                            {teamTournamentConfig?.format === 'ROUND ROBIN' && roundRobinSchedule ? (
                                <div className="space-y-4">
                                    {roundRobinSchedule.days.map(day => (
                                        <div key={day.dayNumber} className="rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-4">
                                            <p className="font-semibold text-gray-900 dark:text-white">
                                                Giornata {day.dayNumber} di {totalDays}
                                            </p>
                                            {day.byeTeamNumber ? (
                                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                    Riposa: {getTeamNameByNumber(day.byeTeamNumber)}
                                                </p>
                                            ) : null}
                                            <div className="mt-3 space-y-3">
                                                {day.matches.map(match => (
                                                    <div key={match.matchNumber} className="rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-4 py-3">
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                                                            Partita {match.matchNumber} di {day.matches.length}
                                                        </p>
                                                        <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white text-center">
                                                            {getTeamNameByNumber(match.team1Number)} <span className="font-normal">vs</span> {getTeamNameByNumber(match.team2Number)}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : teamTournamentConfig?.format === 'ELIMINAZIONE DIRETTA' && teamTournamentFixtures.length > 0 ? (
                                <div className="space-y-4">
                                    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                            Tabellone a eliminazione diretta
                                        </p>
                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                            Le teste di serie vengono distribuite nei lati opposti del tabellone. I bye passano automaticamente al turno successivo.
                                        </p>
                                    </div>
                                    {eliminationBracketPhaseOrder
                                        .filter(phase => teamTournamentFixtures.some(fixture => fixture.phase === phase))
                                        .map(phase => (
                                            <div key={phase} className="rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-4">
                                                <p className="font-semibold text-gray-900 dark:text-white">
                                                    {bracketPhaseLabel(phase, 1).replace(/^1[°^]\s*/, '')}
                                                </p>
                                                <div className="mt-3 space-y-3">
                                                    {teamTournamentFixtures
                                                        .filter(fixture => fixture.phase === phase)
                                                        .sort((a, b) => a.slot - b.slot)
                                                        .map(fixture => (
                                                            <div key={fixture.id} className={`rounded-lg border px-4 py-3 ${fixture.phase === 'final_1_2' ? 'border-amber-300 bg-amber-50 dark:border-amber-400/40 dark:bg-amber-900/20' : 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900'}`}>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                                                                    {bracketPhaseLabel(fixture.phase, fixture.slot)}
                                                                </p>
                                                                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white text-center">
                                                                    {fixture.team1Number ? getTeamNameByNumber(fixture.team1Number) : 'BYE'} <span className="font-normal">vs</span> {fixture.team2Number ? getTeamNameByNumber(fixture.team2Number) : 'BYE'}
                                                                </p>
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            ) : (
                                <div className="rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4">
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Riepilogo non disponibile per questo formato (per ora).
                                    </p>
                                </div>
                            )}

                            {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}

                            <div className="flex gap-3 pt-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => setTeamTournamentConfigView('config')}
                                >
                                    Torna alla Configurazione
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => {
                                        clearTeamTournamentToConfigure();
                                        setActivePage('Tournaments');
                                    }}
                                >
                                    Torna a Tornei
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            );
        }

        return (
            <>
                <div className="max-w-4xl mx-auto">
                    <Card title="Completa Configurazione - Torneo a Squadre">
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                        {teamTournamentToConfigureData?.name || 'Torneo a Squadre'}
                                    </h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        {teamTournamentToConfigureData?.club || 'Caricamento dati torneo...'}
                                    </p>
                                </div>

                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={openEditTeamTournamentModal}
                                    disabled={isLoadingTeamTournamentConfig || !teamTournamentConfig}
                                >
                                    <PencilIcon className="h-4 w-4 mr-2" />
                                    Modifica
                                </Button>
                            </div>

                            <div className="rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4">
                                {isLoadingTeamTournamentConfig ? (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Caricamento configurazione...</p>
                                ) : teamTournamentConfig ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Numero Squadre</p>
                                            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{teamTournamentConfig.initialTeamCount}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Giocatori per Squadra</p>
                                            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{teamTournamentConfig.defaultPlayersPerTeam}</p>
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Tipo Torneo</label>
                                            <select
                                                value={teamTournamentConfig.format}
                                                onChange={e => handleTeamTournamentFormatChange(e.target.value as TeamTournamentFormat)}
                                                className="mt-1 block w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                                disabled={isSavingTeamTournamentConfig || !!teamTournamentConfig.hasResults}
                                            >
                        <option value="ROUND ROBIN">Round Robin</option>
                        <option value="ANDATA E RITORNO" disabled>Andata e ritorno</option>
                        <option value="ELIMINAZIONE DIRETTA">Eliminazione diretta</option>
                                            </select>
                                            {!!teamTournamentConfig.hasResults && (
                                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                                    Tipo torneo bloccato: sono gia' stati inseriti dei risultati.
                                                </p>
                                            )}
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Partite per giornata</label>
                                            <select
                                                value={teamTournamentConfig.matchesPerDay}
                                                onChange={async e => {
                                                    if (!teamTournamentToConfigure || !teamTournamentConfig) return;
                                                    const matchesPerDay = Number(e.target.value) as TeamTournamentMatchesPerDay;
                                                    setIsSavingTeamTournamentConfig(true);
                                                    setError(null);
                                                    try {
                                                        const config = await updateTeamTournamentConfig(teamTournamentToConfigure, {
                                                            initialTeamCount: teamTournamentConfig.initialTeamCount,
                                                            defaultPlayersPerTeam: teamTournamentConfig.defaultPlayersPerTeam,
                                                            format: teamTournamentConfig.format,
                                                            matchesPerDay,
                                                            roundRobinFinalPhase: teamTournamentConfig.roundRobinFinalPhase || 'FINALI',
                                                            scoringType: teamTournamentConfig.scoringType
                                                        });
            setTeamTournamentConfig({
                initialTeamCount: config.initialTeamCount,
                defaultPlayersPerTeam: config.defaultPlayersPerTeam,
                format: config.format,
                matchesPerDay: config.matchesPerDay,
                roundRobinFinalPhase: config.roundRobinFinalPhase,
                scoringType: config.scoringType,
                schedule: config.schedule || null,
                hasResults: !!config.hasResults
            });
                                                    } catch (err: any) {
                                                        setError(err.message || 'Errore nell\'aggiornamento delle partite per giornata.');
                                                    } finally {
                                                        setIsSavingTeamTournamentConfig(false);
                                                    }
                                                }}
                                                className="mt-1 block w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                            >
                                                <option value={3}>3</option>
                                                <option value={5} disabled={teamTournamentConfig.defaultPlayersPerTeam < 8}>5</option>
                                            </select>
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Fase Finale</label>
                                            <select
                                                value={teamTournamentConfig.format === 'ELIMINAZIONE DIRETTA' ? '' : (teamTournamentConfig.roundRobinFinalPhase || 'FINALI')}
                                                onChange={e => handleTeamTournamentRoundRobinFinalPhaseChange(e.target.value as RoundRobinFinalPhase)}
                                                className="mt-1 block w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                                disabled={teamTournamentConfig.format === 'ELIMINAZIONE DIRETTA'}
                                            >
                                                <option value="">Non applicabile</option>
                                                <option value="FINALI">Finali</option>
                                                <option value="SEMIFINALI E FINALI">Semifinali e finali</option>
                                                <option value="QUARTI, SEMIFINALI E FINALI" disabled={teamTournamentTeams.length > 0 ? teamTournamentTeams.length < 8 : teamTournamentConfig.initialTeamCount < 8}>Quarti, semifinali e finali</option>
                                            </select>
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Tipo Punteggio</label>
                                            <select
                                                value={teamTournamentConfig.scoringType}
                                                onChange={e => handleTeamTournamentScoringTypeChange(e.target.value as TeamTournamentScoringType)}
                                                className="mt-1 block w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                            >
                                                <option value="Punti">Punti</option>
                                                <option value="Differenza Games">Differenza Games</option>
                                                <option value="Punti + Resilienza">Punti + Resilienza</option>
                                            </select>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Configurazione non disponibile.</p>
                                )}
                            </div>

                            <div className="rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="font-semibold text-gray-900 dark:text-white">Squadre</p>
                                        {teamTournamentConfig?.format === 'ELIMINAZIONE DIRETTA' && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                Teste di serie selezionate: {seededTeams.length} / {maxSeededTeams}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {isLoadingTeamTournamentTeams ? (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Caricamento squadre...</p>
                                ) : (
                                    teamTournamentTeams.map(team => (
                                        <div key={team.id} className={`flex items-center justify-between gap-4 rounded-lg px-4 py-3 border ${getTeamCardClassName(team)}`}>
                                            <div>
                                                <div className="flex items-center flex-wrap gap-2">
                                                    <p className="font-semibold text-gray-900 dark:text-white">{team.name}</p>
                                                    {teamTournamentConfig?.format === 'ELIMINAZIONE DIRETTA' && team.isSeeded && (
                                                        <span className="inline-flex items-center rounded-full border border-sky-300/80 bg-sky-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-sky-800 dark:border-sky-400/40 dark:bg-sky-900/35 dark:text-sky-200">
                                                            Testa di Serie
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    {getConfiguredPlayersCount(team)} / {team.targetPlayerCount} giocatori inseriti
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                onClick={() => openTeamTournamentTeamEditor(team)}
                                            >
                                                <PencilIcon className="h-4 w-4 mr-2" />
                                                Modifica
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </div>

                            {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}

                            <div className="flex gap-3 pt-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => {
                                        clearTeamTournamentToConfigure();
                                        setActivePage('Tournaments');
                                    }}
                                >
                                    Torna a Tornei
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => setTeamTournamentConfigView('summary')}
                                    disabled={teamTournamentConfig?.format === 'ROUND ROBIN' ? !teamTournamentConfig?.schedule : teamTournamentFixtures.length === 0}
                                >
                                    Riepilogo
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleCompleteTeamTournamentConfiguration}
                                    disabled={!canCompleteTeamTournamentConfiguration || isCompletingTeamTournamentConfiguration}
                                    className="ml-auto !border-orange-600 !bg-orange-500 hover:!bg-orange-600 !text-white dark:!border-orange-300 disabled:!border-gray-300 disabled:!bg-gray-300 disabled:!text-gray-500 dark:disabled:!border-gray-700 dark:disabled:!bg-gray-700 dark:disabled:!text-gray-400"
                                >
                                    {isCompletingTeamTournamentConfiguration ? 'Salvataggio...' : 'Completa Configurazione'}
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>

                <HIGSheet
                    isOpen={isEditTeamTournamentModalOpen}
                    onClose={() => setIsEditTeamTournamentModalOpen(false)}
                    title="Modifica Dati Base"
                >
                    <form onSubmit={handleUpdateTeamTournamentConfig} className="space-y-4 px-4 pb-6 pt-2">
                        <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Nome Torneo</label>
                            <input
                                type="text"
                                value={editTeamTournamentName}
                                onChange={e => setEditTeamTournamentName(e.target.value)}
                                className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                disabled={isSavingTeamTournamentConfig}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Circolo</label>
                            <input
                                type="text"
                                value={editTeamTournamentClub}
                                onChange={e => setEditTeamTournamentClub(e.target.value)}
                                className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                disabled={isSavingTeamTournamentConfig}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Numero Squadre</label>
                                <input
                                    type="number"
                                    min={2}
                                    value={editTeamTournamentCount}
                                    onChange={e => setEditTeamTournamentCount(Number(e.target.value))}
                                    className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                    disabled={isSavingTeamTournamentConfig}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Giocatori per Squadra</label>
                                <input
                                    type="number"
                                    min={1}
                                    value={editTeamTournamentPlayersPerTeam}
                                    onChange={e => setEditTeamTournamentPlayersPerTeam(Number(e.target.value))}
                                    className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                    disabled={isSavingTeamTournamentConfig || !!teamTournamentConfig?.hasResults}
                                />
                                {!!teamTournamentConfig?.hasResults && (
                                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                        Giocatori per squadra bloccato: sono gia' stati inseriti dei risultati.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Tipo Torneo</label>
                            <select
                                value={editTeamTournamentFormat}
                                onChange={e => setEditTeamTournamentFormat(e.target.value as TeamTournamentFormat)}
                                className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                disabled={isSavingTeamTournamentConfig || !!teamTournamentConfig?.hasResults}
                            >
                                <option value="ROUND ROBIN">Round Robin</option>
                                <option value="ANDATA E RITORNO" disabled>Andata e ritorno</option>
                                <option value="ELIMINAZIONE DIRETTA">Eliminazione diretta</option>
                            </select>
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                Questo aggiorna il database e la configurazione iniziale per gli inserimenti successivi.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Partite per giornata</label>
                            <select
                                value={editTeamTournamentMatchesPerDay}
                                onChange={e => setEditTeamTournamentMatchesPerDay(Number(e.target.value) as TeamTournamentMatchesPerDay)}
                                className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                disabled={isSavingTeamTournamentConfig}
                            >
                                <option value={3}>3</option>
                                <option value={5} disabled={editTeamTournamentPlayersPerTeam < 8}>5</option>
                            </select>
                        </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Fase Finale</label>
                                <select
                                    value={editTeamTournamentFormat === 'ELIMINAZIONE DIRETTA' ? '' : editTeamTournamentRoundRobinFinalPhase}
                                    onChange={e => setEditTeamTournamentRoundRobinFinalPhase(e.target.value as RoundRobinFinalPhase)}
                                    className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                    disabled={isSavingTeamTournamentConfig || editTeamTournamentFormat === 'ELIMINAZIONE DIRETTA'}
                                >
                                    <option value="">Non applicabile</option>
                                    <option value="FINALI">Finali</option>
                                    <option value="SEMIFINALI E FINALI">Semifinali e finali</option>
                                    <option value="QUARTI, SEMIFINALI E FINALI" disabled={editTeamTournamentCount < 8}>Quarti, semifinali e finali</option>
                                </select>
                            </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Tipo Punteggio</label>
                            <select
                                value={editTeamTournamentScoringType}
                                onChange={e => setEditTeamTournamentScoringType(e.target.value as TeamTournamentScoringType)}
                                className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                disabled={isSavingTeamTournamentConfig}
                            >
                                <option value="Punti">Punti</option>
                                                <option value="Differenza Games">Differenza Games</option>
                                                <option value="Punti + Resilienza">Punti + Resilienza</option>
                            </select>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setIsEditTeamTournamentModalOpen(false)}
                                disabled={isSavingTeamTournamentConfig}
                            >
                                Annulla
                            </Button>
                            <Button type="submit" disabled={isSavingTeamTournamentConfig}>
                                {isSavingTeamTournamentConfig ? 'Salvataggio...' : 'Salva'}
                            </Button>
                        </div>
                    </form>
                </HIGSheet>
            </>
        );
    }

    return (
        <div className="space-y-6 pb-8">
            {isShuffling && <ShuffleAnimation />}
            {isCompletingTeamTournamentConfiguration && teamTournamentConfig?.format === 'ELIMINAZIONE DIRETTA' && (
                <ShuffleAnimation title="Creo il tabellone..." />
            )}
            
            <div className="flex items-center">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setEntryChoice('menu');
                        setSelectedFormatForNewFlow(null);
                        setActiveFlow('pairs');
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium"
                >
                    <ArrowLeftIcon className="w-4 h-4" />
                    Torna indietro
                </Button>
            </div>

            <div className={mode === 'Manual'
                ? 'grid grid-cols-1 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] gap-6 items-start'
                : 'mx-auto w-full max-w-3xl'}>
                <div className="space-y-6">
                    <Card title="Opzioni Sorteggio Coppie">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Numero Coppie da Sorteggiare</label>
                                 <div className="mt-1 flex items-center flex-wrap gap-2">
                                    {(() => {
                                        let allowedPairs = Array.from({ length: 7 }, (_, i) => i + 2);
                                        if (selectedFormatForNewFlow === 'torneotto-30') allowedPairs = [4];
                                        else if (selectedFormatForNewFlow === 'beat-the-box') allowedPairs = [4, 6, 8];
                                        else if (selectedFormatForNewFlow === 'americano') allowedPairs = [4, 5, 6, 7, 8];
                                        else if (selectedFormatForNewFlow === 'round-robin-finali') allowedPairs = [4, 5, 6, 7, 8];
                                        else if (selectedFormatForNewFlow === 'gironi-fase-finale') allowedPairs = [6, 7, 8];
                                        else if (selectedFormatForNewFlow === 'eliminazione-diretta') allowedPairs = [4, 6, 8];
                                        return allowedPairs.map(num => (
                                            <Button
                                                key={num}
                                                type="button"
                                                variant={numPairs === num && !isCustomNumPairs ? 'primary' : 'secondary'}
                                                size="sm"
                                                onClick={() => {
                                                    if (isTeamTournamentFlow) {
                                                        handleFlowChange('pairs');
                                                    }
                                                    setIsCustomNumPairs(false);
                                                    setNumPairs(num);
                                                }}
                                                className="!px-4"
                                            >
                                                {num}
                                            </Button>
                                        ));
                                    })()}
                                    
                                    {(!selectedFormatForNewFlow || !['torneotto-30'].includes(selectedFormatForNewFlow)) && (
                                        <Button
                                            type="button"
                                            variant={isCustomNumPairs ? 'primary' : 'secondary'}
                                            size="sm"
                                            onClick={() => {
                                                if (isTeamTournamentFlow) {
                                                    handleFlowChange('pairs');
                                                }
                                                setIsCustomNumPairs(true);
                                                let minCustom = 9;
                                                if (selectedFormatForNewFlow === 'beat-the-box' && numPairs % 2 !== 0) {
                                                    minCustom = 10;
                                                }
                                                setNumPairs(Math.max(minCustom, numPairs)); // Assicura che parta dal minimo corretto
                                            }}
                                            className="!px-4 font-bold"
                                        >
                                            9+
                                        </Button>
                                    )}

                                    {isCustomNumPairs && (
                                        <div className="flex items-center gap-2 ml-2">
                                            <input
                                                type="number"
                                                min={9}
                                                max={64}
                                                step={selectedFormatForNewFlow === 'beat-the-box' ? 2 : 1}
                                                value={numPairs}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value, 10);
                                                    if (!isNaN(val) && val >= 9) {
                                                        setNumPairs(val);
                                                    }
                                                }}
                                                className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            />
                                            <span className="text-sm text-gray-500 dark:text-gray-400">coppie</span>
                                        </div>
                                    )}

                                    {!isNewGiornataFlow && !isLauncherContext && entryChoice !== 'existing' && (
                                        <Button
                                            type="button"
                                            variant={entryChoice === 'team' ? 'primary' : 'secondary'}
                                            size="sm"
                                            onClick={openTeamFlow}
                                            className="!px-4"
                                        >
                                            A SQUADRE
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Modalità di Sorteggio</label>
                                <select value={mode} onChange={e => setMode(e.target.value as DrawMode)} disabled={isTeamTournamentFlow} className="mt-1 block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                    <option value="Normal">Casuale</option>
                                    <option value="Balanced">Bilanciato</option>
                                    <option value="Seeded">Teste di Serie</option>
                                    <option value="Manual">Manuale</option>
                                </select>
                            </div>
                        </div>
                    </Card>

                    {!isTeamTournamentFlow && mode === 'Seeded' && (
                        <Card title="Seleziona Teste di Serie">
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {participantPlayers.sort((a,b) => b.currentElo - a.currentElo).map(p => (
                                    <label key={p.id} className="flex items-center space-x-3 cursor-pointer p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                                        <input type="checkbox" checked={seeds.includes(p.id)} onChange={() => handleSeedToggle(p.id)} className="form-checkbox h-4 w-4 rounded text-sky-500 bg-gray-200 dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-sky-500" />
                                        <span>{p.name} {p.surname} ({p.currentElo.toFixed(2)})</span>
                                    </label>
                                ))}
                            </div>
                        </Card>
                    )}

                    {!isTeamTournamentFlow && mode !== 'Manual' && (
                        <Card title={participantsTitle}>
                            <div className="space-y-2">
                                 <input
                                    type="text"
                                    placeholder="Cerca giocatori..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                />
                                 {loading ? (
                                    <ParticipantListSkeleton />
                                 ) : (
                                    <div className="grid grid-cols-1 gap-y-2 max-h-[22rem] sm:max-h-[28rem] xl:max-h-[32rem] overflow-y-auto pr-2">
                                        {filteredSortedPlayers.map(p => (
                                            <label key={p.id} className={`flex items-center space-x-3 p-2 rounded-md ${!participants.includes(p.id) && !canSelectMore ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                                                <input type="checkbox" checked={participants.includes(p.id)} onChange={() => handleParticipantToggle(p.id)} disabled={!participants.includes(p.id) && !canSelectMore} className="form-checkbox h-4 w-4 rounded text-sky-500 bg-gray-200 dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-sky-500" />
                                                <span>{p.name} {p.surname} ({p.currentElo.toFixed(2)})</span>
                                            </label>
                                        ))}
                                    </div>
                                 )}
                            </div>
                        </Card>
                    )}
                    
                    {!isTeamTournamentFlow && !isNavigationOverlayOpen && (
                        <div className="fixed left-4 right-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-20 rounded-2xl bg-white/90 p-2 shadow-lg backdrop-blur-xl dark:bg-slate-900/90 xl:static xl:px-4 xl:py-0 xl:bg-transparent xl:shadow-none xl:backdrop-blur-none">
                            <Button
                                onClick={handleDraw}
                                className="w-full"
                                disabled={isShuffling || (mode !== 'Manual' && !isFull)}
                            >
                                <ShuffleIcon /> <span className="ml-2">{isShuffling ? 'Sorteggiando...' : (mode === 'Manual' ? 'Conferma Coppie' : 'Sorteggia Coppie')}</span>
                            </Button>
                            {error && <p className="text-red-500 dark:text-red-400 text-sm mt-2">{error}</p>}
                        </div>
                    )}
                </div>

                {mode === 'Manual' && (
                <div>
                        <Card title="Selezione Manuale Coppie">
                        <div className="space-y-4 max-h-[calc(100vh-20rem)] overflow-y-auto">
                            {manualPairs.map((pair, pairIndex) => {
                                const selectedInManual = manualPairs.flat();
                                return (
                                    <div key={pairIndex} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                        <p className="font-semibold mb-2 text-gray-800 dark:text-gray-200">Coppia {pairIndex + 1}</p>
                                        <div className="grid grid-cols-1 gap-2">
                                            <select
                                                value={pair[0]}
                                                onChange={(e) => handleManualPairChange(pairIndex, 0, e.target.value)}
                                                className="block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                            >
                                                <option value="">Seleziona Giocatore 1</option>
                                                {sortedPlayers.map(p => (
                                                    <option 
                                                        key={p.id} 
                                                        value={p.id} 
                                                        disabled={selectedInManual.includes(p.id) && p.id !== pair[0]}
                                                    >
                                                        {p.name} {p.surname}
                                                    </option>
                                                ))}
                                            </select>
                                            <select
                                                value={pair[1]}
                                                onChange={(e) => handleManualPairChange(pairIndex, 1, e.target.value)}
                                                className="block w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm"
                                            >
                                                <option value="">Seleziona Giocatore 2</option>
                                                {sortedPlayers.map(p => (
                                                    <option 
                                                        key={p.id} 
                                                        value={p.id} 
                                                        disabled={selectedInManual.includes(p.id) && p.id !== pair[1]}
                                                    >
                                                        {p.name} {p.surname}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        </Card>
                </div>
                )}
            </div>
            <PlayerSimilarityModal
                isOpen={isSimilarityModalOpen}
                onClose={() => setIsSimilarityModalOpen(false)}
                candidates={currentSimilarityCandidates}
                inputName={similarityCheckQueue[0]?.name || ''}
                inputSurname={similarityCheckQueue[0]?.surname || ''}
                onCreateNew={() => {
                    setIsSimilarityModalOpen(false);
                    // Procedi al prossimo senza collegare ID
                    processNextSimilarityCheck(similarityCheckQueue.slice(1), similarityCheckCurrentPlayers);
                }}
                onSelect={(selectedPlayer) => {
                    setIsSimilarityModalOpen(false);
                    const currentCheck = similarityCheckQueue[0];
                    const updatedPlayers = [...similarityCheckCurrentPlayers];
                    updatedPlayers[currentCheck.index] = {
                        id: selectedPlayer.id,
                        name: selectedPlayer.name,
                        surname: selectedPlayer.surname,
                        currentElo: selectedPlayer.currentElo,
                    };
                    // Update UI state so it reflects immediately
                    setEditTeamPlayers(updatedPlayers);
                    // Procedi al prossimo passing the updated players array
                    processNextSimilarityCheck(similarityCheckQueue.slice(1), updatedPlayers);
                }}
            />

        </div>
    );
};

export default DrawPage;
