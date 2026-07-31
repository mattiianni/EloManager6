export enum FieldPosition {
    Sinistra = 'Sinistra',
    Destra = 'Destra',
    Indifferente = 'Indifferente',
}

export enum TournamentType {
    TorneOtto = "TorneOtto 30'",
    Americano = "Americano",
    RoundRobinFinali = "Round Robin + Finali",
    TorneoLibero = "Torneo Libero",
    GironiFaseFinale = "Gironi + Fase Finale",
    BeatTheBox = "Beat the Box",
    TorneoASquadre = "Torneo a Squadre",
    EliminazioneDiretta = "Eliminazione Diretta",
}

export interface Player {
    id: string;
    name: string;
    surname: string;
    position: FieldPosition;
    initialElo: number;
    currentElo: number;
}

export interface Match {
    id: string;
    date: string;
    team1: [string, string];
    team2: [string, string];
    sets: SetScore[];
    winner: 'team1' | 'team2' | 'draw' | null;
    tournamentId?: string;
    roundNumber?: number;
    createdAt?: string;
    phase?: MatchPhase;
}

export type MatchPhase =
    | 'ordinary'
    | 'group'
    | 'round_robin'
    | 'direct_elimination_round'
    | 'round_of_32'
    | 'round_of_16'
    | 'quarterfinal'
    | 'semifinal'
    | 'final_1_2'
    | 'final_3_4'
    | 'finalina'
    | 'consolation'
    | 'consolation_final';

export interface SetScore {
    team1: number;
    team2: number;
}

export interface Tournament {
    id: string;
    name: string;
    type: TournamentType;
    date: string;
    club: string;
    matchIds: string[];
    status: 'scheduled' | 'completed';
    americanoFields?: number; // Numero di campi per tornei Americano
    americanoScoringType?: 'games-diff' | 'points'; // Tipo di scoring per Americano
    roundRobinFields?: number; // Numero di campi per Round Robin
    roundRobinHomeAway?: boolean; // Andata e Ritorno
    roundRobinPlayoffType?: 'no_finals' | 'finals_only' | 'semifinals'; // Tipo di fase finale per Round Robin
    giornataName?: string; // Nome della giornata per Torneo Libero
    finalStandings?: any; // Classifiche finali salvate (per Beat the Box e altri tornei)
    numGironi?: number; // Numero di gironi per Gironi + Fase Finale
    teamTournamentConfigCompleted?: boolean;
    teamTournamentRootId?: string | null; // For Torneo a Squadre: root tournament id for the series (child giornate inherit this)
    teamTournamentRoundNumber?: number | null; // For Torneo a Squadre giornate: round/day number within schedule
    teamTournamentTotalDays?: number | null; // For Torneo a Squadre: total schedule days (Round Robin)
    teamTournamentTeam1Number?: number | null; // For Torneo a Squadre giornate: team1 number for the fixture
    teamTournamentTeam2Number?: number | null; // For Torneo a Squadre giornate: team2 number for the fixture
    playoffType?: string;
    teamTournamentPhase?: 'round_robin' | TeamTournamentPlayoffPhase | null;
    isBye?: boolean; // Se la partita del tabellone a eliminazione diretta è un BYE
    parentTournamentName?: string | null; // Nome torneo padre (per tornei figlio di un TorneOtto)
    dayLabel?: string | null; // Etichetta giornata (backfill column - da NON usare per display, usare giornataName||type)
}

export interface EloHistoryEntry {
    eventId: string;
    playerId: string;
    eloBefore: number;
    eloAfter: number;
    delta: number;
    date: string;
    type: 'match' | 'manual' | 'tournament' | 'team_tournament_matchday';
    sourceLabel?: string;
}

export interface RankingEntry extends Player {
    rank: number;
    matchesPlayed: number;
    matchesWon: number;
    gamesWon: number;
    gamesLost: number;
    winPercentage: number;
    lastDelta: number | null;
    presencePercentage?: number;
    playerGiornateCount?: number;
}

