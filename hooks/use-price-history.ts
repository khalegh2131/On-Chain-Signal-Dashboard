'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import {
  MOCK_SUMMARY,
  RANGE_SPECS,
  alignToStep,
  generateSeries,
  mockNow,
  type HistoryPoint,
  type HistoryRange
} from '@/lib/mock';
import { fetchPriceHistory } from '@/lib/services/price.service';

/**
 * Series for the value chart.
 *
 * Two subjects behave differently by nature. A coin id has a real feed, so it is
 * fetched and cached on the range's own freshness window. The portfolio does not:
 * there is no historical endpoint for "what were these tokens worth", and
 * approximating one from today's balances would draw a curve that never
 * happened. So the portfolio series is generated from a seeded walk that ends on
 * the current total — labelled `demo` all the way to the legend, never passed off
 * as a read.
 */

/** Reserved subject for the whole-portfolio series. */
export const PORTFOLIO_SUBJECT = 'portfolio';

/** Where the samples came from. */
export type HistorySource = 'live' | 'demo';

export interface PriceHistoryResult {
  points: HistoryPoint[];
  range: HistoryRange;
  source: HistorySource;
  /** True only for the first fetch; polling refreshes surface on `isFetching`. */
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface UsePriceHistoryOptions {
  /** Value the generated series should end on, typically today's total. */
  endValue?: number;
  /** Force the generated series even for a subject that has a live feed. */
  useMockData?: boolean;
}

type SeriesPayload = { points: HistoryPoint[]; source: HistorySource };

export function usePriceHistory(
  subject: string,
  range: HistoryRange,
  options: UsePriceHistoryOptions = {}
): PriceHistoryResult {
  const spec = RANGE_SPECS[range];
  const endValue = options.endValue ?? MOCK_SUMMARY.totalValueUsd;
  const demo = options.useMockData ?? subject === PORTFOLIO_SUBJECT;

  // Snapped to the range's own step, so the curve is identical on the server and
  // through hydration instead of re-rolling between them.
  const endTimestamp = useMemo(() => alignToStep(mockNow(), spec.stepMs), [spec.stepMs]);

  const demoPoints = useMemo(
    () => generateSeries({ seed: subject, range, endValue, endTimestamp }),
    [subject, range, endValue, endTimestamp]
  );

  const query = useQuery<SeriesPayload>({
    queryKey: ['price-history', subject, range, spec.days],
    enabled: !demo,
    staleTime: spec.staleTimeMs,
    queryFn: async () => {
      const series = await fetchPriceHistory(subject, spec.days);
      return {
        points: series.points.map((point) => ({ timestamp: point.timestamp, value: point.price })),
        source: 'live' as const
      };
    }
  });

  const { refetch: refetchQuery } = query;
  const refetch = useCallback(() => {
    if (demo) return;
    void refetchQuery();
  }, [demo, refetchQuery]);

  const livePoints = query.data?.points ?? [];
  // The feed reports its own failures as an empty series rather than an
  // exception, so "asked and got nothing" is the error the chart must show.
  const isError = !demo && (query.isError || (query.data !== undefined && livePoints.length === 0));

  return {
    points: demo ? demoPoints : livePoints,
    range,
    source: demo ? 'demo' : 'live',
    isLoading: demo ? false : query.isLoading,
    isFetching: demo ? false : query.isFetching,
    isError,
    error: demo ? null : query.error,
    refetch
  };
}
