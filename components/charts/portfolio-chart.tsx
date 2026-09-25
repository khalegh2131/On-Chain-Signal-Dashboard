'use client';

import { LineChart as LineChartIcon } from 'lucide-react';
import { useId, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis
} from 'recharts';

import { DeltaChip } from '@/components/shared/delta-chip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMounted, useTheme } from '@/hooks';
import { HISTORY_RANGES, isHistoryRange, type HistoryPoint, type HistoryRange } from '@/lib/mock';
import { cn, formatUsd } from '@/lib/utils';
import { paddedValueDomain, seriesChange } from '@/lib/utils/series';

import {
  chartPalette,
  formatAxisTimestamp,
  formatTooltipTimestamp,
  type ChartPalette
} from './chart-theme';

/**
 * Portfolio value over time.
 *
 * One line, one accent, one gradient wash — the figure is the subject and
 * everything else is scaffolding. The chart renders only after mount: recharts
 * measures its container, which is meaningless on the server, and gating on
 * mount is what keeps the first client paint identical to the server markup
 * instead of re-laying-out the whole card.
 */

/** Fixed height for the plot area, also used by the skeleton so nothing shifts. */
const PLOT_HEIGHT = 280;

export interface PortfolioChartProps {
  points: readonly HistoryPoint[];
  range: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
  /** Where the samples came from; `demo` is labelled, never hidden. */
  source?: 'live' | 'demo';
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  title?: string;
  className?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: readonly { value?: number | string; payload?: unknown }[];
  range: HistoryRange;
  palette: ChartPalette;
}

/** Hover card: the date, the value, and nothing else competing for attention. */
function ChartTooltip({ active, payload, range, palette }: ChartTooltipProps) {
  const entry = payload?.[0];
  const point = entry?.payload as HistoryPoint | undefined;
  if (!active || !point) return null;

  const value = typeof entry?.value === 'number' ? entry.value : point.value;

  return (
    <div
      className="rounded-lg border px-3 py-2 shadow-lg"
      style={{ backgroundColor: palette.tooltipSurface, borderColor: palette.tooltipBorder }}
    >
      <p className="text-[11px] text-muted-foreground">
        {formatTooltipTimestamp(point.timestamp, range)}
      </p>
      <p className="mt-1 font-mono text-sm tabular-nums text-foreground">{formatUsd(value)}</p>
    </div>
  );
}

export function PortfolioChart({
  points,
  range,
  onRangeChange,
  source = 'live',
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  title = 'Portfolio value',
  className
}: PortfolioChartProps) {
  const mounted = useMounted();
  const { resolvedTheme } = useTheme();
  const palette = chartPalette(resolvedTheme);

  // Colons in a React id are legal but awkward inside a CSS `url(#…)`, so they go.
  const gradientId = `portfolio-fill-${useId().replace(/:/g, '')}`;

  const { lastValue, change, domain, low, high } = useMemo(() => {
    const values = points.map((point) => point.value);
    return {
      lastValue: values.length > 0 ? (values[values.length - 1] ?? 0) : 0,
      change: seriesChange(values),
      domain: paddedValueDomain(values),
      low: values.length > 0 ? Math.min(...values) : 0,
      high: values.length > 0 ? Math.max(...values) : 0
    };
  }, [points]);

  const showSkeleton = !mounted || isLoading;
  const hasPoints = points.length > 0;

  return (
    <Card className={cn('border-border/60 bg-card/50', className)}>
      <CardHeader className="gap-5 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {title}
          </p>

          {showSkeleton ? (
            <div className="space-y-2" aria-hidden="true">
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-5 w-24" />
            </div>
          ) : (
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="font-mono text-2xl font-light tabular-nums text-foreground">
                {formatUsd(lastValue)}
              </p>
              {change ? <DeltaChip percent={change.percent} window={range} /> : null}
            </div>
          )}

          {source === 'demo' && !showSkeleton ? (
            <p className="text-xs text-muted-foreground">
              Generated series — there is no historical feed for a set of balances.
            </p>
          ) : null}
        </div>

        <Tabs
          value={range}
          onValueChange={(value) => {
            // Radix hands back a plain string; validating keeps the cast honest.
            if (isHistoryRange(value)) onRangeChange(value);
          }}
        >
          <TabsList aria-label="Chart range" className="h-9 rounded-full p-0.5">
            {HISTORY_RANGES.map((option) => (
              <TabsTrigger
                key={option}
                value={option}
                className="rounded-full px-3 py-1 font-mono text-xs tabular-nums data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                {option}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="pt-2">
        {showSkeleton ? (
          <Skeleton className="w-full" style={{ height: PLOT_HEIGHT }} />
        ) : isError ? (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 text-center"
            style={{ height: PLOT_HEIGHT }}
            role="alert"
          >
            <p className="text-sm text-muted-foreground">
              {errorMessage ?? 'The price feed did not answer for this range.'}
            </p>
            {onRetry ? (
              <Button variant="outline" size="sm" onClick={onRetry}>
                Try again
              </Button>
            ) : null}
          </div>
        ) : !hasPoints ? (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 px-6 text-center"
            style={{ height: PLOT_HEIGHT }}
          >
            <LineChartIcon aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No samples for this range yet.</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Shorter ranges refresh from the price feed most often. Switch the range, or retry if a
              feed has just come back.
            </p>
            {onRetry ? (
              <Button variant="outline" size="sm" onClick={onRetry}>
                Try again
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <p className="sr-only">
              {`Portfolio value over the last ${range}, from ${formatUsd(low)} to ${formatUsd(
                high
              )}, currently ${formatUsd(lastValue)}.`}
            </p>

            <div
              className="w-full focus-visible:outline-none [&_.recharts-cartesian-axis-tick-value]:font-mono [&_.recharts-cartesian-axis-tick-value]:tabular-nums"
              style={{ height: PLOT_HEIGHT }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  accessibilityLayer
                  data={points as HistoryPoint[]}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={palette.accentFillFrom} />
                      <stop offset="100%" stopColor={palette.accentFillTo} />
                    </linearGradient>
                  </defs>

                  {/* Horizontal rules only: vertical ones would fence the data in. */}
                  <CartesianGrid vertical={false} stroke={palette.grid} />

                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value: number) => formatAxisTimestamp(value, range)}
                    tick={{ fill: palette.axis, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={48}
                    tickMargin={10}
                  />

                  <YAxis
                    domain={domain}
                    tickFormatter={(value: number) => formatUsd(value, { compact: true })}
                    tick={{ fill: palette.axis, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                  />

                  <RechartsTooltip
                    content={<ChartTooltip range={range} palette={palette} />}
                    cursor={{ stroke: palette.cursor, strokeWidth: 1 }}
                  />

                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={palette.accent}
                    strokeWidth={1.5}
                    fill={`url(#${gradientId})`}
                    // The gradient carries the tint, so the line itself is not scaled up.
                    fillOpacity={1}
                    dot={false}
                    activeDot={{ r: 3, fill: palette.accent, stroke: 'none' }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
