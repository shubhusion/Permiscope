import { createHash } from 'crypto';
import { GatewayResult } from './ExecutionGateway';

interface CacheEntry {
  result: GatewayResult;
  storedAt: number;
}

/**
 * Bounded, TTL'd replay cache for side-effecting requests. Keys are hashed so
 * bearer tokens never appear in memory as part of a cache key. Concurrent
 * duplicates share one in-flight execution.
 */
export class IdempotencyCache {
  private entries = new Map<string, CacheEntry>();
  private pending = new Map<string, Promise<GatewayResult>>();

  constructor(
    private readonly maxEntries: number = 1000,
    private readonly ttlMs: number = 3_600_000,
  ) {}

  private cacheKey(principal: string, key: string): string {
    return createHash('sha256').update(`${principal}\u0000${key}`).digest('hex');
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [cacheKey, entry] of this.entries) {
      if (now - entry.storedAt >= this.ttlMs) this.entries.delete(cacheKey);
    }
  }

  async get(principal: string, key: string): Promise<GatewayResult | undefined> {
    this.purgeExpired();
    const entry = this.entries.get(this.cacheKey(principal, key));
    return entry ? { ...entry.result, replayed: true } : undefined;
  }

  async set(principal: string, key: string, result: GatewayResult): Promise<void> {
    const cacheKey = this.cacheKey(principal, key);
    this.entries.delete(cacheKey);
    this.entries.set(cacheKey, { result: { ...result }, storedAt: Date.now() });

    // Evict the oldest entries while over the bound (Map preserves insertion order).
    this.purgeExpired();
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  /** Returns a cached result, an in-flight result, or computes and caches once. */
  async getOrCompute(
    principal: string,
    key: string,
    compute: () => Promise<GatewayResult>,
  ): Promise<GatewayResult> {
    const cached = await this.get(principal, key);
    if (cached) return cached;

    const cacheKey = this.cacheKey(principal, key);
    const inFlight = this.pending.get(cacheKey);
    if (inFlight) return inFlight;

    const promise = compute()
      .then(async (result) => {
        await this.set(principal, key, result);
        return result;
      })
      .finally(() => {
        this.pending.delete(cacheKey);
      });
    this.pending.set(cacheKey, promise);
    return promise;
  }

  async clear(): Promise<void> {
    this.entries.clear();
    this.pending.clear();
  }

  get size(): number {
    this.purgeExpired();
    return this.entries.size;
  }
}
