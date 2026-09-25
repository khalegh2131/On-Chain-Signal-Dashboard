import type { Metadata } from 'next';

import { DefiView } from '@/components/defi/defi-view';
import { PageHeader } from '@/components/shared/page-header';

export const metadata: Metadata = {
  title: 'DeFi Positions',
  description:
    'Liquidity, lending, and staking positions unwrapped into the tokens behind them, with fee tiers, price ranges, and yields.',
  openGraph: {
    title: 'DeFi Positions | DeFi Portfolio Dashboard',
    description:
      'Liquidity, lending, and staking positions unwrapped into the tokens behind them, with fee tiers, price ranges, and yields.',
    type: 'website'
  }
};

export default function DefiPage() {
  return (
    <>
      <PageHeader
        title="DeFi Positions"
        description="Liquidity, lending, and staking positions unwrapped into the tokens behind them."
        className="mb-10"
      />

      <DefiView />
    </>
  );
}
