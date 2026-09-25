/**
 * Shared domain types for the dashboard.
 *
 * These describe the shape every data source is normalised into, so UI
 * components never depend on a specific upstream provider (Alchemy, CoinGecko,
 * a subgraph, ...) and the same components work across chains.
 */

/** A supported fiat currency code. Mirrors the CoinGecko `vs_currency` values we expose. */
export type FiatCurrency = 'usd' | 'eur' | 'gbp';

/** Native gas token metadata for a chain, e.g. `{ symbol: 'ETH', decimals: 18 }`. */
export interface NativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}

/**
 * UI-facing chain descriptor.
 *
 * Deliberately narrower than viem's `Chain`: components only ever need display
 * metadata plus the Alchemy slug, while viem chain objects stay inside the web3
 * layer where RPC transports are wired up.
 */
export interface Chain {
  /** EVM chain id, e.g. `1` for mainnet. */
  id: number;
  /** Full display name, e.g. `Arbitrum One`. */
  name: string;
  /** Compact label for chips and table cells, e.g. `ARB`. */
  shortName: string;
  nativeCurrency: NativeCurrency;
  /** Block explorer origin, without a trailing slash. */
  explorerUrl: string;
  /** Alchemy network subdomain, e.g. `arb-sepolia`. */
  alchemySubdomain: string;
  /**
   * Chain-hosted public JSON-RPC endpoint.
   *
   * Used when no Alchemy key is configured so the dashboard still reads native
   * balances instead of failing outright.
   */
  publicRpcUrl: string;
  /**
   * CoinGecko asset-platform id (`ethereum`, `arbitrum-one`, ...) used to price
   * contract addresses on this chain, or `null` for chains CoinGecko does not
   * index — testnets have no platform, so their tokens stay unpriceable.
   */
  coinGeckoPlatformId: string | null;
  /** CoinGecko coin id for the gas token, e.g. `ethereum` or `matic-network`. */
  coinGeckoNativeId: string;
  /** OpenSea path segment for this chain, e.g. `arbitrum`. */
  openseaSlug: string;
  /** Accent colour (hex) used for chain chips and chart series. */
  color: string;
  /** Testnets are visually flagged and excluded from portfolio totals by default. */
  isTestnet: boolean;
}

/** Zero address, used to represent a chain's native gas token in token lists. */
export const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

/**
 * What a held asset actually is.
 *
 * Valuation differs per kind — a native or ERC-20 row is worth its balance times
 * a spot price, while an LP share needs pool reserves and an NFT needs a floor —
 * so the kind travels with the row instead of being re-derived in the UI.
 */
export type TokenAssetKind = 'native' | 'erc20' | 'lp' | 'nft';

/** A single ERC-20 (or native) balance held by a wallet. */
export interface TokenBalance {
  chainId: number;
  /** ERC-20 contract address, or {@link NATIVE_TOKEN_ADDRESS} for the gas token. */
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  kind: TokenAssetKind;
  /** On-chain balance in base units, kept as a decimal string to avoid precision loss. */
  rawBalance: string;
  /** Human-readable balance derived from `rawBalance / 10 ** decimals`. */
  balance: number;
  /**
   * False when a spot price cannot value this row — LP shares today, since their
   * worth comes from underlying reserves rather than the share token's own quote.
   */
  isPriceable: boolean;
  /** Price per token in USD, or `null` when no reliable quote exists. */
  priceUsd: number | null;
  /** `balance * priceUsd`, or `null` when the price is unknown. */
  valueUsd: number | null;
  /**
   * 24h change in percent for this asset, or `null` when the quote carried none.
   *
   * Travels with the row rather than staying in the price map because every
   * surface that shows a value also shows how it moved, and re-joining a row to
   * its quote further up the tree to find that out is how the two drift apart.
   */
  change24h?: number | null;
  logoUrl?: string;
  /**
   * Row came from the reader's own watchlist rather than an indexed balance read.
   *
   * A watched token is listed whether or not the wallet holds it, so the surface
   * that shows it has to be able to say where the row came from — a zero balance
   * on a watched contract means "not held", not "read failed".
   */
  isCustom?: boolean;
}

/**
 * A token address a reader asked to track, kept across visits.
 *
 * Only the fields the reader supplied are stored; symbol, name and decimals are
 * seeded from an on-chain metadata read and then cached here so a list renders
 * before that read resolves.
 */
export interface CustomToken {
  chainId: number;
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  /** Epoch milliseconds the token was added. */
  addedAt: number;
}

/**
 * A liquidity-pool share held by a wallet.
 *
 * Kept out of {@link TokenBalance} on purpose: a share token has no meaningful
 * standalone price, so it is bucketed separately and excluded from naive totals
 * until a protocol-level position reader can supply the underlying reserves.
 */
