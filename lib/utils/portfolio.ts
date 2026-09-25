import { ACTIVE_CHAINS, getChainMetadata } from '@/config/chains';
import type { Chain, ChainBalance, TokenBalance } from '@/types';

/**
 * Allocation palette.
 *
 * Emerald leads, then its nearest cool neighbours, then a neutral and two warm
 * accents — so a portfolio split across many chains still reads as one family
 * rather than a rainbow. The single neutral entry is deliberate: five saturated
 * slices in a row leave the chart with no visual resting point.
 *
 * Values are concrete hex rather than theme tokens because SVG presentation
 * attributes do not resolve CSS custom properties; they are chosen at 500-level
 * lightness so they hold up on both the dark and the light surface.
 */
export const ALLOCATION_PALETTE: readonly string[] = [
  '#10b981',
  '#14b8a6',
  '#0ea5e9',
  '#71717a',
  '#f59e0b',
  '#f43f5e'
];

/** Palette colour for a zero-based rank, wrapping when there are more entries than colours. */
export function allocationColor(rank: number): string {
  return ALLOCATION_PALETTE[rank % ALLOCATION_PALETTE.length] ?? '#71717a';
}

/** One row of the per-chain allocation breakdown. */
export interface ChainBreakdownEntry {
  chainId: number;
  /** Chain display name from `config/chains.ts`. */
  name: string;
  /** Compact label, e.g. `ARB`. */
  shortName: string;
  /** The chain's own brand colour, used for its identifying dot. */
  chainColor: string;
  /** Allocation-palette colour, shared with the donut so both read alike. */
  color: string;
  valueUsd: number;
  /** Rows held on this chain, including LP shares the total excludes. */
  tokenCount: number;
  /** Share of the portfolio total, in `[0, 1]`. */
  share: number;
}

export interface ChainBreakdownOptions {
  /** Keep chains with nothing on them, e.g. to show that a network was read. */
  includeEmpty?: boolean;
}

/**
 * Turn a snapshot's per-chain rollup into ranked, share-labelled rows.
 *
 * Shares are measured against the entries this function actually returns, not
 * against the raw rollup. A chain id with no metadata cannot be labelled, so it
 * is dropped — and leaving it in the denominator would make the printed shares
 * disagree with the ring drawn from the very same values.
 *
 * Chains present in the rollup but absent from `chains` are still listed, which
 * is what lets a demo snapshot reference mainnet while the reader is pointed at
 * testnets.
 */
export function toChainBreakdown(
  byChain: Record<number, ChainBalance>,
  chains: readonly Chain[] = ACTIVE_CHAINS,
  options: ChainBreakdownOptions = {}
): ChainBreakdownEntry[] {
  const ids = new Set<number>(Object.keys(byChain).map(Number));
  for (const chain of chains) ids.add(chain.id);

  const entries = Array.from(ids)
    .map((chainId) => {
      const metadata = getChainMetadata(chainId);
      const rollup = byChain[chainId] ?? { chainId, totalValueUsd: 0, tokenCount: 0 };
      return { metadata, rollup };
    })
    .filter(
      (entry): entry is { metadata: Chain; rollup: ChainBalance } => entry.metadata !== undefined
    )
    .filter((entry) => options.includeEmpty === true || entry.rollup.totalValueUsd > 0)
    .sort((left, right) => right.rollup.totalValueUsd - left.rollup.totalValueUsd);

  const total = entries.reduce((sum, entry) => sum + entry.rollup.totalValueUsd, 0);

  return entries.map(({ metadata, rollup }, rank) => ({
    chainId: metadata.id,
    name: metadata.name,
    shortName: metadata.shortName,
    chainColor: metadata.color,
    color: allocationColor(rank),
    valueUsd: rollup.totalValueUsd,
    tokenCount: rollup.tokenCount,
    share: total > 0 ? rollup.totalValueUsd / total : 0
  }));
}

/**
 * Highest-value holdings, capped.
 *
 * The snapshot already arrives sorted by value, but re-sorting here keeps the
 * helper honest when it is handed a filtered list.
 */
export function toTopHoldings(tokens: readonly TokenBalance[], limit: number): TokenBalance[] {
  return [...tokens]
    .sort((left, right) => (right.valueUsd ?? 0) - (left.valueUsd ?? 0))
    .slice(0, Math.max(limit, 0));
}

/**
 * Filter rows by a free-text query.
 *
 * Matches the symbol, the name, and the contract address so a paste from a block
 * explorer finds the row it names. A blank query keeps everything, which is what
 * an emptied search box is expected to do.
 */
export function filterTokens(tokens: readonly TokenBalance[], query: string): TokenBalance[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [...tokens];

  return tokens.filter((token) => {
    return (
      token.symbol.toLowerCase().includes(needle) ||
      token.name.toLowerCase().includes(needle) ||
      token.address.toLowerCase().includes(needle) ||
      String(token.chainId).includes(needle)
    );
  });
}

/** Orderings the token table offers. */
export type TokenSortMode = 'value-desc' | 'value-asc' | 'symbol-asc';

export const TOKEN_SORT_MODES: readonly TokenSortMode[] = ['value-desc', 'value-asc', 'symbol-asc'];

/** Human labels for each ordering, used on the control and in its accessible name. */
export const TOKEN_SORT_LABELS: Record<TokenSortMode, string> = {
  'value-desc': 'Value, high to low',
  'value-asc': 'Value, low to high',
  'symbol-asc': 'Symbol, A to Z'
};

/**
 * Order rows for display.
 *
 * Unpriced rows have no value to rank, so they sink to the bottom of both value
 * orderings instead of being shuffled in by a `null` comparison. Ties fall back
 * to the symbol, which keeps the list stable between refreshes.
 */
export function sortTokens(tokens: readonly TokenBalance[], mode: TokenSortMode): TokenBalance[] {
  const bySymbol = (left: TokenBalance, right: TokenBalance) =>
    left.symbol.localeCompare(right.symbol);

  return [...tokens].sort((left, right) => {
    if (mode === 'symbol-asc') return bySymbol(left, right);

    const leftValue = left.valueUsd;
    const rightValue = right.valueUsd;

    if (leftValue === null && rightValue === null) return bySymbol(left, right);
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;

    const difference = mode === 'value-desc' ? rightValue - leftValue : leftValue - rightValue;
    return difference === 0 ? bySymbol(left, right) : difference;
  });
}
