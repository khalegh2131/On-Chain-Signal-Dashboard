import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NFT_SORT,
  filterNfts,
  hasActiveNftFilters,
  matchesNftQuery,
  nftChainIds,
  nftCollectionCount,
  sortNfts
} from '@/lib/utils/nft';
import type { NftItem } from '@/types';

const ETHEREUM = 1;
const ARBITRUM = 42161;
const BASE = 8453;

const APE = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D';
const PUDGY = '0xBd3531dA5CF5857e7CfAA92426877b022e612cf8';
const AZUKI = '0xED5AF388653567Af2F388E6224dC7C4b3241C544';

function nft(overrides: Partial<NftItem> = {}): NftItem {
  const chainId = overrides.chainId ?? ETHEREUM;
  const contractAddress = overrides.contractAddress ?? APE;
  const tokenId = overrides.tokenId ?? '1';

  return {
    chainId,
    contractAddress,
    tokenId,
    id: `${chainId}:${contractAddress.toLowerCase()}:${tokenId}`,
    collectionName: 'Bored Ape Yacht Club',
    name: `Bored Ape #${tokenId}`,
    description: null,
    imageUrl: null,
    floorPriceNative: 12.4,
    floorPriceUsd: 38_967,
    openseaUrl: null,
    spamClassification: 'not_spam',
    ...overrides
  };
}

/** A fixed gallery: two collections on Ethereum, one on Arbitrum, one on Base. */
const ITEMS: readonly NftItem[] = [
  nft({ tokenId: '8817', acquiredAt: 1_700_000_000_000 }),
  nft({
    tokenId: '3129',
    acquiredAt: 1_710_000_000_000,
    collectionName: 'Bored Ape Yacht Club',
    name: 'Bored Ape #3129'
  }),
  nft({
    contractAddress: PUDGY,
    tokenId: '5412',
    collectionName: 'Pudgy Penguins',
    name: 'Pudgy Penguin #5412',
    floorPriceUsd: 30_950,
    acquiredAt: 1_720_000_000_000
  }),
  nft({
    contractAddress: AZUKI,
    tokenId: '2231',
    chainId: ARBITRUM,
    collectionName: 'Azuki',
    name: 'Azuki #2231',
    floorPriceUsd: null,
    acquiredAt: 1_730_000_000_000
  }),
  nft({
    contractAddress: AZUKI,
    tokenId: '6604',
    chainId: BASE,
    collectionName: 'Azuki',
    name: null,
    floorPriceUsd: 17_660,
    acquiredAt: undefined
  })
];

describe('matchesNftQuery', () => {
  it('keeps everything for a blank query', () => {
    const item = nft();
    expect(matchesNftQuery(item, '')).toBe(true);
    expect(matchesNftQuery(item, '   ')).toBe(true);
  });

  it('matches the collection name, case-insensitively', () => {
    const item = nft();
    expect(matchesNftQuery(item, 'pudgy')).toBe(false);
    expect(matchesNftQuery(item, 'BORED ape')).toBe(true);
  });

  it('matches the token name as well as the collection', () => {
    const item = nft({ collectionName: 'Azuki', name: 'Azuki #2231' });
    expect(matchesNftQuery(item, '2231')).toBe(true);
  });

  it('does not treat a missing token name as a match', () => {
    expect(matchesNftQuery(nft({ name: null, collectionName: 'Azuki' }), 'penguin')).toBe(false);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(matchesNftQuery(nft(), '  ape  ')).toBe(true);
  });
});

describe('filterNfts', () => {
  it('returns every token when no filter is set', () => {
    expect(filterNfts(ITEMS)).toHaveLength(ITEMS.length);
  });

  it('narrows by collection name', () => {
    const matched = filterNfts(ITEMS, { query: 'pudgy' });
    expect(matched.map((item) => item.tokenId)).toEqual(['5412']);
  });

  it('narrows by token name', () => {
    const matched = filterNfts(ITEMS, { query: '#5412' });
    expect(matched.map((item) => item.tokenId)).toEqual(['5412']);
  });

  it('keeps one chain when a single chain is selected', () => {
    const matched = filterNfts(ITEMS, { chains: [ARBITRUM] });
    expect(matched.map((item) => item.chainId)).toEqual([ARBITRUM]);
  });

  it('keeps every selected chain in a multi-select', () => {
    const matched = filterNfts(ITEMS, { chains: [ARBITRUM, BASE] });
    expect(new Set(matched.map((item) => item.chainId))).toEqual(new Set([ARBITRUM, BASE]));
  });

  it('treats an empty chain selection as "no chain filter"', () => {
    expect(filterNfts(ITEMS, { chains: [] })).toHaveLength(ITEMS.length);
  });

  it('combines a query and a chain selection', () => {
    expect(filterNfts(ITEMS, { query: 'azuki', chains: [BASE] })).toHaveLength(1);
    expect(filterNfts(ITEMS, { query: 'azuki', chains: [ETHEREUM] })).toHaveLength(0);
  });

  it('returns nothing for a query that matches no collection or token', () => {
    expect(filterNfts(ITEMS, { query: 'zzzz-no-match' })).toEqual([]);
  });

  it('does not mutate the input list', () => {
    const input = [...ITEMS];
    filterNfts(input, { query: 'azuki', sort: 'collection-asc' });
    expect(input.map((item) => item.tokenId)).toEqual(ITEMS.map((item) => item.tokenId));
  });
});

