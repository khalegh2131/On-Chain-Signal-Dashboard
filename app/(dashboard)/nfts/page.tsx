import type { Metadata } from 'next';

import { NftGallery } from '@/components/nfts/nft-gallery';
import { PageHeader } from '@/components/shared/page-header';

export const metadata: Metadata = {
  title: 'NFTs',
  description:
    'Collectibles held by the connected address, grouped by contract with floor prices and spam-flagged airdrops filtered out.',
  openGraph: {
    title: 'NFTs | DeFi Portfolio Dashboard',
    description:
      'Collectibles held by the connected address, grouped by contract with floor prices and spam-flagged airdrops filtered out.',
    type: 'website'
  }
};

export default function NftsPage() {
  return (
    <>
      <PageHeader
        title="NFTs"
        description="Collections held by the connected address, with floor prices and spam filtering."
        className="mb-10"
      />

      <NftGallery />
    </>
  );
}
