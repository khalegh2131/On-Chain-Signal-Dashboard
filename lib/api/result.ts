import type { ApiError, ApiErrorCode, ApiFailure, ApiResult, ApiSuccess } from '@/types';

/** Build a successful {@link ApiResult}. */
export function apiSuccess<T>(data: T, fetchedAt: number = Date.now()): ApiSuccess<T> {
  return { ok: true, data, fetchedAt };
}

/** Build a failed {@link ApiResult} from a code and message. */
export function apiFailure(
  code: ApiErrorCode,
  message: string,
  options?: { status?: number; retryAfterMs?: number; retryable?: boolean }
): ApiFailure {
  const error: ApiError = {
    code,
    message,
    status: options?.status,
    retryAfterMs: options?.retryAfterMs,
    retryable: options?.retryable ?? DEFAULT_RETRYABLE[code]
  };
  return { ok: false, error };
}

/** Codes where retrying the identical request can plausibly succeed. */
const DEFAULT_RETRYABLE: Record<ApiErrorCode, boolean> = {
  invalid_request: false,
  unauthorized: false,
  not_found: false,
  rate_limited: true,
  timeout: true,
  network: true,
  upstream: true,
  unknown: true
};

/** Narrow an {@link ApiResult} to its success branch. */
export function isApiSuccess<T>(result: ApiResult<T>): result is ApiSuccess<T> {
  return result.ok;
}

/** Narrow an {@link ApiResult} to its failure branch. */
export function isApiFailure<T>(result: ApiResult<T>): result is ApiFailure {
  return !result.ok;
}
