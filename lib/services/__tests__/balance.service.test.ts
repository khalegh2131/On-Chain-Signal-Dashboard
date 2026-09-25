import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getNativeBalance,
  getTokenBalances,
  getTokenMetadataBatch
} from '@/lib/api/alchemy.client';
import { InvalidAddressError } from '@/lib/api/errors';
import {
  calculateTotalValue,
  classifyToken,
  fetchChainBalances,
  fetchPortfolioBalances,
  isLiquidityPoolToken
} from '@/lib/services/balance.service';
import { fetchTokenPrices, priceKey } from '@/lib/services/price.service';
import { NATIVE_TOKEN_ADDRESS } from '@/types';
import type { Chain, PriceMap, TokenBalance } from '@/types';

vi.mock('@/lib/api/alchemy.client', () => ({
  getNativeBalance: vi.fn(),
  getTokenBalances: vi.fn(),
  getTokenMetadataBatch: vi.fn()
}));

// Only the network call is stubbed; `priceKey` stays the real implementation so
// the test cannot drift from how balances are actually keyed.
vi.mock('@/lib/services/price.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/price.service')>();
  return { ...actual, fetchTokenPrices: vi.fn() };
});

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const;
const UNI_V2 = '0x00000000000000000000000000000000000000ab' as const;
const WALLET = '0x1111111111111111111111111111111111111111' as const;

