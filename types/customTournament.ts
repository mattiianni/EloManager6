export type PhaseBlockId =
  | 'girone'
  | 'torneotto'
  | 'box'
  | 'americano'
  | 'quarti'
  | 'semifinali'
  | 'finali'
  | 'ritorno';

export type PlayerMode = 'pairs' | 'singles';

export interface PhaseBlock {
  id: PhaseBlockId;
  label: string;
  description: string;
  iconName: string;
  compatiblePlayerModes: PlayerMode[];
  bgColorClass: string;
  isRankingPhase: boolean;
  requiresRankingPhase: boolean;
}

export interface CustomTournamentFlowConfig {
  phases: PhaseBlockId[];
  playerMode: PlayerMode;
  numCampi: number;
  numPartecipanti?: number;
}

export const ALL_PHASE_BLOCKS: PhaseBlock[] = [
  {
    id: 'girone',
    label: 'Girone Italiano',
    description: 'Tutti contro tutti (solo coppie fisse).',
    iconName: 'table_rows',
    compatiblePlayerModes: ['pairs'],
    bgColorClass: 'bg-emerald-500',
    isRankingPhase: true,
    requiresRankingPhase: false,
  },
  {
    id: 'torneotto',
    label: 'TorneOtto',
    description: '4 coppie fisse si sfidano in 3 partite.',
    iconName: 'counter_8',
    compatiblePlayerModes: ['pairs'],
    bgColorClass: 'bg-amber-500',
    isRankingPhase: true,
    requiresRankingPhase: false,
  },
  {
    id: 'box',
    label: 'Box',
    description: 'Mini-gironi (3-4 coppie, oppure 4 singoli per campo).',
    iconName: 'grid_view',
    compatiblePlayerModes: ['pairs', 'singles'],
    bgColorClass: 'bg-sky-500',
    isRankingPhase: true,
    requiresRankingPhase: false,
  },
  {
    id: 'americano',
    label: 'Americano',
    description: 'Tutti con tutti a rotazione (solo singolo).',
    iconName: 'autorenew',
    compatiblePlayerModes: ['singles'],
    bgColorClass: 'bg-indigo-500',
    isRankingPhase: true,
    requiresRankingPhase: false,
  },
  {
    id: 'quarti',
    label: 'Quarti di Finale',
    description: 'I migliori 8 accedono a 4 match a eliminazione.',
    iconName: 'looks_4',
    compatiblePlayerModes: ['pairs', 'singles'],
    bgColorClass: 'bg-purple-500',
    isRankingPhase: false,
    requiresRankingPhase: true,
  },
  {
    id: 'semifinali',
    label: 'Semifinali',
    description: 'I migliori 4 si affrontano in 2 match.',
    iconName: 'looks_two',
    compatiblePlayerModes: ['pairs', 'singles'],
    bgColorClass: 'bg-orange-500',
    isRankingPhase: false,
    requiresRankingPhase: true,
  },
  {
    id: 'finali',
    label: 'Finali',
    description: 'Finale 1°-2° posto e Finalina 3°-4° posto.',
    iconName: 'military_tech',
    compatiblePlayerModes: ['pairs', 'singles'],
    bgColorClass: 'bg-yellow-500',
    isRankingPhase: false,
    requiresRankingPhase: true,
  },
  {
    id: 'ritorno',
    label: 'Ritorno',
    description: 'Raddoppia le partite di girone con andata e ritorno.',
    iconName: 'sync_alt',
    compatiblePlayerModes: ['pairs'],
    bgColorClass: 'bg-teal-500',
    isRankingPhase: true,
    requiresRankingPhase: true,
  },
];
