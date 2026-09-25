import { parseUnits } from 'viem';

import { getChainMetadata } from '@/config/chains';
import { STETH_ADDRESS } from '@/config/constants';
import { MOCK_ARB_USD, MOCK_ETH_USD, MOCK_STETH_USD, MOCK_USDC_USD } from '@/lib/mock/portfolio';
import { toTokenAmount } from '@/lib/utils/format';
import type {
  DefiPosition,
  DefiPositionKind,
  DefiPriceRange,
  DefiProtocol,
  TokenBalance
} from '@/types';

/**
 * Demo DeFi positions.
 *
 * The four positions a reader is most likely to hold, one per shape the DeFi
 * view knows how to render: two concentrated-liquidity bands, a lending supply,
 * and a liquid-staking balance. Contract addresses are the real deployments and
 * the pool addresses are derived from Uniswap's own factory rather than copied,
 * so a link built from one lands on the pool it names.
 *
 * These are illustrations, not readings. A position whose live value needs a
 * credential this deployment does not hold says so through `requiresCredential`
 * and a note, and the view renders that note rather than passing the figure off
 * as a read.
 */

/** Chains the demo positions live on; none of these protocols runs on a testnet. */
const ETHEREUM = 1;
const ARBITRUM = 42161;

/** Canonical deployments, identical on every chain the Uniswap v3 factory serves. */
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const;
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const WETH_ARBITRUM = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as const;
const ARB = '0x912CE59144191C1204E64559FE8253a0e49E6548' as const;

/** WETH / USDC 0.05% on Ethereum, the deepest pool on the chain. */
const UNISWAP_WETH_USDC_POOL = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640' as const;

/** ARB / WETH 0.3% on Arbitrum. */
const UNISWAP_ARB_WETH_POOL = '0x92c63d0e701CAAe670C9415d91C474F686298f00' as const;

/** Pool fee tiers, in percent. */
const FEE_TIER_LOW = 0.05;
const FEE_TIER_MEDIUM = 0.3;

/**
 * Pool prices, quoted as the second token per unit of the first.
 *
 * Derived from the same quotes the token table uses, so a band cannot disagree
 * with the value of the tokens sitting inside it.
 */
const WETH_IN_USDC = MOCK_ETH_USD / MOCK_USDC_USD;
const ARB_IN_WETH = MOCK_ARB_USD / MOCK_ETH_USD;

/**
 * Why a live read of a subgraph-only protocol is not attempted.
 *
 * Stated once per protocol so the reason a reader sees matches the variable that
 * would fix it, instead of a generic "unavailable".
 */
const UNISWAP_NOTE =
  'Reading this pool live needs the Uniswap v3 subgraph, which answers only with a Graph API key (GRAPH_API_KEY). The figures below are the demo snapshot.';

const AAVE_NOTE =
  'Reading this market live needs the Aave v3 subgraph, addressed by a deployment URL this environment sets through AAVE_V3_SUBGRAPH_URL. The figures below are the demo snapshot.';

/** One token inside a demo position. */
interface MockPositionToken {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  /** Human-readable amount, kept as text so base units stay exact. */
  amount: string;
  priceUsd: number;
}

/**
 * A concentrated-liquidity band, described relative to the current price.
 *
 * Stored as fractions rather than absolute bounds because that is how a band is
 * actually chosen — as a width around the price at deposit — and it keeps the
 * demo consistent if a quote above changes.
 */
interface MockBand {
  lower: number;
  upper: number;
  /** Which way the pair is quoted, e.g. `USDC per WETH`. */
  quotePerBase: string;
}

/** A demo position before it is expanded into a valued {@link DefiPosition}. */
interface MockDefiPosition {
  id: string;
  chainId: number;
  protocol: DefiProtocol;
  kind: DefiPositionKind;
  label: string;
  tokens: readonly MockPositionToken[];
  apy: number | null;
  poolAddress: `0x${string}`;
  feeTier?: number;
  band?: MockBand;
  positionUrl?: string;
  requiresCredential?: boolean;
  note?: string;
}

/**
 * The demo positions.
 *
 * The ARB / WETH band sits entirely above spot on purpose: a band that has been
 * left behind is the state a reader most needs to recognise, and a demo where
 * every position is comfortably in range never exercises it.
 */
