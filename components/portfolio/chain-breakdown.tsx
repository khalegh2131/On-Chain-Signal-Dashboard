import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatPercent, formatUsd, type ChainBreakdownEntry } from '@/lib/utils';

/**
 * Per-chain value and share.
 *
 * Bars are drawn against the largest chain rather than against 100%: a portfolio
 * split 50/30/20 would otherwise leave every bar in the first half of the track,
 * and the comparison between chains is the only thing this view is for. The share
 * is printed beside each row, so the absolute scale is never lost.
 */

export interface ChainBreakdownProps {
  entries: readonly ChainBreakdownEntry[];
  isLoading?: boolean;
  /** Cap on rows shown; the remainder is summarised. */
  limit?: number;
  className?: string;
}

export function ChainBreakdown({
  entries,
  isLoading = false,
  limit,
  className
}: ChainBreakdownProps) {
  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)} aria-hidden="true">
        {[0, 1].map((row) => (
          <div key={row} className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-1.5 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        No chain has a priced balance yet.
      </p>
    );
  }

  const visible = limit === undefined ? entries : entries.slice(0, limit);
  const hidden = entries.length - visible.length;
  const largest = entries.reduce((max, entry) => Math.max(max, entry.valueUsd), 0);

  return (
    <div className={cn('space-y-4', className)}>
      <ul className="space-y-4">
        {visible.map((entry) => {
          const width = largest > 0 ? (entry.valueUsd / largest) * 100 : 0;

          return (
            <li key={entry.chainId} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.chainColor }}
                  />
                  <span className="truncate text-foreground">{entry.name}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-3">
                  <span className="font-mono text-sm tabular-nums text-foreground">
                    {formatUsd(entry.valueUsd)}
                  </span>
                  <span className="w-12 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {formatPercent(entry.share * 100, { signed: false })}
                  </span>
                </span>
              </div>

              <div
                aria-hidden="true"
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.max(width, 1.5)}%`, backgroundColor: entry.color }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {hidden > 0 ? (
        <p className="text-xs text-muted-foreground">
          {hidden === 1 ? '1 smaller chain' : `${hidden} smaller chains`} not shown.
        </p>
      ) : null}
    </div>
  );
}
