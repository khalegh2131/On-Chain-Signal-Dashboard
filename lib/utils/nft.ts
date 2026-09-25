import type { NftItem } from '@/types';

/**
 * Gallery filtering and ordering.
 *
 * Kept out of the gallery component because these are the rules a reader
 * actually reasons about — what a query matches, which order the tiles fall in —
 * and they can be asserted directly here instead of through a rendered grid.
 */

/** Orderings the gallery offers. */
export type NftSortMode = 'recent' | 'floor-desc' | 'collection-asc';

export const NFT_SORT_MODES: readonly NftSortMode[] = ['recent', 'floor-desc', 'collection-asc'];

/** Human labels for each ordering, used on the control and in its accessible name. */
export const NFT_SORT_LABELS: Record<NftSortMode, string> = {
  recent: 'Recently added',
  'floor-desc': 'Floor, high to low',
  'collection-asc': 'Collection, A to Z'
};

/** The default ordering: the most recently acquired token leads. */
export const DEFAULT_NFT_SORT: NftSortMode = 'recent';

export interface NftFilters {
  /** Free-text query matched against the collection and the token name. */
  query?: string;
  /** Chain ids to keep; an empty list keeps every chain. */
  chains?: readonly number[];
  sort?: NftSortMode;
}

/**
 * Whether one token matches a query.
 *
 * The collection name is matched as well as the token name because a reader
 * looking for "pudgy" is looking for a collection they hold, not for a token
 * whose individual name happens to contain the word.
 */
export function matchesNftQuery(item: NftItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;

  return (
    item.collectionName.toLowerCase().includes(needle) ||
    (item.name?.toLowerCase().includes(needle) ?? false)
  );
}

/**
 * Apply a query, a chain selection and an ordering.
 *
 * Chain ids absent from the data are still accepted: a filter that is on but
 * matches nothing is a legitimate state, and silently widening it to "all
 * chains" would make the control lie about what it is doing.
 */
export function filterNfts(items: readonly NftItem[], filters: NftFilters = {}): NftItem[] {
  const { query = '', chains = [], sort = DEFAULT_NFT_SORT } = filters;
  const chainSet = new Set(chains);

  const matched = items.filter((item) => {
    if (chainSet.size > 0 && !chainSet.has(item.chainId)) return false;
    return matchesNftQuery(item, query);
  });

  return sortNfts(matched, sort);
}

/**
 * Order a set of tokens.
 *
 * Unavailable floors sink to the bottom of the floor ordering rather than being
 * shuffled in by a `null` comparison, and every ordering falls back to the
 * collection and token id so the grid does not reshuffle between renders of the
 * same data.
 */
export function sortNfts(
  items: readonly NftItem[],
  mode: NftSortMode = DEFAULT_NFT_SORT
): NftItem[] {
  return [...items].sort((left, right) => {
    if (mode === 'floor-desc') {
      const leftFloor = left.floorPriceUsd;
      const rightFloor = right.floorPriceUsd;
      if (leftFloor === null && rightFloor === null) return byCollectionThenToken(left, right);
      if (leftFloor === null) return 1;
      if (rightFloor === null) return -1;
      if (leftFloor !== rightFloor) return rightFloor - leftFloor;
      return byCollectionThenToken(left, right);
    }

    if (mode === 'collection-asc') return byCollectionThenToken(left, right);

    const leftAcquired = left.acquiredAt;
    const rightAcquired = right.acquiredAt;
    if (leftAcquired === rightAcquired) return byCollectionThenToken(left, right);
    // An indexer that does not report acquisition time leaves the field off;
    // those tokens trail the dated ones instead of sorting as epoch zero.
    if (leftAcquired === undefined) return 1;
    if (rightAcquired === undefined) return -1;
    return rightAcquired - leftAcquired;
  });
}

function byCollectionThenToken(left: NftItem, right: NftItem): number {
  const byCollection = left.collectionName.localeCompare(right.collectionName);
  if (byCollection !== 0) return byCollection;
  return compareTokenIds(left.tokenId, right.tokenId);
}

/** Compare token ids numerically when both are integers, so `#9` precedes `#10`. */
function compareTokenIds(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);

  if (Number.isInteger(leftNumber) && Number.isInteger(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right);
}

/**
 * Chains actually present in a set of tokens, in the order they were declared.
 *
 * Derived from the data rather than from the chain registry: a filter offering a
 * network the reader holds nothing on would only ever produce an empty grid.
 */
export function nftChainIds(items: readonly NftItem[], order: readonly number[] = []): number[] {
  const present = new Set(items.map((item) => item.chainId));
  const ranked = order.filter((chainId) => present.has(chainId));
  const unranked = Array.from(present)
    .filter((chainId) => !ranked.includes(chainId))
    .sort((left, right) => left - right);

  return [...ranked, ...unranked];
}

/** Distinct collections in a set of tokens, keyed the way the gallery groups them. */
export function nftCollectionCount(items: readonly NftItem[]): number {
  return new Set(items.map((item) => `${item.chainId}:${item.contractAddress.toLowerCase()}`)).size;
}

/** Whether a filter set would narrow the gallery at all. */
export function hasActiveNftFilters(filters: NftFilters): boolean {
  return (filters.query ?? '').trim().length > 0 || (filters.chains?.length ?? 0) > 0;
}
