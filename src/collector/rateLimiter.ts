export interface RateLimiterOptions {
  shortLimit?: number;
  shortWindowMs?: number;
  longLimit?: number;
  longWindowMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Dual-window token/timestamp rate limiter aligned with Riot API limits.
 */
export class RiotRateLimiter {
  private readonly shortLimit: number;
  private readonly shortWindowMs: number;
  private readonly longLimit: number;
  private readonly longWindowMs: number;
  private readonly now: () => number;
  private readonly sleepFn: (ms: number) => Promise<void>;

  private readonly shortTimestamps: number[] = [];
  private readonly longTimestamps: number[] = [];
  private blockedUntil = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: RateLimiterOptions = {}) {
    this.shortLimit = options.shortLimit ?? 18;
    this.shortWindowMs = options.shortWindowMs ?? 1_050;
    this.longLimit = options.longLimit ?? 95;
    this.longWindowMs = options.longWindowMs ?? 122_000;
    this.now = options.now ?? (() => Date.now());
    this.sleepFn = options.sleep ?? defaultSleep;
  }

  /**
   * Pauses subsequent acquire() calls when Riot responds with HTTP 429 Retry-After.
   */
  notifyRetryAfter(seconds: number): void {
    const waitMs = Math.max(1, seconds) * 1_000 + 150;
    const target = this.now() + waitMs;
    if (target > this.blockedUntil) {
      this.blockedUntil = target;
    }
  }

  async acquire(): Promise<void> {
    const next = this.queue.then(() => this.waitForSlot());
    this.queue = next.catch(() => undefined);
    return next;
  }

  private prune(currentTime: number): void {
    while (
      this.shortTimestamps.length > 0 &&
      currentTime - this.shortTimestamps[0] >= this.shortWindowMs
    ) {
      this.shortTimestamps.shift();
    }
    while (
      this.longTimestamps.length > 0 &&
      currentTime - this.longTimestamps[0] >= this.longWindowMs
    ) {
      this.longTimestamps.shift();
    }
  }

  private async waitForSlot(): Promise<void> {
    while (true) {
      const current = this.now();
      if (current < this.blockedUntil) {
        await this.sleepFn(this.blockedUntil - current);
        continue;
      }

      this.prune(current);

      let waitMs = 0;
      if (this.shortTimestamps.length >= this.shortLimit) {
        waitMs = Math.max(waitMs, this.shortTimestamps[0] + this.shortWindowMs - current + 10);
      }
      if (this.longTimestamps.length >= this.longLimit) {
        waitMs = Math.max(waitMs, this.longTimestamps[0] + this.longWindowMs - current + 10);
      }

      if (waitMs > 0) {
        await this.sleepFn(waitMs);
        continue;
      }

      const stamped = this.now();
      this.shortTimestamps.push(stamped);
      this.longTimestamps.push(stamped);
      return;
    }
  }
}
