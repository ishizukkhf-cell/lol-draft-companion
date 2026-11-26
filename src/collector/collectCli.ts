import fs from 'node:fs';
import path from 'node:path';
import { ENV_PATH, STATS_LATEST_PATH } from '../shared/paths.ts';
import { aggregateMatches } from './aggregator.ts';
import { loadCollectorConfig, maskApiKey, platformToRegion } from './config.ts';
import { loadDdragon, syncDdragon } from './ddragon.ts';
import { MatchStore, normalizePatch, toStoredMatch } from './matchStore.ts';
import { RiotRateLimiter } from './rateLimiter.ts';
import { RiotApiClient, RiotApiError } from './riotClient.ts';
import type { LeagueEntryDto } from './riotClient.ts';

const TIER_PRIORITY: Record<string, number> = {
  CHALLENGER: 1,
  GRANDMASTER: 2,
  MASTER: 3,
  DIAMOND: 4,
  EMERALD: 5,
  PLATINUM: 6,
  GOLD: 7,
  SILVER: 8,
  BRONZE: 9,
  IRON: 10,
};

function sortTiersByActivity(tiers: string[]): string[] {
  return [...tiers].sort((a, b) => (TIER_PRIORITY[a] ?? 99) - (TIER_PRIORITY[b] ?? 99));
}

function comparePatchDesc(a: string, b: string): number {
  const [aMaj = 0, aMin = 0] = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [bMaj = 0, bMin = 0] = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  return bMaj - aMaj || bMin - aMin;
}

function parseCliArgs(args: string[]): {
  targetMatches?: number;
  platform?: string;
  tiers?: string[];
} {
  let targetMatches: number | undefined;
  let platform: string | undefined;
  let tiers: string[] | undefined;

  for (const arg of args) {
    if (arg.startsWith('--matches=')) {
      const n = Number.parseInt(arg.slice('--matches='.length), 10);
      if (Number.isFinite(n) && n > 0) targetMatches = n;
    } else if (arg.startsWith('--platform=')) {
      platform = arg.slice('--platform='.length).trim().toLowerCase();
    } else if (arg.startsWith('--tiers=')) {
      tiers = arg
        .slice('--tiers='.length)
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
    }
  }

  return { targetMatches, platform, tiers };
}

function printMissingApiKeyHelp(): void {
  console.error('');
  console.error('[設定不足] RIOT_API_KEY が未設定、または初期値のままです。');
  console.error(`設定ファイル: ${ENV_PATH}`);
  console.error('');
  console.error('以下の手順で Riot API キーを設定してください:');
  console.error('  1. https://developer.riotgames.com/ で API キーを取得');
  console.error('  2. .env.example をコピーして .env を作成');
  console.error('  3. .env の RIOT_API_KEY=RGAPI-your-key-here を自分のキーに書き換え');
  console.error('  ※ .env ファイルは絶対に友達などへ共有しないでください。');
  console.error('');
}

async function resolveEntryPuuids(
  client: RiotApiClient,
  entries: LeagueEntryDto[],
  maxPuuids: number,
): Promise<string[]> {
  const sorted = [...entries].sort((a, b) => (b.leaguePoints ?? 0) - (a.leaguePoints ?? 0));
  const puuids = new Set<string>();
  for (const entry of sorted) {
    if (puuids.size >= maxPuuids) break;
    if (entry.puuid) {
      puuids.add(entry.puuid);
    } else if (entry.summonerId) {
      const summoner = await client.getSummonerById(entry.summonerId);
      if (summoner.puuid) puuids.add(summoner.puuid);
    }
  }
  return Array.from(puuids);
}

