'use client';

import { useCallback, useMemo } from 'react';

import { useCustomTokens } from '@/hooks/use-custom-tokens';
import { ACTIVE_CHAINS } from '@/config/chains';
import { DEMO_ADDRESS, createMockPortfolio, mockNow } from '@/lib/mock';
import {
  mergeTokenRows,
  toChainBreakdown,
  toTopHoldings,
  type ChainBreakdownEntry
} from '@/lib/utils';
import { usePortfolio } from '@/lib/web3/hooks';
import type { LpPosition, TokenBalance } from '@/types';

/**
 * The portfolio view model.
 *
 * One shape for both data sources — a connected wallet or the fixed demo set —
 * so the views below never branch on which is active; they only report it. The
 * snapshot already arrives priced (the balance reader applies quotes before it
 * returns), so there is no second price read here to keep in sync with it.
 *
 * The reader's own watchlist is folded in on top of that snapshot. It is a
 * separate source on purpose: a watched contract is listed whether or not the
 * wallet holds it, and a balance read that skips a token the indexer has never
 * indexed should not make the reader's own list disappear.
 */

/** Stable empties, so a loading render does not hand a new array to every consumer. */
const NO_TOKENS: readonly TokenBalance[] = [];
const NO_LP_POSITIONS: readonly LpPosition[] = [];
const NO_BREAKDOWN: readonly ChainBreakdownEntry[] = [];

/** Rows kept for the compact "top holdings" list. */
const DEFAULT_TOP_HOLDINGS = 5;

export interface PortfolioView {
  /** Total across every priced row, in USD, including watched rows the read missed. */
  totalValue: number;
  /** Absolute 24h change, in USD. */
  change24h: number;
  /** 24h change in percent, or `null` when no quote carried one. */
  change24hPct: number | null;
  /** Per-chain allocation, ranked by value. */
  chainBreakdown: readonly ChainBreakdownEntry[];
  /** Highest-value rows, capped. */
  topHoldings: readonly TokenBalance[];
  /** Every priced row, highest value first, including the reader's watchlist. */
  tokens: readonly TokenBalance[];
  /** Pool shares, which carry no standalone price and sit outside the total. */
  lpPositions: readonly LpPosition[];
  /** Rows held, including the LP shares the total excludes. */
  assetCount: number;
  /** Networks with a non-zero balance. */
  chainCount: number;
  /** Watched contracts on screen, whether or not the wallet holds them. */
  customTokenCount: number;
  /** True when the figures come from the demo set rather than a wallet. */
  isDemo: boolean;
  /** True only for the first read; polling refreshes surface on `isFetching`. */
  isInitialLoading: boolean;
  isFetching: boolean;
  /** Read succeeded but the wallet holds nothing — distinct from still loading. */
  isEmpty: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface UsePortfolioDataOptions {
  address?: `0x${string}`;
  /** Render the fixed demo set instead of reading a wallet. */
  useMockData?: boolean;
  /** How many rows `topHoldings` keeps. */
  topHoldingsLimit?: number;
}

/** Demo data is static, so a refetch has nothing to re-read. */
function noop(): void {}

export function usePortfolioData(options: UsePortfolioDataOptions = {}): PortfolioView {
  const { address, useMockData = false, topHoldingsLimit = DEFAULT_TOP_HOLDINGS } = options;

  // Disabled in demo mode rather than passed a fake address: an address the
  // readers would happily try to resolve is a request nobody wants.
  const query = usePortfolio(useMockData ? undefined : address);
  const { refetch: refetchQuery } = query;

  const demo = useMemo(
    () => (useMockData ? createMockPortfolio(address ?? DEMO_ADDRESS, mockNow()) : null),
    [useMockData, address]
  );

  const snapshot = demo ?? query.data;
  const isDemo = demo !== null;

  // The watchlist itself needs no wallet to render; only its balances do, and
  // those come back at zero when there is nobody to read them for.
  const watched = useCustomTokens({ address: useMockData ? undefined : address });

  const baseTokens = snapshot?.tokens ?? NO_TOKENS;
  const merged = useMemo(
    () => mergeTokenRows(baseTokens, watched.rows),
    [baseTokens, watched.rows]
  );
  const tokens = merged.rows;
  const lpPositions = snapshot?.lpPositions ?? NO_LP_POSITIONS;

  const chainBreakdown = useMemo(
    () => (snapshot ? toChainBreakdown(snapshot.byChain, ACTIVE_CHAINS) : NO_BREAKDOWN),
    [snapshot]
  );

  const topHoldings = useMemo(
    () => toTopHoldings(tokens, topHoldingsLimit),
    [tokens, topHoldingsLimit]
  );

  const refetch = useCallback(() => {
    if (isDemo) return;
    void refetchQuery();
    watched.refetch();
  }, [isDemo, refetchQuery, watched]);

  const isInitialLoading = !isDemo && query.isLoading;
  const error = isDemo ? null : query.error;

  return {
    // Watched rows the balance read did not cover are added on top: they are not
    // part of the snapshot, so leaving them out would show them at a value the
    // headline total disagrees with.
    totalValue: (snapshot?.totalValueUsd ?? 0) + merged.addedValueUsd,
    change24h: snapshot?.change24hUsd ?? 0,
    change24hPct: snapshot?.change24hPercent ?? null,
    chainBreakdown,
    topHoldings,
    tokens,
    lpPositions,
    assetCount: tokens.length + lpPositions.length,
    chainCount: chainBreakdown.length,
    customTokenCount: watched.tokens.length,
    isDemo,
    isInitialLoading,
    isFetching: !isDemo && query.isFetching,
    isEmpty: !isInitialLoading && error === null && tokens.length === 0 && lpPositions.length === 0,
    error,
    refetch
  };
}
