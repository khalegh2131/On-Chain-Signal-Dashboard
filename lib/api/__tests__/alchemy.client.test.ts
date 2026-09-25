import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getNativeBalance,
  getNftsForOwner,
  getTokenBalances,
  getTokenMetadataBatch
} from '@/lib/api/alchemy.client';
import { RateLimitError, UpstreamError } from '@/lib/api/errors';
import { CHAIN_METADATA } from '@/config/chains';

const ETHEREUM = CHAIN_METADATA[1]!;
const OWNER = '0x1111111111111111111111111111111111111111' as const;
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const;

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

function rpcResult<T>(result: T): Response {
  return json({ jsonrpc: '2.0', id: 1, result });
}

/** A test-only key so the client takes its authenticated path without a real credential. */
const TEST_KEY = 'test-key-not-a-credential';

describe('alchemy client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  });

  it('posts eth_getBalance to the Alchemy RPC host when a key is configured', async () => {
    process.env.NEXT_PUBLIC_ALCHEMY_API_KEY = TEST_KEY;
    const fetchMock = stubFetch(() => rpcResult('0x14d1120d7b160000'));

    const balance = await getNativeBalance(OWNER, ETHEREUM);

    expect(balance).toBe(1_500_000_000_000_000_000n);
    const call = fetchMock.mock.calls[0];
    expect(
      String(requestUrl(call?.[0])).startsWith(`https://eth-mainnet.g.alchemy.com/v2/${TEST_KEY}`)
    ).toBe(true);
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getBalance',
      params: [OWNER, 'latest']
    });
  });

  it('falls back to the chain public RPC when no key is configured', async () => {
    const fetchMock = stubFetch(() => rpcResult('0x0'));

    const balance = await getNativeBalance(OWNER, ETHEREUM);

    expect(balance).toBe(0n);
    expect(new URL(requestUrl(fetchMock.mock.calls[0]?.[0])).hostname).toBe(
      new URL(ETHEREUM.publicRpcUrl).hostname
    );
  });

  it('reports an Alchemy-only method as a configuration problem on a keyless endpoint', async () => {
    stubFetch(() =>
      json({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'the method does not exist' } })
    );

    const error: unknown = await getTokenBalances(OWNER, ETHEREUM).catch(
      (reason: unknown) => reason
    );

    expect(error).toBeInstanceOf(UpstreamError);
    expect((error as UpstreamError).message).toContain('NEXT_PUBLIC_ALCHEMY_API_KEY');
    expect((error as UpstreamError).status).toBe(501);
  });

  it('chunks a large contract list into separate batched calls', async () => {
    process.env.NEXT_PUBLIC_ALCHEMY_API_KEY = TEST_KEY;
    const addresses = Array.from(
      { length: 150 },
      (_, index) => `0x${index.toString(16).padStart(40, '0')}` as `0x${string}`
    );
    const fetchMock = stubFetch((_url, init) => {
      const body = JSON.parse(String(init?.body)) as { params: [string, string[]] };
      return rpcResult({
        address: OWNER,
        tokenBalances: body.params[1].map((contractAddress) => ({
          contractAddress,
          tokenBalance: '0x1'
        }))
      });
    });

    const balances = await getTokenBalances(OWNER, ETHEREUM, addresses);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(balances).toHaveLength(150);
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      params: [string, string[]];
    };
    expect(secondBody.params[1]).toHaveLength(50);
  });

  it('sends token metadata as one JSON-RPC batch and keys it by lowercased address', async () => {
    process.env.NEXT_PUBLIC_ALCHEMY_API_KEY = TEST_KEY;
    const fetchMock = stubFetch(() =>
      json([
        {
          jsonrpc: '2.0',
          id: 1,
          result: { symbol: 'USDC', name: 'USD Coin', decimals: 6, logo: null }
        },
        { jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'not a contract' } }
      ])
    );

    const metadata = await getTokenMetadataBatch([USDC, '0xdead' as `0x${string}`], ETHEREUM);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Array.isArray(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)))).toBe(true);
    expect(metadata.get(USDC)).toEqual({
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      logo: null
    });
    // The reverted entry is skipped rather than failing the whole batch.
    expect(metadata.size).toBe(1);
  });

  it('refuses to read NFTs without a key instead of returning an empty gallery', async () => {
    const fetchMock = stubFetch(() => json({ ownedNfts: [], totalCount: 0 }));

    const error: unknown = await getNftsForOwner(OWNER, ETHEREUM).catch(
      (reason: unknown) => reason
    );

    expect(error).toBeInstanceOf(UpstreamError);
    expect((error as UpstreamError).message).toContain('NEXT_PUBLIC_ALCHEMY_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the NFT API v3 path with the real query parameters', async () => {
    process.env.NEXT_PUBLIC_ALCHEMY_API_KEY = TEST_KEY;
    const fetchMock = stubFetch(() =>
      json({ ownedNfts: [{ tokenId: '1' }], totalCount: 1, pageKey: 'next-page' })
    );

    const page = await getNftsForOwner(OWNER, ETHEREUM, { pageSize: 24, pageKey: 'cursor-1' });

    const href = requestUrl(fetchMock.mock.calls[0]?.[0]);
    expect(
      href.startsWith(`https://eth-mainnet.g.alchemy.com/nft/v3/${TEST_KEY}/getNFTsForOwner?`)
    ).toBe(true);
    expect(href).toContain(`owner=${OWNER}`);
    expect(href).toContain('withMetadata=true');
    expect(href).toContain('pageSize=24');
    expect(href).toContain('pageKey=cursor-1');
    expect(page.pageKey).toBe('next-page');
  });

  it('honours Retry-After and recovers on the next attempt', async () => {
    process.env.NEXT_PUBLIC_ALCHEMY_API_KEY = TEST_KEY;
    let attempts = 0;
    const fetchMock = stubFetch(() => {
      attempts += 1;
      return attempts === 1 ? json({}, 429, { 'retry-after': '1' }) : rpcResult('0x1234');
    });

    const pending = getNativeBalance(OWNER, ETHEREUM);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe(0x1234n);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('backs off exponentially without a Retry-After hint', async () => {
    process.env.NEXT_PUBLIC_ALCHEMY_API_KEY = TEST_KEY;
    let attempts = 0;
    const fetchMock = stubFetch(() => {
      attempts += 1;
      return attempts <= 2 ? json({}, 503) : rpcResult('0xabc');
    });

    const pending = getNativeBalance(OWNER, ETHEREUM);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // First retry is base 300ms with jitter shaving at most 25% off.
    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toBe(0xabcn);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up as a RateLimitError once the attempt budget is spent', async () => {
    process.env.NEXT_PUBLIC_ALCHEMY_API_KEY = TEST_KEY;
    const fetchMock = stubFetch(() => json({}, 429));

    const pending = getNativeBalance(OWNER, ETHEREUM);
    const rejection = expect(pending).rejects.toBeInstanceOf(RateLimitError);

    await vi.advanceTimersByTimeAsync(60_000);
    await rejection;

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const error: unknown = await pending.catch((reason: unknown) => reason);
    expect((error as RateLimitError).code).toBe('rate_limited');
  });

  it('does not retry a failure the upstream described as permanent', async () => {
    process.env.NEXT_PUBLIC_ALCHEMY_API_KEY = TEST_KEY;
    const fetchMock = stubFetch(() => json({ message: 'bad request' }, 400));

    await expect(getNativeBalance(OWNER, ETHEREUM)).rejects.toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
