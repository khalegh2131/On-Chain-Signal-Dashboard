'use client';

import { ArrowDownAZ, ArrowDownWideNarrow, ArrowUpNarrowWide, Search } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { EmptyState } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TOKEN_SORT_LABELS,
  TOKEN_SORT_MODES,
  cn,
  filterTokens,
  sortTokens,
  type TokenSortMode
} from '@/lib/utils';
import type { TokenBalance } from '@/types';

import { TokenRow } from './token-row';

/**
 * Held assets, filterable and paged.
 *
 * Rows are rendered in windows of fifty rather than virtualised: a dashboard
 * wallet holds tens of assets, not tens of thousands, and a window keeps the
 * markup readable in the DOM inspector for the rare case that needs it.
 */

/** Default window size, large enough that most wallets never see the button. */
const DEFAULT_PAGE_SIZE = 50;

const SORT_ICONS: Record<TokenSortMode, typeof ArrowDownWideNarrow> = {
  'value-desc': ArrowDownWideNarrow,
  'value-asc': ArrowUpNarrowWide,
  'symbol-asc': ArrowDownAZ
};

export interface TokenListProps {
  tokens: readonly TokenBalance[];
  /** Portfolio total, used to compute each row's share. */
  totalValue: number;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** Rendered in the empty state, e.g. a connect button. */
  emptyAction?: ReactNode;
  pageSize?: number;
  className?: string;
}

export function TokenList({
  tokens,
  totalValue,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  emptyAction,
  pageSize = DEFAULT_PAGE_SIZE,
  className
}: TokenListProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TokenSortMode>('value-desc');
  const [visibleCount, setVisibleCount] = useState(pageSize);

  // A new search or ordering restarts paging; keeping the old window would show
  // the tail of the previous result set.
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [query, sort, pageSize]);

  const matched = useMemo(
    () => sortTokens(filterTokens(tokens, query), sort),
    [tokens, query, sort]
  );

  if (isLoading) {
    return (
      <Card className={cn('border-border/60 bg-card/50', className)}>
        <CardContent className="divide-y divide-border/60 p-6">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="flex items-center gap-3 py-4">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className={cn('border-border/60 bg-card/50', className)}>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="text-sm text-muted-foreground">
            {errorMessage ?? 'Balances could not be read for this address.'}
          </p>
          {onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (tokens.length === 0) {
    return (
      <EmptyState
        icon={<Search aria-hidden="true" className="h-5 w-5" />}
        title="No token balances yet"
        description="Balances are read from public RPC endpoints for every enabled chain. Connecting shares an address only — nothing is signed and nothing can be moved."
        action={emptyAction}
        className={className}
      />
    );
  }

  const visible = matched.slice(0, visibleCount);
  const remaining = matched.length - visible.length;
  const SortIcon = SORT_ICONS[sort];

  return (
    <Card className={cn('border-border/60 bg-card/50', className)}>
      <CardHeader className="flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search symbol, name, or address"
            aria-label="Search holdings"
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const index = TOKEN_SORT_MODES.indexOf(sort);
              const next = TOKEN_SORT_MODES[(index + 1) % TOKEN_SORT_MODES.length];
              if (next) setSort(next);
            }}
            aria-label={`Sort by ${TOKEN_SORT_LABELS[sort].toLowerCase()}. Activate to change the order.`}
          >
            <SortIcon aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">{TOKEN_SORT_LABELS[sort]}</span>
          </Button>
          <p className="whitespace-nowrap text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{matched.length}</span>{' '}
            {matched.length === 1 ? 'asset' : 'assets'}
          </p>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing matches <span className="font-mono">{query}</span>.
            </p>
            <Button variant="outline" size="sm" onClick={() => setQuery('')}>
              Clear search
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {visible.map((token) => (
              <li key={`${token.chainId}:${token.address}`}>
                <TokenRow
                  token={token}
                  share={
                    totalValue > 0 && token.valueUsd !== null
                      ? token.valueUsd / totalValue
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {remaining > 0 ? (
          <div className="flex justify-center pt-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVisibleCount((count) => count + pageSize)}
            >
              Show {Math.min(remaining, pageSize)} more
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
