import { ACTIVE_CHAINS } from '@/config/chains';
import { ALCHEMY_NFT_MAX_PAGES, ALCHEMY_NFT_PAGE_SIZE } from '@/config/constants';
import { getNftsForOwner, type AlchemyOwnedNft } from '@/lib/api/alchemy.client';
import { toChainReadError } from '@/lib/api/errors';
import { fetchNativePrices, priceKey } from '@/lib/services/price.service';
import { toTokenAmount } from '@/lib/utils/format';
import { NATIVE_TOKEN_ADDRESS } from '@/types';
import type {
  Chain,
  ChainReadError,
  NftCollection,
  NftFetchResult,
  NftItem,
  PriceMap,
  SpamClassification
} from '@/types';

/** Public IPFS gateway used to turn `ipfs://` URIs into something a browser can load. */
const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

/** Arweave gateway for `ar://` URIs. */
const ARWEAVE_GATEWAY = 'https://arweave.net/';

export interface FetchNftsOptions {
  pageSize?: number;
  /** Pages per chain, capped so a whale wallet cannot hold a request open. */
  maxPages?: number;
}

/**
 * Read NFTs across chains.
 *
 * Chains are settled independently: an indexer that is down for one network
 * leaves the other networks' galleries intact and reports itself in `errors`.
 */
export async function fetchNfts(
  address: `0x${string}`,
  chains: readonly Chain[] = ACTIVE_CHAINS,
  options: FetchNftsOptions = {}
): Promise<NftFetchResult> {
  const { pageSize = ALCHEMY_NFT_PAGE_SIZE, maxPages = ALCHEMY_NFT_MAX_PAGES } = options;

  if (chains.length === 0) {
    return { items: [], collections: [], totalCount: 0, errors: [] };
  }

  const nativePrices = await fetchNativePrices(chains);
  const settled = await Promise.allSettled(
    chains.map((chain) => readChainNfts(address, chain, nativePrices, { pageSize, maxPages }))
  );

  const items: NftItem[] = [];
  const errors: ChainReadError[] = [];
  let totalCount = 0;

  settled.forEach((outcome, index) => {
    const chain = chains[index];
    if (!chain) return;

    if (outcome.status === 'fulfilled') {
      items.push(...outcome.value.items);
      totalCount += outcome.value.totalCount;
      return;
    }

    errors.push(toChainReadError(chain.id, outcome.reason, 'alchemy'));
  });

  return { items, collections: groupByCollection(items), totalCount, errors };
}

/**
 * Roll tokens up per collection for gallery grouping.
 *
 * The first renderable image and the first known floor stand in for the whole
 * collection, so a grid tile does not have to look them up per token.
 */
export function groupByCollection(items: readonly NftItem[]): NftCollection[] {
  const groups = new Map<string, NftCollection>();

  for (const item of items) {
    const id = `${item.chainId}:${item.contractAddress.toLowerCase()}`;
    const existing = groups.get(id);

    if (existing) {
      existing.items.push(item);
      existing.count += 1;
      existing.imageUrl ??= item.imageUrl;
      existing.floorPriceNative ??= item.floorPriceNative;
      existing.floorPriceUsd ??= item.floorPriceUsd;
      continue;
    }

    groups.set(id, {
      id,
      chainId: item.chainId,
      contractAddress: item.contractAddress,
      name: item.collectionName,
      count: 1,
      floorPriceNative: item.floorPriceNative,
      floorPriceUsd: item.floorPriceUsd,
      imageUrl: item.imageUrl,
      items: [item]
    });
  }

  return Array.from(groups.values()).sort((left, right) => right.count - left.count);
}

/**
 * Resolve token media to a URL a browser can fetch.
 *
 * Metadata points at content-addressed URIs (`ipfs://`, `ar://`) that no `<img>`
 * can load directly, so they are rewritten to public gateways. Anything that is
 * not a recognised, fetchable scheme is dropped rather than passed through.
 */
