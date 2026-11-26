export const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;
export type Role = (typeof ROLES)[number];

export type DamageProfile = 'AD' | 'AP' | 'MIXED';

export interface ChampionTraits {
  damageProfile: DamageProfile;
  isTank: boolean;
  isFrontline: boolean;
  hasEngage: boolean;
  hasHardCC: boolean;
  hasPeel: boolean;
  hasPoke: boolean;
}

export interface ChampionStatic {
  id: number;
  key: string;
  nameJa: string;
  nameEn: string;
  titleJa: string;
  tags: string[];
  info: {
    attack: number;
    defense: number;
    magic: number;
    difficulty: number;
  };
  iconUrl: string;
  traits: ChampionTraits;
}

export interface DDragonSnapshot {
  patch: string;
  fetchedAt: string;
  champions: Record<number, ChampionStatic>;
  runes: Record<number, { id: number; nameJa: string; nameEn?: string; icon: string; styleId?: number }>;
  spells: Record<number, { id: number; nameJa: string; nameEn?: string; key: string }>;
  items: Record<number, { id: number; nameJa: string; nameEn?: string; goldTotal: number; isCompleted: boolean }>;
}

export interface PairStat {
  opponentOrAllyId: number;
  games: number;
  wins: number;
  winRate: number;
  delta: number;
}

export interface RuneBuildStat {
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
  statPerks: [number, number, number];
  games: number;
  wins: number;
  winRate: number;
}

export interface SpellPairStat {
  spells: [number, number];
  games: number;
  wins: number;
  winRate: number;
}

export interface ItemBuildStat {
  items: number[];
  games: number;
  wins: number;
  winRate: number;
}

export type TierRank = 'S+' | 'S' | 'A' | 'B' | 'C' | 'D';

export interface ChampionRoleStats {
  championId: number;
  role: Role;
  games: number;
  wins: number;
  winRate: number;
  smoothedWinRate: number;
  pickRate: number;
  banRate: number;
  tier: TierRank;
  laneMatchups: Record<number, PairStat>;
  enemyCounters: Record<number, PairStat>;
  allySynergies: Record<number, PairStat>;
  topRunes: RuneBuildStat[];
  topSpells: SpellPairStat[];
  topItems: ItemBuildStat[];
}

export interface StatsSnapshot {
  schemaVersion: 1;
  patch: string;
  platform: string;
  queueId: number;
  generatedAt: string;
  totalMatches: number;
  byRole: Record<Role, Record<number, ChampionRoleStats>>;
}

export type PoolProficiency = 'main' | 'sub' | 'situational';

export interface ChampionPoolEntry {
  championId: number;
  roles: Role[];
  proficiency: PoolProficiency;
  note?: string;
}

export interface UserPreset {
  id: string;
  name: string;
  championId: number;
  role: Role;
  vsChampionId?: number;
  runes?: {
    primaryStyleId: number;
    subStyleId: number;
    selectedPerkIds: number[];
    statPerks: [number, number, number];
  };
  spells?: [number, number];
  items?: number[];
  itemBlocks?: Array<{ type: string; items: number[] }>;
  skillOrder?: string[];
  memo?: string;
  updatedAt: string;
}

export interface DraftSlot {
  championId: number;
  role?: Role;
}

export interface DraftState {
  myRole: Role;
  allyPicks: DraftSlot[];
  enemyPicks: DraftSlot[];
  bannedChampionIds: number[];
  enemyLaneOpponentId?: number;
}

export interface ScoreBreakdown {
  laneMatchup: number;
  compBalance: number;
  enemyCounter: number;
  allySynergy: number;
  baseStrength: number;
  poolComfort: number;
  total: number;
}

export interface RecommendationItem {
  championId: number;
  role: Role;
  source: 'pool' | 'exception';
  proficiency?: PoolProficiency;
  tier: TierRank;
  winRate: number;
  games: number;
  score: ScoreBreakdown;
  reasons: string[];
  warnings: string[];
  recommendedRunes?: RuneBuildStat;
  recommendedSpells?: SpellPairStat;
  recommendedItems?: ItemBuildStat;
}

export interface TeamCompSummary {
  adCount: number;
  apCount: number;
  mixedCount: number;
  frontlineCount: number;
  engageCount: number;
  hardCCCount: number;
  needs: string[];
}

export interface RecommendationResult {
  myRole: Role;
  poolRecommendations: RecommendationItem[];
  exceptionRecommendations: RecommendationItem[];
  teamCompSummary: TeamCompSummary;
}
