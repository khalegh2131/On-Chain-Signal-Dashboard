import type { ApiError, ApiErrorCode, ChainReadError, ReadErrorCode } from '@/types';

/**
 * Codes an {@link AppError} can carry.
 *
 * Shares the vocabulary declared in `types` so a failure can travel from a
 * client, through a service, into a rendered error row without translation.
 */
export type AppErrorCode = ReadErrorCode;

export interface AppErrorOptions {
  code?: AppErrorCode;
  /** HTTP status when the failure came from a response. */
  status?: number;
  /** Upstream that produced the failure, e.g. `alchemy`. */
  service?: string;
  /** Original error, kept for logging without flattening the stack. */
  cause?: unknown;
}

/**
 * Base class for every failure this layer throws.
 *
 * A `code` travels with the message because callers branch on the failure kind —
 * a rate limit means "back off and retry", a malformed address means "reject the
 * request" — and matching on message text would be brittle.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status?: number;
  readonly service?: string;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code ?? 'unknown';
    this.status = options.status;
    this.service = options.service;
  }
}

/** Upstream refused to serve us at the current rate. */
export class RateLimitError extends AppError {
  /** Upstream-advised wait, parsed from `Retry-After`, when it sent one. */
  readonly retryAfterMs?: number;

  constructor(message: string, options: AppErrorOptions & { retryAfterMs?: number } = {}) {
    super(message, { ...options, code: 'rate_limited' });
    this.name = 'RateLimitError';
    this.retryAfterMs = options.retryAfterMs;
  }
}

/** The request never produced a response: DNS, TLS, socket, or timeout. */
export class NetworkError extends AppError {
  constructor(message: string, options: AppErrorOptions & { code?: 'network' | 'timeout' } = {}) {
    super(message, { ...options, code: options.code ?? 'network' });
    this.name = 'NetworkError';
  }
}

/** Caller-supplied value is not an EVM address. */
export class InvalidAddressError extends AppError {
  readonly value: unknown;

  constructor(value: unknown) {
    super(
      `"${String(value)}" is not a valid EVM address — expected 0x followed by 40 hex characters`,
      { code: 'invalid_address' }
    );
    this.name = 'InvalidAddressError';
    this.value = value;
  }
}

/** An upstream answered, but not with something usable. */
export class UpstreamError extends AppError {
  constructor(service: string, status: number, message?: string) {
    super(message ?? defaultUpstreamMessage(service, status), {
      code: codeForStatus(status),
      status,
      service
    });
    this.name = 'UpstreamError';
  }
}

/** Asked a cache for a key it has never stored or has already expired. */
export class CacheMissError extends AppError {
  readonly key: string;

  constructor(key: string) {
    super(`No live cache entry for "${key}" — it was never set or has expired`, {
      code: 'cache_miss'
    });
    this.name = 'CacheMissError';
    this.key = key;
  }
}

/** Guidance appended to an upstream message, per failure kind. */
function defaultUpstreamMessage(service: string, status: number): string {
  if (status === 401 || status === 403) {
    return `${service} rejected the credential (${status}) — the API key is missing, wrong, or not entitled`;
  }
  if (status === 404) {
    return `${service} has no record matching this request (404)`;
  }
  if (status === 429) {
    return `${service} is rate limiting this client (429) — back off before retrying`;
  }
  if (status >= 500) {
    return `${service} returned ${status} — upstream fault, retry shortly`;
  }
  return `${service} rejected the request (${status})`;
}

/** Translate an HTTP status into the shared error vocabulary. */
function codeForStatus(status: number): AppErrorCode {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 400 && status < 500) return 'invalid_request';
  return 'upstream';
}

const API_ERROR_CODES: readonly ApiErrorCode[] = [
  'invalid_request',
  'unauthorized',
  'not_found',
  'rate_limited',
  'timeout',
  'network',
  'upstream',
  'unknown'
];

const APP_ERROR_CODES: readonly string[] = [...API_ERROR_CODES, 'invalid_address', 'cache_miss'];

