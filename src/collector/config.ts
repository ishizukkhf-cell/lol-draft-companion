import fs from 'node:fs';
import { ENV_PATH } from '../shared/paths.ts';

export interface CollectorConfig {
  apiKey: string;
  platform: string;
  region: string;
  tiers: string[];
  targetMatches: number;
  queueId: number;
  ratePerSec: number;
  ratePer2Min: number;
}

const PLATFORM_TO_REGION: Record<string, string> = {
  jp1: 'asia',
  kr: 'asia',
  na1: 'americas',
  br1: 'americas',
  la1: 'americas',
  la2: 'americas',
  euw1: 'europe',
  eun1: 'europe',
  tr1: 'europe',
  ru: 'europe',
  me1: 'europe',
  oc1: 'sea',
  ph2: 'sea',
  sg2: 'sea',
  th2: 'sea',
  tw2: 'sea',
  vn2: 'sea',
};

export function platformToRegion(platform: string): string {
  const normalized = platform.trim().toLowerCase();
  return PLATFORM_TO_REGION[normalized] ?? 'asia';
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 10) {
    return '***';
  }
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}

/**
 * Loads key=value pairs from .env without overwriting existing process.env values.
 */
export function loadDotEnv(envPath: string = ENV_PATH): void {
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadCollectorConfig(envPath: string = ENV_PATH): CollectorConfig {
  loadDotEnv(envPath);

  const platform = (process.env.RIOT_PLATFORM ?? 'jp1').trim().toLowerCase();
  const region = (process.env.RIOT_REGION ?? platformToRegion(platform)).trim().toLowerCase();
  const rawTiers = process.env.COLLECT_TIERS ?? 'EMERALD,DIAMOND,MASTER,GRANDMASTER,CHALLENGER';
  const tiers = rawTiers
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  return {
    apiKey: (process.env.RIOT_API_KEY ?? '').trim(),
    platform,
    region,
    tiers: tiers.length > 0 ? tiers : ['EMERALD', 'DIAMOND', 'MASTER'],
    targetMatches: parsePositiveInt(process.env.COLLECT_TARGET_MATCHES, 300),
    queueId: parsePositiveInt(process.env.COLLECT_QUEUE_ID, 420),
    ratePerSec: parsePositiveInt(process.env.RIOT_RATE_PER_SEC, 18),
    ratePer2Min: parsePositiveInt(process.env.RIOT_RATE_PER_2MIN, 95),
  };
}
