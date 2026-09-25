import {
  ALCHEMY_METADATA_BATCH_SIZE,
  ALCHEMY_RETRY,
  ALCHEMY_TOKEN_BATCH_SIZE,
  alchemyHost
} from '@/config/constants';
import { AppError, RateLimitError, UpstreamError } from '@/lib/api/errors';
import { fetchJsonOrThrow, type RetryPolicy } from '@/lib/api/http';
import { readEnv } from '@/lib/utils/env';
import type { Chain } from '@/types';

/** Alchemy clears throttling and deploy blips in seconds, so a short curve recovers most reads. */
const RETRY_POLICY: RetryPolicy = { ...ALCHEMY_RETRY };

/** Keyword Alchemy accepts in place of a contract list to enumerate every ERC-20 it has seen. */
const ALL_ERC20_KEYWORD = 'erc20';

/** JSON-RPC error code Alchemy uses for "method not available on this endpoint". */
const METHOD_NOT_FOUND = -32601;

/** JSON-RPC error code Alchemy uses when the compute units for the key are exhausted. */
const RPC_RATE_LIMITED = -32005;

/** Response envelope of a single JSON-RPC call. */
export interface JsonRpcEnvelope<T> {
  result?: T;
  error?: { code: number; message: string };
}

/** One entry of `alchemy_getTokenBalances`. */
export interface AlchemyTokenBalance {
  contractAddress: `0x${string}`;
  /** Base-unit balance as hex, or `null` alongside `error` when the call reverted. */
  tokenBalance: string | null;
  error?: string | null;
}

export interface AlchemyTokenBalancesResult {
  address: string;
  tokenBalances: AlchemyTokenBalance[];
}

/** Result of `alchemy_getTokenMetadata`. */
export interface AlchemyTokenMetadata {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  logo: string | null;
}

/** Collection half of an NFT API v3 token. */
export interface AlchemyNftContract {
  address: `0x${string}`;
  name?: string | null;
  symbol?: string | null;
  isSpam?: boolean | null;
  spamClassifications?: string[] | null;
  /** OpenSea-sourced fields; `floorPrice` is quoted in wei of the chain's native token. */
  openseaMetadata?: {
    floorPrice?: string | number | null;
    collectionName?: string | null;
  } | null;
}

export interface AlchemyNftMedia {
  cachedUrl?: string | null;
  thumbnailUrl?: string | null;
  pngUrl?: string | null;
  originalUrl?: string | null;
  gateway?: string | null;
}

/** One token from `getNFTsForOwner`. */
export interface AlchemyOwnedNft {
  contract: AlchemyNftContract;
  tokenId: string;
  tokenType: string;
  name?: string | null;
  description?: string | null;
  image?: AlchemyNftMedia | null;
  raw?: {
    metadata?: { name?: string | null; description?: string | null; image?: string | null } | null;
  } | null;
  balance?: string | number | null;
}

export interface AlchemyNftsForOwnerResult {
  ownedNfts: AlchemyOwnedNft[];
  totalCount: number;
  pageKey?: string | null;
}

export interface GetNftsOptions {
  pageSize?: number;
  pageKey?: string;
  /** Ask Alchemy to drop tokens it has classified as spam. */
  excludeSpam?: boolean;
}

/** Where a chain's JSON-RPC calls go, and whether they are authenticated. */
interface RpcEndpoint {
  url: string;
  allowedHosts: readonly string[];
  keyless: boolean;
}

/**
 * Resolve the RPC endpoint for a chain.
 *
 * Falls back to the chain's public endpoint when no key is configured: reads that
 * only need standard JSON-RPC (native balances) keep working on an empty env,
 * and Alchemy-only methods fail with an explicit "set the key" message instead of
 * a generic 400.
 */
function rpcEndpoint(chain: Chain): RpcEndpoint {
  const apiKey = readEnv(process.env.NEXT_PUBLIC_ALCHEMY_API_KEY);
  const host = alchemyHost(chain.alchemySubdomain);

  if (apiKey) {
    return { url: `https://${host}/v2/${apiKey}`, allowedHosts: [host], keyless: false };
  }

  return {
    url: chain.publicRpcUrl,
    allowedHosts: [new URL(chain.publicRpcUrl).hostname],
    keyless: true
  };
}

/** NFT API v3 host and path; the key is a path segment here, unlike JSON-RPC. */
function nftBaseUrl(chain: Chain): string | null {
  const apiKey = readEnv(process.env.NEXT_PUBLIC_ALCHEMY_API_KEY);
  if (!apiKey) return null;
  return `https://${alchemyHost(chain.alchemySubdomain)}/nft/v3/${apiKey}`;
}

/** Single JSON-RPC call, with retries and typed failures. */
async function rpc<T>(chain: Chain, method: string, params: unknown[]): Promise<T> {
  const endpoint = rpcEndpoint(chain);

  const envelope = await fetchJsonOrThrow<JsonRpcEnvelope<T>>(endpoint.url, {
    method: 'POST',
    body: { jsonrpc: '2.0', id: 1, method, params },
    allowedHosts: endpoint.allowedHosts,
    retry: RETRY_POLICY,
    service: 'alchemy'
  });

  if (envelope.error) throw rpcFailure(chain, method, envelope.error, endpoint.keyless);
  if (envelope.result === undefined) {
    throw new UpstreamError(
      'alchemy',
      502,
      `alchemy ${method} returned no result on ${chain.name}`
    );
  }

  return envelope.result;
}

