import { parseUnits } from 'viem';

import { calculateTotalValue } from '@/lib/services/balance.service';
import { priceKey } from '@/lib/services/price.service';
import { toTokenAmount } from '@/lib/utils/format';
import { NATIVE_TOKEN_ADDRESS } from '@/types';
import type {
  ChainBalance,
  LpPosition,
  PortfolioBalances,
  PriceMap,
  TokenAssetKind,
  TokenBalance
} from '@/types';

/**
 * A realistic portfolio used whenever the dashboard has no wallet to read.
 *
 * Writing these numbers by hand rather than deriving them from a live read keeps
 * the shell, the charts, and the allocation split demonstrable without an RPC
 * key, which is the state most people first run this in. Everything is a plain
 * literal — no randomness, no clock — so the rendered figures are stable and the
 * totals below can be asserted in a test.
 */

/**
 * Demo wallet address.
 *
 * Deliberately not a real holder: attributing a fabricated portfolio to a live
 * address would read as a claim about that address rather than an example.
 */
export const DEMO_ADDRESS = '0x5f8b3a1c9d4e7a2b6c0f1d8e3a4b7c2d9e6f0a1b' as const;

/** Ether spot price the demo portfolio and the demo NFT floors are quoted against. */
export const MOCK_ETH_USD = 3142.55;

/**
 * Quotes for the other assets the demo references.
 *
 * Exported rather than inlined per row so the DeFi positions and the token
 * table quote the same asset at the same price — two demo datasets disagreeing
 * about what a token is worth is worse than either number being wrong.
 */
export const MOCK_USDC_USD = 0.9998;
export const MOCK_STETH_USD = 3168.2;
export const MOCK_ARB_USD = 0.842;

/**
 * Contract addresses the demo rows reference.
 *
 * Every one is the real deployment and every one is a valid EIP-55 checksum —
 * asserted in `lib/mock/__tests__/datasets.test.ts`, which is what stops a
 * mistyped address from being pasted into a wallet by someone reading the demo.
 */
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const;
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const STETH = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84' as const;
const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' as const;
const UNI_V2_POOL = '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc' as const;
const GMX = '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a' as const;
const USDC_E = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' as const;

/** One demo holding, before it is expanded into a {@link TokenBalance}. */
export interface MockHolding {
  chainId: number;
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  kind: TokenAssetKind;
  /** Human-readable amount, kept as text so base units stay exact. */
  amount: string;
  /** Spot price in USD, or `null` for a row with no standalone quote. */
  priceUsd: number | null;
  /** 24h change in percent; omitted for rows that carry no quote. */
  change24h?: number;
}

/**
 * The demo wallet.
 *
 * Two native balances because ETH on Ethereum and ETH on Arbitrum are separate
 * holdings, and the split is the whole point of a multi-chain view. The LP share
 * carries no price on purpose: pool reserves are what give it value, and those
 * are read per protocol rather than from a token quote.
 */
export const MOCK_HOLDINGS: readonly MockHolding[] = [
  {
    chainId: 1,
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    kind: 'native',
    amount: '1.8423',
    priceUsd: MOCK_ETH_USD,
    change24h: 1.86
  },
  {
    chainId: 1,
    address: WETH,
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    kind: 'erc20',
    amount: '4.2841',
    priceUsd: MOCK_ETH_USD,
    change24h: 1.86
  },
  {
    chainId: 1,
    address: USDC,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    kind: 'erc20',
    amount: '12480.52',
    priceUsd: MOCK_USDC_USD,
    change24h: -0.02
  },
  {
    chainId: 1,
    address: STETH,
    symbol: 'stETH',
    name: 'Lido Staked Ether',
    decimals: 18,
    kind: 'erc20',
    amount: '3.1054',
    priceUsd: MOCK_STETH_USD,
    change24h: 1.74
  },
  {
    chainId: 1,
    address: UNI,
    symbol: 'UNI',
    name: 'Uniswap',
    decimals: 18,
    kind: 'erc20',
    amount: '412.5',
    priceUsd: 9.87,
    change24h: -2.41
  },
  {
    chainId: 1,
    address: UNI_V2_POOL,
    symbol: 'UNI-V2',
    name: 'Uniswap V2 ETH/USDC',
    decimals: 18,
    kind: 'lp',
    amount: '15.7231',
    priceUsd: null
  },
  {
    chainId: 42161,
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    kind: 'native',
    amount: '0.6412',
    priceUsd: MOCK_ETH_USD,
    change24h: 1.86
  },
  {
    chainId: 42161,
    address: GMX,
    symbol: 'GMX',
    name: 'GMX',
    decimals: 18,
    kind: 'erc20',
    amount: '128.4512',
    priceUsd: 42.18,
    change24h: 6.4
  },
  {
    chainId: 42161,
    address: USDC_E,
    symbol: 'USDC.e',
    name: 'USD Coin (Arbitrum)',
    decimals: 6,
    kind: 'erc20',
    amount: '2150.75',
    priceUsd: MOCK_USDC_USD,
    change24h: -0.02
  }
];