export interface TournamentStandingEntry {
    team: Player[];
    teamId: string;
    points: number;
    gamesWon: number;
    gamesLost: number;
    gameDifference: number;
    matches?: number;
}

// Beat the Box specific types
export interface BeatTheBoxData {
    numBoxes: number;
    boxPlayers: Player[][]; // Array di array (4 giocatori per box)
    currentPhase: 'boxes' | 'semifinals' | 'finals';
    boxMatchCount: number; // Numero di match per box (sempre 3)
    semifinalMatchCount?: number; // Se 8+ coppie
}

export interface TeamTournamentConfig {
    tournamentId: string;
    initialTeamCount: number;
    defaultPlayersPerTeam: number;
    format: 'ROUND ROBIN' | 'ANDATA E RITORNO' | 'ELIMINAZIONE DIRETTA';
    matchesPerDay: 3 | 5;
    roundRobinFinalPhase: 'FINALI' | 'SEMIFINALI E FINALI' | 'QUARTI, SEMIFINALI E FINALI' | null;
    scoringType: 'Punti' | 'Differenza Games' | 'Punti + Resilienza';
    configCompleted?: boolean;
    schedule?: TeamTournamentSchedule | null;
    hasResults?: boolean; // true if at least one matchday has non-zero set scores saved
}

export interface TeamTournamentPlayerEntry {
    name: string;
    surname: string;
    id?: string;
    currentElo?: number;
    playtomicLevel?: number;
}

export type TeamTournamentSchedule = TeamTournamentRoundRobinSchedule;

export interface TeamTournamentRoundRobinSchedule {
    kind: 'round_robin';
    days: Array<{
        dayNumber: number;
        byeTeamNumber?: number | null;
        matches: Array<{
            matchNumber: number;
            team1Number: number;
            team2Number: number;
        }>;
    }>;
}

export interface TeamTournamentTeam {
    id: string;
    tournamentId: string;
    teamNumber: number;
    name: string;
    targetPlayerCount: number;
    players: TeamTournamentPlayerEntry[];
    isSeeded?: boolean;
}

export interface TeamTournamentSubMatch {
    matchIndex: number;
    team1Players: TeamTournamentPlayerEntry[];
    team2Players: TeamTournamentPlayerEntry[];
    sets: SetScore[] | null;
    winner: 'team1' | 'team2' | 'draw' | null;
    cancelled?: boolean; // true when match was removed because the team match was already decided
}

export interface TeamTournamentMatchday {
    id: string;
    rootTournamentId: string;
    tournamentDayId: string; // tournaments.id for this giornata entry
    date: string;
    team1Number: number;
    team2Number: number;
    roundNumber: number | null;
    matchesPerDay: 3 | 5;
    status: 'scheduled' | 'completed';
    summary: any | null;
    subMatches: TeamTournamentSubMatch[];
    tournament?: {
        id: string;
        name: string;
        club: string;
        type: TournamentType;
        giornataName: string | null;
        teamTournamentRootId: string | null;
    };
    createdAt?: string;
    phase?: 'round_robin' | TeamTournamentPlayoffPhase;
}

export interface TeamTournamentPlayerStatsRow {
    name: string;
    surname: string;
    matchesPlayed: number;
    matchesWon: number;
    matchesLost: number;
    gamesWon: number;
    gamesLost: number;
    gamesDiff: number;
    winPercentage: number;
}

export type TeamTournamentPlayoffPhase =
    | 'round_of_32'
    | 'round_of_16'
    | 'quarterfinal'
    | 'semifinal'
    | 'final_3_4'
    | 'final_1_2';

export interface TeamTournamentFixture {
    id: string;
    rootTournamentId: string;
    phase: TeamTournamentPlayoffPhase;
    slot: number;
    team1Number: number | null;
    team2Number: number | null;
    winnerTeamNumber?: number | null;
    loserTeamNumber?: number | null;
    isBye?: boolean;
    dependsOn: any | null;
    status: 'planned' | 'scheduled' | 'completed';
    tournamentDayId: string | null;
    matchdayId: string | null;
    createdAt?: string;
    updatedAt?: string;
}
