import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

// Works identically regardless of CWD or drive letter.
export const PROJECT_ROOT = path.resolve(currentDir, '..', '..');
export const CONFIG_DIR = path.join(PROJECT_ROOT, 'config');
export const STATS_FEED_CONFIG_PATH = path.join(CONFIG_DIR, 'stats-feed.json');
export const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
export const CREDENTIALS_DIR = path.join(PROJECT_ROOT, 'credentials');
export const DEFAULT_VERTEX_SA_PATH = path.join(CREDENTIALS_DIR, 'vertex-sa.json');
export const DATA_DIR = path.join(PROJECT_ROOT, 'data');
export const DDRAGON_DIR = path.join(DATA_DIR, 'ddragon');
export const DDRAGON_LATEST_PATH = path.join(DDRAGON_DIR, 'latest.json');
export const STATS_DIR = path.join(DATA_DIR, 'stats');
export const STATS_LATEST_PATH = path.join(STATS_DIR, 'stats-latest.json');
export const RAW_DIR = path.join(DATA_DIR, 'raw');
export const USER_DIR = path.join(DATA_DIR, 'user');
export const POOL_PATH = path.join(USER_DIR, 'pool.json');
export const PRESETS_PATH = path.join(USER_DIR, 'presets.json');
export const SETTINGS_PATH = path.join(USER_DIR, 'settings.json');
export const ENV_PATH = path.join(PROJECT_ROOT, '.env');