export function normalizeMediaUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;

  const value = raw.trim();
  if (value.length === 0) return null;

  if (value.startsWith('ipfs://'))
    return `${IPFS_GATEWAY}${trimIpfsPath(value.slice('ipfs://'.length))}`;
  if (value.startsWith('ar://')) return `${ARWEAVE_GATEWAY}${value.slice('ar://'.length)}`;
  if (value.startsWith('https://') || value.startsWith('http://')) return value;
  if (value.startsWith('data:image/')) return value;

  return null;
}

/** Fetch one chain's pages, up to the page cap. */
async function readChainNfts(
  address: `0x${string}`,
  chain: Chain,
  nativePrices: PriceMap,
  options: Required<FetchNftsOptions>
): Promise<{ items: NftItem[]; totalCount: number }> {
  const items: NftItem[] = [];
  let totalCount = 0;
  let pageKey: string | undefined;

  for (let page = 0; page < options.maxPages; page += 1) {
    const response = await getNftsForOwner(address, chain, {
      pageSize: options.pageSize,
      pageKey
    });

    totalCount = response.totalCount;
    items.push(...response.ownedNfts.map((nft) => toNftItem(nft, chain, nativePrices)));

    if (!response.pageKey || response.ownedNfts.length === 0) break;
    pageKey = response.pageKey;
  }

  return { items, totalCount };
}

function toNftItem(nft: AlchemyOwnedNft, chain: Chain, nativePrices: PriceMap): NftItem {
  const contractAddress = nft.contract.address;
  const tokenId = nft.tokenId;
  const floorPriceNative = readFloorPrice(nft, chain);
  const nativePrice = nativePrices[priceKey(NATIVE_TOKEN_ADDRESS, chain.id)];

  return {
    chainId: chain.id,
    contractAddress,
    tokenId,
    id: `${chain.id}:${contractAddress.toLowerCase()}:${tokenId}`,
    collectionName:
      nft.contract.openseaMetadata?.collectionName ?? nft.contract.name ?? 'Unknown collection',
    name: nft.name ?? nft.raw?.metadata?.name ?? null,
    description: nft.description ?? nft.raw?.metadata?.description ?? null,
    imageUrl: resolveImage(nft),
    floorPriceNative,
    floorPriceUsd:
      floorPriceNative === null || !nativePrice ? null : floorPriceNative * nativePrice.usd,
    openseaUrl: buildOpenSeaUrl(chain, contractAddress, tokenId),
    spamClassification: classifySpam(nft)
  };
}

/** Resolve the best available image, preferring Alchemy's pre-cached copy. */
function resolveImage(nft: AlchemyOwnedNft): string | null {
  const candidates = [
    nft.image?.cachedUrl,
    nft.image?.thumbnailUrl,
    nft.image?.pngUrl,
    nft.image?.gateway,
    nft.image?.originalUrl,
    nft.raw?.metadata?.image
  ];

  for (const candidate of candidates) {
    const resolved = normalizeMediaUrl(candidate);
    if (resolved) return resolved;
  }

  return null;
}

/** Collection floor, quoted in wei of the chain's native token by OpenSea. */
function readFloorPrice(nft: AlchemyOwnedNft, chain: Chain): number | null {
  const raw = nft.contract.openseaMetadata?.floorPrice;
  if (raw === null || raw === undefined) return null;

  const value = toTokenAmount(String(raw), chain.nativeCurrency.decimals);
  return value > 0 ? value : null;
}

function classifySpam(nft: AlchemyOwnedNft): SpamClassification {
  const labels = nft.contract.spamClassifications ?? [];

  if (nft.contract.isSpam === true || labels.includes('spam')) return 'spam';
  if (labels.includes('possible_spam') || labels.includes('airdrop')) return 'possible_spam';
  if (nft.contract.isSpam === false) return 'not_spam';

  return 'unknown';
}

function buildOpenSeaUrl(chain: Chain, contractAddress: string, tokenId: string): string {
  return `https://opensea.io/assets/${chain.openseaSlug}/${contractAddress}/${tokenId}`;
}

function trimIpfsPath(path: string): string {
  return path.startsWith('ipfs/') ? path.slice('ipfs/'.length) : path;
}
