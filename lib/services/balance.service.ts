import { isAddress } from 'viem';

import { ACTIVE_CHAINS } from '@/config/chains';
import {
  LP_TOKEN_ALLOWLIST,
  LP_TOKEN_NAME_HINTS,
  LP_TOKEN_SYMBOL_PATTERN
} from '@/config/constants';
import {
  getNativeBalance,
  getTokenBalances,
  getTokenMetadataBatch,
  type AlchemyTokenBalance,
  type AlchemyTokenMetadata
} from '@/lib/api/alchemy.client';
import { InvalidAddressError, toAppError } from '@/lib/api/errors';
import { fetchTokenPrices, priceKey } from '@/lib/services/price.service';
import { toTokenAmount, truncateAddress } from '@/lib/utils/format';
import type {
  Chain,
  ChainBalance,
  ChainBalanceResult,
  ChainReadError,
  LpPosition,
  PortfolioBalances,
  PriceMap,
  TokenAssetKind,
  TokenBalance
} from '@/types';
import { NATIVE_TOKEN_ADDRESS } from '@/types';

/** Decimals assumed when a token's metadata cannot be read; the ERC-20 default. */
const ASSUMED_DECIMALS = 18;

/** Address of a pool share candidate, with the labels its pool is known by. */
export interface LpCandidate {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
}

export interface TotalValue {
  totalValue: number;
  /** Absolute 24h change in USD, `0` when no quote carried a change. */
  change24h: number;
  change24hPct: number;
}

/**
 * Whether a token is a liquidity-pool share rather than a standalone asset.
 *
 * Protocols label these inconsistently, so the symbol pattern, the name hints and
 * an explicit allowlist are all consulted. Being wrong here understates the
 * portfolio's value, so an obvious pool share is bucketed rather than priced at
 * a share-token quote that means nothing on its own.
 */
export function isLiquidityPoolToken({ chainId, address, symbol, name }: LpCandidate): boolean {
  if (LP_TOKEN_ALLOWLIST.includes(`${chainId}:${address.toLowerCase()}`)) return true;
  if (LP_TOKEN_SYMBOL_PATTERN.test(symbol)) return true;

  const haystack = name.toLowerCase();
  return LP_TOKEN_NAME_HINTS.some((hint) => haystack.includes(hint));
}

/** Classify a held ERC-20 row. */
export function classifyToken(candidate: LpCandidate): TokenAssetKind {
  return isLiquidityPoolToken(candidate) ? 'lp' : 'erc20';
}

/**
 * Read one chain's balances.
 *
 * Never throws: a chain that fails comes back with an empty list plus the reason,
 * so a rejected RPC on Arbitrum still leaves an Ethereum portfolio on screen.
 * Native and token reads are settled independently because they fail
 * independently — without an Alchemy key the native read still succeeds.
 */
export async function fetchChainBalances(
  address: `0x${string}`,
  chain: Chain
): Promise<ChainBalanceResult> {
  const [nativeRead, tokenRead] = await Promise.allSettled([
    getNativeBalance(address, chain),
    getTokenBalances(address, chain)
  ]);

  const errors: ChainReadError[] = [];
  const balances: TokenBalance[] = [];
  const lpPositions: LpPosition[] = [];

  if (nativeRead.status === 'fulfilled') {
    const nativeRow = toNativeBalance(nativeRead.value, chain);
    if (nativeRow) balances.push(nativeRow);
  } else {
    errors.push(toChainReadError(chain, nativeRead.reason));
  }

  if (tokenRead.status === 'fulfilled') {
    const held = filterHeldTokens(tokenRead.value);
    const metadata = await readMetadata(held, chain, errors);
    const rows = held.map((entry) => toTokenBalance(entry, chain, metadata));

    for (const row of rows) {
      if (row.kind === 'lp') lpPositions.push(toLpPosition(row));
      else balances.push(row);
    }
  } else {
    errors.push(toChainReadError(chain, tokenRead.reason));
  }

  return { chainId: chain.id, balances, lpPositions, errors };
}