/**
 * Narrow an unknown value to {@link AppError}.
 *
 * Also accepts structurally-identical errors from another realm (a dependency
 * bundling its own copy of this module), which `instanceof` alone would miss.
 */
export function isAppError(value: unknown): value is AppError {
  if (value instanceof AppError) return true;
  if (!(value instanceof Error)) return false;
  return APP_ERROR_CODES.includes((value as { code?: unknown }).code as string);
}

/** Narrow an unknown value to the plain {@link ApiError} shape returned by the http layer. */
export function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null || value instanceof Error) return false;
  const candidate = value as { code?: unknown; message?: unknown };
  return (
    typeof candidate.message === 'string' &&
    API_ERROR_CODES.includes(candidate.code as ApiErrorCode)
  );
}

export interface AppErrorContext {
  /** Upstream that produced the failure, used in generated messages. */
  service?: string;
}

/**
 * Normalise anything thrown or returned into an {@link AppError}.
 *
 * The http helper reports failures as values, dependencies throw their own error
 * types, and fetch throws bare `TypeError`s; this is the single funnel that turns
 * all three into one type callers can branch on.
 */
export function toAppError(value: unknown, context: AppErrorContext = {}): AppError {
  if (isAppError(value)) return value;

  const failure = asApiFailure(value);
  if (failure) return fromApiError(failure, context);
  if (isApiError(value)) return fromApiError(value, context);

  const label = context.service ?? 'Upstream';

  if (value instanceof Error) {
    if (value.name === 'TimeoutError' || value.name === 'AbortError') {
      return new NetworkError(`${label} did not answer inside the request budget`, {
        code: 'timeout',
        service: context.service,
        cause: value
      });
    }
    if (value instanceof TypeError) {
      return new NetworkError(`${label} was unreachable: ${value.message}`, {
        service: context.service,
        cause: value
      });
    }
    return new AppError(value.message || `${label} failed without a message`, {
      service: context.service,
      cause: value
    });
  }

  return new AppError(`${label} failed with a non-Error value: ${String(value)}`, {
    service: context.service
  });
}

/** Unwrap the `{ ok: false, error }` envelope the http layer returns. */
function asApiFailure(value: unknown): ApiError | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as { ok?: unknown; error?: unknown };
  if (candidate.ok !== false) return undefined;
  return isApiError(candidate.error) ? candidate.error : undefined;
}

/**
 * Shape a failure for the per-chain error list a reader returns.
 *
 * Services report partial failures as rows next to the data that did load, so a
 * single chain's outage never discards the chains that answered.
 */
export function toChainReadError(
  chainId: number,
  reason: unknown,
  service?: string
): ChainReadError {
  const failure = toAppError(reason, service === undefined ? {} : { service });
  return { chainId, code: failure.code, message: failure.message };
}

/** Preserve upstream detail, append the action the caller should take. */
function fromApiError(error: ApiError, context: AppErrorContext): AppError {
  const { service } = context;
  const { status, retryAfterMs } = error;

  switch (error.code) {
    case 'rate_limited':
      return new RateLimitError(
        `${error.message} — upstream is throttling this client, back off before retrying`,
        { status, service, retryAfterMs }
      );
    case 'timeout':
      return new NetworkError(`${error.message} — it did not answer inside the request budget`, {
        code: 'timeout',
        status,
        service
      });
    case 'network':
      return new NetworkError(`${error.message} — the upstream could not be reached`, {
        status,
        service
      });
    case 'unauthorized':
      return new UpstreamError(
        service ?? 'Upstream',
        status ?? 401,
        `${error.message} — the credential for this service is missing, wrong, or not entitled`
      );
    case 'not_found':
      return new UpstreamError(
        service ?? 'Upstream',
        status ?? 404,
        `${error.message} — nothing upstream matches this request`
      );
    case 'upstream':
      return new UpstreamError(
        service ?? 'Upstream',
        status ?? 502,
        `${error.message} — upstream fault, retry shortly`
      );
    case 'invalid_request':
      return new AppError(`${error.message} — the request was rejected as malformed`, {
        code: 'invalid_request',
        status,
        service
      });
    default:
      return new AppError(error.message, { code: error.code, status, service });
  }
}
