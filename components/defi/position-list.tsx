'use client';

import { Layers } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';

import { EmptyState } from '@/components/shared/page-header';
import { SectionHeading } from '@/components/shared/section-heading';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { POSITION_KIND_LABELS } from '@/lib/mock';
import type { DefiPosition, DefiPositionKind } from '@/types';

import { PositionCard } from './position-card';

/**
 * Positions, grouped by what they do.
 *
 * Grouping by kind rather than by protocol because a reader comparing two
 * liquidity positions thinks about them as liquidity, and a protocol list mixes
 * a supply with a stake and a band in one column. The order is fixed rather than
 * derived from the data, so a page does not rearrange itself between reads.
 */

const KIND_ORDER: readonly DefiPositionKind[] = [
  'liquidity',
  'lending',
  'borrowing',
  'staking',
  'vault'
];

const KIND_DESCRIPTIONS: Record<DefiPositionKind, string> = {
  liquidity: 'Concentrated ranges, valued from the tokens deposited into them.',
  lending: 'Supplied assets accruing interest on a money market.',
  borrowing: 'Outstanding debt, valued at the current price of the borrowed asset.',
  staking: 'Assets staked with a validator or a liquid-staking protocol.',
  vault: 'Yield-bearing vault shares.'
};

/** Placeholder cards shown while the protocol readers are in flight. */
const SKELETON_CARDS = [0, 1];

export interface PositionListProps {
  positions: readonly DefiPosition[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** Rendered in the empty state, e.g. a connect button. */
  emptyAction?: ReactNode;
  className?: string;
}

export function PositionList({
  positions,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  emptyAction,
  className
}: PositionListProps) {
  const grouped = useMemo(() => {
    return KIND_ORDER.map((kind) => ({
      kind,
      items: positions.filter((position) => position.kind === kind)
    })).filter((group) => group.items.length > 0);
  }, [positions]);

  if (isLoading) {
    return (
      <div className={className} aria-hidden="true">
        {SKELETON_CARDS.map((card) => (
          <Card key={card} className="mb-6 border-border/60 bg-card/50">
            <CardContent className="space-y-4 p-6">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-4 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="text-sm text-muted-foreground">
            {errorMessage ?? 'Positions could not be read for this address.'}
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

  if (positions.length === 0) {
    return (
      <EmptyState
        icon={<Layers aria-hidden="true" className="h-5 w-5" />}
        title="No open positions detected"
        description="Uniswap LP shares, Aave supplies and borrows, and Lido staking balances show up here with their underlying tokens, current APY, and any cooldown or unlock timing. A protocol that needs a credential this deployment does not hold is reported by name rather than guessed at."
        action={emptyAction}
        className={className}
      />
    );
  }

  return (
    <div className={className}>
      {grouped.map((group) => (
        <section key={group.kind} className="mb-10 last:mb-0">
          <SectionHeading
            as="h2"
            eyebrow={`${group.items.length} ${group.items.length === 1 ? 'position' : 'positions'}`}
            title={POSITION_KIND_LABELS[group.kind]}
            description={KIND_DESCRIPTIONS[group.kind]}
            className="mb-4"
          />

          <div className="space-y-4">
            {group.items.map((position) => (
              <PositionCard key={position.id} position={position} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
