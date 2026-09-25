'use client';

import { Images, SearchX } from 'lucide-react';
import { type ReactNode } from 'react';

import { EmptyState } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { NftItem } from '@/types';

import { NftCard } from './nft-card';

/**
 * Responsive column mosaic.
 *
 * CSS columns rather than a grid: the cards carry artwork of different heights,
 * and columns reflow them without the rows of a grid forcing every card in a
 * band to the height of its tallest sibling. Order runs down each column, which
 * is the trade-off accepted for that — the collection grouping is what gives the
 * gallery its structure, not the sequence.
 */

/** Artwork ratios, cycled by position so the mosaic has an irregular rhythm. */
const ASPECTS = ['aspect-square', 'aspect-[4/5]', 'aspect-[5/6]', 'aspect-[3/4]'] as const;

/** Skeleton tiles shown while the first read is in flight. */
const SKELETON_COUNT = 8;

export interface NftGridProps {
  items: readonly NftItem[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** Rendered in the empty state, e.g. a connect button. */
  emptyAction?: ReactNode;
  className?: string;
}

export function NftGrid({
  items,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  emptyAction,
  className
}: NftGridProps) {
  const columns = cn('columns-1 gap-6 sm:columns-2 lg:columns-3 xl:columns-4', className);

  if (isLoading) {
    return (
      <div className={columns} aria-hidden="true">
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <div key={index} className="mb-6 break-inside-avoid space-y-3">
            <Skeleton className={cn('w-full rounded-lg', ASPECTS[index % ASPECTS.length])} />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className={cn('border-border/60 bg-card/50', className)}>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <SearchX aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {errorMessage ?? 'The NFT indexer did not answer for this address.'}
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

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Images aria-hidden="true" className="h-5 w-5" />}
        title="No collectibles to show"
        description="Tokens are grouped by contract, floor prices come from the marketplace feed, and spam-flagged airdrops are filtered out before they reach the gallery."
        action={emptyAction}
        className={className}
      />
    );
  }

  return (
    <div className={columns}>
      {items.map((item, index) => (
        <NftCard
          key={item.id}
          item={item}
          aspectClassName={ASPECTS[index % ASPECTS.length]}
          className="mb-6"
        />
      ))}
    </div>
  );
}