describe('sortNfts', () => {
  it('defaults to the most recently acquired token first', () => {
    expect(DEFAULT_NFT_SORT).toBe('recent');
    expect(sortNfts(ITEMS).map((item) => item.tokenId)).toEqual([
      '2231',
      '5412',
      '3129',
      '8817',
      '6604'
    ]);
  });

  it('puts a token with no acquisition date last rather than first', () => {
    const ordered = sortNfts(ITEMS, 'recent');
    expect(ordered[ordered.length - 1]?.tokenId).toBe('6604');
  });

  it('orders by floor, highest first, with unpriced tokens last', () => {
    const ordered = sortNfts(ITEMS, 'floor-desc');
    expect(ordered.map((item) => item.tokenId)).toEqual(['3129', '8817', '5412', '6604', '2231']);
    expect(ordered.map((item) => item.floorPriceUsd)).toEqual([
      38_967,
      38_967,
      30_950,
      17_660,
      null
    ]);
    expect(ordered[ordered.length - 1]?.chainId).toBe(ARBITRUM);
  });

  it('orders by collection name, then token id numerically', () => {
    const ordered = sortNfts(ITEMS, 'collection-asc');
    expect(ordered.map((item) => `${item.collectionName} ${item.tokenId}`)).toEqual([
      'Azuki 2231',
      'Azuki 6604',
      'Bored Ape Yacht Club 3129',
      'Bored Ape Yacht Club 8817',
      'Pudgy Penguins 5412'
    ]);
  });

  it('breaks a floor tie by collection and token id', () => {
    const tied = [
      nft({ tokenId: '2', floorPriceUsd: 100 }),
      nft({ tokenId: '10', floorPriceUsd: 100 })
    ];
    expect(sortNfts(tied, 'floor-desc').map((item) => item.tokenId)).toEqual(['2', '10']);
  });

  it('leaves the input array untouched', () => {
    const input = [...ITEMS];
    sortNfts(input, 'floor-desc');
    expect(input.map((item) => item.tokenId)).toEqual(ITEMS.map((item) => item.tokenId));
  });
});

describe('nftChainIds', () => {
  it('lists only the chains present in the data', () => {
    expect(new Set(nftChainIds(ITEMS))).toEqual(new Set([ETHEREUM, ARBITRUM, BASE]));
  });

  it('honours a preferred order and appends the rest', () => {
    expect(nftChainIds(ITEMS, [ARBITRUM, ETHEREUM, 999])).toEqual([ARBITRUM, ETHEREUM, BASE]);
  });

  it('returns nothing for an empty gallery', () => {
    expect(nftChainIds([])).toEqual([]);
  });
});

describe('nftCollectionCount', () => {
  it('counts distinct contracts, not tokens', () => {
    // Three Bored Apes, one Pudgy, two Azuki tokens on two chains.
    expect(nftCollectionCount(ITEMS)).toBe(4);
  });

  it('treats one contract on two chains as two collections', () => {
    expect(nftCollectionCount([nft({ chainId: 1 }), nft({ chainId: ARBITRUM })])).toBe(2);
  });

  it('returns zero for an empty gallery', () => {
    expect(nftCollectionCount([])).toBe(0);
  });
});

describe('hasActiveNftFilters', () => {
  it('is false for an untouched filter bar', () => {
    expect(hasActiveNftFilters({})).toBe(false);
    expect(hasActiveNftFilters({ query: '   ', chains: [] })).toBe(false);
  });

  it('is true when a query or a chain is set', () => {
    expect(hasActiveNftFilters({ query: 'ape' })).toBe(true);
    expect(hasActiveNftFilters({ chains: [ETHEREUM] })).toBe(true);
  });
});
