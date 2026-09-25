import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { coinGeckoCache } from '@/lib/api/coingecko.client';
import { CHAIN_METADATA } from '@/config/chains';
import {
  fetchNativePrices,
  fetchPriceHistory,
  fetchTokenPrices,
  priceKey
} from '@/lib/services/price.service';
import { NATIVE_TOKEN_ADDRESS } from '@/types';

/** Lowercase form, which is also the key the price map uses. */
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

/** Mixed-case (checksummed) form of the same contract, to prove keys are normalised. */
const USDC_CHECKSUMMED = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function requestUrl(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (typeof input === 'object' && input !== null && 'url' in input) {
    return String((input as { url: unknown }).url);
  }
  return String(input);
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const mock = vi.fn((input: unknown, init?: RequestInit) =>
    Promise.resolve(handler(requestUrl(input), init))
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** Deterministic token addresses so each case gets distinct cache keys. */
function tokenAddress(index: number): string {
  return `0x${(index + 1).toString(16).padStart(40, '0')}`;
}

let clock = Date.parse('2026-01-01T00:00:00.000Z');

describe('price service', () => {
  beforeEach(() => {
    clock += 60 * 60 * 1_000;
    vi.useFakeTimers();
    vi.setSystemTime(clock);
    coinGeckoCache.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns CoinGecko quotes keyed by lowercased contract address', async () => {
    stubFetch(() =>
      json({ [USDC]: { usd: 1.0002, usd_24h_change: -0.01, usd_market_cap: 32_100_000_000 } })
    );

    const prices = await fetchTokenPrices([{ address: USDC_CHECKSUMMED, chainId: 1 }]);

    expect(prices[USDC]).toEqual({
      usd: 1.0002,
      change24h: -0.01,
      marketCap: 32_100_000_000,
      source: 'coingecko',
      updatedAt: expect.any(Number)
    });
  });

  it('falls back to a zero quote when the price feed is throttled, without throwing', async () => {
    stubFetch(() => json({}, 429));

    const prices = await fetchTokenPrices([{ address: USDC, chainId: 1 }]);

    expect(prices[USDC]).toMatchObject({ usd: 0, source: 'fallback' });
  });

  it('splits more than fifty contracts into two requests', async () => {
    const targets = Array.from({ length: 60 }, (_, index) => ({
      address: tokenAddress(index),
      chainId: 1
    }));

    const fetchMock = stubFetch((url) => {
      const requested = new URL(url).searchParams.get('contract_addresses')?.split(',') ?? [];
      return json(Object.fromEntries(requested.map((address) => [address, { usd: 5 }])));
    });

    const pending = fetchTokenPrices(targets);
    await vi.advanceTimersByTimeAsync(1_000);
    const prices = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBatch = new URL(requestUrl(fetchMock.mock.calls[0]?.[0])).searchParams.get(
      'contract_addresses'
    );
    expect(firstBatch?.split(',')).toHaveLength(50);
    expect(Object.keys(prices)).toHaveLength(60);
    expect(prices[tokenAddress(59)]).toMatchObject({ usd: 5, source: 'coingecko' });
  });

  it('prices the native gas token through /simple/price under a per-chain key', async () => {
    const fetchMock = stubFetch(() =>
      json({ ethereum: { usd: 2_400, usd_24h_change: 1.5, usd_market_cap: 288_000_000_000 } })
    );

    const prices = await fetchNativePrices([CHAIN_METADATA[1]!]);

    expect(requestUrl(fetchMock.mock.calls[0]?.[0])).toContain('/simple/price?ids=ethereum');
    expect(prices[priceKey(NATIVE_TOKEN_ADDRESS, 1)]).toMatchObject({
      usd: 2_400,
      change24h: 1.5,
      source: 'coingecko'
    });
  });

  it('leaves a testnet token unpriced, since CoinGecko indexes no testnet platform', async () => {
    const fetchMock = stubFetch(() => json({ [USDC]: { usd: 1 } }));

    const prices = await fetchTokenPrices([{ address: USDC, chainId: 11155111 }]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prices[priceKey(USDC, 11155111)]).toMatchObject({ usd: 0, source: 'fallback' });
  });

  it('normalises a price history series', async () => {
    stubFetch(() =>
      json({
        prices: [
          [1_760_000_000_000, 2_400],
          [1_760_086_400_000, 2_450]
        ]
      })
    );

    const series = await fetchPriceHistory('ethereum', 7);

    expect(series).toMatchObject({
      coinId: 'ethereum',
      days: 7,
      currency: 'usd',
      source: 'coingecko'
    });
    expect(series.points).toHaveLength(2);
    expect(series.points[1]).toEqual({ timestamp: 1_760_086_400_000, price: 2_450 });
  });

  it('returns an empty, flagged series when history cannot be read', async () => {
    stubFetch(() => json({}, 500));

    const series = await fetchPriceHistory('ethereum', 30);

    expect(series.points).toEqual([]);
    expect(series.source).toBe('fallback');
  });
});
