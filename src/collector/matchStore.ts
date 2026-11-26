import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR } from '../shared/paths.ts';
import { ROLES } from '../shared/types.ts';
import type { Role } from '../shared/types.ts';
import type { MatchDto } from './riotClient.ts';

export interface StoredParticipant {
  teamId: number;
  championId: number;
  teamPosition: Role | '';
  win: boolean;
  earlySurrender: boolean;
  spells: [number, number];
  items: number[];
  perks?: {
    primaryStyleId: number;
    subStyleId: number;
    selectedPerkIds: number[];
    statPerks: [number, number, number];
  };
}

export interface StoredMatch {
  matchId: string;
  patch: string;
  queueId: number;
  gameDuration: number;
  bannedChampionIds: number[];
  participants: StoredParticipant[];
}

const VALID_ROLES = new Set<string>(ROLES);

export function normalizePatch(gameVersion: string): string {
  const parts = gameVersion.split('.');
  if (parts.length >= 2) {
    return `${parts[0]}.${parts[1]}`;
  }
  return gameVersion;
}

function toStoredRole(pos: string): Role | '' {
  return VALID_ROLES.has(pos) ? (pos as Role) : '';
}

export function toStoredMatch(match: MatchDto): StoredMatch {
  const bannedChampionIds = new Set<number>();
  for (const team of match.info.teams ?? []) {
    for (const ban of team.bans ?? []) {
      if (ban.championId > 0) {
        bannedChampionIds.add(ban.championId);
      }
    }
  }

  const participants: StoredParticipant[] = match.info.participants.map((p) => {
    const primaryStyle = p.perks?.styles?.find((s) => s.description === 'primaryStyle') ?? p.perks?.styles?.[0];
    const subStyle = p.perks?.styles?.find((s) => s.description === 'subStyle') ?? p.perks?.styles?.[1];
    const selectedPerkIds = [
      ...(primaryStyle?.selections?.map((s) => s.perk) ?? []),
      ...(subStyle?.selections?.map((s) => s.perk) ?? []),
    ];

    const statPerks: [number, number, number] = [
      p.perks?.statPerks?.offense ?? 0,
      p.perks?.statPerks?.flex ?? 0,
      p.perks?.statPerks?.defense ?? 0,
    ];

    return {
      teamId: p.teamId,
      championId: p.championId,
      teamPosition: toStoredRole(p.teamPosition),
      win: Boolean(p.win),
      earlySurrender: Boolean(p.gameEndedInEarlySurrender),
      spells: [p.summoner1Id, p.summoner2Id],
      items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].filter((id) => id > 0),
      perks:
        primaryStyle && subStyle && selectedPerkIds.length > 0
          ? {
              primaryStyleId: primaryStyle.style,
              subStyleId: subStyle.style,
              selectedPerkIds,
              statPerks,
            }
          : undefined,
    };
  });

  return {
    matchId: match.metadata.matchId,
    patch: normalizePatch(match.info.gameVersion),
    queueId: match.info.queueId,
    gameDuration: match.info.gameDuration,
    bannedChampionIds: Array.from(bannedChampionIds),
    participants,
  };
}

export function getRawMatchesPath(patch: string, rawDir: string = RAW_DIR): string {
  const majorMinor = normalizePatch(patch);
  return path.join(rawDir, `matches-${majorMinor}.ndjson`);
}

export class MatchStore {
  private readonly filePath: string;
  private readonly seenIds = new Set<string>();

  constructor(patch: string, rawDir: string = RAW_DIR) {
    this.filePath = getRawMatchesPath(patch, rawDir);
    if (fs.existsSync(this.filePath)) {
      const lines = fs.readFileSync(this.filePath, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as { matchId?: string };
          if (parsed.matchId) {
            this.seenIds.add(parsed.matchId);
          }
        } catch {
          // Skip trailing partial line if a prior run was killed mid-write
        }
      }
    }
  }

  has(matchId: string): boolean {
    return this.seenIds.has(matchId);
  }

  count(): number {
    return this.seenIds.size;
  }

  append(match: StoredMatch): boolean {
    if (this.seenIds.has(match.matchId)) {
      return false;
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, `${JSON.stringify(match)}\n`, 'utf8');
    this.seenIds.add(match.matchId);
    return true;
  }

  readAll(): StoredMatch[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }
    const result: StoredMatch[] = [];
    const lines = fs.readFileSync(this.filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        result.push(JSON.parse(line) as StoredMatch);
      } catch {
        // Ignore corrupted line
      }
    }
    return result;
  }
}
