import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RateLimitError } from '@/lib/api/errors';
import {
  coinGeckoCache,
  getHistoricalPrices,
  getSimplePrices,
  getTokenPrices
} from '@/lib/api/coingecko.client';

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const DAI = '0x6b175474e89094c44da98b954eedeac495271d0f';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
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

/** The request the client actually issued, as a URL string plus its headers. */
function inspect(mock: ReturnType<typeof stubFetch>, index = 0) {
  const call = mock.mock.calls[index];
  if (!call) throw new Error(`fetch call ${index} never happened`);
  return {
    href: requestUrl(call[0]),
    headers: (call[1]?.headers ?? {}) as Record<string, string>
  };
}

/** Each test starts an hour later so a slot reserved by the previous one is in the past. */
let clock = Date.parse('2026-01-01T00:00:00.000Z');

describe('coingecko client', () => {
  beforeEach(() => {
    clock += 60 * 60 * 1_000;
    vi.useFakeTimers();
    vi.setSystemTime(clock);
    coinGeckoCache.clear();
    delete process.env.COINGECKO_API_KEY;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.COINGECKO_API_KEY;
  });

  it('requests real contract prices from the public tier when no key is set', async () => {
    const fetchMock = stubFetch(() =>
      json({ [USDC]: { usd: 1.0001, usd_24h_change: -0.02, usd_market_cap: 32_000_000_000 } })
    );

    const prices = await getTokenPrices('ethereum', [USDC]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { href, headers } = inspect(fetchMock);

    expect(href.startsWith('https://api.coingecko.com/api/v3/simple/token_price/ethereum?')).toBe(
      true
    );
    expect(href).toContain(`contract_addresses=${USDC}`);
    expect(href).toContain('vs_currencies=usd');
    expect(href).toContain('include_24hr_change=true');
    expect(href).toContain('include_market_cap=true');
    expect(headers['x-cg-demo-api-key']).toBeUndefined();
    expect(headers['x-cg-pro-api-key']).toBeUndefined();

    expect(prices[USDC]).toEqual({
      usd: 1.0001,
      change24h: -0.02,
      marketCap: 32_000_000_000,
      source: 'coingecko',
      updatedAt: expect.any(Number)
    });
  });

  it('routes a CG- key to the Pro host with the Pro header', async () => {
    process.env.COINGECKO_API_KEY = 'CG-test-key-not-a-credential';
    const fetchMock = stubFetch(() => json({ [DAI]: { usd: 0.9998 } }));

    await getTokenPrices('ethereum', [DAI]);

    const { href, headers } = inspect(fetchMock);
    expect(href.startsWith('https://pro-api.coingecko.com/api/v3/')).toBe(true);
    expect(headers['x-cg-pro-api-key']).toBe('CG-test-key-not-a-credential');
  });

  it('sends a Demo key on the public host as a demo header', async () => {
    process.env.COINGECKO_API_KEY = 'test-demo-key-not-a-credential';
    const fetchMock = stubFetch(() => json({ [DAI]: { usd: 0.9998 } }));

    await getTokenPrices('ethereum', [DAI]);

    const { href, headers } = inspect(fetchMock);
    expect(href.startsWith('https://api.coingecko.com/api/v3/')).toBe(true);
    expect(headers['x-cg-demo-api-key']).toBe('test-demo-key-not-a-credential');
  });

  it('surfaces a 429 as a RateLimitError carrying the Retry-After window', async () => {
    const fetchMock = stubFetch(() => json({}, 429, { 'retry-after': '2' }));

    const error: unknown = await getTokenPrices('ethereum', [USDC]).catch(
      (reason: unknown) => reason
    );

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error).toMatchObject({ code: 'rate_limited', status: 429, retryAfterMs: 2_000 });
    expect((error as RateLimitError).message).toContain('30 requests per minute');
    // No retry loop for CoinGecko: a throttled free tier only gets worse with a second burst.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('explains a rejected key instead of reporting a bare 401', async () => {
    process.env.COINGECKO_API_KEY = 'CG-test-key-not-a-credential';
    stubFetch(() => json({ status: { error_code: 10002 } }, 401));

    const error: unknown = await getTokenPrices('ethereum', [USDC]).catch(
      (reason: unknown) => reason
    );

    expect((error as Error).message).toContain('COINGECKO_API_KEY');
    expect((error as Error).message).toContain('401');
  });

  it('spaces queued requests by the configured gap', async () => {
    const startedAt: number[] = [];
    const fetchMock = stubFetch((url) => {
      startedAt.push(Date.now());
      return json(url.includes(USDC) ? { [USDC]: { usd: 1 } } : { [DAI]: { usd: 1 } });
    });

    const first = getTokenPrices('ethereum', [USDC]);
    const second = getTokenPrices('ethereum', [DAI]);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(299);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await Promise.all([first, second]);
    expect(startedAt[1]! - startedAt[0]!).toBeGreaterThanOrEqual(300);
  });

  it('serves a repeated read from the cache without a second request', async () => {
    const fetchMock = stubFetch(() => json({ [USDC]: { usd: 1.0002 } }));

    const first = await getTokenPrices('ethereum', [USDC]);
    const second = await getTokenPrices('ethereum', [USDC]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(coinGeckoCache.stats().hits).toBeGreaterThan(0);
  });

  it('re-reads once the cached entry expires', async () => {
    const fetchMock = stubFetch(() => json({ [USDC]: { usd: 1 } }));

    await getTokenPrices('ethereum', [USDC], 'usd', { ttlMs: 1_000 });
    await getTokenPrices('ethereum', [USDC], 'usd', { ttlMs: 1_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_001);
    await vi.advanceTimersByTimeAsync(0);
    await getTokenPrices('ethereum', [USDC], 'usd', { ttlMs: 1_000 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('prices coin ids through /simple/price and keeps the id as the key', async () => {
    stubFetch(() =>
      json({ ethereum: { usd: 2_400, usd_24h_change: 1.5, last_updated_at: 1_760_000_000 } })
    );

    const quotes = await getSimplePrices(['ethereum']);

    expect(quotes.ethereum).toEqual({
      coinGeckoId: 'ethereum',
      price: 2_400,
      currency: 'usd',
      change24h: 1.5,
      marketCap: undefined,
      lastUpdated: 1_760_000_000_000
    });
  });

  it('normalises a market chart into timestamped points', async () => {
    stubFetch(() =>
      json({
        prices: [
          [1_760_000_000_000, 2_400],
          [1_760_086_400_000, 2_450]
        ]
      })
    );

    const points = await getHistoricalPrices('ethereum', 7);

    expect(points).toEqual([
      { timestamp: 1_760_000_000_000, price: 2_400 },
      { timestamp: 1_760_086_400_000, price: 2_450 }
    ]);
  });

  it('returns an empty map when the upstream knows none of the contracts', async () => {
    stubFetch(() => json({}));

    await expect(getTokenPrices('ethereum', [USDC])).resolves.toEqual({});
  });
});
