import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CacheMissError } from '@/lib/api/errors';
import { TtlCache, cache, createCache } from '@/lib/services/cache.service';

/** Private store per test so cases cannot see each other's keys. */
function isolatedCache(maxEntries?: number): TtlCache {
  return new TtlCache(
    maxEntries === undefined ? { store: new Map() } : { store: new Map(), maxEntries }
  );
}

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves an entry until its ttl elapses, then drops it', () => {
    const store = isolatedCache();

    store.set('eth', { price: 2_000 }, 1_000);
    expect(store.get('eth')).toEqual({ price: 2_000 });

    vi.advanceTimersByTime(999);
    expect(store.has('eth')).toBe(true);

    vi.advanceTimersByTime(1);
    expect(store.get('eth')).toBeUndefined();
    expect(store.has('eth')).toBe(false);
    expect(store.size).toBe(0);
  });

  it('reports a miss rather than throwing, and throws only when asked to', () => {
    const store = isolatedCache();

    expect(store.get('missing')).toBeUndefined();
    expect(() => store.getOrThrow('missing')).toThrow(CacheMissError);
  });

  it('collapses concurrent loads of one key into a single loader call', async () => {
    const store = isolatedCache();
    let resolveLoader: (value: number) => void = () => {};
    const loader = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveLoader = resolve;
        })
    );

    const first = store.getOrSet('stampede', loader, 1_000);
    const second = store.getOrSet('stampede', loader, 1_000);
    const third = store.getOrSet('stampede', loader, 1_000);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(store.stats().dedupes).toBe(2);

    resolveLoader(42);
    await expect(Promise.all([first, second, third])).resolves.toEqual([42, 42, 42]);
    expect(store.get('stampede')).toBe(42);
  });

  it('does not cache a rejected load and lets the next caller retry', async () => {
    const store = isolatedCache();
    const failing = vi.fn().mockRejectedValue(new Error('upstream down'));
    const succeeding = vi.fn().mockResolvedValue('recovered');

    await expect(store.getOrSet('flaky', failing)).rejects.toThrow('upstream down');
    expect(store.has('flaky')).toBe(false);

    await expect(store.getOrSet('flaky', succeeding)).resolves.toBe('recovered');
    expect(succeeding).toHaveBeenCalledTimes(1);
  });

  it('invalidates a single key and a whole prefix', () => {
    const store = isolatedCache();

    store.set('prices:eth', 1);
    store.set('prices:arb', 2);
    store.set('nfts:1', 3);

    expect(store.invalidate('prices:eth')).toBe(true);
    expect(store.invalidate('prices:eth')).toBe(false);
    expect(store.invalidatePrefix('prices:')).toBe(1);
    expect(store.has('prices:arb')).toBe(false);
    expect(store.has('nfts:1')).toBe(true);
    expect(store.size).toBe(1);
  });

  it('evicts the least recently used entry once the cap is exceeded', () => {
    const store = isolatedCache(2);

    store.set('a', 1);
    store.set('b', 2);
    store.get('a');
    store.set('c', 3);

    expect(store.stats().evictions).toBe(1);
    expect(store.has('b')).toBe(false);
    expect(store.has('a')).toBe(true);
    expect(store.size).toBe(2);
  });

  it('tracks hits, misses and the resulting hit rate', () => {
    const store = isolatedCache();

    store.set('eth', 1);
    store.get('eth');
    store.get('eth');
    store.get('missing');

    const stats = store.stats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.sets).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3, 10);
  });

  it('namespaces keys so a prefixed cache and the shared cache compose', () => {
    const prices = createCache('prices');

    prices.set('eth', 1);

    expect(prices.get('eth')).toBe(1);
    expect(cache.get('eth')).toBeUndefined();
    expect(prices.stats().size).toBe(1);

    // The root cache owns the store, so it can drop the namespace in one call.
    expect(cache.invalidatePrefix('prices:')).toBe(1);
    expect(prices.has('eth')).toBe(false);
  });
});
