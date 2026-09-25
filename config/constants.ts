import { CHAIN_METADATA } from '@/config/chains';
import { readEnv } from '@/lib/utils/env';
import type { FiatCurrency } from '@/types';

export const APP_NAME = 'DeFi Portfolio Dashboard';
export const APP_DESCRIPTION =
  'Track tokens, NFTs, and DeFi positions across Ethereum, Arbitrum, and more — in one read-only dashboard.';

/**
 * Origin used to resolve relative Open Graph and Twitter image paths.
 *
 * Prefers the platform-provided deployment URL and falls back to the local dev
 * origin, so social previews resolve correctly without adding another required
 * environment variable.
 */
export const APP_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';

/** CoinGecko API origin. Pro keys use a different host, see {@link COINGECKO_PRO_BASE_URL}. */
export const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';
export const COINGECKO_PRO_BASE_URL = 'https://pro-api.coingecko.com/api/v3';

/**
 * Spacing enforced between CoinGecko requests.
 *
 * The free tier allows roughly 30 requests per minute across the whole process,
 * so calls are serialized with a gap rather than fired in parallel bursts.
 */
export const COINGECKO_REQUEST_SPACING_MS = 300;

/** Contract addresses per `/simple/token_price` call; CoinGecko accepts up to 50. */
export const COINGECKO_CONTRACT_BATCH_SIZE = 50;

/** Assets per `/simple/price` call. */
export const COINGECKO_ID_BATCH_SIZE = 100;

/** Default freshness window for spot prices and token metadata. */
export const PRICE_TTL_MS = 5 * 60_000;

/** Alchemy host for a network subdomain, e.g. `eth-mainnet.g.alchemy.com`. */
export function alchemyHost(subdomain: string): string {
  return `${subdomain}.g.alchemy.com`;
}

/** Alchemy hosts built from the chain metadata map. */
export const ALCHEMY_HOSTS: readonly string[] = Object.values(CHAIN_METADATA).map((chain) =>
  alchemyHost(chain.alchemySubdomain)
);

/** Hosts of the public RPC fallbacks declared per chain. */
export const PUBLIC_RPC_HOSTS: readonly string[] = Object.values(CHAIN_METADATA).map(
  (chain) => new URL(chain.publicRpcUrl).hostname
);

/** The Graph gateway hosts. Both require an API key before they will serve data. */
export const GRAPH_HOSTS: readonly string[] = [
  'gateway.thegraph.com',
  'api.thegraph.com',
  'gateway-arbitrum.network.thegraph.com'
];

/**
 * Published subgraph deployments used by the DeFi reader.
 *
 * Decentralized-network deployments are addressed by id and always require a
 * Graph API key, so `graphGatewayUrl` returns `null` when none is configured and
 * callers degrade to an "unsupported" note instead of a half-read position.
 */
export const SUBGRAPHS = {
  /** Uniswap V3, Ethereum mainnet — The Graph Network deployment. */
  uniswapV3: '5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV'
} as const;

/** Build a gateway URL for a subgraph id, or `null` without a Graph API key. */
export function graphGatewayUrl(subgraphId: string): string | null {
  const apiKey = readEnv(process.env.GRAPH_API_KEY);
  return apiKey ? `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}` : null;
}

/** Alchemy caps the contract-address array per token-balance call; chunk below it. */
export const ALCHEMY_TOKEN_BATCH_SIZE = 100;

/** JSON-RPC batch size for token metadata reads. */
export const ALCHEMY_METADATA_BATCH_SIZE = 50;

/** NFT page size requested from the Alchemy NFT API. */
export const ALCHEMY_NFT_PAGE_SIZE = 100;

/** Upper bound on NFT pages fetched per chain, so a whale wallet cannot stall a request. */
export const ALCHEMY_NFT_MAX_PAGES = 3;

/**
 * Retry curve for Alchemy reads.
 *
 * Alchemy bursts briefly return 429 under load and 5xx during deploys; both clear
 * within a few seconds, so a short jittered backoff recovers without hammering.
 */
export const ALCHEMY_RETRY = {
  attempts: 4,
  baseDelayMs: 300,
  maxDelayMs: 4_000,
  jitterRatio: 0.25
} as const;

