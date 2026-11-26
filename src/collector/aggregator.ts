import { ROLES } from '../shared/types.ts';
import type {
  ChampionRoleStats,
  ItemBuildStat,
  PairStat,
  Role,
  RuneBuildStat,
  SpellPairStat,
  StatsSnapshot,
  TierRank,
} from '../shared/types.ts';
import { normalizePatch } from './matchStore.ts';
import type { StoredMatch, StoredParticipant } from './matchStore.ts';

export interface AggregateOptions {
  patch: string;
  platform: string;
  queueId: number;
  completedItemIds?: Set<number>;
}

interface CountAcc {
  games: number;
  wins: number;
}

interface RuneAcc extends CountAcc {
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
  statPerks: [number, number, number];
}

interface SpellAcc extends CountAcc {
  spells: [number, number];
}

interface ItemAcc extends CountAcc {
  items: number[];
}

interface ChampRoleAcc {
  games: number;
  wins: number;
  laneMatchups: Map<number, CountAcc>;
  enemyCounters: Map<number, CountAcc>;
  allySynergies: Map<number, CountAcc>;
  runes: Map<string, RuneAcc>;
  spells: Map<string, SpellAcc>;
  items: Map<string, ItemAcc>;
}

const PRIOR_GAMES = 20;
const PRIOR_WINS = 10;
const PAIR_SHRINKAGE_K = 15;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function getOrCreateAcc(
  byRole: Map<Role, Map<number, ChampRoleAcc>>,
  role: Role,
  championId: number,
): ChampRoleAcc {
  let roleMap = byRole.get(role);
  if (!roleMap) {
    roleMap = new Map();
    byRole.set(role, roleMap);
  }
  let acc = roleMap.get(championId);
  if (!acc) {
    acc = {
      games: 0,
      wins: 0,
      laneMatchups: new Map(),
      enemyCounters: new Map(),
      allySynergies: new Map(),
      runes: new Map(),
      spells: new Map(),
      items: new Map(),
    };
    roleMap.set(championId, acc);
  }
  return acc;
}

function addPairCount(map: Map<number, CountAcc>, otherId: number, won: boolean): void {
  let entry = map.get(otherId);
  if (!entry) {
    entry = { games: 0, wins: 0 };
    map.set(otherId, entry);
  }
  entry.games += 1;
  if (won) entry.wins += 1;
}

function assignTier(composite: number, games: number): TierRank {
  if (games < 3) return 'B';
  if (composite >= 4.5) return 'S+';
  if (composite >= 2.2) return 'S';
  if (composite >= 0.4) return 'A';
  if (composite >= -1.5) return 'B';
  if (composite >= -3.5) return 'C';
  return 'D';
}

function isValidMatch(match: StoredMatch, queueId: number): boolean {
  if (match.queueId !== queueId) return false;
  if (match.gameDuration < 300) return false;
  if (match.participants.some((p) => p.earlySurrender)) return false;
  return match.participants.length > 0;
}

/**
 * Aggregates Match-V5 StoredMatch records into role-based win rates, matchups, synergies, and builds.
 */
