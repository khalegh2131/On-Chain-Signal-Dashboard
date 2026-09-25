import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getAddress } from 'viem';
import { describe, expect, it } from 'vitest';

import { createMockNftCollections, createMockNfts } from '@/lib/mock/nfts';
import {
  DEMO_ADDRESS,
  MOCK_ETH_USD,
  MOCK_HOLDINGS,
  MOCK_SUMMARY,
  createMockBalances,
  createMockPortfolio
} from '@/lib/mock/portfolio';
import { toTokenAmount } from '@/lib/utils/format';
import { NATIVE_TOKEN_ADDRESS } from '@/types';

/** Fixed clock so two snapshots can be compared field for field. */
const FIXED_NOW = Date.UTC(2026, 8, 23, 12, 0, 0);

describe('demo portfolio', () => {
  const portfolio = createMockPortfolio(DEMO_ADDRESS, FIXED_NOW);

  it('splits priced rows from the pool share', () => {
    expect(portfolio.tokens).toHaveLength(8);
    expect(portfolio.lpPositions).toHaveLength(1);
    expect(portfolio.lpPositions[0]?.symbol).toBe('UNI-V2');
    expect(portfolio.tokens.every((token) => token.kind !== 'lp')).toBe(true);
    expect(portfolio.errors).toEqual([]);
    expect(portfolio.address).toBe(DEMO_ADDRESS);
    expect(portfolio.updatedAt).toBe(FIXED_NOW);
  });

  it('is deterministic for a fixed clock', () => {
    expect(createMockPortfolio(DEMO_ADDRESS, FIXED_NOW)).toEqual(portfolio);
  });

  it('totals exactly the rows it is built from', () => {
    const summed = portfolio.tokens.reduce((total, token) => total + (token.valueUsd ?? 0), 0);

    expect(portfolio.totalValueUsd).toBeCloseTo(summed, 6);
    expect(MOCK_SUMMARY.totalValueUsd).toBeCloseTo(portfolio.totalValueUsd, 6);
    // A plausible wallet, not a dust pile and not a whale.
    expect(portfolio.totalValueUsd).toBeGreaterThan(10_000);
    expect(portfolio.totalValueUsd).toBeLessThan(250_000);
  });

  it('reports a positive 24h change weighted across the priced rows', () => {
    expect(portfolio.change24hUsd).toBeGreaterThan(0);
    expect(portfolio.change24hPercent).toBeGreaterThan(0);
    // Ether is up ~1.9% and dominates the portfolio, so the blend sits near it
    // rather than at the average of a +1.9% and a -2.4% row.
    expect(portfolio.change24hPercent).toBeGreaterThan(1);
    expect(portfolio.change24hPercent).toBeLessThan(2.5);
    expect(portfolio.change24hPercent).toBeCloseTo(MOCK_SUMMARY.change24hPercent ?? 0, 6);
  });

  it('ranks holdings by value and keeps the pool share out of the ranking', () => {
    const values = portfolio.tokens.map((token) => token.valueUsd ?? 0);
    expect(values).toEqual([...values].sort((left, right) => right - left));
  });

  it('rolls up per chain including the pool share in the asset count', () => {
    expect(portfolio.byChain[1]).toMatchObject({ chainId: 1, tokenCount: 6 });
    expect(portfolio.byChain[42161]).toMatchObject({ chainId: 42161, tokenCount: 3 });

    const onEthereum = portfolio.tokens
      .filter((token) => token.chainId === 1)
      .reduce((total, token) => total + (token.valueUsd ?? 0), 0);
    expect(portfolio.byChain[1]?.totalValueUsd).toBeCloseTo(onEthereum, 6);
  });

  it('keeps base units and display amounts consistent', () => {
    const rows = createMockBalances();

    for (const row of rows) {
      expect(row.rawBalance).toMatch(/^\d+$/);
      expect(row.balance).toBeCloseTo(toTokenAmount(row.rawBalance, row.decimals), 10);
    }
  });

  it('describes every holding with a usable address and amount', () => {
    expect(DEMO_ADDRESS).toMatch(/^0x[0-9a-f]{40}$/);
    expect(MOCK_HOLDINGS.length).toBeGreaterThan(0);

    for (const holding of MOCK_HOLDINGS) {
      expect(holding.decimals).toBeGreaterThanOrEqual(0);
      expect(Number(holding.amount)).toBeGreaterThan(0);
    }

    expect(MOCK_HOLDINGS.filter((holding) => holding.kind === 'native')).toHaveLength(2);
    expect(
      MOCK_HOLDINGS.filter((holding) => holding.address === NATIVE_TOKEN_ADDRESS)
    ).toHaveLength(2);
  });

  it('quotes every contract address as a valid EIP-55 checksum', () => {
    const contracts = MOCK_HOLDINGS.filter((holding) => holding.address !== NATIVE_TOKEN_ADDRESS);

    expect(contracts.length).toBeGreaterThan(0);

    for (const holding of contracts) {
      // `getAddress` re-checksums the lowercase form. A mistyped address fails
      // this with overwhelming probability, so the demo cannot ship one that a
      // reader might paste into a wallet.
      expect(getAddress(holding.address), holding.symbol).toBe(holding.address);
    }
  });

  it('leaves the pool share unpriced', () => {
    const share = createMockBalances().find((row) => row.kind === 'lp');

    expect(share?.isPriceable).toBe(false);
    expect(share?.priceUsd).toBeNull();
    expect(share?.valueUsd).toBeNull();
  });
});

describe('demo NFTs', () => {
  const items = createMockNfts();

  it('covers three real collections', () => {
    const collections = createMockNftCollections();

    expect(items).toHaveLength(8);
    expect(collections).toHaveLength(3);
    expect(collections.map((collection) => collection.count)).toEqual([3, 3, 2]);
    expect(collections.map((collection) => collection.name)).toEqual([
      'Bored Ape Yacht Club',
      'Pudgy Penguins',
      'Azuki'
    ]);
  });

  it('gives every token a unique id and a well-formed OpenSea link', () => {
    const ids = new Set(items.map((item) => item.id));
    expect(ids.size).toBe(items.length);

    for (const item of items) {
      expect(item.openseaUrl).toMatch(
        new RegExp(`^https://opensea\\.io/assets/ethereum/${item.contractAddress}/${item.tokenId}$`)
      );
    }
  });

  it('points every token at artwork that is actually on disk', () => {
    for (const item of items) {
      expect(item.imageUrl).toMatch(/^\/mock\/nft-\d{2}\.svg$/);

      const file = resolve(process.cwd(), 'public', (item.imageUrl ?? '').replace(/^\//, ''));
      expect(existsSync(file), `missing artwork for ${item.id}`).toBe(true);
    }
  });

  it('starts every artwork with an XML declaration', () => {
    // Next's image optimiser sniffs magic bytes and only recognises an SVG that
    // opens with `<?xml`; without that line it answers 400 and every card in the
    // gallery silently loses its image.
    for (const item of items) {
      const file = resolve(process.cwd(), 'public', (item.imageUrl ?? '').replace(/^\//, ''));
      expect(readFileSync(file, 'utf8').startsWith('<?xml'), item.imageUrl ?? '').toBe(true);
    }
  });

  it('quotes floors in eth and in usd at one shared rate', () => {
    for (const item of items) {
      expect(item.floorPriceNative).toBeGreaterThan(0);
      expect(item.floorPriceUsd).toBeCloseTo((item.floorPriceNative ?? 0) * MOCK_ETH_USD, 6);
      expect(item.spamClassification).toBe('not_spam');
    }
  });
});