/** stETH on Ethereum mainnet, used to value Lido staking positions. */
export const STETH_ADDRESS = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84' as const;

/** Public RPC used for direct contract reads that are not worth an Alchemy key. */
export const LIDO_READ_RPC_URL = CHAIN_METADATA[1]!.publicRpcUrl;

/**
 * Cache lifetimes in seconds.
 *
 * Sized against upstream rate limits rather than freshness wishes: prices move
 * constantly but the free CoinGecko tier does not, so balances refresh faster
 * than NFT metadata, which is effectively immutable.
 */
export const CACHE_TTL = {
  prices: 60,
  balances: 30,
  defiPositions: 120,
  nftMetadata: 900,
  nftFloorPrices: 300,
  chartHistory: 300
} as const;

/** Values below this USD threshold are hidden from token lists to suppress dust. */
export const MIN_TOKEN_VALUE_USD = 0.01;

/** Heuristic matcher for liquidity-pool share tokens, whose price needs pool data. */
export const LP_TOKEN_SYMBOL_PATTERN =
  /(^|[\s-])(UNI-V2|UNI-V3|SLP|GLP|Cake-LP|LP|BPT|CRV|vAMM)([\s-]|$)/i;

/**
 * Name fragments that mark a token as a pool share without the symbol saying so.
 *
 * Protocols name these inconsistently, so both the symbol pattern above and these
 * fragments are checked before a row is treated as priceable.
 */
export const LP_TOKEN_NAME_HINTS: readonly string[] = [
  'lp token',
  'liquidity pool',
  'uniswap v2',
  'uniswap v3',
  'sushiswap',
  'pancake lp',
  'curve.fi',
  'balancer pool'
];

/**
 * Explicit override for tokens the heuristics miss.
 *
 * Keyed `${chainId}:${lowercased address}` so a known pool share is always
 * bucketed as one even when its symbol looks like an ordinary ERC-20.
 */
export const LP_TOKEN_ALLOWLIST: readonly string[] = [];

/** Alchemy network slugs keyed by chain id, derived from the chain metadata map. */
export const ALCHEMY_NETWORK_SLUGS: Record<number, string> = Object.fromEntries(
  Object.values(CHAIN_METADATA).map((chain) => [chain.id, chain.alchemySubdomain])
);

/** Alchemy host template; `${subdomain}` is replaced with an {@link ALCHEMY_NETWORK_SLUGS} value. */
export const ALCHEMY_RPC_TEMPLATE = 'https://${subdomain}.g.alchemy.com/v2/${apiKey}';

/** Symbols treated as fiat-pegged when computing stablecoin exposure. */
export const STABLECOIN_SYMBOLS: readonly string[] = [
  'USDC',
  'USDC.E',
  'USDT',
  'DAI',
  'FRAX',
  'LUSD',
  'GHO',
  'TUSD',
  'USDE'
];

/** Wrapped gas-token symbols, unwrapped to the native symbol for display grouping. */
export const WRAPPED_NATIVE_SYMBOLS: Record<number, string> = {
  1: 'WETH',
  42161: 'WETH',
  11155111: 'WETH',
  421614: 'WETH'
};

/** Default page size for table and list reads. */
export const DEFAULT_PAGE_SIZE = 20;

/** Upper bound enforced on any client-supplied `limit` parameter. */
export const MAX_PAGE_SIZE = 100;

/** Page size for the NFT gallery grid, chosen to fill a 4-column layout evenly. */
export const NFT_PAGE_SIZE = 24;

/** Fiat currencies offered in the currency switcher. */
export const SUPPORTED_FIAT: readonly FiatCurrency[] = ['usd', 'eur', 'gbp'];

/** Third-party destinations referenced from the UI. */
export const EXTERNAL_LINKS = {
  alchemyDashboard: 'https://dashboard.alchemy.com',
  walletConnectCloud: 'https://cloud.walletconnect.com',
  coinGeckoApi: 'https://www.coingecko.com/en/api',
  rainbowKit: 'https://www.rainbowkit.com',
  wagmi: 'https://wagmi.sh',
  viem: 'https://viem.sh'
} as const;