async function seedPlayerPuuids(
  client: RiotApiClient,
  tiers: string[],
  maxSeedPlayers: number,
): Promise<string[]> {
  const orderedTiers = sortTiersByActivity(tiers);
  const perTierLimit = Math.max(5, Math.ceil(maxSeedPlayers / Math.max(1, orderedTiers.length)));
  const collected = new Set<string>();

  for (const tier of orderedTiers) {
    if (collected.size >= maxSeedPlayers) break;
    try {
      let entries: LeagueEntryDto[] = [];
      if (tier === 'CHALLENGER' || tier === 'GRANDMASTER' || tier === 'MASTER') {
        const list = await client.getApexLeague(tier);
        entries = list.entries;
      } else {
        entries = await client.getLeagueEntries(tier, 'I', 1);
      }

      const resolved = await resolveEntryPuuids(client, entries, perTierLimit);
      for (const p of resolved) {
        collected.add(p);
      }
      console.log(`  シード取得 (${tier}): ${resolved.length}人`);
    } catch (err) {
      if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  [警告] ${tier} のシード取得をスキップしました: ${msg}`);
    }
  }

  return Array.from(collected);
}

async function main(): Promise<void> {
  const config = loadCollectorConfig();
  const cli = parseCliArgs(process.argv.slice(2));

  const apiKey = config.apiKey;
  if (!apiKey || apiKey === 'RGAPI-your-key-here') {
    printMissingApiKeyHelp();
    process.exitCode = 1;
    return;
  }

  const platform = cli.platform ?? config.platform;
  const region = cli.platform ? platformToRegion(platform) : config.region;
  const tiers = sortTiersByActivity(cli.tiers ?? config.tiers);
  const targetNewMatches = cli.targetMatches ?? config.targetMatches;

  console.log(`LoL Draft Companion 統計収集を開始します`);
  console.log(`  Platform: ${platform} / Region: ${region} / API Key: ${maskApiKey(apiKey)}`);
  console.log(`  対象ティア(アクティブ順): ${tiers.join(', ')} / 目標新規試合数: ${targetNewMatches}`);

  let ddragon = loadDdragon();
  if (!ddragon) {
    console.log('Data Dragon 最新データを同期しています...');
    ddragon = await syncDdragon();
  }
  const currentPatch = normalizePatch(ddragon.patch);
  console.log(`  基準パッチ (Data Dragon): ${currentPatch}`);

  const rateLimiter = new RiotRateLimiter({
    shortLimit: config.ratePerSec,
    longLimit: config.ratePer2Min,
  });

  const client = new RiotApiClient({
    apiKey,
    platform,
    region,
    rateLimiter,
  });

  const patchStores = new Map<string, MatchStore>();
  const getStoreForPatch = (patch: string): MatchStore => {
    const norm = normalizePatch(patch);
    let s = patchStores.get(norm);
    if (!s) {
      s = new MatchStore(norm);
      patchStores.set(norm, s);
    }
    return s;
  };

  const primaryStore = getStoreForPatch(currentPatch);
  console.log(`  既存キャッシュ (${currentPatch}): ${primaryStore.count()}件`);

  const maxSeeds = Math.max(15, Math.ceil(targetNewMatches / 5));
  console.log('対象ランク帯からプレイヤーPUUIDを取得中...');
  const seedPuuids = await seedPlayerPuuids(client, tiers, maxSeeds);

  if (seedPuuids.length === 0) {
    console.error('[エラー] シードプレイヤーを1人も取得できませんでした。');
    process.exitCode = 1;
    return;
  }

  const fourteenDaysAgoSec = Math.floor(Date.now() / 1000) - 14 * 86_400;
  const candidateMatchIds = new Set<string>();

  for (const puuid of seedPuuids) {
    if (candidateMatchIds.size >= targetNewMatches * 2) break;
    let ids = await client.getMatchIdsByPuuid(puuid, {
      queue: config.queueId,
      start: 0,
      count: 20,
      startTime: fourteenDaysAgoSec,
    });
    if (ids.length === 0) {
      ids = await client.getMatchIdsByPuuid(puuid, {
        queue: config.queueId,
        start: 0,
        count: 10,
      });
    }
    for (const id of ids) {
      if (!primaryStore.has(id)) {
        candidateMatchIds.add(id);
      }
    }
  }

  const toFetch = Array.from(candidateMatchIds).slice(0, targetNewMatches);
  console.log(`新規取得対象の試合ID: ${toFetch.length}件`);

  let fetchedCount = 0;
  const fetchedByPatch = new Map<string, number>();

  for (const matchId of toFetch) {
    const rawMatch = await client.getMatch(matchId);
    const stored = toStoredMatch(rawMatch);
    const store = getStoreForPatch(stored.patch);
    store.append(stored);
    fetchedByPatch.set(stored.patch, (fetchedByPatch.get(stored.patch) ?? 0) + 1);

    fetchedCount += 1;
    if (fetchedCount % 10 === 0 || fetchedCount === toFetch.length) {
      const patchSummary = Array.from(fetchedByPatch.entries())
        .sort(([a], [b]) => comparePatchDesc(a, b))
        .map(([p, c]) => `${p}:${c}件`)
        .join(', ');
      console.log(`  進捗: ${fetchedCount}/${toFetch.length}件取得 (${patchSummary})`);
    }
  }

  let aggregatePatch = currentPatch;
  let allMatches = getStoreForPatch(currentPatch).readAll();

  if (allMatches.length === 0 && fetchedByPatch.size > 0) {
    const availablePatches = Array.from(fetchedByPatch.keys()).sort(comparePatchDesc);
    aggregatePatch = availablePatches[0];
    allMatches = getStoreForPatch(aggregatePatch).readAll();
    console.log(
      `  [情報] パッチ ${currentPatch} の試合が0件だったため、直近アクティブパッチ ${aggregatePatch} (${allMatches.length}件) を集計します。`,
    );
  }

  const completedItemIds = new Set(
    Object.values(ddragon.items)
      .filter((item) => item.isCompleted)
      .map((item) => item.id),
  );

  const stats = aggregateMatches(allMatches, {
    patch: aggregatePatch,
    platform,
    queueId: config.queueId,
    completedItemIds,
  });

  fs.mkdirSync(path.dirname(STATS_LATEST_PATH), { recursive: true });
  fs.writeFileSync(STATS_LATEST_PATH, JSON.stringify(stats, null, 2), 'utf8');

  console.log('');
  console.log(`収集・集計完了！`);
  console.log(`  有効試合合計: ${stats.totalMatches}件 (パッチ ${stats.patch})`);
  console.log(`  出力ファイル: ${STATS_LATEST_PATH}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[エラー] 統計収集が中断されました: ${message}`);
  process.exitCode = 1;
});