/** Aggregate figures for the demo portfolio, derived once from the table above. */
export interface MockPortfolioSummary {
  totalValueUsd: number;
  change24hUsd: number;
  change24hPercent: number | null;
}

/** Expand one table entry into the row shape every reader returns. */
function toBalance(holding: MockHolding): TokenBalance {
  const rawBalance = parseUnits(holding.amount, holding.decimals).toString();
  const balance = toTokenAmount(rawBalance, holding.decimals);
  const priceUsd = holding.priceUsd;

  return {
    chainId: holding.chainId,
    address: holding.address,
    symbol: holding.symbol,
    name: holding.name,
    decimals: holding.decimals,
    kind: holding.kind,
    rawBalance,
    balance,
    isPriceable: holding.kind !== 'lp',
    priceUsd,
    valueUsd: priceUsd === null ? null : balance * priceUsd,
    change24h: holding.change24h ?? null
  };
}

/** Every demo row, including the LP share that valuation deliberately skips. */
export function createMockBalances(): TokenBalance[] {
  return MOCK_HOLDINGS.map(toBalance);
}

/** A price map in the shape the services produce, so the demo totals use service math. */
function toPriceMap(holdings: readonly MockHolding[], updatedAt: number): PriceMap {
  const prices: PriceMap = {};

  for (const holding of holdings) {
    if (holding.priceUsd === null) continue;
    prices[priceKey(holding.address, holding.chainId)] = {
      usd: holding.priceUsd,
      change24h: holding.change24h,
      source: 'coingecko',
      updatedAt
    };
  }

  return prices;
}

/**
 * Per-chain rollup over every row on a chain.
 *
 * Mirrors the service's own rollup, including its treatment of LP shares: they
 * add to a chain's asset count but not to its value, so the demo cannot report a
 * chain count that disagrees with what a live read would produce.
 */
function rollup(balances: readonly TokenBalance[]): Record<number, ChainBalance> {
  const byChain: Record<number, ChainBalance> = {};

  for (const balance of balances) {
    const entry = (byChain[balance.chainId] ??= {
      chainId: balance.chainId,
      totalValueUsd: 0,
      tokenCount: 0
    });
    entry.totalValueUsd += balance.valueUsd ?? 0;
    entry.tokenCount += 1;
  }

  return byChain;
}

function summarize(balances: readonly TokenBalance[], updatedAt: number): MockPortfolioSummary {
  const prices = toPriceMap(MOCK_HOLDINGS, updatedAt);
  const { totalValue, change24h, change24hPct } = calculateTotalValue(balances, prices);

  return {
    totalValueUsd: totalValue,
    change24hUsd: change24h,
    change24hPercent: change24hPct
  };
}

/** Headline figures for the demo portfolio, computed from the same math the services use. */
export const MOCK_SUMMARY: MockPortfolioSummary = summarize(createMockBalances(), 0);

/** Wrap the LP rows the way the balance reader does, so the UI can treat both alike. */
function toLpPosition(balance: TokenBalance): LpPosition {
  return {
    id: `${balance.chainId}:${balance.address.toLowerCase()}`,
    chainId: balance.chainId,
    address: balance.address,
    symbol: balance.symbol,
    name: balance.name,
    decimals: balance.decimals,
    rawBalance: balance.rawBalance,
    balance: balance.balance,
    isPriceable: false
  };
}

/**
 * A complete demo snapshot.
 *
 * Shaped exactly like {@link PortfolioBalances} so views can render a connected
 * wallet and the demo through one code path, with no branching in the UI.
 */
export function createMockPortfolio(
  address: `0x${string}` = DEMO_ADDRESS,
  updatedAt: number = Date.now()
): PortfolioBalances {
  const balances = createMockBalances();
  const tokens = balances
    .filter((balance) => balance.kind !== 'lp')
    .sort((left, right) => (right.valueUsd ?? 0) - (left.valueUsd ?? 0));
  const { totalValueUsd, change24hUsd, change24hPercent } = summarize(balances, updatedAt);

  return {
    address,
    updatedAt,
    totalValueUsd,
    change24hUsd,
    change24hPercent,
    byChain: rollup(balances),
    tokens,
    lpPositions: balances.filter((balance) => balance.kind === 'lp').map(toLpPosition),
    errors: []
  };
}
