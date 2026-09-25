'use client';

import { useAccount } from 'wagmi';

import { StatCard } from '@/components/shared/stat-card';
import { WalletConnect } from '@/components/wallet/wallet-connect';
import { usePortfolioData } from '@/hooks';
import { formatUsd } from '@/lib/utils';

import { TokenList } from './token-list';

/**
 * Portfolio page.
 *
 * Four tiles rather than one hero: this surface is where a reader goes to
 * compare holdings, so the summary is a compact row and the table below it gets
 * the room. The tiles reuse the same primitives as the dashboard, which is what
 * keeps the two pages from drifting into different visual languages.
 */
export function PortfolioView() {
  const { address, isConnected } = useAccount();
  const view = usePortfolioData({ address, useMockData: !isConnected });

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total value"
          value={formatUsd(view.totalValue)}
          delta={view.change24hPct}
          deltaAbsolute={view.change24h}
          isLoading={view.isInitialLoading}
        />
        <StatCard
          label="Assets"
          value={String(view.assetCount)}
          hint="Including pool shares"
          isLoading={view.isInitialLoading}
        />
        <StatCard
          label="Networks"
          value={String(view.chainCount)}
          hint="With a balance"
          isLoading={view.isInitialLoading}
        />
        <StatCard
          label="Pool shares"
          value={String(view.lpPositions.length)}
          hint="Valued from reserves"
          isLoading={view.isInitialLoading}
        />
      </div>

      <TokenList
        tokens={view.tokens}
        totalValue={view.totalValue}
        isLoading={view.isInitialLoading}
        isError={view.error !== null}
        errorMessage={view.error?.message}
        onRetry={view.refetch}
        emptyAction={<WalletConnect />}
      />
    </div>
  );
}
