'use client';

import { useAccount } from 'wagmi';

import { PortfolioChart } from '@/components/charts/portfolio-chart';
import { SectionHeading } from '@/components/shared/section-heading';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PORTFOLIO_SUBJECT, useLocalStorage, usePortfolioData, usePriceHistory } from '@/hooks';
import { isHistoryRange, type HistoryRange } from '@/lib/mock';

import { ChainBreakdown } from './chain-breakdown';
import { PortfolioOverview } from './portfolio-overview';
import { TokenRow } from './token-row';

/**
 * Dashboard composition.
 *
 * Client-side because every figure on it polls: the wallet, the balances, and
 * the chart range all change under the render. The page above stays a server
 * component so its metadata and title are resolved before any of this runs.
 */

/** Remembered across visits — a reader interested in one range wants it back. */
const CHART_RANGE_KEY = 'defi-dashboard:chart-range';
const DEFAULT_RANGE: HistoryRange = '1M';

/** Positions shown in the concentration list. */
const TOP_HOLDINGS_LIMIT = 5;

export function DashboardView() {
  const { address, isConnected } = useAccount();
  const view = usePortfolioData({
    address,
    useMockData: !isConnected,
    topHoldingsLimit: TOP_HOLDINGS_LIMIT
  });

  const [storedRange, setStoredRange] = useLocalStorage<HistoryRange>(
    CHART_RANGE_KEY,
    DEFAULT_RANGE
  );
  // Storage is shared with older builds, so an unrecognised value falls back
  // rather than indexing the range table with a key that is not there.
  const range = isHistoryRange(storedRange) ? storedRange : DEFAULT_RANGE;

  const history = usePriceHistory(PORTFOLIO_SUBJECT, range, { endValue: view.totalValue });

  return (
    <div className="space-y-8">
      <PortfolioOverview
        totalValue={view.totalValue}
        change24h={view.change24h}
        change24hPct={view.change24hPct}
        assetCount={view.assetCount}
        chainCount={view.chainCount}
        allocation={view.chainBreakdown}
        isLoading={view.isInitialLoading}
        isError={view.error !== null}
        errorMessage={view.error?.message}
        onRetry={view.refetch}
        isEmpty={view.isEmpty}
      />

      <PortfolioChart
        points={history.points}
        range={range}
        onRangeChange={setStoredRange}
        source={history.source}
        isLoading={history.isLoading}
        isError={history.isError}
        errorMessage={history.error?.message}
        onRetry={history.refetch}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <SectionHeading
              as="h3"
              eyebrow="Allocation"
              title="Value by chain"
              description="Shares are measured against every chain holding a balance."
            />
          </CardHeader>
          <CardContent className="pt-0">
            <ChainBreakdown
              entries={view.chainBreakdown}
              isLoading={view.isInitialLoading}
              limit={6}
            />
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <SectionHeading
              as="h3"
              eyebrow="Concentration"
              title="Top holdings"
              description="The largest positions by value, with 24h movement."
            />
          </CardHeader>
          <CardContent className="pt-0">
            {view.isInitialLoading ? (
              <p className="py-6 text-sm text-muted-foreground">Reading balances…</p>
            ) : view.topHoldings.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">No priced holdings to rank yet.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {view.topHoldings.map((token) => (
                  <li key={`${token.chainId}:${token.address}`}>
                    <TokenRow
                      token={token}
                      share={
                        view.totalValue > 0 && token.valueUsd !== null
                          ? token.valueUsd / view.totalValue
                          : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
