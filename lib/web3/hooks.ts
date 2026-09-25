'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';

import { ACTIVE_CHAINS, getChainMetadata } from '@/config/chains';
import { fetchPortfolioBalances } from '@/lib/services/balance.service';
import { fetchTokenPrices, type PriceTarget } from '@/lib/services/price.service';
import { formatTokenAmount, toTokenAmount } from '@/lib/utils/format';
import { toChainBreakdown, type ChainBreakdownEntry } from '@/lib/utils/portfolio';
import { SUPPORTED_CHAINS } from '@/lib/web3/config';
import type { Chain, PortfolioBalances, PriceMap } from '@/types';

/**
 * Wallet- and chain-aware data hooks.
 *
 * These read through the same service layer the API routes use, so a component
 * can never disagree with a server render about what a balance is. The reads are
 * deliberately polled rather than pushed: this dashboard holds no connection to
 * any chain, and an interval that matches the service cache lifetimes keeps the
 * upstream request count flat instead of proportional to open tabs.
 */

/** Chain the dashboard falls back to before a wallet is connected. */
export const DEFAULT_CHAIN: Chain = ACTIVE_CHAINS[0]!;

/** Chain ids the connector is configured for. */
export const SUPPORTED_CHAIN_IDS: readonly number[] = SUPPORTED_CHAINS.map((chain) => chain.id);

/** A chain id the dashboard can both read and ask the wallet to switch to. */
export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]['id'];

/** Whether a chain is one of the enabled {@link ACTIVE_CHAINS}. */
export function isActiveChainId(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return ACTIVE_CHAINS.some((chain) => chain.id === chainId);
}

/**
 * Portfolio freshness.
 *
 * Thirty seconds is shorter than the price cache's five-minute window on
 * purpose: a re-read then re-prices from cache, which is cheap, while a genuine
 * price move still lands within a minute.
 */
const PORTFOLIO_STALE_MS = 30_000;
const PORTFOLIO_REFETCH_MS = 60_000;

/** Quotes move constantly but the upstream feed does not update faster than this. */
const PRICE_QUOTE_STALE_MS = 60_000;
const PRICE_QUOTE_REFETCH_MS = 120_000;

/** Query keys, kept together so a manual invalidation cannot miss one. */
export const web3QueryKeys = {
  portfolio: (address: string, chainIds: string) => ['portfolio', address, chainIds] as const,
  tokenPrices: (targets: string) => ['token-prices', targets] as const
};

export interface ActiveChainState {
  /** Display metadata for the resolved chain. */
  chain: Chain;
  /** Id of the resolved chain; matches `chain.id`. */
  chainId: number;
  /** True only while a wallet is connected to a chain the dashboard can read. */
  isSupported: boolean;
  /** Ask the wallet to move to another supported chain. */
  switchChain: (chainId: number) => void;
}

/**
 * The chain the dashboard is currently reading.
 *
 * Falls back to the first active chain rather than to viem's default: showing
 * "Ethereum mainnet" while nothing is connected would imply reads that are not
 * happening. `isSupported` covers the two ways this can be wrong — no wallet at
 * all, or a wallet parked on a network none of the readers cover.
 */
export function useActiveChain(): ActiveChainState {
  const { isConnected } = useAccount();
  const connectedChainId = useChainId();
  const { switchChain: requestSwitch } = useSwitchChain();

  const metadata = getChainMetadata(connectedChainId);
  const supported = isActiveChainId(connectedChainId) && metadata !== undefined;

  const switchChain = useCallback(
    (chainId: number) => {
      // The connector only accepts the chains it was configured with, which are
      // exactly the active ones; the cast records that invariant.
      requestSwitch({ chainId: chainId as SupportedChainId });
    },
    [requestSwitch]
  );

  return {
    chain: supported && metadata ? metadata : DEFAULT_CHAIN,
    chainId: supported && metadata ? metadata.id : DEFAULT_CHAIN.id,
    isSupported: isConnected && supported,
    switchChain
  };
}

export interface FormattedBalance {
  /** Base units as a decimal string — exactly what the chain reported. */
  raw: string;
  /** Human-readable amount, with precision scaled to its magnitude. */
  formatted: string;
  /** Abbreviated form for dense cells, e.g. `1.24M`. */
  compact: string;
  /** Unit label, when the caller supplied one. */
  symbol?: string;
}

export interface FormatBalanceOptions {
  /** Unit label carried through on the result, e.g. `ETH`. */
  symbol?: string;
  /** Upper bound on decimals for the `formatted` value. */
  maxDecimals?: number;
}