/** Portfolio snapshot for one address across the given chains. */
export async function fetchPortfolioBalances(
  address: `0x${string}`,
  chains: readonly Chain[] = ACTIVE_CHAINS
): Promise<PortfolioBalances> {
  if (!address || address.toLowerCase() === NATIVE_TOKEN_ADDRESS) {
    return emptyPortfolio(address, chains);
  }

  if (!isAddress(address)) {
    throw new InvalidAddressError(address);
  }

  const perChain = await Promise.all(chains.map((chain) => fetchChainBalances(address, chain)));
  const balances = perChain.flatMap((result) => result.balances);
  const lpPositions = perChain.flatMap((result) => result.lpPositions);
  const errors = perChain.flatMap((result) => result.errors);

  const prices = await fetchTokenPrices(
    balances.map((balance) => ({ address: balance.address, chainId: balance.chainId }))
  );
  const priced = applyPrices(balances, prices);
  const { totalValue, change24h, change24hPct } = calculateTotalValue(priced, prices);

  return {
    address,
    updatedAt: Date.now(),
    totalValueUsd: totalValue,
    change24hUsd: change24h,
    change24hPercent: carriesChangeData(priced, prices) ? change24hPct : null,
    byChain: rollupByChain(priced, chains),
    tokens: sortByValue(priced),
    lpPositions,
    errors
  };
}

/** Attach quotes to the rows that can use one, leaving LP shares untouched. */
export function applyPrices(balances: readonly TokenBalance[], prices: PriceMap): TokenBalance[] {
  return balances.map((balance) => {
    if (!balance.isPriceable) return balance;

    const price = prices[priceKey(balance.address, balance.chainId)];
    if (!price) return balance;

    return {
      ...balance,
      priceUsd: price.usd,
      valueUsd: balance.balance * price.usd,
      // Carried on the row so a table cell does not have to re-join the quote.
      change24h: price.change24h ?? null
    };
  });
}

/**
 * Sum the priceable rows and weight the 24h change by position size.
 *
 * Yesterday's value is recovered from today's quote and its change, so a 2% move
 * on a large position moves the total more than a 20% move on dust — an average
 * of the percentages would say the opposite.
 */
export function calculateTotalValue(
  balances: readonly TokenBalance[],
  prices: PriceMap
): TotalValue {
  let totalValue = 0;
  let previousValue = 0;
  let trackedChange = false;

  for (const balance of balances) {
    if (!balance.isPriceable || balance.kind === 'lp') continue;

    const quote = prices[priceKey(balance.address, balance.chainId)];
    const usdValue = quote ? balance.balance * quote.usd : balance.valueUsd;
    if (usdValue === null || !Number.isFinite(usdValue)) continue;

    totalValue += usdValue;

    const change = quote?.change24h;
    if (change === undefined || !Number.isFinite(change)) continue;

    const ratio = 1 + change / 100;
    if (ratio <= 0) continue;

    previousValue += usdValue / ratio;
    trackedChange = true;
  }

  if (!trackedChange || previousValue === 0) {
    return { totalValue, change24h: 0, change24hPct: 0 };
  }

  const change24h = totalValue - previousValue;
  return { totalValue, change24h, change24hPct: (change24h / previousValue) * 100 };
}

/** Native gas-token row, omitted when the wallet holds none. */
function toNativeBalance(rawBalance: bigint, chain: Chain): TokenBalance | null {
  if (rawBalance <= 0n) return null;

  const { symbol, name, decimals } = chain.nativeCurrency;
  const raw = rawBalance.toString();

  return {
    chainId: chain.id,
    address: NATIVE_TOKEN_ADDRESS,
    symbol,
    name,
    decimals,
    kind: 'native',
    rawBalance: raw,
    balance: toTokenAmount(raw, decimals),
    isPriceable: true,
    priceUsd: null,
    valueUsd: null
  };
}

/** Drop entries the indexer reported as empty or errored. */
function filterHeldTokens(entries: readonly AlchemyTokenBalance[]): AlchemyTokenBalance[] {
  return entries.filter((entry) => {
    if (entry.error || entry.tokenBalance === null) return false;
    return toRawUnits(entry.tokenBalance) > 0n;
  });
}

