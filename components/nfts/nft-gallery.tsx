'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useAccount } from 'wagmi';

import { WalletConnect } from '@/components/wallet/wallet-connect';
import { ACTIVE_CHAINS } from '@/config/chains';
import { createMockNfts } from '@/lib/mock';
import { fetchNfts } from '@/lib/services/nft.service';
import type { NftFetchResult } from '@/types';

import { NftExplorer } from './nft-explorer';

/**
 * NFT page composition.
 *
 * Metadata and floors change on the scale of hours, so this read is cached far
 * longer than balances and never polled. The demo set stands in while no wallet
 * is connected, which keeps the filters, the grouping and the floors exercisable
 * without an indexer key.
 */

const NFT_STALE_MS = 5 * 60_000;

export function NftGallery() {
  const { address, isConnected } = useAccount();
  const demo = !isConnected;

  const { data, isLoading, isError, error, refetch } = useQuery<NftFetchResult>({
    queryKey: ['nfts', address ?? '', ACTIVE_CHAINS.map((chain) => chain.id).join(',')],
    queryFn: () => fetchNfts(address as `0x${string}`, ACTIVE_CHAINS),
    enabled: Boolean(address),
    staleTime: NFT_STALE_MS
  });

  const items = useMemo(() => (demo ? createMockNfts() : (data?.items ?? [])), [demo, data]);

  const chainOrder = useMemo(() => ACTIVE_CHAINS.map((chain) => chain.id), []);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <div className="space-y-6">
      {demo ? (
        <p className="text-xs text-muted-foreground">
          Showing a demo collection - connect a wallet to read the tokens a real address holds.
        </p>
      ) : null}

      <NftExplorer
        items={items}
        isLoading={!demo && isLoading}
        isError={!demo && isError}
        errorMessage={error?.message}
        onRetry={retry}
        chainOrder={chainOrder}
        emptyAction={<WalletConnect />}
      />
    </div>
  );
}
