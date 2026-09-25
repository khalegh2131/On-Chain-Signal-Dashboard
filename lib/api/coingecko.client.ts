import {
  COINGECKO_BASE_URL,
  COINGECKO_CONTRACT_BATCH_SIZE,
  COINGECKO_ID_BATCH_SIZE,
  COINGECKO_PRO_BASE_URL,
  COINGECKO_REQUEST_SPACING_MS
} from '@/config/constants';
import { AppError, RateLimitError, UpstreamError, toAppError } from '@/lib/api/errors';
import { fetchJsonOrThrow } from '@/lib/api/http';
import { createCache } from '@/lib/services/cache.service';
import { readEnv } from '@/lib/utils/env';
import type {
  CoinPriceMap,
  CoinPriceQuote,
  FiatCurrency,
  PriceHistoryPoint,
  PriceMap,
  TokenPrice
} from '@/types';

/** Contract prices and token metadata change slowly enough that five minutes is plenty. */
const DEFAULT_TTL_MS = 5 * 60_000;

/** `/coins/list` returns every indexed asset, so it is reused for a day. */
const COIN_LIST_TTL_MS = 24 * 60 * 60_000;

/** Coin ids priced by default when a caller does not name any. */
export const DEFAULT_NATIVE_COIN_IDS: readonly string[] = ['ethereum', 'matic-network'];

/** Shared namespace so callers can drop cached prices after a manual refresh. */
export const coinGeckoCache = createCache('coingecko');

/** The public API answers for ids and addresses with the same field names. */
interface SimplePriceEntry {
  usd?: number;
  usd_24h_change?: number;
  usd_market_cap?: number;
  eur?: number;
  eur_24h_change?: number;
  eur_market_cap?: number;
  gbp?: number;
  gbp_24h_change?: number;
  gbp_market_cap?: number;
  last_updated_at?: number;
}

type SimplePriceResponse = Record<string, SimplePriceEntry>;

interface MarketChartResponse {
  prices?: [number, number][];
}

interface CoinResponse {
  id?: string;
  symbol?: string;
  name?: string;
  image?: { large?: string; small?: string; thumb?: string } | null;
  detail_platforms?: Record<
    string,
    { contract_address?: string; decimal_place?: number } | null
  > | null;
}

interface CoinListItem {
  id?: string;
  symbol?: string;
  name?: string;
  platforms?: Record<string, string> | null;
}

/** Token identity resolved from CoinGecko, used when Alchemy metadata is unavailable. */
export interface TokenInfo {
  coinGeckoId: string;
  symbol: string;
  name: string;
  decimals?: number;
  logoUrl?: string;
  platform: string;
  contractAddress: `0x${string}`;
}

export interface CoinGeckoEndpoint {
  baseUrl: string;
  headers: Record<string, string>;
  tier: 'pro' | 'demo' | 'public';
}

/**
 * Pick the host and auth header for the configured key.
 *
 * Pro keys only authenticate against the Pro host and Demo keys only against the
 * public one, so the key shape decides the base URL; with no key at all the
 * keyless public tier still serves prices at a lower rate limit.
 */
export function resolveEndpoint(): CoinGeckoEndpoint {
  const apiKey = readEnv(process.env.COINGECKO_API_KEY);

  if (!apiKey) return { baseUrl: COINGECKO_BASE_URL, headers: {}, tier: 'public' };

  if (apiKey.startsWith('CG-')) {
    return {
      baseUrl: COINGECKO_PRO_BASE_URL,
      headers: { 'x-cg-pro-api-key': apiKey },
      tier: 'pro'
    };
  }

  return {
    baseUrl: COINGECKO_BASE_URL,
    headers: { 'x-cg-demo-api-key': apiKey },
    tier: 'demo'
  };
}

/** Start time reserved for the next request, in epoch milliseconds. */
let nextSlotAt = 0;

/** Tail of the serialized call chain; never carries a rejection. */
let queueTail: Promise<unknown> = Promise.resolve();

/**
 * Run one request after every earlier one, spaced out.
 *
 * The free tier allows roughly 30 requests per minute across the whole process,
 * so calls are serialized with a gap between them rather than fired in parallel
 * bursts — a burst earns a 429 that costs far more time than the spacing does.
 */
function schedule<T>(task: () => Promise<T>): Promise<T> {
  const startAt = Math.max(Date.now(), nextSlotAt);
  nextSlotAt = startAt + COINGECKO_REQUEST_SPACING_MS;

  const run = queueTail.then(async () => {
    await sleep(startAt - Date.now());
    return task();
  });

  // A failed call must not poison the queue for the next caller.
  queueTail = run.then(ignoreFailure, ignoreFailure);
  return run;
}