export interface LpPosition {
  /** Stable composite key, `${chainId}:${address}`. */
  id: string;
  chainId: number;
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  rawBalance: string;
  balance: number;
  /** Always false in v1: pool reserves are not read yet, so no guess is offered. */
  isPriceable: false;
}

/** Per-chain rollup inside a portfolio snapshot. */
export interface ChainBalance {
  chainId: number;
  totalValueUsd: number;
  tokenCount: number;
}

/** A chain whose read failed, kept alongside the chains that succeeded. */
export interface ChainReadError {
  chainId: number;
  code: ReadErrorCode;
  message: string;
}

/** Result of reading one chain, including LP shares and any failures it hit. */
export interface ChainBalanceResult {
  chainId: number;
  balances: TokenBalance[];
  lpPositions: LpPosition[];
  /** Empty when the chain read fully succeeded, even if the wallet held nothing. */
  errors: ChainReadError[];
}

/** A full portfolio snapshot for one address across the active chains. */
export interface PortfolioBalances {
  address: `0x${string}`;
  /** Epoch milliseconds of the read that produced this snapshot. */
  updatedAt: number;
  /** Sum of every chain rollup, in USD. */
  totalValueUsd: number;
  /** Absolute 24h change of the priced part of the portfolio, in USD. */
  change24hUsd: number;
  /** 24h change of the priced part of the portfolio in percent, `null` when uncomputable. */
  change24hPercent: number | null;
  /** Per-chain rollups keyed by chain id. */
  byChain: Record<number, ChainBalance>;
  /** Priceable rows, highest value first. */
  tokens: TokenBalance[];
  /** LP shares, excluded from {@link PortfolioBalances.totalValueUsd}. */
  lpPositions: LpPosition[];
  /** Chains that could not be read; the rest of the snapshot is still valid. */
  errors: ChainReadError[];
}

/** Which upstream produced a price, surfaced so the UI can flag estimates. */
export type PriceSource = 'coingecko' | 'alchemy' | 'fallback';

/** A spot price for one asset, keyed in {@link PriceMap} by contract address. */
export interface TokenPrice {
  usd: number;
  /** 24h change in percent, omitted when the upstream feed does not report one. */
  change24h?: number;
  marketCap?: number;
  source: PriceSource;
  /** Epoch milliseconds the quote was observed. */
  updatedAt: number;
}

/**
 * Spot prices keyed by lowercased contract address.
 *
 * Native gas tokens share the same zero address on every chain, so they are keyed
 * as `native:{chainId}` — see `priceKey` in `lib/services/price.service.ts`.
 */
export type PriceMap = Record<string, TokenPrice>;

/** One point of a historical price series. */
export interface PriceHistoryPoint {
  /** Epoch milliseconds of the sample. */
  timestamp: number;
  price: number;
}

/** A normalised historical price series for one asset. */
export interface PriceSeries {
  coinId: string;
  days: number;
  currency: FiatCurrency;
  points: PriceHistoryPoint[];
  /** `fallback` means the series is empty because the upstream read failed. */
  source: PriceSource;
  updatedAt: number;
}

/** A single price quote for one CoinGecko asset id. */
export interface CoinPriceQuote {
  /** CoinGecko asset id, e.g. `ethereum`. */
  coinGeckoId: string;
  price: number;
  currency: FiatCurrency;
  /** 24h change in percent, or `null` when the upstream feed omits it. */
  change24h: number | null;
  marketCap?: number;
  /** Epoch milliseconds of the quote. */
  lastUpdated: number;
}

/** Price quotes keyed by CoinGecko asset id. */
export type CoinPriceMap = Record<string, CoinPriceQuote>;

/** How a marketplace classifies a token, used to filter spam airdrops out of the gallery. */
export type SpamClassification = 'spam' | 'possible_spam' | 'not_spam' | 'unknown';

/** An NFT held by a wallet, enriched with collection-level floor pricing. */
export interface NftItem {
  chainId: number;
  contractAddress: `0x${string}`;
  tokenId: string;
  /** Stable composite key, `${chainId}:${contractAddress}:${tokenId}`. */
  id: string;
  collectionName: string;
  name: string | null;
  description: string | null;
  /** Resolved media URL, `null` when the token has no renderable image. */
  imageUrl: string | null;
  /** Collection floor in the chain's native currency, `null` when unavailable. */
  floorPriceNative: number | null;
  floorPriceUsd: number | null;
  /** Marketplace deep link, or `null` for chains OpenSea does not serve. */
  openseaUrl: string | null;
  spamClassification: SpamClassification;
  /** Epoch milliseconds the token was acquired, when the indexer exposes it. */
  acquiredAt?: number;
}

/** A wallet's NFTs from one collection, rolled up for gallery grouping. */
export interface NftCollection {
  /** Stable key, `${chainId}:${contractAddress}`. */
  id: string;
  chainId: number;
  contractAddress: `0x${string}`;
  name: string;
  /** Number of tokens held from this collection. */
  count: number;
  floorPriceNative: number | null;
  floorPriceUsd: number | null;
  /** Cover image, taken from the first token that has renderable media. */
  imageUrl: string | null;
  items: NftItem[];
}

