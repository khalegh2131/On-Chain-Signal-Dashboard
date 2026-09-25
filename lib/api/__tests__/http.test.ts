import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ALLOWED_UPSTREAM_HOSTS,
  assertSafeUrl,
  fetchJson,
  isRetryableFailure,
  nextRetryDelayMs,
  parseRetryAfterMs
} from '@/lib/api/http';
import type { ApiErrorCode } from '@/types';

/**
 * The outbound gate.
 *
 * Every server-side read in this project goes through `fetchJson`, which refuses
 * anything that is not on the caller's allowlist before a socket is opened. That
 * makes this file the security boundary of the whole data layer, and the cases
 * below are written as attacks rather than as examples: loopback, the cloud
 * metadata address, private ranges, internal suffixes, IPv6 literals, and a
 * hostname that merely *contains* an allowed host.
 */

const ALLOWED = ['api.coingecko.com'];

describe('assertSafeUrl', () => {
  it('accepts an allowlisted https host and returns the parsed URL', () => {
    const parsed = assertSafeUrl('https://api.coingecko.com/api/v3/ping', ALLOWED);

    expect(parsed.hostname).toBe('api.coingecko.com');
  });

  it.each([
    ['a malformed URL', 'not a url at all'],
    ['a protocol-relative string', '//api.coingecko.com/ping']
  ])('refuses %s', (_label, value) => {
    expect(() => assertSafeUrl(value, ALLOWED)).toThrow();
  });

  it.each([
    ['file', 'file:///etc/passwd'],
    ['ftp', 'ftp://api.coingecko.com/x'],
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:text/plain,hello']
  ])('refuses the %s scheme even on an allowlisted host', (_label, value) => {
    expect(() => assertSafeUrl(value, ALLOWED)).toThrow(/non-HTTP protocol/i);
  });

  it.each([
    'http://localhost/x',
    'http://api.coingecko.com.localhost/x',
    'http://metadata.google.internal/x',
    'http://printer.local/x'
  ])('refuses the internal name %s', (value) => {
    expect(() => assertSafeUrl(value, ALLOWED)).toThrow(/internal host/i);
  });

  it.each([
    'http://127.0.0.1/x',
    'http://127.0.0.1:8080/x',
    'http://10.0.0.5/x',
    'http://192.168.1.1/x',
    'http://172.16.0.1/x',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.64.0.1/x',
    'http://198.18.0.1/x',
    'http://0.0.0.0/x',
    'http://240.0.0.1/x'
  ])('refuses the private or reserved address %s', (value) => {
    // Either guard may fire first; both are refusals, which is the property that matters.
    expect(() => assertSafeUrl(value, ALLOWED)).toThrow();
  });

  it.each(['http://[::1]/x', 'http://[fd00::1]/x'])('refuses the IPv6 literal %s', (value) => {
    expect(() => assertSafeUrl(value, ALLOWED)).toThrow();
  });

  it('refuses a public host that only contains an allowlisted name', () => {
    expect(() => assertSafeUrl('http://api.coingecko.com.attacker.example/x', ALLOWED)).toThrow(
      /not allowlisted/i
    );
  });

  it('refuses a public host that is not on the list at all', () => {
    expect(() => assertSafeUrl('https://example.com/x', ALLOWED)).toThrow(/not allowlisted/i);
  });
});

describe('fetchJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never dials out for a rejected host, and reports it as a bad request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchJson('http://127.0.0.1:9/steal', { allowedHosts: ALLOWED });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_request');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('retries a temporary upstream failure and returns the eventual success', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchJson<{ ok: boolean }>('https://api.coingecko.com/api/v3/ping', {
      allowedHosts: ALLOWED,
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 2, jitterRatio: 0 }
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.ok).toBe(true);
  });

  it('gives up after the configured number of attempts', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('busy', { status: 503 }));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchJson('https://api.coingecko.com/api/v3/ping', {
      allowedHosts: ALLOWED,
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 2, jitterRatio: 0 }
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(503);
  });

  it('does not retry a failure the upstream called permanent', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchJson('https://api.coingecko.com/api/v3/ping', {
      allowedHosts: ALLOWED,
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 2, jitterRatio: 0 }
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });
});

describe('isRetryableFailure', () => {
  const cases: [number | undefined, ApiErrorCode, boolean][] = [
    [429, 'rate_limited', true],
    [500, 'upstream', true],
    [503, 'upstream', true],
    [404, 'not_found', false],
    [401, 'unauthorized', false],
    [undefined, 'network', true],
    [undefined, 'timeout', true],
    [undefined, 'invalid_request', false]
  ];

  it.each(cases)('status %s with code %s is retryable: %s', (status, code, expected) => {
    expect(isRetryableFailure({ attempt: 1, code, status })).toBe(expected);
  });
});

describe('parseRetryAfterMs', () => {
  it('reads delta seconds', () => {
    expect(parseRetryAfterMs('12')).toBe(12_000);
  });

  it('reads an HTTP date relative to now', () => {
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    expect(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:30 GMT', now)).toBe(30_000);
  });

  it('returns undefined for a missing or unparseable header', () => {
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs('   ')).toBeUndefined();
    expect(parseRetryAfterMs('soon')).toBeUndefined();
  });

  it('never reports a negative wait for a date in the past', () => {
    const now = Date.UTC(2026, 0, 1, 0, 1, 0);
    expect(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:00 GMT', now)).toBe(0);
  });
});

describe('nextRetryDelayMs', () => {
  it('honours the upstream wait over its own curve', () => {
    expect(nextRetryDelayMs({ attempt: 4, code: 'rate_limited', retryAfterMs: 5_000 })).toBe(5_000);
  });

  it('doubles per attempt and stops at the cap', () => {
    const policy = { baseDelayMs: 100, maxDelayMs: 500, jitterRatio: 0 };

    expect(nextRetryDelayMs({ attempt: 1, code: 'network' }, policy)).toBe(100);
    expect(nextRetryDelayMs({ attempt: 2, code: 'network' }, policy)).toBe(200);
    expect(nextRetryDelayMs({ attempt: 3, code: 'network' }, policy)).toBe(400);
    expect(nextRetryDelayMs({ attempt: 6, code: 'network' }, policy)).toBe(500);
  });

  it('stays within the jitter band and does not produce a constant delay', () => {
    const policy = { baseDelayMs: 1_000, maxDelayMs: 10_000, jitterRatio: 0.5 };

    const samples = Array.from({ length: 20 }, () =>
      nextRetryDelayMs({ attempt: 1, code: 'network' }, policy)
    );

    for (const sample of samples) {
      expect(sample).toBeGreaterThanOrEqual(500);
      expect(sample).toBeLessThanOrEqual(1_000);
    }
    // A constant series would mean the jitter silently stopped being random,
    // which is what makes parallel readers retry in lockstep.
    expect(new Set(samples).size).toBeGreaterThan(1);
  });
});

describe('ALLOWED_UPSTREAM_HOSTS', () => {
  it('contains only bare hostnames, so an exact match cannot be spoofed with a path', () => {
    for (const host of ALLOWED_UPSTREAM_HOSTS) {
      expect(host).not.toMatch(/[/:]/);
      expect(host).toBe(host.toLowerCase());
    }
  });
});
