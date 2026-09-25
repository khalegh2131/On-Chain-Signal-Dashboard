'use client';

import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

import { Skeleton } from '@/components/ui/skeleton';
import { useMounted } from '@/hooks';
import { cn, formatPercent, formatUsd, type ChainBreakdownEntry } from '@/lib/utils';

/**
 * Allocation donut.
 *
 * The shares are also written out as text, so the ring is decoration over a
 * table rather than the only way to read the split — a chart that is unreadable
 * without colour is unreadable for a screen reader and for anyone who cannot
 * separate the hues.
 *
 * Rotation starts at twelve o'clock and runs clockwise, matching how the ranked
 * legend below it reads.
 */

const SKELETON_SIZE = '11rem';

export interface AllocationDonutProps {
  entries: readonly ChainBreakdownEntry[];
  /** Total the shares are measured against; defaults to the sum of the entries. */
  total?: number;
  isLoading?: boolean;
  className?: string;
}

export function AllocationDonut({
  entries,
  total,
  isLoading = false,
  className
}: AllocationDonutProps) {
  const mounted = useMounted();

  const data = useMemo(() => entries.filter((entry) => entry.valueUsd > 0), [entries]);

  const sum = useMemo(
    () => total ?? data.reduce((accumulator, entry) => accumulator + entry.valueUsd, 0),
    [data, total]
  );

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)} aria-hidden="true">
        <Skeleton
          className="rounded-full"
          style={{ height: SKELETON_SIZE, width: SKELETON_SIZE }}
        />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        Nothing to allocate yet — once an address holds a priced balance, the chain split appears
        here.
      </p>
    );
  }

  return (
    <figure className={cn('flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8', className)}>
      <figcaption className="sr-only">Allocation by chain</figcaption>

      <div className="relative shrink-0" style={{ height: SKELETON_SIZE, width: SKELETON_SIZE }}>
        {mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="valueUsd"
                nameKey="name"
                innerRadius="70%"
                outerRadius="100%"
                paddingAngle={2}
                startAngle={90}
                endAngle={-270}
                stroke="none"
                isAnimationActive={false}
              >
                {data.map((entry) => (
                  <Cell key={entry.chainId} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : null}

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Total
          </span>
          <span className="font-mono text-sm tabular-nums text-foreground">
            {formatUsd(sum, { compact: true })}
          </span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2.5">
        {data.map((entry) => (
          <li key={entry.chainId} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{entry.name}</span>
            <span className="font-mono text-xs tabular-nums text-foreground">
              {formatUsd(entry.valueUsd, { compact: true })}
            </span>
            <span className="w-12 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {formatPercent(entry.share * 100, { signed: false })}
            </span>
          </li>
        ))}
      </ul>

      {/* Text fallback: the same split, readable without the ring. */}
      <table className="sr-only">
        <caption>Allocation by chain</caption>
        <thead>
          <tr>
            <th scope="col">Chain</th>
            <th scope="col">Value</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry) => (
            <tr key={entry.chainId}>
              <th scope="row">{entry.name}</th>
              <td>{formatUsd(entry.valueUsd)}</td>
              <td>{formatPercent(entry.share * 100, { signed: false })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
