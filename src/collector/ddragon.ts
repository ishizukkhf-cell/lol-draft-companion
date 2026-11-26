import fs from 'node:fs';
import path from 'node:path';
import { inferChampionTraits } from '../shared/championTraits.ts';
import { DDRAGON_LATEST_PATH } from '../shared/paths.ts';
import type { ChampionStatic, DDragonSnapshot } from '../shared/types.ts';

interface DDragonChampionRaw {
  id: string;
  key: string;
  name: string;
  title: string;
  tags: string[];
  info: {
    attack: number;
    defense: number;
    magic: number;
    difficulty: number;
  };
}

interface DDragonItemRaw {
  name: string;
  gold: {
    total: number;
    purchasable: boolean;
  };
  into?: string[];
  maps?: Record<string, boolean>;
}

interface DDragonSummonerRaw {
  id: string;
  key: string;
  name: string;
}

interface DDragonRuneStyleRaw {
  id: number;
  key: string;
  name: string;
  icon: string;
  slots: Array<{
    runes: Array<{
      id: number;
      key: string;
      name: string;
      icon: string;
    }>;
  }>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Data Dragon fetch failed (${response.status}): ${url}`);
  }
  return (await response.json()) as T;
}

export async function fetchLatestPatchVersion(): Promise<string> {
  const versions = await fetchJson<string[]>('https://ddragon.leagueoflegends.com/api/versions.json');
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error('Data Dragon versions.json returned empty list');
  }
  return versions[0];
}

export async function syncDdragon(outputPath: string = DDRAGON_LATEST_PATH): Promise<DDragonSnapshot> {
  const patch = await fetchLatestPatchVersion();
  const baseUrl = `https://ddragon.leagueoflegends.com/cdn/${patch}/data`;

  const [champJa, champEn, itemJa, itemEn, summonerJa, summonerEn, runesJa, runesEn] = await Promise.all([
    fetchJson<{ data: Record<string, DDragonChampionRaw> }>(`${baseUrl}/ja_JP/champion.json`),
    fetchJson<{ data: Record<string, DDragonChampionRaw> }>(`${baseUrl}/en_US/champion.json`),
    fetchJson<{ data: Record<string, DDragonItemRaw> }>(`${baseUrl}/ja_JP/item.json`),
    fetchJson<{ data: Record<string, DDragonItemRaw> }>(`${baseUrl}/en_US/item.json`),
    fetchJson<{ data: Record<string, DDragonSummonerRaw> }>(`${baseUrl}/ja_JP/summoner.json`),
    fetchJson<{ data: Record<string, DDragonSummonerRaw> }>(`${baseUrl}/en_US/summoner.json`),
    fetchJson<DDragonRuneStyleRaw[]>(`${baseUrl}/ja_JP/runesReforged.json`),
    fetchJson<DDragonRuneStyleRaw[]>(`${baseUrl}/en_US/runesReforged.json`),
  ]);

  const champions: Record<number, ChampionStatic> = {};
  for (const [champKey, ja] of Object.entries(champJa.data)) {
    const numericId = Number.parseInt(ja.key, 10);
    if (!Number.isFinite(numericId)) {
      continue;
    }
    const en = champEn.data[champKey];
    champions[numericId] = {
      id: numericId,
      key: ja.id,
      nameJa: ja.name,
      nameEn: en?.name ?? ja.name,
      titleJa: ja.title,
      tags: ja.tags,
      info: ja.info,
      iconUrl: `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${ja.id}.png`,
      traits: inferChampionTraits(ja.id, ja.tags, ja.info),
    };
  }

  const items: DDragonSnapshot['items'] = {};
  for (const [idStr, item] of Object.entries(itemJa.data)) {
    const id = Number.parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      continue;
    }
    const onSR = item.maps?.['11'] !== false;
    const isCompleted =
      onSR &&
      item.gold.purchasable &&
      item.gold.total >= 2000 &&
      (!item.into || item.into.length === 0);

    items[id] = {
      id,
      nameJa: item.name,
      nameEn: itemEn.data[idStr]?.name,
      goldTotal: item.gold.total,
      isCompleted,
    };
  }

  const spellEnById = new Map<number, string>();
  for (const spell of Object.values(summonerEn.data)) {
    const id = Number.parseInt(spell.key, 10);
    if (Number.isFinite(id)) {
      spellEnById.set(id, spell.name);
    }
  }

  const spells: DDragonSnapshot['spells'] = {};
  for (const spell of Object.values(summonerJa.data)) {
    const id = Number.parseInt(spell.key, 10);
    if (!Number.isFinite(id)) {
      continue;
    }
    spells[id] = {
      id,
      nameJa: spell.name,
      nameEn: spellEnById.get(id),
      key: spell.id,
    };
  }

  const runeEnById = new Map<number, string>();
  for (const style of runesEn) {
    runeEnById.set(style.id, style.name);
    for (const slot of style.slots) {
      for (const rune of slot.runes) {
        runeEnById.set(rune.id, rune.name);
      }
    }
  }

  const runes: DDragonSnapshot['runes'] = {};
  for (const style of runesJa) {
    runes[style.id] = {
      id: style.id,
      nameJa: style.name,
      nameEn: runeEnById.get(style.id),
      icon: style.icon,
    };
    for (const slot of style.slots) {
      for (const rune of slot.runes) {
        runes[rune.id] = {
          id: rune.id,
          nameJa: rune.name,
          nameEn: runeEnById.get(rune.id),
          icon: rune.icon,
          styleId: style.id,
        };
      }
    }
  }

  const snapshot: DDragonSnapshot = {
    patch,
    fetchedAt: new Date().toISOString(),
    champions,
    runes,
    spells,
    items,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), 'utf8');
  return snapshot;
}

export function loadDdragon(inputPath: string = DDRAGON_LATEST_PATH): DDragonSnapshot | null {
  if (!fs.existsSync(inputPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(inputPath, 'utf8')) as DDragonSnapshot;
}
