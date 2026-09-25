'use client';

import { FilterX, Search, SearchX } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getChainMetadata } from '@/config/chains';
import {
  DEFAULT_NFT_SORT,
  NFT_SORT_LABELS,
  NFT_SORT_MODES,
  cn,
  filterNfts,
  hasActiveNftFilters,
  nftChainIds,
  nftCollectionCount,
  type NftSortMode
} from '@/lib/utils';
import type { NftItem } from '@/types';

import { NftGrid } from './nft-grid';

/**
 * The gallery's controls plus the grid they drive.
 *
 * Split out from the data container so the filtering rules can be exercised
 * against a fixed set of tokens without a wallet or a provider in the way — the
 * controls are the part with behaviour worth testing, and the read around them
 * is the part worth keeping out of that test.
 *
 * The query is debounced because every keystroke would otherwise re-sort and
 * re-render the whole mosaic, which on a large collection drops frames while the
 * reader is still typing.
 */

/** Delay before a keystroke is applied to the grid. */
const SEARCH_DEBOUNCE_MS = 200;

export interface NftExplorerProps {
  items: readonly NftItem[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** Rendered in the empty state, e.g. a connect button. */
  emptyAction?: ReactNode;
  /** Preferred order for the chain filter, so the registry decides the sequence. */
  chainOrder?: readonly number[];
  className?: string;
}

export function NftExplorer({
  items,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  emptyAction,
  chainOrder = [],
  className
}: NftExplorerProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [chains, setChains] = useState<readonly number[]>([]);
  const [sort, setSort] = useState<NftSortMode>(DEFAULT_NFT_SORT);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const availableChains = useMemo(() => nftChainIds(items, chainOrder), [items, chainOrder]);

  // A chain that disappears from the data should not stay selected: the filter
  // would then hide everything with no visible cause.
  useEffect(() => {
    setChains((selected) => {
      const stillPresent = selected.filter((chainId) => availableChains.includes(chainId));
      return stillPresent.length === selected.length ? selected : stillPresent;
    });
  }, [availableChains]);

  const filters = useMemo(
    () => ({ query: debouncedQuery, chains, sort }),
    [debouncedQuery, chains, sort]
  );

  const matched = useMemo(() => filterNfts(items, filters), [items, filters]);
  const active = hasActiveNftFilters(filters);

  const toggleChain = useCallback((chainId: number) => {
    setChains((selected) =>
      selected.includes(chainId)
        ? selected.filter((entry) => entry !== chainId)
        : [...selected, chainId]
    );
  }, []);

  const clearFilters = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setChains([]);
  }, []);

  if (isLoading) return <NftGrid items={[]} isLoading className={className} />;
  if (isError) {
    return (
      <NftGrid
        items={[]}
        isError
        errorMessage={errorMessage}
        onRetry={onRetry}
        className={className}
      />
    );
  }
  if (items.length === 0) {
    return <NftGrid items={[]} emptyAction={emptyAction} className={className} />;
  }

  return (
    <div className={cn('space-y-6', className)}>
      <Card className="border-border/60 bg-card/50">
        <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search collection or token"
                aria-label="Search collectibles"
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-3">
              <label
                htmlFor="nft-sort"
                className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
              >
                Sort
              </label>
              <select
                id="nft-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as NftSortMode)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {NFT_SORT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {NFT_SORT_LABELS[mode]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Chains
            </span>

            {availableChains.map((chainId) => {
              const selected = chains.includes(chainId);
              const name = getChainMetadata(chainId)?.name ?? `Chain ${chainId}`;

              return (
                <button
                  key={chainId}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleChain(chainId)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[11px] transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    selected
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border/60 text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span className="font-mono tabular-nums">{name}</span>
                </button>
              );
            })}

            {/* When nothing matches, the panel below owns the only escape hatch;
                two identically named buttons in one view is ambiguity, not help. */}
            {active && matched.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto">
                <FilterX aria-hidden="true" className="h-4 w-4" />
                Clear filters
              </Button>
            ) : null}
          </div>

          <p aria-live="polite" className="text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{matched.length}</span>{' '}
            {matched.length === 1 ? 'token' : 'tokens'} across{' '}
            <span className="font-mono tabular-nums">{nftCollectionCount(matched)}</span>{' '}
            {nftCollectionCount(matched) === 1 ? 'collection' : 'collections'}
          </p>
        </CardContent>
      </Card>

      {matched.length === 0 ? (
        <Card className="border-border/60 bg-card/50">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <SearchX aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nothing matches the current filters.</p>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <NftGrid items={matched} />
      )}
    </div>
  );
}