const CHAIN: Chain = {
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

const OTHER_CHAIN: Chain = {
  ...CHAIN,
  id: 42161,
  name: 'Arbitrum One',
  shortName: 'ARB',
  alchemySubdomain: 'arb-mainnet',
  publicRpcUrl: 'https://arb1.arbitrum.io/rpc',
  coinGeckoPlatformId: 'arbitrum-one',
  openseaSlug: 'arbitrum'
};

const mocks = {
  getNativeBalance: vi.mocked(getNativeBalance),
  getTokenBalances: vi.mocked(getTokenBalances),
  getTokenMetadataBatch: vi.mocked(getTokenMetadataBatch),
  fetchTokenPrices: vi.mocked(fetchTokenPrices)
};

/** Prices for ETH at $2,000 (+10% in 24h) on both chains and USDC at $1 (flat). */
function mockPrices(): PriceMap {
  const eth = { usd: 2_000, change24h: 10, source: 'coingecko' as const, updatedAt: 1 };
  return {
    [priceKey(NATIVE_TOKEN_ADDRESS, 1)]: eth,
    [priceKey(NATIVE_TOKEN_ADDRESS, 42161)]: eth,
    [USDC]: { usd: 1, change24h: 0, source: 'coingecko', updatedAt: 1 }
  };
}

function erc20Row(overrides: Partial<TokenBalance> = {}): TokenBalance {
  return {
    chainId: 1,
    address: USDC,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    kind: 'erc20',
    rawBalance: '100000000',
    balance: 100,
    isPriceable: true,
    priceUsd: null,
    valueUsd: null,
    ...overrides
  };
}

describe('balance service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getTokenMetadataBatch.mockResolvedValue(new Map());
    mocks.fetchTokenPrices.mockResolvedValue({});
  });

  it('returns an empty snapshot for an empty address without touching any client', async () => {
    const portfolio = await fetchPortfolioBalances('' as `0x${string}`, [CHAIN]);

    expect(portfolio).toMatchObject({ totalValueUsd: 0, tokens: [], lpPositions: [], errors: [] });
    expect(portfolio.byChain[1]).toEqual({ chainId: 1, totalValueUsd: 0, tokenCount: 0 });
    expect(mocks.getNativeBalance).not.toHaveBeenCalled();
  });

  it('returns an empty snapshot for the zero address', async () => {
    const portfolio = await fetchPortfolioBalances(NATIVE_TOKEN_ADDRESS, [CHAIN]);

    expect(portfolio.address).toBe(NATIVE_TOKEN_ADDRESS);
    expect(portfolio.totalValueUsd).toBe(0);
    expect(portfolio.change24hPercent).toBeNull();
    expect(mocks.getTokenBalances).not.toHaveBeenCalled();
  });

  it('rejects a malformed address before dialling any upstream', async () => {
    await expect(fetchPortfolioBalances('0xnope', [CHAIN])).rejects.toBeInstanceOf(
      InvalidAddressError
    );
    expect(mocks.getNativeBalance).not.toHaveBeenCalled();
  });

  it('aggregates two chains, prices the rows, and buckets LP shares out of the total', async () => {
    mocks.getNativeBalance.mockImplementation(async (_owner, chain) =>
      chain.id === 1 ? 1_500_000_000_000_000_000n : 2_000_000_000_000_000_000n
    );
    mocks.getTokenBalances.mockImplementation(async (_owner, chain) =>
      chain.id === 1
        ? [
            { contractAddress: USDC, tokenBalance: '0x5f5e100' },
            { contractAddress: UNI_V2, tokenBalance: '0x4563918244f40000' },
            {
              contractAddress: '0x00000000000000000000000000000000000000cd' as const,
              tokenBalance: '0x0'
            }
          ]
        : []
    );
    mocks.getTokenMetadataBatch.mockResolvedValue(
      new Map([
        [USDC, { symbol: 'USDC', name: 'USD Coin', decimals: 6, logo: null }],
        [UNI_V2, { symbol: 'UNI-V2', name: 'Uniswap V2', decimals: 18, logo: null }]
      ])
    );
    mocks.fetchTokenPrices.mockResolvedValue(mockPrices());

    const portfolio = await fetchPortfolioBalances(WALLET, [CHAIN, OTHER_CHAIN]);

    // Chain 1: 1.5 ETH at $2,000 + 100 USDC at $1. Chain 42161: 2 ETH. The LP share
    // is bucketed, so it is excluded from the total.
    expect(portfolio.totalValueUsd).toBeCloseTo(7_100, 6);
    expect(portfolio.tokens.map((token) => token.symbol)).toEqual(['ETH', 'ETH', 'USDC']);
    expect(portfolio.lpPositions).toHaveLength(1);
    expect(portfolio.lpPositions[0]).toMatchObject({
      symbol: 'UNI-V2',
      balance: 5,
      isPriceable: false
    });

    // The zero-balance token is filtered out before metadata is even fetched.
    expect(portfolio.tokens).toHaveLength(3);

    expect(portfolio.byChain[1]).toEqual({ chainId: 1, totalValueUsd: 3_100, tokenCount: 2 });
    expect(portfolio.byChain[42161]).toEqual({
      chainId: 42161,
      totalValueUsd: 4_000,
      tokenCount: 1
    });

    // Weighted by position size: +10% on the ETH rows against a flat stablecoin.
    expect(portfolio.change24hUsd).toBeGreaterThan(600);
    expect(portfolio.change24hPercent).toBeGreaterThan(9);
    expect(portfolio.change24hPercent).toBeLessThan(10);
  });

  it('keeps the chains that answered when one chain fails', async () => {
    mocks.getNativeBalance.mockImplementation(async (_owner, chain) => {
      if (chain.id === 42161) throw new Error('arbitrum RPC exploded');
      return 1_000_000_000_000_000_000n;
    });
    mocks.getTokenBalances.mockResolvedValue([]);
    mocks.fetchTokenPrices.mockResolvedValue({
      [priceKey(NATIVE_TOKEN_ADDRESS, 1)]: { usd: 2_000, source: 'coingecko', updatedAt: 1 }
    });

    const portfolio = await fetchPortfolioBalances(WALLET, [CHAIN, OTHER_CHAIN]);

    expect(portfolio.tokens.map((token) => token.symbol)).toEqual(['ETH']);
    expect(portfolio.errors).toHaveLength(1);
    expect(portfolio.errors[0]?.chainId).toBe(42161);
    expect(portfolio.errors[0]?.message).toContain('arbitrum RPC exploded');
  });

  it('still returns token rows when their metadata cannot be read', async () => {
    mocks.getNativeBalance.mockResolvedValue(0n);
    mocks.getTokenBalances.mockResolvedValue([
      { contractAddress: USDC, tokenBalance: '0x5f5e100' }
    ]);
    mocks.getTokenMetadataBatch.mockRejectedValue(new Error('metadata batch failed'));

    const result = await fetchChainBalances(WALLET, CHAIN);

    expect(result.balances).toHaveLength(1);
    expect(result.balances[0]?.symbol).toBe('0xa0b…b48');
    expect(result.balances[0]?.decimals).toBe(18);
    expect(result.errors).toHaveLength(1);
  });

  it('detects pool-share tokens by symbol, by name, and by the explicit allowlist', () => {
    expect(
      isLiquidityPoolToken({ chainId: 1, address: USDC, symbol: 'UNI-V2', name: 'Uniswap V2' })
    ).toBe(true);
    expect(
      isLiquidityPoolToken({ chainId: 1, address: USDC, symbol: 'SLP', name: 'SushiSwap LP' })
    ).toBe(true);
    expect(
      isLiquidityPoolToken({ chainId: 1, address: USDC, symbol: 'CAKE-LP', name: 'Pancake LP' })
    ).toBe(true);
    expect(
      isLiquidityPoolToken({
        chainId: 1,
        address: USDC,
        symbol: 'XYZ',
        name: 'Balancer Pool Token'
      })
    ).toBe(true);
    expect(
      isLiquidityPoolToken({ chainId: 1, address: USDC, symbol: 'USDC', name: 'USD Coin' })
    ).toBe(false);

    expect(classifyToken({ chainId: 1, address: USDC, symbol: 'UNI-V2', name: 'Uniswap V2' })).toBe(
      'lp'
    );
    expect(classifyToken({ chainId: 1, address: USDC, symbol: 'USDC', name: 'USD Coin' })).toBe(
      'erc20'
    );
  });

  it('weights the 24h change by position size rather than averaging percentages', () => {
    const balances: TokenBalance[] = [
      erc20Row({
        address: NATIVE_TOKEN_ADDRESS,
        kind: 'native',
        balance: 1,
        rawBalance: '1000000000000000000'
      }),
      erc20Row({ address: USDC, balance: 100 })
    ];
    const prices: PriceMap = {
      [priceKey(NATIVE_TOKEN_ADDRESS, 1)]: {
        usd: 2_000,
        change24h: 10,
        source: 'coingecko',
        updatedAt: 1
      },
      [USDC]: { usd: 1, change24h: 0, source: 'coingecko', updatedAt: 1 }
    };

    const totals = calculateTotalValue(balances, prices);

    expect(totals.totalValue).toBeCloseTo(2_100, 6);
    // Yesterday: 2000 / 1.1 + 100 = 1918.18, so the delta is +181.82 on that base.
    expect(totals.change24h).toBeCloseTo(181.82, 1);
    expect(totals.change24hPct).toBeCloseTo(9.48, 1);
  });

  it('reports no change when no quote carried one', () => {
    const totals = calculateTotalValue([erc20Row()], {
      [USDC]: { usd: 1, source: 'coingecko', updatedAt: 1 }
    });

    expect(totals).toEqual({ totalValue: 100, change24h: 0, change24hPct: 0 });
  });

  it('excludes LP shares and unpriced rows from the total', () => {
    const totals = calculateTotalValue(
      [
        erc20Row({ kind: 'lp', isPriceable: false, balance: 5 }),
        erc20Row({ address: '0x00000000000000000000000000000000000000ef', isPriceable: false })
      ],
      {}
    );

    expect(totals.totalValue).toBe(0);
  });
});
