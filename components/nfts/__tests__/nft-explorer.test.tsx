// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { NftExplorer } from '@/components/nfts/nft-explorer';
import { createMockNfts } from '@/lib/mock';
import type { NftItem } from '@/types';

/**
 * The gallery's controls against a fixed set of tokens.
 *
 * Every demo token carries a marketplace link, so the rendered links are an
 * exact count of the tiles on screen — which is what makes an assertion about
 * filtering mean what it says.
 */

function nft(input: { chainId: number; tokenId: string; collectionName: string }): NftItem {
  const contract = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D';

  return {
    chainId: input.chainId,
    contractAddress: contract,
    tokenId: input.tokenId,
    id: `${input.chainId}:${contract}:${input.tokenId}`,
    collectionName: input.collectionName,
    name: `${input.collectionName} #${input.tokenId}`,
    description: null,
    imageUrl: null,
    floorPriceNative: 1,
    floorPriceUsd: 3000,
    openseaUrl: `https://opensea.io/assets/${input.chainId}/${contract}/${input.tokenId}`,
    spamClassification: 'not_spam'
  };
}

/** Two chains, so the chain filter has something to exclude. */
const MULTI_CHAIN: NftItem[] = [
  nft({ chainId: 1, tokenId: '1', collectionName: 'Bored Ape Yacht Club' }),
  nft({ chainId: 1, tokenId: '2', collectionName: 'Bored Ape Yacht Club' }),
  nft({ chainId: 42161, tokenId: '3', collectionName: 'Pudgy Penguins' })
];

describe('NftExplorer', () => {
  it('renders every token before any filter is applied', () => {
    const items = createMockNfts();
    render(<NftExplorer items={items} />);

    expect(screen.getAllByRole('link')).toHaveLength(items.length);
    expect(screen.queryByText('Nothing matches the current filters.')).not.toBeInTheDocument();
  });

  it('filters by collection name once the search settles', async () => {
    const user = userEvent.setup();
    render(<NftExplorer items={createMockNfts()} />);

    await user.type(screen.getByLabelText('Search collectibles'), 'pudgy');

    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(3));
  });

  it('filters by chain and restores the full set when the filter is cleared', async () => {
    const user = userEvent.setup();
    render(<NftExplorer items={MULTI_CHAIN} />);

    await user.click(screen.getByRole('button', { name: 'Arbitrum One' }));
    expect(screen.getAllByRole('link')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('shows a no-match state with a way out for a query that matches nothing', async () => {
    const user = userEvent.setup();
    render(<NftExplorer items={createMockNfts()} />);

    await user.type(screen.getByLabelText('Search collectibles'), 'zzzz-no-such-collection');

    await waitFor(() =>
      expect(screen.getByText('Nothing matches the current filters.')).toBeInTheDocument()
    );
    expect(screen.queryAllByRole('link')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /clear filters/i }));
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(8));
  });

  it('reports the count of what is on screen', async () => {
    const user = userEvent.setup();
    render(<NftExplorer items={MULTI_CHAIN} />);

    expect(screen.getByText(/across/)).toHaveTextContent('3 tokens across 2 collections');

    await user.click(screen.getByRole('button', { name: 'Ethereum' }));
    expect(screen.getByText(/across/)).toHaveTextContent('2 tokens across 1 collection');
  });

  it('renders the empty state with its action when there is nothing to show', () => {
    render(
      <NftExplorer items={[]} emptyAction={<button type="button">Connect a wallet</button>} />
    );

    expect(screen.getByText('No collectibles to show')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect a wallet' })).toBeInTheDocument();
  });
});
