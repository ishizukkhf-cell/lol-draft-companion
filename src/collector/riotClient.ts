import { RiotRateLimiter } from './rateLimiter.ts';

export interface LeagueEntryDto {
  leagueId?: string;
  summonerId?: string;
  puuid?: string;
  tier?: string;
  rank?: string;
  leaguePoints: number;
}

export interface LeagueListDto {
  tier: string;
  entries: LeagueEntryDto[];
}

export interface SummonerDto {
  id: string;
  puuid: string;
}

export interface MatchParticipantDto {
  puuid: string;
  teamId: number;
  championId: number;
  teamPosition: string;
  individualPosition: string;
  win: boolean;
  gameEndedInEarlySurrender?: boolean;
  summoner1Id: number;
  summoner2Id: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  perks?: {
    statPerks?: {
      offense: number;
      flex: number;
      defense: number;
    };
    styles?: Array<{
      description: string;
      style: number;
      selections: Array<{
        perk: number;
      }>;
    }>;
  };
}

export interface MatchDto {
  metadata: {
    matchId: string;
  };
  info: {
    gameVersion: string;
    queueId: number;
    gameDuration: number;
    teams: Array<{
      teamId: number;
      win: boolean;
      bans: Array<{
        championId: number;
        pickTurn: number;
      }>;
    }>;
    participants: MatchParticipantDto[];
  };
}

export class RiotApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RiotApiError';
    this.status = status;
  }
}

export interface RiotClientOptions {
  apiKey: string;
  platform: string;
  region: string;
  rateLimiter: RiotRateLimiter;
}

export class RiotApiClient {
  private readonly apiKey: string;
  private readonly platformBase: string;
  private readonly regionBase: string;
  private readonly rateLimiter: RiotRateLimiter;

  constructor(options: RiotClientOptions) {
    this.apiKey = options.apiKey;
    this.platformBase = `https://${options.platform}.api.riotgames.com`;
    this.regionBase = `https://${options.region}.api.riotgames.com`;
    this.rateLimiter = options.rateLimiter;
  }

  private async request<T>(url: string, attempt = 0): Promise<T> {
    await this.rateLimiter.acquire();

    const response = await fetch(url, {
      headers: {
        'X-Riot-Token': this.apiKey,
      },
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    if (response.status === 401 || response.status === 403) {
      throw new RiotApiError(
        `Riot API 認証エラー (${response.status}): API キーが無効または期限切れです。.env の RIOT_API_KEY を確認してください。`,
        response.status,
      );
    }

    if (response.status === 429 && attempt < 4) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterSec = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : 5;
      this.rateLimiter.notifyRetryAfter(Number.isFinite(retryAfterSec) ? retryAfterSec : 5);
      return this.request<T>(url, attempt + 1);
    }

    if (response.status >= 500 && attempt < 3) {
      const backoffMs = 500 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      return this.request<T>(url, attempt + 1);
    }

    throw new RiotApiError(`Riot API リクエスト失敗 (${response.status}): ${url}`, response.status);
  }

  async getApexLeague(
    tier: 'CHALLENGER' | 'GRANDMASTER' | 'MASTER',
    queue = 'RANKED_SOLO_5x5',
  ): Promise<LeagueListDto> {
    const endpoint =
      tier === 'CHALLENGER'
        ? 'challengerleagues'
        : tier === 'GRANDMASTER'
          ? 'grandmasterleagues'
          : 'masterleagues';
    return this.request<LeagueListDto>(
      `${this.platformBase}/lol/league/v4/${endpoint}/by-queue/${queue}`,
    );
  }

  async getLeagueEntries(
    tier: string,
    division: 'I' | 'II' | 'III' | 'IV' = 'I',
    page = 1,
    queue = 'RANKED_SOLO_5x5',
  ): Promise<LeagueEntryDto[]> {
    return this.request<LeagueEntryDto[]>(
      `${this.platformBase}/lol/league/v4/entries/${queue}/${tier}/${division}?page=${page}`,
    );
  }

  async getSummonerById(summonerId: string): Promise<SummonerDto> {
    return this.request<SummonerDto>(
      `${this.platformBase}/lol/summoner/v4/summoners/${encodeURIComponent(summonerId)}`,
    );
  }

  async getMatchIdsByPuuid(
    puuid: string,
    options: { queue?: number; start?: number; count?: number; startTime?: number } = {},
  ): Promise<string[]> {
    const params = new URLSearchParams();
    if (options.queue !== undefined) params.set('queue', String(options.queue));
    if (options.start !== undefined) params.set('start', String(options.start));
    if (options.count !== undefined) params.set('count', String(options.count));
    if (options.startTime !== undefined) params.set('startTime', String(options.startTime));

    return this.request<string[]>(
      `${this.regionBase}/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params.toString()}`,
    );
  }

  async getMatch(matchId: string): Promise<MatchDto> {
    return this.request<MatchDto>(
      `${this.regionBase}/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
    );
  }
}
