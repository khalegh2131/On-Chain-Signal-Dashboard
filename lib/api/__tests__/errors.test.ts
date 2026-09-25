import { describe, expect, it } from 'vitest';

import {
  AppError,
  CacheMissError,
  InvalidAddressError,
  NetworkError,
  RateLimitError,
  UpstreamError,
  isApiError,
  isAppError,
  toAppError
} from '@/lib/api/errors';

describe('AppError hierarchy', () => {
  it('carries a machine-readable code and keeps the cause', () => {
    const cause = new Error('socket closed');
    const error = new AppError('alchemy_getTokenBalances failed', { code: 'upstream', cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('upstream');
    expect(error.cause).toBe(cause);
    expect(error.message).toBe('alchemy_getTokenBalances failed');
  });

  it('reports a retry window on rate limits and defaults to the shared code', () => {
    const error = new RateLimitError('CoinGecko is throttling', {
      retryAfterMs: 2_000,
      status: 429
    });

    expect(error.code).toBe('rate_limited');
    expect(error.retryAfterMs).toBe(2_000);
    expect(error.status).toBe(429);
  });

  it('names the offending value on an invalid address', () => {
    const error = new InvalidAddressError('0xnope');

    expect(error.code).toBe('invalid_address');
    expect(error.value).toBe('0xnope');
    expect(error.message).toContain('0xnope');
    expect(error.message).toContain('40 hex characters');
  });

  it('remembers which key missed the cache', () => {
    expect(new CacheMissError('coingecko:prices').key).toBe('coingecko:prices');
  });

  it('derives a specific, actionable message from the upstream status', () => {
    expect(new UpstreamError('coingecko', 401).message).toContain('API key');
    expect(new UpstreamError('alchemy', 429).message).toContain('back off');
    expect(new UpstreamError('thegraph', 503).message).toContain('retry shortly');
    expect(new UpstreamError('thegraph', 404).message).toContain('no record');
    expect(new UpstreamError('thegraph', 502).code).toBe('upstream');
  });

  it('guards with instanceof and with a structural check for other realms', () => {
    expect(isAppError(new NetworkError('unreachable'))).toBe(true);
    expect(isAppError(new Error('plain'))).toBe(false);
    expect(isAppError('boom')).toBe(false);

    const foreign = Object.assign(new Error('cross-realm'), { code: 'rate_limited' });
    expect(isAppError(foreign)).toBe(true);
  });

  it('recognises the plain ApiError shape separately', () => {
    expect(isApiError({ code: 'rate_limited', message: 'x', retryable: true })).toBe(true);
    expect(isApiError({ code: 'not_a_code', message: 'x' })).toBe(false);
    expect(isApiError(new RateLimitError('x'))).toBe(false);
  });
});

describe('toAppError', () => {
  it('passes an existing AppError through untouched', () => {
    const original = new UpstreamError('alchemy', 500);
    expect(toAppError(original)).toBe(original);
  });

  it('unwraps the ApiFailure envelope the http layer returns', () => {
    const failure = {
      ok: false as const,
      error: {
        code: 'rate_limited' as const,
        message: 'api.coingecko.com responded 429',
        status: 429,
        retryAfterMs: 1_500,
        retryable: true
      }
    };

    const error = toAppError(failure, { service: 'coingecko' });

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.code).toBe('rate_limited');
    expect(error.status).toBe(429);
    expect((error as RateLimitError).retryAfterMs).toBe(1_500);
    expect(error.message).toContain('throttling');
  });

  it('maps a bare ApiError by its code', () => {
    const error = toAppError(
      { code: 'timeout', message: 'Request to api.llama.fi timed out', retryable: true },
      { service: 'llama' }
    );

    expect(error).toBeInstanceOf(NetworkError);
    expect(error.code).toBe('timeout');
    expect(error.message).toContain('Reques');
  });

  it('describes a fetch TypeError as an unreachable upstream', () => {
    const error = toAppError(new TypeError('fetch failed'), { service: 'alchemy' });

    expect(error).toBeInstanceOf(NetworkError);
    expect(error.code).toBe('network');
    expect(error.message).toContain('alchemy');
    expect(error.message).toContain('fetch failed');
  });

  it('treats an abort as a timeout', () => {
    const aborted = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });

    const error = toAppError(aborted, { service: 'coingecko' });

    expect(error).toBeInstanceOf(NetworkError);
    expect(error.code).toBe('timeout');
  });

  it('falls back to an unknown AppError for anything else', () => {
    const error = toAppError('something odd happened');

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('unknown');
    expect(error.message).toContain('something odd happened');
  });
});