/** Batched JSON-RPC call: one POST carries every request in the array. */
async function rpcBatch<T>(
  chain: Chain,
  calls: readonly { method: string; params: unknown[] }[]
): Promise<(T | undefined)[]> {
  if (calls.length === 0) return [];

  const endpoint = rpcEndpoint(chain);
  const envelopes = await fetchJsonOrThrow<JsonRpcEnvelope<T>[]>(endpoint.url, {
    method: 'POST',
    body: calls.map((call, index) => ({ jsonrpc: '2.0', id: index + 1, ...call })),
    allowedHosts: endpoint.allowedHosts,
    retry: RETRY_POLICY,
    service: 'alchemy'
  });

  return envelopes.map((envelope) => (envelope.error ? undefined : envelope.result));
}

/**
 * Turn a JSON-RPC error into a typed failure.
 *
 * A keyless endpoint answering "method not found" is not a transient fault, so it
 * is reported as a configuration problem naming the variable to set.
 */
function rpcFailure(
  chain: Chain,
  method: string,
  error: { code: number; message: string },
  keyless: boolean
): AppError {
  if (error.code === RPC_RATE_LIMITED || /rate limit|too many requests/i.test(error.message)) {
    return new RateLimitError(`alchemy ${method} throttled on ${chain.name}: ${error.message}`, {
      service: 'alchemy'
    });
  }

  if (keyless && error.code === METHOD_NOT_FOUND) {
    return new UpstreamError(
      'alchemy',
      501,
      `alchemy ${method} is not served by the public RPC for ${chain.name} — set NEXT_PUBLIC_ALCHEMY_API_KEY to read token balances`
    );
  }

  return new UpstreamError(
    'alchemy',
    502,
    `alchemy ${method} failed on ${chain.name}: ${error.message}`
  );
}

/** Native gas balance in base units. Works with or without an Alchemy key. */
export async function getNativeBalance(owner: `0x${string}`, chain: Chain): Promise<bigint> {
  const hex = await rpc<string>(chain, 'eth_getBalance', [owner, 'latest']);
  return BigInt(hex);
}

/**
 * ERC-20 balances held by an address.
 *
 * Without a contract list Alchemy enumerates every token it has indexed for the
 * address; with one, the request is chunked because Alchemy caps the array per
 * call and a large watchlist would otherwise be rejected wholesale.
 */
export async function getTokenBalances(
  owner: `0x${string}`,
  chain: Chain,
  tokenAddresses?: readonly `0x${string}`[]
): Promise<AlchemyTokenBalance[]> {
  if (!tokenAddresses) {
    const result = await rpc<AlchemyTokenBalancesResult>(chain, 'alchemy_getTokenBalances', [
      owner,
      ALL_ERC20_KEYWORD
    ]);
    return result.tokenBalances;
  }

  const batches = chunk(tokenAddresses, ALCHEMY_TOKEN_BATCH_SIZE);
  const pages = await Promise.all(
    batches.map((batch) =>
      rpc<AlchemyTokenBalancesResult>(chain, 'alchemy_getTokenBalances', [owner, batch])
    )
  );

  return pages.flatMap((page) => page.tokenBalances);
}

/** Symbol, name, decimals and logo for one contract. */
export async function getTokenMetadata(
  contractAddress: `0x${string}`,
  chain: Chain
): Promise<AlchemyTokenMetadata> {
  return rpc<AlchemyTokenMetadata>(chain, 'alchemy_getTokenMetadata', [contractAddress]);
}

/**
 * Metadata for many contracts keyed by lowercased address.
 *
 * Sent as one JSON-RPC batch so a wallet with thirty tokens costs a single round
 * trip. Individual entries that error are omitted rather than failing the batch,
 * because one reverted token should not blank the rest of the table.
 */
export async function getTokenMetadataBatch(
  contractAddresses: readonly `0x${string}`[],
  chain: Chain
): Promise<Map<string, AlchemyTokenMetadata>> {
  const metadata = new Map<string, AlchemyTokenMetadata>();
  const batches = chunk(contractAddresses, ALCHEMY_METADATA_BATCH_SIZE);

  for (const batch of batches) {
    const results = await rpcBatch<AlchemyTokenMetadata>(
      chain,
      batch.map((address) => ({ method: 'alchemy_getTokenMetadata', params: [address] }))
    );

    results.forEach((entry, index) => {
      const address = batch[index];
      if (entry && address) metadata.set(address.toLowerCase(), entry);
    });
  }

  return metadata;
}

/**
 * One page of NFTs owned by an address.
 *
 * The NFT API is a REST product on the Alchemy host and is not served by public
 * RPC, so a keyless call fails loudly instead of returning an empty gallery.
 */
export async function getNftsForOwner(
  owner: `0x${string}`,
  chain: Chain,
  options: GetNftsOptions = {}
): Promise<AlchemyNftsForOwnerResult> {
  const baseUrl = nftBaseUrl(chain);
  if (!baseUrl) {
    throw new UpstreamError(
      'alchemy',
      401,
      'NFT reads need NEXT_PUBLIC_ALCHEMY_API_KEY — the NFT API is not served by public RPC'
    );
  }

  const { pageSize = 100, pageKey, excludeSpam = false } = options;

  const url = new URL(`${baseUrl}/getNFTsForOwner`);
  url.searchParams.set('owner', owner);
  url.searchParams.set('withMetadata', 'true');
  url.searchParams.set('pageSize', String(pageSize));
  if (pageKey) url.searchParams.set('pageKey', pageKey);
  if (excludeSpam) url.searchParams.append('excludeFilters[]', 'SPAM');

  const host = alchemyHost(chain.alchemySubdomain);

  return fetchJsonOrThrow<AlchemyNftsForOwnerResult>(url.toString(), {
    allowedHosts: [host],
    retry: RETRY_POLICY,
    service: 'alchemy'
  });
}

/** Split a list into fixed-size groups, keeping the tail. */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}
