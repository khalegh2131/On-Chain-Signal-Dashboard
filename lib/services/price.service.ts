import { ALL_CHAINS, getChainMetadata } from '@/config/chains';
import {
  getHistoricalPrices,
  getSimplePrices,
  getTokenPrices as getContractPrices
} from '@/lib/api/coingecko.client';
import { toAppError } from '@/lib/api/errors';
import { NATIVE_TOKEN_ADDRESS } from '@/types';
import type { Chain, FiatCurrency, PriceMap, PriceSeries, TokenPrice } from '@/types';

/** One asset a caller wants priced. */
export interface PriceTarget {
  /** ERC-20 contract address, or {@link NATIVE_TOKEN_ADDRESS} for the gas token. */
  address: string;
  chainId: number;
}

/**
 * Cache key for a priced asset.
 *
 * The zero address means "native gas token" on every chain, so natives are keyed
 * by chain id instead — otherwise ETH on Arbitrum and ETH on Ethereum would
 * collide on a single key.
 */
export function priceKey(address: string, chainId: number): string {
  const normalized = address.toLowerCase();
  return normalized === NATIVE_TOKEN_ADDRESS ? `native:${chainId}` : normalized;
}

/** Whether a balance row refers to the chain's gas token. */
export function isNativeTarget(address: string): boolean {
  return address.toLowerCase() === NATIVE_TOKEN_ADDRESS;
}

/**
 * Spot prices for a mixed list of tokens across chains.
 *
 * Never rejects. A token no upstream can quote comes back as `usd: 0` with
 * `source: 'fallback'`, which lets the UI show the holding and flag the missing
 * price instead of dropping the row or blanking the page.
 *
 * Alchemy is deliberately not consulted: its Token and NFT APIs expose no price
 * feed, so a synthetic middle rung would just be a guess dressed up as a quote.
 * LP shares are the one asset with an on-chain value source, and they are valued
 * from pool reserves by `defi.service` rather than here.
 */
export async function fetchTokenPrices(
  targets: readonly PriceTarget[],
  vs: FiatCurrency = 'usd'
): Promise<PriceMap> {
  const now = Date.now();
  const prices: PriceMap = {};

  for (const target of targets) {
    prices[priceKey(target.address, target.chainId)] = unpriced(now);
  }

  if (targets.length === 0) return prices;

  const nativeTargets = targets.filter((target) => isNativeTarget(target.address));
  const erc20Targets = targets.filter((target) => !isNativeTarget(target.address));

  const [nativeQuotes, contractQuotes] = await Promise.all([
    priceNatives(nativeTargets, vs),
    priceContracts(erc20Targets, vs)
  ]);

  return { ...prices, ...nativeQuotes, ...contractQuotes };
}

/** Gas-token prices for chains, keyed as `native:{chainId}`. */
export async function fetchNativePrices(
  chains: readonly Chain[] = ALL_CHAINS,
  vs: FiatCurrency = 'usd'
): Promise<PriceMap> {
  return fetchTokenPrices(
    chains.map((chain) => ({ address: NATIVE_TOKEN_ADDRESS, chainId: chain.id })),
    vs
  );
}

/**
 * Normalised price series for one coin id.
 *
 * An upstream failure yields an empty series marked `fallback`: a chart with a
 * gap is easier to explain than an exception thrown from a render path.
 */
export async function fetchPriceHistory(
  coinId: string,
  days: number,
  vs: FiatCurrency = 'usd'
): Promise<PriceSeries> {
  const empty: PriceSeries = {
    coinId,
    days,
    currency: vs,
    points: [],
    source: 'fallback',
    updatedAt: Date.now()
  };

  try {
    const points = await getHistoricalPrices(coinId, days, vs);
    return { ...empty, points, source: 'coingecko', updatedAt: Date.now() };
  } catch (error) {
    logSkip(`price history for ${coinId}`, error);
    return empty;
  }
}

/** Resolve native prices through `/simple/price`, one call per currency. */
async function priceNatives(targets: readonly PriceTarget[], vs: FiatCurrency): Promise<PriceMap> {
  const chainIds = Array.from(new Set(targets.map((target) => target.chainId)));
  const coinIds = Array.from(
    new Set(
      chainIds
        .map((chainId) => getChainMetadata(chainId)?.coinGeckoNativeId)
        .filter((id): id is string => typeof id === 'string')
    )
  );

  if (coinIds.length === 0) return {};

  try {
    const quotes = await getSimplePrices(coinIds, vs);
    const prices: PriceMap = {};

    for (const chainId of chainIds) {
      const coinId = getChainMetadata(chainId)?.coinGeckoNativeId;
      const quote = coinId ? quotes[coinId] : undefined;
      if (!quote) continue;
      prices[priceKey(NATIVE_TOKEN_ADDRESS, chainId)] = {
        usd: quote.price,
        change24h: quote.change24h ?? undefined,
        marketCap: quote.marketCap,
        source: 'coingecko',
        updatedAt: quote.lastUpdated
      };
    }

    return prices;
  } catch (error) {
    logSkip(`native prices (${coinIds.join(', ')})`, error);
    return {};
  }
}

/** Resolve ERC-20 prices per CoinGecko platform, skipping unindexed chains. */
async function priceContracts(
  targets: readonly PriceTarget[],
  vs: FiatCurrency
): Promise<PriceMap> {
  const byPlatform = groupByPlatform(targets);
  if (byPlatform.size === 0) return {};

  const results = await Promise.all(
    Array.from(byPlatform, async ([platform, platformTargets]) => {
      try {
        return await getContractPrices(
          platform,
          platformTargets.map((target) => target.address),
          vs
        );
      } catch (error) {
        logSkip(`${platformTargets.length} contract prices on ${platform}`, error);
        return {} as PriceMap;
      }
    })
  );

  return Object.assign({}, ...results) as PriceMap;
}

/** Group targets by the CoinGecko platform that indexes their chain. */
function groupByPlatform(targets: readonly PriceTarget[]): Map<string, PriceTarget[]> {
  const grouped = new Map<string, PriceTarget[]>();

  for (const target of targets) {
    const platform = getChainMetadata(target.chainId)?.coinGeckoPlatformId;
    // Testnets and unlisted chains have no platform, so their tokens stay unpriced.
    if (!platform) continue;

    const existing = grouped.get(platform);
    if (existing) existing.push(target);
    else grouped.set(platform, [target]);
  }

  return grouped;
}

/** Placeholder quote for an asset no upstream could price. */
function unpriced(updatedAt: number): TokenPrice {
  return { usd: 0, source: 'fallback', updatedAt };
}

/** Missing prices are expected (spam airdrops, testnets), so they are a debug line. */
function logSkip(what: string, error: unknown): void {
  if (process.env.NODE_ENV === 'production') return;
  console.warn(`[price] skipping ${what}: ${toAppError(error, { service: 'coingecko' }).message}`);
}
