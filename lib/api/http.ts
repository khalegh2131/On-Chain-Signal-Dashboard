import { ALCHEMY_HOSTS, GRAPH_HOSTS, PUBLIC_RPC_HOSTS } from '@/config/constants';
import { toAppError } from '@/lib/api/errors';
import { apiFailure, apiSuccess, isApiSuccess } from '@/lib/api/result';
import type { ApiErrorCode, ApiResult } from '@/types';

/** Default upstream budget before a request is aborted. */
const DEFAULT_TIMEOUT_MS = 8_000;

/** Hosts the server is allowed to call. Anything else is rejected before dialling out. */
export const ALLOWED_UPSTREAM_HOSTS: readonly string[] = [
  'api.coingecko.com',
  'pro-api.coingecko.com',
  'api.llama.fi',
  ...ALCHEMY_HOSTS,
  ...PUBLIC_RPC_HOSTS,
  ...GRAPH_HOSTS
];

/** IPv4 ranges that must never be reachable from server-side fetching. */
const BLOCKED_IPV4_PATTERNS: readonly RegExp[] = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^198\.1[89]\./,
  /^2(2[4-9]|3\d|4\d|5[0-5])\./
];

/** Suffixes reserved for local or internal name resolution. */
const BLOCKED_HOST_SUFFIXES: readonly string[] = [
  '.local',
  '.internal',
  '.localhost',
  '.home.arpa'
];

/**
 * Assert a URL is safe to fetch from the server.
 *
 * Guards against SSRF: only `http(s)` is allowed, the host must be on the
 * caller's allowlist, and loopback, private, link-local and reserved addresses
 * are rejected so a crafted parameter can never reach internal services.
 *
 * @throws {Error} when the URL is malformed, non-HTTP, off-allowlist, or internal.
 */
export function assertSafeUrl(rawUrl: string, allowedHosts: readonly string[]): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Refusing to fetch malformed URL: ${rawUrl}`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Refusing to fetch non-HTTP protocol: ${parsed.protocol}`);
  }

  const host = parsed.hostname.toLowerCase();

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))
  ) {
    throw new Error(`Refusing to fetch internal host: ${host}`);
  }

  if (BLOCKED_IPV4_PATTERNS.some((pattern) => pattern.test(host))) {
    throw new Error(`Refusing to fetch private or reserved address: ${host}`);
  }

  if (host.includes(':')) {
    // Any IPv6 literal is refused outright: no upstream feed needs one.
    throw new Error(`Refusing to fetch IPv6 literal host: ${host}`);
  }

  if (!allowedHosts.includes(host)) {
    throw new Error(`Host not allowlisted for upstream calls: ${host}`);
  }

  return parsed;
}

/** HTTP verbs the helper will issue. Only read-shaped upstreams are proxied today. */
export type HttpMethod = 'GET' | 'POST';

/** One failed attempt, handed to a {@link RetryPolicy} to decide whether to try again. */
export interface RetryContext {
  /** 1-based number of the attempt that just failed. */
  attempt: number;
  code: ApiErrorCode;
  status?: number;
  retryAfterMs?: number;
}

export interface RetryPolicy {
  /** Total attempts including the first. `1` disables retrying. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Fraction of the computed delay that jitter may shave off, `0`–`1`. */
  jitterRatio?: number;
  shouldRetry?: (context: RetryContext) => boolean;
}

/** Retry only failures the upstream described as temporary. */
export function isRetryableFailure({ code, status }: RetryContext): boolean {
  if (status === 429) return true;
  if (status !== undefined && status >= 500) return true;
  return code === 'network' || code === 'timeout';
}

/**
 * Delay before the next attempt.
 *
 * A `Retry-After` value wins outright: the upstream knows when its own window
 * reopens, and our curve would only guess. Without one, the delay doubles per
 * attempt up to the cap and is then shaved by jitter, so parallel readers that
 * hit the same limit do not retry in lockstep.
 */
export function nextRetryDelayMs(
  { attempt, retryAfterMs }: RetryContext,
  policy: RetryPolicy = {}
): number {
  if (retryAfterMs !== undefined) return Math.max(0, retryAfterMs);

  const base = policy.baseDelayMs ?? 300;
  const cap = policy.maxDelayMs ?? 4_000;
  const exponential = Math.min(base * 2 ** (attempt - 1), cap);
  return Math.round(exponential * (1 - randomUnit() * (policy.jitterRatio ?? 0)));
}