/** Cache-aware GET: one upstream call per distinct URL per TTL window. */
async function cachedGet<T>(
  path: string,
  params: Record<string, string>,
  ttlMs: number
): Promise<T> {
  const endpoint = resolveEndpoint();
  const url = new URL(`${endpoint.baseUrl}${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

  const href = url.toString();

  return coinGeckoCache.getOrSet(href, () => schedule(() => request<T>(href, endpoint)), ttlMs);
}

/** Single request, with key and throttling failures translated into guidance. */
async function request<T>(url: string, endpoint: CoinGeckoEndpoint): Promise<T> {
  try {
    return await fetchJsonOrThrow<T>(url, { headers: endpoint.headers, service: 'coingecko' });
  } catch (error) {
    throw explainFailure(error, endpoint);
  }
}

/** Replace generic upstream failures with the action a caller can actually take. */
function explainFailure(error: unknown, endpoint: CoinGeckoEndpoint): AppError {
  const failure = toAppError(error, { service: 'coingecko' });

  if (failure.status === 401 || failure.status === 403) {
    return new UpstreamError(
      'coingecko',
      failure.status,
      `CoinGecko rejected the key (${failure.status}) — check COINGECKO_API_KEY, or clear it to use the keyless tier (configured tier: ${endpoint.tier})`
    );
  }

  if (failure.code === 'rate_limited') {
    const retryAfterMs = failure instanceof RateLimitError ? failure.retryAfterMs : undefined;
    const pause =
      retryAfterMs === undefined
        ? ''
        : ` and asked for a ${Math.ceil(retryAfterMs / 1_000)}s pause`;
    return new RateLimitError(
      `CoinGecko is throttling this client${pause} — the free tier allows roughly 30 requests per minute`,
      { status: failure.status, service: 'coingecko', retryAfterMs, cause: failure }
    );
  }

  return failure;
}

/**
 * Contract prices for one CoinGecko asset platform.
 *
 * Addresses are sent in one request up to the platform's per-call cap, so a
 * wallet with thirty tokens costs one call rather than thirty.
 */
export async function getTokenPrices(
  platform: string,
  contractAddresses: readonly string[],
  vsCurrency: FiatCurrency = 'usd',
  options: { ttlMs?: number } = {}
): Promise<PriceMap> {
  const addresses = uniqueLowercased(contractAddresses);
  if (addresses.length === 0) return {};

  const batches = chunk(addresses, COINGECKO_CONTRACT_BATCH_SIZE);
  const prices: PriceMap = {};

  for (const batch of batches) {
    const payload = await cachedGet<SimplePriceResponse>(
      `/simple/token_price/${platform}`,
      {
        contract_addresses: batch.join(','),
        vs_currencies: vsCurrency,
        include_24hr_change: 'true',
        include_market_cap: 'true',
        include_last_updated_at: 'true'
      },
      options.ttlMs ?? DEFAULT_TTL_MS
    );

    for (const [address, entry] of Object.entries(payload)) {
      const usd = entry[vsCurrency];
      if (typeof usd !== 'number') continue;
      prices[address.toLowerCase()] = toTokenPrice(entry, vsCurrency, usd);
    }
  }

  return prices;
}

/** Prices for CoinGecko coin ids, e.g. `ethereum`, keyed by id. */
export async function getSimplePrices(
  coinIds: readonly string[],
  vsCurrency: FiatCurrency = 'usd',
  options: { ttlMs?: number } = {}
): Promise<CoinPriceMap> {
  const ids = Array.from(new Set(coinIds.filter((id) => id.length > 0)));
  if (ids.length === 0) return {};

  const quotes: CoinPriceMap = {};

  for (const batch of chunk(ids, COINGECKO_ID_BATCH_SIZE)) {
    const payload = await cachedGet<SimplePriceResponse>(
      '/simple/price',
      {
        ids: batch.join(','),
        vs_currencies: vsCurrency,
        include_24hr_change: 'true',
        include_market_cap: 'true',
        include_last_updated_at: 'true'
      },
      options.ttlMs ?? DEFAULT_TTL_MS
    );

    for (const [coinGeckoId, entry] of Object.entries(payload)) {
      const price = entry[vsCurrency];
      if (typeof price !== 'number') continue;
      const quote: CoinPriceQuote = {
        coinGeckoId,
        price,
        currency: vsCurrency,
        change24h: changeFor(entry, vsCurrency) ?? null,
        marketCap: marketCapFor(entry, vsCurrency),
        lastUpdated: entry.last_updated_at ? entry.last_updated_at * 1_000 : Date.now()
      };
      quotes[coinGeckoId] = quote;
    }
  }

  return quotes;
}

/** Gas-token prices for the chains the dashboard reads. */
export async function getNativePrices(
  vsCurrency: FiatCurrency = 'usd',
  coinIds: readonly string[] = DEFAULT_NATIVE_COIN_IDS,
  options: { ttlMs?: number } = {}
): Promise<CoinPriceMap> {
  return getSimplePrices(coinIds, vsCurrency, options);
}

/**
 * Historical series for one coin id.
 *
 * `interval` is only sent when a caller names one: the free tier rejects some
 * interval values, and leaving it out lets CoinGecko pick the resolution that
 * matches the requested range.
 */
export async function getHistoricalPrices(
  coinId: string,
  days: number,
  vsCurrency: FiatCurrency = 'usd',
  options: { interval?: 'hourly' | 'daily'; ttlMs?: number } = {}
): Promise<PriceHistoryPoint[]> {
  const params: Record<string, string> = {
    vs_currency: vsCurrency,
    days: String(days)
  };
  if (options.interval) params.interval = options.interval;

  const payload = await cachedGet<MarketChartResponse>(
    `/coins/${encodeURIComponent(coinId)}/market_chart`,
    params,
    options.ttlMs ?? historyTtlMs(days)
  );

  return (payload.prices ?? []).map(([timestamp, price]) => ({ timestamp, price }));
}

/**
 * Token identity for a contract address.
 *
 * The contract endpoint is authoritative but does not cover every listed token;
 * when it misses, the full coin list (cached for a day) is scanned for a platform
 * address match. Returns `null` when neither path knows the token, so callers can
 * fall back to on-chain metadata.
 */
export async function getTokenInfo(platform: string, address: string): Promise<TokenInfo | null> {
  const contractAddress = address.toLowerCase();

  try {
    const coin = await cachedGet<CoinResponse>(
      `/coins/${encodeURIComponent(platform)}/contract/${contractAddress}`,
      {},
      DEFAULT_TTL_MS
    );
    const info = toTokenInfo(coin, platform, contractAddress);
    if (info) return info;
  } catch (error) {
    const failure = toAppError(error, { service: 'coingecko' });
    // Only a miss is worth a second, far more expensive, lookup.
    if (failure.code !== 'not_found') throw failure;
  }

  const listedId = await findCoinIdByAddress(platform, contractAddress);
  if (!listedId) return null;

  const coin = await cachedGet<CoinResponse>(
    `/coins/${encodeURIComponent(listedId)}`,
    {
      localization: 'false',
      tickers: 'false',
      market_data: 'false',
      community_data: 'false',
      developer_data: 'false'
    },
    DEFAULT_TTL_MS
  );

  return toTokenInfo(coin, platform, contractAddress) ?? null;
}

/** Locate a coin id by contract address using the platform map on `/coins/list`. */
async function findCoinIdByAddress(
  platform: string,
  contractAddress: string
): Promise<string | null> {
  const coins = await cachedGet<CoinListItem[]>(
    '/coins/list',
    { include_platform: 'true' },
    COIN_LIST_TTL_MS
  );

  const match = coins.find((coin) => {
    const mapped = coin.platforms?.[platform];
    return typeof mapped === 'string' && mapped.toLowerCase() === contractAddress;
  });

  return match?.id ?? null;
}

function toTokenPrice(entry: SimplePriceEntry, currency: FiatCurrency, usd: number): TokenPrice {
  return {
    usd,
    change24h: changeFor(entry, currency),
    marketCap: marketCapFor(entry, currency),
    source: 'coingecko',
    updatedAt: entry.last_updated_at ? entry.last_updated_at * 1_000 : Date.now()
  };
}

function toTokenInfo(
  coin: CoinResponse,
  platform: string,
  contractAddress: string
): TokenInfo | undefined {
  if (!coin.id || !coin.symbol || !coin.name) return undefined;

  const platformDetail = coin.detail_platforms?.[platform] ?? undefined;
  const decimals = platformDetail?.decimal_place;

  return {
    coinGeckoId: coin.id,
    symbol: coin.symbol.toUpperCase(),
    name: coin.name,
    decimals: typeof decimals === 'number' ? decimals : undefined,
    logoUrl: coin.image?.large ?? coin.image?.small ?? coin.image?.thumb ?? undefined,
    platform,
    contractAddress: contractAddress as `0x${string}`
  };
}

/**
 * Read the 24h change for a currency.
 *
 * CoinGecko suffixes these fields with the requested currency rather than always
 * reporting USD, so the currency has to be resolved explicitly.
 */
function changeFor(entry: SimplePriceEntry, currency: FiatCurrency): number | undefined {
  if (currency === 'usd') return entry.usd_24h_change;
  if (currency === 'eur') return entry.eur_24h_change;
  return entry.gbp_24h_change;
}

function marketCapFor(entry: SimplePriceEntry, currency: FiatCurrency): number | undefined {
  if (currency === 'usd') return entry.usd_market_cap;
  if (currency === 'eur') return entry.eur_market_cap;
  return entry.gbp_market_cap;
}

/** Longer ranges move less per day, so a longer series is cached for longer. */
function historyTtlMs(days: number): number {
  if (days <= 1) return 5 * 60_000;
  if (days <= 30) return 30 * 60_000;
  return 6 * 60 * 60_000;
}

function uniqueLowercased(values: readonly string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.toLowerCase()).filter((value) => value.length > 0))
  );
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function ignoreFailure(): void {
  // The queue only cares that the previous call settled, not how.
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
