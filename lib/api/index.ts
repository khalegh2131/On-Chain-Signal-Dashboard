export {
  fetchJson,
  fetchJsonOrThrow,
  assertSafeUrl,
  ALLOWED_UPSTREAM_HOSTS,
  isRetryableFailure,
  nextRetryDelayMs,
  parseRetryAfterMs
} from './http';
export type { FetchJsonOptions, HttpMethod, RetryContext, RetryPolicy } from './http';

export { apiFailure, apiSuccess, isApiFailure, isApiSuccess } from './result';

export {
  AppError,
  CacheMissError,
  InvalidAddressError,
  NetworkError,
  RateLimitError,
  UpstreamError,
  isApiError,
  isAppError,
  toAppError,
  toChainReadError
} from './errors';
export type { AppErrorCode, AppErrorContext, AppErrorOptions } from './errors';

export {
  getNativeBalance,
  getNftsForOwner,
  getTokenBalances,
  getTokenMetadata,
  getTokenMetadataBatch
} from './alchemy.client';
export type {
  AlchemyNftsForOwnerResult,
  AlchemyOwnedNft,
  AlchemyTokenBalance,
  AlchemyTokenMetadata,
  GetNftsOptions
} from './alchemy.client';

export {
  DEFAULT_NATIVE_COIN_IDS,
  coinGeckoCache,
  getHistoricalPrices,
  getNativePrices,
  getSimplePrices,
  getTokenInfo,
  getTokenPrices,
  resolveEndpoint
} from './coingecko.client';
export type { CoinGeckoEndpoint, TokenInfo } from './coingecko.client';

export { createSubgraphClient, query, uniswapV3Subgraph } from './thegraph.client';
export type { SubgraphClient, SubgraphQueryOptions, SubgraphResponse } from './thegraph.client';