export const MOCK_DEFI_POSITIONS: readonly MockDefiPosition[] = [
  {
    id: `uniswap-v3:${ETHEREUM}:${UNISWAP_WETH_USDC_POOL}`,
    chainId: ETHEREUM,
    protocol: 'uniswap-v3',
    kind: 'liquidity',
    label: `WETH / USDC ${FEE_TIER_LOW.toFixed(2)}%`,
    poolAddress: UNISWAP_WETH_USDC_POOL,
    feeTier: FEE_TIER_LOW,
    tokens: [
      {
        address: WETH,
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18,
        amount: '2.4183',
        priceUsd: MOCK_ETH_USD
      },
      {
        address: USDC,
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        amount: '7608.11',
        priceUsd: MOCK_USDC_USD
      }
    ],
    apy: null,
    band: { lower: 0.885, upper: 1.127, quotePerBase: 'USDC per WETH' },
    positionUrl: `https://app.uniswap.org/explore/pools/ethereum/${UNISWAP_WETH_USDC_POOL}`,
    requiresCredential: true,
    note: UNISWAP_NOTE
  },
  {
    id: `uniswap-v3:${ARBITRUM}:${UNISWAP_ARB_WETH_POOL}`,
    chainId: ARBITRUM,
    protocol: 'uniswap-v3',
    kind: 'liquidity',
    label: `ARB / WETH ${FEE_TIER_MEDIUM.toFixed(2)}%`,
    poolAddress: UNISWAP_ARB_WETH_POOL,
    feeTier: FEE_TIER_MEDIUM,
    tokens: [
      {
        address: ARB,
        symbol: 'ARB',
        name: 'Arbitrum',
        decimals: 18,
        amount: '2120.4',
        priceUsd: MOCK_ARB_USD
      },
      {
        address: WETH_ARBITRUM,
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18,
        amount: '0.5681',
        priceUsd: MOCK_ETH_USD
      }
    ],
    apy: null,
    band: { lower: 1.025, upper: 1.185, quotePerBase: 'WETH per ARB' },
    positionUrl: `https://app.uniswap.org/explore/pools/arbitrum/${UNISWAP_ARB_WETH_POOL}`,
    requiresCredential: true,
    note: UNISWAP_NOTE
  },
  {
    id: `aave-v3:${ETHEREUM}:${USDC}`,
    chainId: ETHEREUM,
    protocol: 'aave-v3',
    kind: 'lending',
    label: 'USDC supply',
    poolAddress: USDC,
    tokens: [
      {
        address: USDC,
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        amount: '18240.66',
        priceUsd: MOCK_USDC_USD
      }
    ],
    apy: 4.62,
    positionUrl: `https://app.aave.com/reserve-overview/?underlyingAsset=${USDC.toLowerCase()}&marketName=proto_mainnet_v3`,
    requiresCredential: true,
    note: AAVE_NOTE
  },
  {
    id: `lido:${ETHEREUM}:${STETH_ADDRESS}`,
    chainId: ETHEREUM,
    protocol: 'lido',
    kind: 'staking',
    label: 'stETH stake',
    poolAddress: STETH_ADDRESS,
    tokens: [
      {
        address: STETH_ADDRESS,
        symbol: 'stETH',
        name: 'Lido Staked Ether',
        decimals: 18,
        amount: '3.1054',
        priceUsd: MOCK_STETH_USD
      }
    ],
    // The staking rate comes from Lido's oracle, which this reader does not decode.
    apy: null,
    positionUrl: 'https://stake.lido.fi/'
  }
];

/** Expand one demo token into the row shape every reader returns. */
function toPositionToken(token: MockPositionToken, chainId: number): TokenBalance {
  const rawBalance = parseUnits(token.amount, token.decimals).toString();
  const balance = toTokenAmount(rawBalance, token.decimals);

  return {
    chainId,
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    kind: 'erc20',
    rawBalance,
    balance,
    isPriceable: true,
    priceUsd: token.priceUsd,
    valueUsd: balance * token.priceUsd
  };
}

/**
 * The pool price each band is quoted against.
 *
 * Keyed by pool so a position's band and the tokens inside it are derived from
 * the same quote rather than two independently maintained numbers.
 */
const POOL_PRICES: Record<string, number> = {
  [UNISWAP_WETH_USDC_POOL]: WETH_IN_USDC,
  [UNISWAP_ARB_WETH_POOL]: ARB_IN_WETH
};

/** Resolve a fraction-of-current band into the absolute bounds a reader sees. */
function toPriceRange(band: MockBand | undefined, current: number): DefiPriceRange | null {
  if (!band || current <= 0) return null;

  return {
    lower: current * band.lower,
    upper: current * band.upper,
    current,
    quotePerBase: band.quotePerBase
  };
}

/**
 * The demo positions, valued.
 *
 * A position's worth is the sum of its priced tokens rather than a stored
 * number, matching how `defi.service` values a read — so the two paths cannot
 * disagree about what the same holding is worth.
 */
export function createMockDefiPositions(): DefiPosition[] {
  return MOCK_DEFI_POSITIONS.map((position) => {
    const tokens = position.tokens.map((token) => toPositionToken(token, position.chainId));
    const priceRange = toPriceRange(position.band, POOL_PRICES[position.poolAddress] ?? 0);

    return {
      id: position.id,
      chainId: position.chainId,
      protocol: position.protocol,
      kind: position.kind,
      label: position.label,
      tokens,
      valueUsd: tokens.reduce((total, token) => total + (token.valueUsd ?? 0), 0),
      debtUsd: 0,
      apy: position.apy,
      poolAddress: position.poolAddress,
      unlockAt: null,
      feeTier: position.feeTier ?? null,
      priceRange,
      inRange:
        priceRange === null
          ? null
          : priceRange.current >= priceRange.lower && priceRange.current <= priceRange.upper,
      positionUrl: position.positionUrl ?? null,
      requiresCredential: position.requiresCredential ?? false,
      note: position.note
    };
  });
}

/** Human label for a protocol, used for section headings and position badges. */
export const PROTOCOL_LABELS: Record<DefiProtocol, string> = {
  'uniswap-v3': 'Uniswap v3',
  'aave-v3': 'Aave v3',
  lido: 'Lido',
  gmx: 'GMX',
  unknown: 'Unknown protocol'
};

/** Human label for a position's economic kind, used for section headings. */
export const POSITION_KIND_LABELS: Record<DefiPositionKind, string> = {
  liquidity: 'Liquidity',
  lending: 'Lending',
  borrowing: 'Borrowing',
  staking: 'Staking',
  vault: 'Vaults'
};

/**
 * Explorer link for a pool or reserve address.
 *
 * Built from the chain's own metadata so a position on a chain the dashboard has
 * no explorer for renders without a link rather than with a broken one.
 */
export function explorerAddressUrl(chainId: number, address: string): string | null {
  const chain = getChainMetadata(chainId);
  if (!chain) return null;
  return `${chain.explorerUrl}/address/${address}`;
}
