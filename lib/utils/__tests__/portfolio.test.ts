import { describe, expect, it } from 'vitest';

import {
  ALLOCATION_PALETTE,
  filterTokens,
  sortTokens,
  toChainBreakdown,
  toTopHoldings
} from '@/lib/utils/portfolio';
import type { Chain, ChainBalance, TokenBalance } from '@/types';

const CHAIN_1: Chain = {
  id: 1,
  name: 'Ethereum',
  shortName: 'ETH',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  explorerUrl: 'https://etherscan.io',
  alchemySubdomain: 'eth-mainnet',
  publicRpcUrl: 'https://ethereum-rpc.publicnode.com',
  coinGeckoPlatformId: 'ethereum',
  coinGeckoNativeId: 'ethereum',
  openseaSlug: 'ethereum',
  color: '#627eea',
  isTestnet: false
};

const CHAIN_42161: Chain = {
  ...CHAIN_1,
  id: 42161,
  name: 'Arbitrum One',
  shortName: 'ARB',
  color: '#28a0f0'
};

/** Chosen so the sorted order differs from the input order. */
const CHAINS: readonly Chain[] = [CHAIN_42161, CHAIN_1];

function rollup(chainId: number, totalValueUsd: number, tokenCount: number): ChainBalance {
  return { chainId, totalValueUsd, tokenCount };
}

function token(overrides: Partial<TokenBalance> = {}): TokenBalance {
  return {
    chainId: 1,
    address: '0x0000000000000000000000000000000000000001',
    symbol: 'TKN',
    name: 'Token',
    decimals: 18,
    kind: 'erc20',
    rawBalance: '1000000000000000000',
    balance: 1,
    isPriceable: true,
    priceUsd: 1,
    valueUsd: 1,
    ...overrides
  };
}

describe('toChainBreakdown', () => {
  const byChain: Record<number, ChainBalance> = {
    1: rollup(1, 7_500, 4),
    42161: rollup(42161, 2_500, 2),
    // Read as part of the snapshot but carrying nothing.
    11155111: rollup(11155111, 0, 0),
    // No metadata for this id anywhere in the config, so it must be dropped.
    999999: rollup(999999, 500, 1)
  };

  it('ranks chains by value and measures each share against the listed entries', () => {
    const entries = toChainBreakdown(byChain, CHAINS);

    expect(entries.map((entry) => entry.chainId)).toEqual([1, 42161]);
    expect(entries[0]?.share).toBeCloseTo(7_500 / 10_000, 10);
    expect(entries[1]?.share).toBeCloseTo(2_500 / 10_000, 10);
    // The two listed shares must account for the whole ring the donut draws,
    // which is why the unlabellable chain is dropped from the denominator.
    expect(entries.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1, 10);
  });

  it('carries the display metadata the views need', () => {
    const [first] = toChainBreakdown(byChain, CHAINS);

    expect(first).toMatchObject({
      name: 'Ethereum',
      shortName: 'ETH',
      chainColor: '#627eea',
      valueUsd: 7_500,
      tokenCount: 4
    });
  });

  it('assigns palette colours by rank so the donut and the bars agree', () => {
    const entries = toChainBreakdown(byChain, CHAINS);

    expect(entries[0]?.color).toBe(ALLOCATION_PALETTE[0]);
    expect(entries[1]?.color).toBe(ALLOCATION_PALETTE[1]);
  });

  it('drops chains with no value unless they are asked for', () => {
    expect(toChainBreakdown(byChain, CHAINS)).toHaveLength(2);

    const withEmpty = toChainBreakdown(byChain, CHAINS, { includeEmpty: true });
    expect(withEmpty.map((entry) => entry.chainId)).toEqual([1, 42161, 11155111]);
    expect(withEmpty[2]?.share).toBe(0);
  });

  it('reports zero shares instead of dividing by an empty portfolio', () => {
    const entries = toChainBreakdown({ 1: rollup(1, 0, 0) }, CHAINS, { includeEmpty: true });

    expect(entries.every((entry) => entry.share === 0)).toBe(true);
  });
});

describe('filterTokens', () => {
  const tokens = [
    token({ symbol: 'USDC', name: 'USD Coin' }),
    token({
      symbol: 'WETH',
      name: 'Wrapped Ether',
      address: '0x00000000000000000000000000000000000000ff'
    }),
    token({ symbol: 'ARB', name: 'Arbitrum', chainId: 42161 })
  ];

  it('returns everything for a blank query', () => {
    expect(filterTokens(tokens, '   ')).toHaveLength(3);
  });

  it('matches symbol, name, and contract address', () => {
    expect(filterTokens(tokens, 'usdc').map((entry) => entry.symbol)).toEqual(['USDC']);
    expect(filterTokens(tokens, 'ether').map((entry) => entry.symbol)).toEqual(['WETH']);
    expect(filterTokens(tokens, '00ff').map((entry) => entry.symbol)).toEqual(['WETH']);
    expect(filterTokens(tokens, '0x00000000000000000000000000000000000000ff')).toHaveLength(1);
    expect(filterTokens(tokens, '42161').map((entry) => entry.symbol)).toEqual(['ARB']);
  });

  it('returns nothing when the query matches nothing', () => {
    expect(filterTokens(tokens, 'doge')).toEqual([]);
  });
});

describe('sortTokens', () => {
  const tokens = [
    token({ symbol: 'ARB', valueUsd: 30 }),
    token({ symbol: 'WETH', valueUsd: 900 }),
    token({ symbol: 'LP', valueUsd: null, isPriceable: false }),
    token({ symbol: 'USDC', valueUsd: 70 })
  ];

  it('orders by value in both directions, unpriced rows last', () => {
    expect(sortTokens(tokens, 'value-desc').map((entry) => entry.symbol)).toEqual([
      'WETH',
      'USDC',
      'ARB',
      'LP'
    ]);
    expect(sortTokens(tokens, 'value-asc').map((entry) => entry.symbol)).toEqual([
      'ARB',
      'USDC',
      'WETH',
      'LP'
    ]);
  });

  it('orders alphabetically by symbol', () => {
    expect(sortTokens(tokens, 'symbol-asc').map((entry) => entry.symbol)).toEqual([
      'ARB',
      'LP',
      'USDC',
      'WETH'
    ]);
  });

  it('leaves the input untouched', () => {
    const before = tokens.map((entry) => entry.symbol);
    sortTokens(tokens, 'value-asc');
    expect(tokens.map((entry) => entry.symbol)).toEqual(before);
  });
});

describe('toTopHoldings', () => {
  const tokens = [
    token({ symbol: 'A', valueUsd: 1 }),
    token({ symbol: 'B', valueUsd: 50 }),
    token({ symbol: 'C', valueUsd: 10 })
  ];

  it('keeps the largest rows, in order', () => {
    expect(toTopHoldings(tokens, 2).map((entry) => entry.symbol)).toEqual(['B', 'C']);
  });

  it('handles a limit of zero and one beyond the list', () => {
    expect(toTopHoldings(tokens, 0)).toEqual([]);
    expect(toTopHoldings(tokens, 10)).toHaveLength(3);
  });
});
