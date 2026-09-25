import * as React from 'react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkline } from '@/components/charts/sparkline';
import { cn } from '@/lib/utils';

import { DeltaChip } from './delta-chip';

/**
 * Compact metric tile.
 *
 * Used wherever a single number needs a label, a change, and optionally a
 * shape — the three things a reader checks in that order. The value is always
 * monospaced and tabular so a column of these tiles lines up on the decimal
 * point instead of jittering as the figures refresh.
 */

export interface StatCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  label: string;
  /** Pre-formatted figure, rendered in tabular mono. */
  value: string;
  /** Signed change in percent, rendered as a chip. */
  delta?: number | null;
  /** Signed absolute change, rendered as USD beside the percentage. */
  deltaAbsolute?: number | null;
  /** Quiet caption under the value, e.g. what the figure excludes. */
  hint?: string;
  /** Samples for the optional inline trend line. */
  sparkline?: readonly number[];
  /** Replaces the contents with placeholders while the first read is in flight. */
  isLoading?: boolean;
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  (
    { label, value, delta, deltaAbsolute, hint, sparkline, isLoading = false, className, ...props },
    ref
  ) => (
    <Card ref={ref} className={cn('border-border/60 bg-card/50 p-6', className)} {...props}>
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>

        {isLoading ? (
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-4 w-16" />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="font-mono text-2xl font-light tabular-nums text-foreground">{value}</p>
            <div className="flex items-center gap-2">
              {delta === undefined ? null : (
                <DeltaChip percent={delta} absolute={deltaAbsolute} window="last 24 hours" />
              )}
              {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
            </div>
          </div>
        )}

        {sparkline && sparkline.length > 1 && !isLoading ? (
          <Sparkline
            values={sparkline}
            className={cn('h-8 w-full', (delta ?? 0) < 0 ? 'text-destructive' : 'text-primary')}
          />
        ) : null}
      </div>
    </Card>
  )
);
StatCard.displayName = 'StatCard';

export { StatCard };