/** Metadata for the held contracts, degrading to address labels when it fails. */
async function readMetadata(
  entries: readonly AlchemyTokenBalance[],
  chain: Chain,
  errors: ChainReadError[]
): Promise<Map<string, AlchemyTokenMetadata>> {
  if (entries.length === 0) return new Map();

  try {
    return await getTokenMetadataBatch(
      entries.map((entry) => entry.contractAddress),
      chain
    );
  } catch (error) {
    // Missing metadata costs labels, not balances, so the rows are still returned.
    errors.push(toChainReadError(chain, error));
    return new Map();
  }
}

function toTokenBalance(
  entry: AlchemyTokenBalance,
  chain: Chain,
  metadata: Map<string, AlchemyTokenMetadata>
): TokenBalance {
  const address = entry.contractAddress;
  const meta = metadata.get(address.toLowerCase());
  const decimals = typeof meta?.decimals === 'number' ? meta.decimals : ASSUMED_DECIMALS;
  const symbol = meta?.symbol ?? truncateAddress(address, 3);
  const name = meta?.name ?? symbol;
  const raw = entry.tokenBalance ?? '0';
  const kind = classifyToken({ chainId: chain.id, address, symbol, name });

  return {
    chainId: chain.id,
    address,
    symbol,
    name,
    decimals,
    kind,
    rawBalance: raw,
    balance: toTokenAmount(raw, decimals),
    isPriceable: kind !== 'lp',
    priceUsd: null,
    valueUsd: null,
    logoUrl: meta?.logo ?? undefined
  };
}

/** LP shares carry no standalone price, so they are bucketed, not valued. */
function toLpPosition(balance: TokenBalance): LpPosition {
  return {
    id: `${balance.chainId}:${balance.address.toLowerCase()}`,
    chainId: balance.chainId,
    address: balance.address,
    symbol: balance.symbol,
    name: balance.name,
    decimals: balance.decimals,
    rawBalance: balance.rawBalance,
    balance: balance.balance,
    isPriceable: false
  };
}

/** Per-chain totals over the rows that carried a value. */
function rollupByChain(
  balances: readonly TokenBalance[],
  chains: readonly Chain[]
): Record<number, ChainBalance> {
  const rollup: Record<number, ChainBalance> = {};

  for (const chain of chains) {
    rollup[chain.id] = { chainId: chain.id, totalValueUsd: 0, tokenCount: 0 };
  }

  for (const balance of balances) {
    const entry = rollup[balance.chainId];
    if (!entry) continue;
    entry.totalValueUsd += balance.valueUsd ?? 0;
    entry.tokenCount += 1;
  }

  return rollup;
}

/** Highest value first, unpriced rows last. */
function sortByValue(balances: readonly TokenBalance[]): TokenBalance[] {
  return [...balances].sort((left, right) => (right.valueUsd ?? 0) - (left.valueUsd ?? 0));
}

/** Whether any quote reported a 24h change, which is what makes a percentage knowable. */
function carriesChangeData(balances: readonly TokenBalance[], prices: PriceMap): boolean {
  return balances.some(
    (balance) => prices[priceKey(balance.address, balance.chainId)]?.change24h !== undefined
  );
}

function toChainReadError(chain: Chain, reason: unknown): ChainReadError {
  const failure = toAppError(reason, { service: 'alchemy' });
  return { chainId: chain.id, code: failure.code, message: failure.message };
}

function emptyPortfolio(address: string, chains: readonly Chain[]): PortfolioBalances {
  const byChain: Record<number, ChainBalance> = {};
  for (const chain of chains) {
    byChain[chain.id] = { chainId: chain.id, totalValueUsd: 0, tokenCount: 0 };
  }

  return {
    address: address as `0x${string}`,
    updatedAt: Date.now(),
    totalValueUsd: 0,
    change24hUsd: 0,
    change24hPercent: null,
    byChain,
    tokens: [],
    lpPositions: [],
    errors: []
  };
}

/** Base units from a hex quantity, tolerating the malformed values spam tokens return. */
function toRawUnits(hex: string): bigint {
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}
