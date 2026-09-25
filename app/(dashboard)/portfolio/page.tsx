import type { Metadata } from 'next';

import { AddTokenDialog } from '@/components/portfolio/add-token-dialog';
import { PortfolioView } from '@/components/portfolio/portfolio-view';
import { PageHeader } from '@/components/shared/page-header';

export const metadata: Metadata = {
  title: 'Portfolio',
  description:
    'Every token an address holds, priced per chain, sorted by value, with the tokens this browser watches folded in.',
  openGraph: {
    title: 'Portfolio | DeFi Portfolio Dashboard',
    description:
      'Every token an address holds, priced per chain, sorted by value, with the tokens this browser watches folded in.',
    type: 'website'
  }
};

export default function PortfolioPage() {
  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Every token an address holds, priced and grouped by chain, sorted by value."
        actions={<AddTokenDialog size="sm" />}
        className="mb-10"
      />

      <PortfolioView />
    </>
  );
}
