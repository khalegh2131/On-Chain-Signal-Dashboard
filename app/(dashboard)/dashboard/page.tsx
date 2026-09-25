import type { Metadata } from 'next';

import { AddTokenDialog } from '@/components/portfolio/add-token-dialog';
import { DashboardView } from '@/components/portfolio/dashboard-view';
import { PageHeader } from '@/components/shared/page-header';
import { ChainIndicator } from '@/components/wallet/chain-indicator';
import { ACTIVE_CHAINS } from '@/config/chains';

/**
 * Metadata is resolved here rather than in the client view below, so the title
 * and the social card are correct before any balance read starts.
 *
 * Balances are deliberately not prefetched on the server. Every figure on this
 * route is scoped to whichever wallet is connected, and the connection only
 * exists in the browser, so a server render has no address to read for; the
 * client view fetches behind the loading boundary this route declares.
 */
export const metadata: Metadata = {
  title: 'Dashboard',
  description:
    'Net worth, allocation by chain, and 24-hour movement for the connected wallet, aggregated across every supported network.',
  openGraph: {
    title: 'Dashboard | DeFi Portfolio Dashboard',
    description:
      'Net worth, allocation by chain, and 24-hour movement for the connected wallet, aggregated across every supported network.',
    type: 'website'
  }
};

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Net worth, allocation by chain, and the movement behind it for the connected address."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {ACTIVE_CHAINS.map((chain) => (
              <ChainIndicator key={chain.id} chainId={chain.id} variant="full" />
            ))}
            <AddTokenDialog size="sm" />
          </div>
        }
        className="mb-10"
      />

      <DashboardView />
    </>
  );
}
