import type { TokenBalance } from '@/types';

/**
 * Row identity used when folding two token lists together.
 *
 * Addresses are compared lowercased because a checksummed and an all-lowercase
 * spelling of the same contract name the same asset, and a watchlist entry is
 * stored as whatever the reader pasted.
 */
export function tokenRowKey(token: Pick<TokenBalance, 'chainId' | 'address'>): string {
  return `${token.chainId}:${token.address.toLowerCase()}`;
}

/** The merged list plus the value the merge contributed. */
export interface MergedRows {
  rows: TokenBalance[];
  /** USD held in rows that only the second list carried, so a total can grow by exactly that. */
  addedValueUsd: number;
}

/**
 * Fold watched-token rows into a balance read.
 *
 * The balance read wins every collision: a watched contract the wallet actually
 * holds already appears in the read with the amount the chain reports, and
 * listing it twice would count it twice in the total. Watched rows the read did
 * not cover are appended instead, which is what makes a token the indexer has
 * never heard of visible at all.
 *
 * The added value is reported separately rather than being folded into a sum
 * here, because who owns the total is the caller's decision — the dashboard
 * extends its headline figure with it, a table does not.
 */
export function mergeTokenRows(
  base: readonly TokenBalance[],
  extra: readonly TokenBalance[]
): MergedRows {
  if (extra.length === 0) return { rows: [...base], addedValueUsd: 0 };

  const seen = new Set(base.map(tokenRowKey));
  const rows = [...base];
  let addedValueUsd = 0;

  for (const token of extra) {
    const key = tokenRowKey(token);
    if (seen.has(key)) continue;

    seen.add(key);
    rows.push(token);
    addedValueUsd += token.valueUsd ?? 0;
  }

  return { rows, addedValueUsd };
}
