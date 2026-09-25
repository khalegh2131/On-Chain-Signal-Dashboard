import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http, type Transport } from 'wagmi';
import { arbitrum, arbitrumSepolia, mainnet, sepolia } from 'wagmi/chains';
import type { Chain as ViemChain } from 'viem';

import { APP_NAME, ALCHEMY_NETWORK_SLUGS } from '@/config/constants';
import { readEnv } from '@/lib/utils/env';

/** Placeholder project id so builds and first runs succeed before WalletConnect is configured. */
const FALLBACK_WALLETCONNECT_PROJECT_ID = 'demo-project-id';

const alchemyApiKey = readEnv(process.env.NEXT_PUBLIC_ALCHEMY_API_KEY);

const walletConnectProjectId =
  readEnv(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) ?? FALLBACK_WALLETCONNECT_PROJECT_ID;

/**
 * Chains enabled in the wallet connector today.
 *
 * Testnets first: every read path works against them without spending mainnet
 * RPC quota, which keeps the dashboard usable during development.
 */
const enabledChains = [sepolia, arbitrumSepolia] as const;

/** Chains with metadata and transports ready, enabled or not. */
const definedChains = [sepolia, arbitrumSepolia, mainnet, arbitrum] as const;

/**
 * Build the RPC transport for a chain.
 *
 * Prefers Alchemy when a key is present and falls back to the chain's public
 * RPC otherwise, so an empty `NEXT_PUBLIC_ALCHEMY_API_KEY` degrades to slower
 * reads instead of a broken app.
 */
function transportFor(chain: ViemChain): Transport {
  const slug = ALCHEMY_NETWORK_SLUGS[chain.id];
  if (alchemyApiKey && slug) {
    return http(`https://${slug}.g.alchemy.com/v2/${alchemyApiKey}`, { batch: true });
  }
  return http(chain.rpcUrls.default.http[0], { batch: true });
}

const transports = Object.fromEntries(
  definedChains.map((chain) => [chain.id, transportFor(chain)])
) as Record<(typeof definedChains)[number]['id'], Transport>;

/**
 * Wallet + RPC configuration shared by every provider in the app.
 *
 * `ssr: true` keeps the server render and the first client render identical by
 * serving a disconnected snapshot until hydration; the provider then restores
 * the last used connector (see `WagmiProvider` in `components/providers.tsx`).
 */
export const config = getDefaultConfig({
  appName: APP_NAME,
  projectId: walletConnectProjectId,
  chains: enabledChains,
  transports,
  ssr: true
});

/** Alias kept for call sites that read better with an explicit name. */
export const wagmiConfig = config;

/** Chains the UI exposes for selection right now. */
export const SUPPORTED_CHAINS = enabledChains;

/** Chains whose metadata and transports exist but are not enabled by default. */
export const DEFINED_CHAINS = definedChains;

/** True when the wallet is connected to a chain the dashboard can read. */
export function isSupportedChain(chainId: number | undefined): boolean {
  return chainId !== undefined && enabledChains.some((chain) => chain.id === chainId);
}

/** Display name for the active chain, falling back to the raw id when unknown. */
export function getChainLabel(chainId: number | undefined): string {
  if (chainId === undefined) return 'No network';
  return definedChains.find((chain) => chain.id === chainId)?.name ?? `Chain ${chainId}`;
}

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