/** Abbreviations start where digits stop being readable at a glance. */
const COMPACT_THRESHOLD = 10_000;

const COMPACT_NUMBER = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2
});

/**
 * Format a base-unit amount for display.
 *
 * Conversion goes through viem's arbitrary-precision `formatUnits` before any
 * `Number` appears, because an 18-decimal balance leaves the safe-integer range
 * long before it stops being a plausible amount.
 */
export function useFormatBalance(
  amount?: bigint,
  decimals = 18,
  options: FormatBalanceOptions = {}
): FormattedBalance {
  const { symbol, maxDecimals = 6 } = options;

  return useMemo(() => {
    if (amount === undefined) {
      return { raw: '0', formatted: '—', compact: '—', symbol };
    }

    const value = toTokenAmount(amount, decimals);
    return {
      raw: amount.toString(),
      formatted: formatTokenAmount(value, maxDecimals),
      compact:
        Math.abs(value) >= COMPACT_THRESHOLD
          ? COMPACT_NUMBER.format(value)
          : formatTokenAmount(value, maxDecimals),
      symbol
    };
  }, [amount, decimals, maxDecimals, symbol]);
}

/**
 * What a caller may hand {@link useTokenPrices}.
 *
 * A contract address on its own is ambiguous: the same address can hold
 * different tokens on different chains. Passing a bare address therefore prices
 * it on every active chain, while {@link PriceTarget} names one chain exactly.
 */
export type TokenPriceInput = readonly PriceTarget[] | readonly string[];

export interface UseTokenPricesOptions {
  /** Skip the read entirely, e.g. until an address is known. */
  enabled?: boolean;
}

/** Expand both accepted input forms into explicit chain-and-address pairs. */
export function toPriceTargets(input: TokenPriceInput): PriceTarget[] {
  return input.map((entry) =>
    typeof entry === 'string' ? { address: entry, chainId: DEFAULT_CHAIN.id } : entry
  );
}

/** Stable, order-insensitive key for a set of price targets. */
function priceTargetKey(targets: readonly PriceTarget[]): string {
  return targets
    .map((target) => `${target.chainId}:${target.address.toLowerCase()}`)
    .sort()
    .join('|');
}

/** Spot quotes for a set of tokens, refreshed on a two-minute interval. */
export function useTokenPrices(input: TokenPriceInput, options: UseTokenPricesOptions = {}) {
  const targets = useMemo(() => toPriceTargets(input), [input]);
  const key = useMemo(() => priceTargetKey(targets), [targets]);

  return useQuery<PriceMap>({
    queryKey: web3QueryKeys.tokenPrices(key),
    queryFn: () => fetchTokenPrices(targets),
    enabled: (options.enabled ?? true) && targets.length > 0,
    staleTime: PRICE_QUOTE_STALE_MS,
    refetchInterval: PRICE_QUOTE_REFETCH_MS
  });
}

export interface PortfolioQueryState {
  data: PortfolioBalances | undefined;
  /** True only for the first load; polling refreshes set `isFetching` instead. */
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  /** Headline total in USD, `0` before the first snapshot arrives. */
  totalValue: number;
  /** Per-chain allocation, ranked by value. */
  breakdown: ChainBreakdownEntry[];
}

/**
 * The portfolio snapshot for one address across every active chain.
 *
 * Never enabled without an address: the readers would answer with an empty
 * snapshot, which the UI cannot distinguish from a wallet that genuinely holds
 * nothing. The chain list is part of the query key so re-pointing the dashboard
 * at different networks cannot serve a stale snapshot from the old set.
 */
export function usePortfolio(address?: `0x${string}`): PortfolioQueryState {
  const chainIds = ACTIVE_CHAINS.map((chain) => chain.id).join(',');
  const { refetch: refetchQuery, ...query } = useQuery<PortfolioBalances>({
    queryKey: web3QueryKeys.portfolio(address ?? '', chainIds),
    queryFn: () => fetchPortfolioBalances(address as `0x${string}`, ACTIVE_CHAINS),
    enabled: Boolean(address),
    staleTime: PORTFOLIO_STALE_MS,
    refetchInterval: PORTFOLIO_REFETCH_MS
  });

  const data = query.data;

  // Sorting and share maths over every chain: worth memoising, unlike the plain
  // field reads below, which are already stable references.
  const breakdown = useMemo(
    () => (data ? toChainBreakdown(data.byChain, ACTIVE_CHAINS) : []),
    [data]
  );

  const refetch = useCallback(() => {
    void refetchQuery();
  }, [refetchQuery]);

  return {
    data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch,
    totalValue: data?.totalValueUsd ?? 0,
    breakdown
  };
}