export function aggregateMatches(
  matches: StoredMatch[],
  options: AggregateOptions,
): StatsSnapshot {
  const validMatches = matches.filter((m) => isValidMatch(m, options.queueId));
  const totalMatches = validMatches.length;

  const byRole = new Map<Role, Map<number, ChampRoleAcc>>();
  for (const role of ROLES) {
    byRole.set(role, new Map());
  }

  const banCounts = new Map<number, number>();

  for (const match of validMatches) {
    for (const bannedId of match.bannedChampionIds) {
      banCounts.set(bannedId, (banCounts.get(bannedId) ?? 0) + 1);
    }

    const teams = new Map<number, StoredParticipant[]>();
    for (const p of match.participants) {
      if (p.championId <= 0) continue;
      const list = teams.get(p.teamId) ?? [];
      list.push(p);
      teams.set(p.teamId, list);
    }

    for (const p of match.participants) {
      if (!p.teamPosition || p.championId <= 0) continue;
      const acc = getOrCreateAcc(byRole, p.teamPosition, p.championId);
      acc.games += 1;
      if (p.win) acc.wins += 1;

      if (p.perks) {
        const runeKey = `${p.perks.primaryStyleId}:${p.perks.subStyleId}:${p.perks.selectedPerkIds.join(',')}:${p.perks.statPerks.join(',')}`;
        let rAcc = acc.runes.get(runeKey);
        if (!rAcc) {
          rAcc = {
            primaryStyleId: p.perks.primaryStyleId,
            subStyleId: p.perks.subStyleId,
            selectedPerkIds: p.perks.selectedPerkIds,
            statPerks: p.perks.statPerks,
            games: 0,
            wins: 0,
          };
          acc.runes.set(runeKey, rAcc);
        }
        rAcc.games += 1;
        if (p.win) rAcc.wins += 1;
      }

      const sortedSpells: [number, number] =
        p.spells[0] <= p.spells[1] ? [p.spells[0], p.spells[1]] : [p.spells[1], p.spells[0]];
      if (sortedSpells[0] > 0 && sortedSpells[1] > 0) {
        const spellKey = `${sortedSpells[0]}:${sortedSpells[1]}`;
        let sAcc = acc.spells.get(spellKey);
        if (!sAcc) {
          sAcc = { spells: sortedSpells, games: 0, wins: 0 };
          acc.spells.set(spellKey, sAcc);
        }
        sAcc.games += 1;
        if (p.win) sAcc.wins += 1;
      }

      const filteredItems = options.completedItemIds
        ? p.items.filter((id) => options.completedItemIds!.has(id))
        : p.items.filter((id) => id > 0);
      if (filteredItems.length > 0) {
        const coreItems = [...filteredItems].sort((a, b) => a - b).slice(0, 4);
        const itemKey = coreItems.join(',');
        let iAcc = acc.items.get(itemKey);
        if (!iAcc) {
          iAcc = { items: coreItems, games: 0, wins: 0 };
          acc.items.set(itemKey, iAcc);
        }
        iAcc.games += 1;
        if (p.win) iAcc.wins += 1;
      }
    }

    const teamEntries = Array.from(teams.entries());
    if (teamEntries.length === 2) {
      const [teamA, teamB] = [teamEntries[0][1], teamEntries[1][1]];

      const processTeamPairs = (allies: StoredParticipant[], enemies: StoredParticipant[]) => {
        for (const p of allies) {
          if (!p.teamPosition || p.championId <= 0) continue;
          const acc = getOrCreateAcc(byRole, p.teamPosition, p.championId);

          for (const enemy of enemies) {
            if (enemy.championId > 0) {
              addPairCount(acc.enemyCounters, enemy.championId, p.win);
            }
          }
          for (const ally of allies) {
            if (ally !== p && ally.championId > 0) {
              addPairCount(acc.allySynergies, ally.championId, p.win);
            }
          }
        }
      };

      processTeamPairs(teamA, teamB);
      processTeamPairs(teamB, teamA);

      for (const role of ROLES) {
        const aInRole = teamA.filter((p) => p.teamPosition === role && p.championId > 0);
        const bInRole = teamB.filter((p) => p.teamPosition === role && p.championId > 0);
        if (aInRole.length === 1 && bInRole.length === 1) {
          const pA = aInRole[0];
          const pB = bInRole[0];
          addPairCount(getOrCreateAcc(byRole, role, pA.championId).laneMatchups, pB.championId, pA.win);
          addPairCount(getOrCreateAcc(byRole, role, pB.championId).laneMatchups, pA.championId, pB.win);
        }
      }
    }
  }

  const globalGames = new Map<number, number>();
  const globalWins = new Map<number, number>();
  for (const roleMap of byRole.values()) {
    for (const [champId, acc] of roleMap.entries()) {
      globalGames.set(champId, (globalGames.get(champId) ?? 0) + acc.games);
      globalWins.set(champId, (globalWins.get(champId) ?? 0) + acc.wins);
    }
  }
  const getGlobalSmoothedWR = (champId: number): number => {
    const g = globalGames.get(champId) ?? 0;
    const w = globalWins.get(champId) ?? 0;
    return (w + PRIOR_WINS) / (g + PRIOR_GAMES);
  };

  const snapshotByRole: StatsSnapshot['byRole'] = {
    TOP: {},
    JUNGLE: {},
    MIDDLE: {},
    BOTTOM: {},
    UTILITY: {},
  };

  for (const role of ROLES) {
    const roleMap = byRole.get(role)!;
    const getRoleSmoothedWR = (champId: number): number => {
      const acc = roleMap.get(champId);
      if (!acc) return 0.5;
      return (acc.wins + PRIOR_WINS) / (acc.games + PRIOR_GAMES);
    };

    for (const [championId, acc] of roleMap.entries()) {
      if (acc.games === 0) continue;

      const winRate = acc.wins / acc.games;
      const smoothedWinRate = (acc.wins + PRIOR_WINS) / (acc.games + PRIOR_GAMES);
      const pickRate = totalMatches > 0 ? acc.games / totalMatches : 0;
      const banRate = totalMatches > 0 ? (banCounts.get(championId) ?? 0) / totalMatches : 0;
      const composite = (smoothedWinRate - 0.5) * 100 + Math.log10(pickRate * 100 + 1) * 1.5;

      const laneMatchups: Record<number, PairStat> = {};
      for (const [oppId, pair] of acc.laneMatchups.entries()) {
        const actualWR = pair.wins / pair.games;
        const oppWR = getRoleSmoothedWR(oppId);
        const expectedWR = clamp(0.5 + (smoothedWinRate - 0.5) - (oppWR - 0.5), 0.1, 0.9);
        const delta = (actualWR - expectedWR) * (pair.games / (pair.games + PAIR_SHRINKAGE_K));
        laneMatchups[oppId] = {
          opponentOrAllyId: oppId,
          games: pair.games,
          wins: pair.wins,
          winRate: round4(actualWR),
          delta: round4(delta),
        };
      }

      const enemyCounters: Record<number, PairStat> = {};
      for (const [enemyId, pair] of acc.enemyCounters.entries()) {
        const actualWR = pair.wins / pair.games;
        const enemyWR = getGlobalSmoothedWR(enemyId);
        const expectedWR = clamp(0.5 + (smoothedWinRate - 0.5) - (enemyWR - 0.5), 0.1, 0.9);
        const delta = (actualWR - expectedWR) * (pair.games / (pair.games + PAIR_SHRINKAGE_K));
        enemyCounters[enemyId] = {
          opponentOrAllyId: enemyId,
          games: pair.games,
          wins: pair.wins,
          winRate: round4(actualWR),
          delta: round4(delta),
        };
      }

      const allySynergies: Record<number, PairStat> = {};
      for (const [allyId, pair] of acc.allySynergies.entries()) {
        const actualWR = pair.wins / pair.games;
        const allyWR = getGlobalSmoothedWR(allyId);
        const expectedWR = clamp(0.5 + (smoothedWinRate - 0.5) + (allyWR - 0.5), 0.1, 0.9);
        const delta = (actualWR - expectedWR) * (pair.games / (pair.games + PAIR_SHRINKAGE_K));
        allySynergies[allyId] = {
          opponentOrAllyId: allyId,
          games: pair.games,
          wins: pair.wins,
          winRate: round4(actualWR),
          delta: round4(delta),
        };
      }

      const topRunes: RuneBuildStat[] = Array.from(acc.runes.values())
        .sort((a, b) => b.games - a.games || b.wins / b.games - a.wins / a.games)
        .slice(0, 3)
        .map((r) => ({
          primaryStyleId: r.primaryStyleId,
          subStyleId: r.subStyleId,
          selectedPerkIds: r.selectedPerkIds,
          statPerks: r.statPerks,
          games: r.games,
          wins: r.wins,
          winRate: round4(r.wins / r.games),
        }));

      const topSpells: SpellPairStat[] = Array.from(acc.spells.values())
        .sort((a, b) => b.games - a.games || b.wins / b.games - a.wins / a.games)
        .slice(0, 3)
        .map((s) => ({
          spells: s.spells,
          games: s.games,
          wins: s.wins,
          winRate: round4(s.wins / s.games),
        }));

      const topItems: ItemBuildStat[] = Array.from(acc.items.values())
        .sort((a, b) => b.games - a.games || b.wins / b.games - a.wins / a.games)
        .slice(0, 3)
        .map((i) => ({
          items: i.items,
          games: i.games,
          wins: i.wins,
          winRate: round4(i.wins / i.games),
        }));

      const roleStats: ChampionRoleStats = {
        championId,
        role,
        games: acc.games,
        wins: acc.wins,
        winRate: round4(winRate),
        smoothedWinRate: round4(smoothedWinRate),
        pickRate: round4(pickRate),
        banRate: round4(banRate),
        tier: assignTier(composite, acc.games),
        laneMatchups,
        enemyCounters,
        allySynergies,
        topRunes,
        topSpells,
        topItems,
      };

      snapshotByRole[role][championId] = roleStats;
    }
  }

  return {
    schemaVersion: 1,
    patch: normalizePatch(options.patch),
    platform: options.platform,
    queueId: options.queueId,
    generatedAt: new Date().toISOString(),
    totalMatches,
    byRole: snapshotByRole,
  };
}