/** Aggregated NFT read across chains, including per-chain failures. */
export interface NftFetchResult {
  items: NftItem[];
  collections: NftCollection[];
  /** Total reported by the indexer, which can exceed what was paged in. */
  totalCount: number;
  errors: ChainReadError[];
}

/** Protocols the DeFi layer knows how to decode. */
export type DefiProtocol = 'uniswap-v3' | 'aave-v3' | 'lido' | 'gmx' | 'unknown';

/** Economic kind of a position, which drives how its value is presented. */
export type DefiPositionKind = 'liquidity' | 'lending' | 'borrowing' | 'staking' | 'vault';

/** A concentrated-liquidity band in the pool's own price ratio. */
export interface DefiPriceRange {
  /** Lower bound of the band, quoted in `quotePerBase`. */
  lower: number;
  /** Upper bound of the band, quoted in `quotePerBase`. */
  upper: number;
  /** Spot price the bounds are compared against, same units. */
  current: number;
  /** Which way the pair is quoted, e.g. `USDC per WETH`. */
  quotePerBase: string;
}

/**
 * A decoded on-chain position in a DeFi protocol.
 *
 * Everything past `unlockAt` is optional because not every protocol exposes it:
 * a concentrated-liquidity band, a fee tier, and a fee APR only exist for
 * Uniswap-style positions, and a reader that cannot reach a protocol leaves
 * {@link DefiPosition.note} instead of filling the gap with a guess.
 */
export interface DefiPosition {
  /** Stable identifier, usually `${protocol}:${chainId}:${poolAddress}`. */
  id: string;
  chainId: number;
  protocol: DefiProtocol;
  kind: DefiPositionKind;
  /** Human-readable position name, e.g. `ETH / USDC 0.05%`. */
  label: string;
  /** Tokens backing the position, priced individually where possible. */
  tokens: TokenBalance[];
  valueUsd: number;
  /** Debt in USD for borrowing positions; `0` for every other kind. */
  debtUsd: number;
  /** Annualised yield in percent when the protocol exposes one. */
  apy: number | null;
  poolAddress?: `0x${string}`;
  /** Epoch milliseconds an unlock/cooldown completes, when applicable. */
  unlockAt?: number | null;
  /** Pool fee tier in percent, e.g. `0.05` for a Uniswap v3 0.05% pool. */
  feeTier?: number | null;
  /** Concentrated-liquidity band, with whether spot sits inside it. */
  priceRange?: DefiPriceRange | null;
  /** Whether spot is inside {@link DefiPosition.priceRange}; `null` when unknown. */
  inRange?: boolean | null;
  /** Deep link to the position on the protocol's own explorer, when one exists. */
  positionUrl?: string | null;
  /**
   * True when a live read of this position needs a credential the deployment
   * does not hold, e.g. a Graph API key for a subgraph-only protocol.
   */
  requiresCredential?: boolean;
  /** Why a figure is missing or a protocol was skipped. Rendered, never hidden. */
  note?: string;
}

/** Decoded DeFi positions plus whatever the read could not cover. */
export interface DefiPositionsResult {
  positions: DefiPosition[];
  errors: ChainReadError[];
  /** Human-readable reasons a protocol was skipped, e.g. a missing Graph API key. */
  notes: string[];
}

/** Machine-readable failure reasons shared by every service call. */
export type ApiErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'not_found'
  | 'rate_limited'
  | 'timeout'
  | 'network'
  | 'upstream'
  | 'unknown';

/**
 * Failure codes a reader can report.
 *
 * Wider than {@link ApiErrorCode}: a read can also fail locally, before any
 * upstream is called, on a malformed address or a missing cache entry.
 */
export type ReadErrorCode = ApiErrorCode | 'invalid_address' | 'cache_miss';

/** Structured error returned by service calls instead of throwing. */
export interface ApiError {
  code: ApiErrorCode;
  message: string;
  /** Upstream HTTP status, when the failure originated from a response. */
  status?: number;
  /** Upstream-advised wait before retrying, parsed from `Retry-After`. */
  retryAfterMs?: number;
  /** Whether retrying the same request could plausibly succeed. */
  retryable: boolean;
}

/** Successful service response. */
export interface ApiSuccess<T> {
  ok: true;
  data: T;
  /** Epoch milliseconds the payload was produced upstream. */
  fetchedAt: number;
}

/** Failed service response. */
export interface ApiFailure {
  ok: false;
  error: ApiError;
}

/**
 * Discriminated union returned by every service in `lib/services`.
 *
 * Services return failures as values rather than throwing so that API routes
 * can map them to status codes and UI can render partial data.
 */
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;
