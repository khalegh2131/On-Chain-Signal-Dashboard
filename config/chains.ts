import type { Chain } from '@/types';

/**
 * Display metadata for every chain the dashboard can talk to.
 *
 * Kept separate from viem's chain objects on purpose: this map is importable
 * from client components without pulling RPC definitions into the bundle, and
 * the Alchemy slug here is the single source of truth used to build transports.
 */
export const CHAIN_METADATA: Record<number, Chain> = {
  1: {
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
  },
  42161: {
    id: 42161,
    name: 'Arbitrum One',
    shortName: 'ARB',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://arbiscan.io',
    alchemySubdomain: 'arb-mainnet',
    publicRpcUrl: 'https://arb1.arbitrum.io/rpc',
    coinGeckoPlatformId: 'arbitrum-one',
    coinGeckoNativeId: 'ethereum',
    openseaSlug: 'arbitrum',
    color: '#28a0f0',
    isTestnet: false
  },
  11155111: {
    id: 11155111,
    name: 'Sepolia',
    shortName: 'SEP',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://sepolia.etherscan.io',
    alchemySubdomain: 'eth-sepolia',
    publicRpcUrl: 'https://rpc.sepolia.org',
    // CoinGecko does not index testnets, so testnet tokens never get a contract price.
    coinGeckoPlatformId: null,
    coinGeckoNativeId: 'ethereum',
    openseaSlug: 'sepolia',
    color: '#8a92b2',
    isTestnet: true
  },
  421614: {
    id: 421614,
    name: 'Arbitrum Sepolia',
    shortName: 'ARB-SEP',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://sepolia.arbiscan.io',
    alchemySubdomain: 'arb-sepolia',
    publicRpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    coinGeckoPlatformId: null,
    coinGeckoNativeId: 'ethereum',
    openseaSlug: 'arbitrum_sepolia',
    color: '#1b4add',
    isTestnet: true
  }
};

/**
 * Chains enabled by default in the wallet connector and portfolio reads.
 *
 * Testnets lead so the dashboard is usable without spending mainnet RPC quota;
 * mainnet chains are defined above and promoted here as indexing matures.
 */
export const ACTIVE_CHAINS: readonly Chain[] = [CHAIN_METADATA[11155111]!, CHAIN_METADATA[421614]!];

/** Every chain with metadata, including ones not yet enabled by default. */
export const ALL_CHAINS: readonly Chain[] = [
  CHAIN_METADATA[11155111]!,
  CHAIN_METADATA[421614]!,
  CHAIN_METADATA[1]!,
  CHAIN_METADATA[42161]!
];

/** Look up display metadata for a chain id, or `undefined` when unsupported. */
export function getChainMetadata(chainId: number): Chain | undefined {
  return CHAIN_METADATA[chainId];
}
