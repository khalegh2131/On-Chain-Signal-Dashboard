import { CacheMissError } from '@/lib/api/errors';

/** Freshness window applied when a caller does not pick one. */
const DEFAULT_TTL_MS = 60_000;

/** Hard cap on live entries, applied to the store the instance writes into. */
const DEFAULT_MAX_ENTRIES = 2_000;

/** Debug tracing is noise in production logs, where the cache is opaque anyway. */
const TRACE_ENABLED = process.env.NODE_ENV !== 'production';

interface CacheEntry<T> {
  value: T;
  /** Epoch milliseconds after which the entry is dead. */
  expiresAt: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  /** Concurrent loads of one key that shared an in-flight promise. */
  dedupes: number;
  /** Live entries visible to this instance. */
  size: number;
  /** `hits / (hits + misses)`, or `0` before the first read. */
  hitRate: number;
}

export interface TtlCacheOptions {
  /** Key prefix applied to every call, so unrelated features share one store safely. */
  prefix?: string;
  maxEntries?: number;
  /** Backing map. Instances handed the same map see each other's entries. */
  store?: Map<string, CacheEntry<unknown>>;
}

/**
 * Process-wide store shared by the default cache and every namespaced cache.
 *
 * One map instead of one per instance so a caller can drop a whole namespace
 * (`cache.invalidatePrefix('prices:')`) without holding a reference to the
 * instance that filled it.
 */
const SHARED_STORE = new Map<string, CacheEntry<unknown>>();

/**
 * In-memory TTL cache with in-flight de-duplication.
 *
 * Upstreams here are rate limited far below what a dashboard renders, so the
 * cache does double duty: it keeps repeated reads off the wire, and `getOrSet`
 * collapses concurrent loads of the same key into one request so a page with ten
 * components asking for the same price issues one call rather than ten.
 */
export class TtlCache {
  private readonly prefix: string;
  private readonly maxEntries: number;
  private readonly store: Map<string, CacheEntry<unknown>>;
  private readonly inflight = new Map<string, Promise<unknown>>();

  private hits = 0;
  private misses = 0;
  private sets = 0;
  private evictions = 0;
  private dedupes = 0;

  constructor(options: TtlCacheOptions = {}) {
    this.prefix = options.prefix ?? '';
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.store = options.store ?? SHARED_STORE;
  }

  /**
   * Read a live entry.
   *
   * Returns `undefined` for both a miss and an expired entry; use {@link has} or
   * {@link getOrThrow} when `undefined` is a meaningful value for the key.
   */
  get<T>(key: string): T | undefined {
    const qualified = this.qualify(key);
    const entry = this.store.get(qualified);

    if (!entry) {
      this.misses += 1;
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(qualified);
      this.misses += 1;
      this.trace('expired', qualified);
      return undefined;
    }

    // Re-insert so Map iteration order keeps the least recently used key first.
    this.store.delete(qualified);
    this.store.set(qualified, entry);
    this.hits += 1;
    return entry.value as T;
  }

  /** Read a live entry, or throw {@link CacheMissError} when there is none. */
  getOrThrow<T>(key: string): T {
    const value = this.get<T>(key);
    if (value === undefined) throw new CacheMissError(this.qualify(key));
    return value;
  }

  set<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
    const qualified = this.qualify(key);
    this.store.delete(qualified);
    this.store.set(qualified, { value, expiresAt: Date.now() + ttlMs });
    this.sets += 1;
    this.trace(`set ttl=${ttlMs}ms`, qualified);
    this.evictOverflow();
  }

  /** Drop one key. Returns whether a live entry was removed. */
  invalidate(key: string): boolean {
    return this.store.delete(this.qualify(key));
  }

  /** Drop every key under a prefix. Returns how many entries were removed. */
  invalidatePrefix(prefix: string): number {
    return this.dropMatching(this.qualify(prefix));
  }

  /** Whether a live entry exists, without touching hit/miss counters. */
  has(key: string): boolean {
    const qualified = this.qualify(key);
    const entry = this.store.get(qualified);
    if (!entry) return false;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(qualified);
      return false;
    }
    return true;
  }

  /**
   * Live entries visible to this instance.
   *
   * An unprefixed instance spans the shared store, so it counts entries written
   * by namespaced caches too — that is what `clear()` on it would remove.
   */
  get size(): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(this.prefix)) count += 1;
    }
    return count;
  }

  /** Remove every entry this instance can see. Returns how many were removed. */
  clear(): number {
    const removed = this.dropMatching(this.prefix);
    this.inflight.clear();
    return removed;
  }

  /**
   * Read through the cache, loading on a miss.
   *
   * Concurrent callers for the same key share one in-flight promise, so a burst
   * of components requesting the same price produces a single upstream call. A
   * rejected load is never cached, and the entry stays cold for the next caller.
   */
  async getOrSet<T>(
    key: string,
    loader: () => Promise<T>,
    ttlMs: number = DEFAULT_TTL_MS
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const qualified = this.qualify(key);
    const pending = this.inflight.get(qualified) as Promise<T> | undefined;
    if (pending) {
      this.dedupes += 1;
      this.trace('dedupe', qualified);
      return pending;
    }

    const load = loader()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inflight.delete(qualified);
      });

    this.inflight.set(qualified, load);
    return load;
  }

  stats(): CacheStats {
    const reads = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      evictions: this.evictions,
      dedupes: this.dedupes,
      size: this.size,
      hitRate: reads === 0 ? 0 : this.hits / reads
    };
  }

  private qualify(key: string): string {
    return `${this.prefix}${key}`;
  }

  private dropMatching(prefix: string): number {
    let removed = 0;
    for (const key of Array.from(this.store.keys())) {
      if (!key.startsWith(prefix)) continue;
      this.store.delete(key);
      removed += 1;
    }
    return removed;
  }

  /** Evict least-recently-used entries until the store is back under its cap. */
  private evictOverflow(): void {
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) return;
      this.store.delete(oldest.value);
      this.evictions += 1;
      this.trace('evicted', oldest.value);
    }
  }

  private trace(message: string, key: string): void {
    if (!TRACE_ENABLED) return;
    console.debug(`[cache] ${message} ${shorten(key)}`);
  }
}

/** Keys here are usually full URLs, which would swamp the log line. */
function shorten(key: string): string {
  return key.length <= 72 ? key : `${key.slice(0, 71)}…`;
}

/** Shared instance for callers that do not need their own namespace. */
export const cache = new TtlCache();

/** Create a cache whose keys are namespaced, sharing the process-wide store. */
export function createCache(
  prefix: string,
  options: Omit<TtlCacheOptions, 'prefix'> = {}
): TtlCache {
  return new TtlCache({ ...options, prefix: normalizePrefix(prefix) });
}

/** Force a separator so `prices` and `prices:eth` never prefix-collide. */
function normalizePrefix(prefix: string): string {
  if (prefix.length === 0) return '';
  return prefix.endsWith(':') ? prefix : `${prefix}:`;
}
