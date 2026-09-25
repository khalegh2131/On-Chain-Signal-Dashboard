'use client';

import type { ReactNode } from 'react';

import { DeltaChip } from '@/components/shared/delta-chip';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatUsd, type ChainBreakdownEntry } from '@/lib/utils';

import { AllocationDonut } from './allocation-donut';

/**
 * Headline card.
 *
 * The total is the one figure on the page that gets to be large, and it is set
 * extralight so its weight does not compete with the numbers underneath it. The
 * split is a golden-ratio grid — the figure takes the wider column and the
 * allocation the narrower one — which is why the two never feel evenly matched
 * against each other.
 */

export interface PortfolioOverviewProps {
  totalValue: number;
  /** Absolute 24h change in USD. */
  change24h: number;
  /** 24h change in percent, or `null` when it cannot be computed. */
  change24hPct: number | null;
  /** Rows held, including pool shares the total excludes. */
  assetCount: number;
  /** Networks with a non-zero balance. */
  chainCount: number;
  allocation: readonly ChainBreakdownEntry[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** Read succeeded but there is nothing to show. */
  isEmpty?: boolean;
  /** Rendered in the empty state, e.g. a connect button. */
  emptyAction?: ReactNode;
  className?: string;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="font-mono text-sm tabular-nums text-foreground">{value}</dd>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function OverviewSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('border-border/60 bg-card/50', className)}>
      <CardContent className="grid gap-10 p-6 lg:grid-cols-[1.618fr_1fr] lg:p-8">
        <div className="space-y-8">
          <div className="space-y-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-12 w-64" />
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="grid grid-cols-3 gap-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-44 w-44 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </CardContent>
    </Card>
  );
}

export function PortfolioOverview({
  totalValue,
  change24h,
  change24hPct,
  assetCount,
  chainCount,
  allocation,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  isEmpty = false,
  emptyAction,
  className
}: PortfolioOverviewProps) {
  if (isLoading) return <OverviewSkeleton className={className} />;

  if (isError) {
    return (
      <Card className={cn('border-border/60 bg-card/50', className)}>
        <CardContent className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-destructive">
            Read failed
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            {errorMessage ??
              'The balance readers could not be reached. A single chain being down usually clears on its own; retrying re-reads every chain.'}
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

  if (isEmpty) {
    return (
      <Card className={cn('border-dashed border-border/60 bg-card/50', className)}>
        <CardContent className="flex flex-col items-center gap-4 px-6 py-20 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Nothing to value
          </p>
          <h2 className="max-w-lg text-2xl font-light tracking-tight text-foreground">
            This address holds no priced balances on the enabled chains
          </h2>
          <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
            Every enabled chain was read and came back empty. Balances appear here as soon as the
            address holds a token — pool shares are listed separately, since a share token has no
            price of its own.
          </p>
          {emptyAction ? <div className="mt-2">{emptyAction}</div> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('border-border/60 bg-card/50', className)}>
      <CardContent className="grid gap-10 p-6 lg:grid-cols-[1.618fr_1fr] lg:gap-12 lg:p-8">
        <div className="flex flex-col justify-between gap-8">
          <div className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Total value
            </p>
            <p className="font-mono text-4xl font-extralight tabular-nums tracking-tight text-foreground sm:text-5xl">
              {formatUsd(totalValue)}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <DeltaChip
                size="md"
                percent={change24hPct}
                absolute={change24h}
                window="last 24 hours"
              />
              <span className="text-xs text-muted-foreground">24h, weighted by position size</span>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <Stat label="24h change" value={formatUsd(change24h)} />
            <Stat label="Assets" value={String(assetCount)} hint="Including pool shares" />
            <Stat label="Networks" value={String(chainCount)} hint="With a balance" />
          </dl>
        </div>

        <AllocationDonut
          entries={allocation}
          total={totalValue}
          className="lg:border-l lg:border-border/60 lg:pl-12"
        />
      </CardContent>
    </Card>
  );
}