/**
 * Uniform value in `[0, 1)` from the platform RNG.
 *
 * Two workers that trip the same upstream limit must not compute the same delay,
 * and a seeded PRNG shared across a process would do exactly that.
 */
function randomUnit(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 0x1_0000_0000;
}

/** Parse `Retry-After`, which is either delta-seconds or an HTTP date. */
export function parseRetryAfterMs(
  header: string | null,
  now: number = Date.now()
): number | undefined {
  if (!header) return undefined;

  const trimmed = header.trim();
  if (trimmed.length === 0) return undefined;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

export interface FetchJsonOptions {
  /** Hosts permitted for this call. Defaults to {@link ALLOWED_UPSTREAM_HOSTS}. */
  allowedHosts?: readonly string[];
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Cache revalidation window in seconds, passed through to `fetch`. */
  revalidateSeconds?: number;
  method?: HttpMethod;
  /** JSON body, serialised by the helper. Only sent for `POST`. */
  body?: unknown;
  /** Backoff behaviour. Omitted means a single attempt. */
  retry?: RetryPolicy;
}

/**
 * Fetch JSON from an allowlisted host and normalise the outcome.
 *
 * Returning an {@link ApiResult} instead of throwing keeps partial failures
 * renderable — a rate-limited price feed should dim a chart, not blank the page.
 */
export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {}
): Promise<ApiResult<T>> {
  const { allowedHosts = ALLOWED_UPSTREAM_HOSTS, retry } = options;

  let target: URL;
  try {
    target = assertSafeUrl(url, allowedHosts);
  } catch (error) {
    return apiFailure('invalid_request', (error as Error).message, { retryable: false });
  }

  const attempts = Math.max(1, retry?.attempts ?? 1);
  const shouldRetry = retry?.shouldRetry ?? isRetryableFailure;
  let failure = apiFailure('unknown', `${target.host} produced no response`, { retryable: false });

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const outcome = await performFetch<T>(target, options);
    if (isApiSuccess(outcome)) return outcome;

    failure = outcome;
    const context: RetryContext = {
      attempt,
      code: outcome.error.code,
      status: outcome.error.status,
      retryAfterMs: outcome.error.retryAfterMs
    };

    if (attempt >= attempts || !shouldRetry(context)) break;
    await sleep(nextRetryDelayMs(context, retry));
  }

  return failure;
}

/**
 * Fetch JSON and throw on failure.
 *
 * Clients that cannot produce a useful value from a failure use this; services
 * that render partial data keep using {@link fetchJson} directly.
 */
export async function fetchJsonOrThrow<T>(
  url: string,
  options: FetchJsonOptions & { service?: string } = {}
): Promise<T> {
  const { service, ...fetchOptions } = options;
  const result = await fetchJson<T>(url, fetchOptions);
  if (isApiSuccess(result)) return result.data;
  throw toAppError(result.error, { service });
}

/** One attempt: dial, classify the status, decode JSON. */
async function performFetch<T>(target: URL, options: FetchJsonOptions): Promise<ApiResult<T>> {
  const { headers, timeoutMs, revalidateSeconds, method = 'GET', body } = options;

  try {
    const response = await fetch(target, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS),
      next: revalidateSeconds ? { revalidate: revalidateSeconds } : undefined
    });

    if (!response.ok) {
      return apiFailure(
        mapStatusToCode(response.status),
        `${target.host} responded ${response.status}`,
        {
          status: response.status,
          retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after'))
        }
      );
    }

    return apiSuccess((await response.json()) as T);
  } catch (error) {
    const name = (error as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      return apiFailure('timeout', `Request to ${target.host} timed out`);
    }
    return apiFailure('network', `Request to ${target.host} failed: ${(error as Error).message}`);
  }
}

/** Sleep helper kept local so fake timers can drive the backoff in tests. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Translate an upstream HTTP status into the shared error vocabulary. */
function mapStatusToCode(
  status: number
): 'unauthorized' | 'not_found' | 'rate_limited' | 'invalid_request' | 'upstream' {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 400 && status < 500) return 'invalid_request';
  return 'upstream';
}
