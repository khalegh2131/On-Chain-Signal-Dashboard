import { format, formatDistanceToNowStrict } from 'date-fns';
import { formatUnits } from 'viem';

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const COMPACT_USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2
});

const PERCENT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/** Render a USD amount with cents, e.g. `$12,480.05`. */
export function formatUsd(value: number, options?: { compact?: boolean }): string {
  if (!Number.isFinite(value)) return '—';
  return options?.compact ? COMPACT_USD.format(value) : USD.format(value);
}

/** Render a signed percentage, e.g. `+4.21%` / `-0.88%`. */
export function formatPercent(value: number, options?: { signed?: boolean }): string {
  if (!Number.isFinite(value)) return '—';
  const sign = options?.signed === false ? '' : value > 0 ? '+' : '';
  return `${sign}${PERCENT.format(value)}%`;
}

/**
 * Render a token amount, trimming precision for large balances and keeping
 * enough significant digits for small ones (meme tokens, dust positions).
 */
export function formatTokenAmount(value: number, maxDecimals = 6): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  const decimals = magnitude >= 1000 ? 2 : magnitude >= 1 ? 4 : maxDecimals;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals }).format(value);
}

/** Shorten an address or tx hash for dense table cells: `0x1234…cdef`. */
export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

/**
 * Convert a base-unit amount into a decimal number for valuation math.
 *
 * Routed through viem's arbitrary-precision `formatUnits` first: an 18-decimal
 * balance exceeds `Number.MAX_SAFE_INTEGER` long before it stops being plausible.
 */
export function toTokenAmount(raw: string | bigint, decimals: number): number {
  try {
    return Number(formatUnits(BigInt(raw), decimals));
  } catch {
    return 0;
  }
}

/** Display form of a base-unit amount, e.g. `1.2045` for `1204500000000000000`. */
export function formatUnitsShort(raw: string | bigint, decimals: number, maxDecimals = 6): string {
  return formatTokenAmount(toTokenAmount(raw, decimals), maxDecimals);
}

/** Absolute timestamp for tooltips and detail rows. */
export function formatTimestamp(timestampSeconds: number): string {
  return format(new Date(timestampSeconds * 1000), 'MMM d, yyyy HH:mm');
}

/** Human-friendly age of a cached value, e.g. `12 seconds ago`. */
export function formatRelativeTime(timestampMs: number): string {
  return formatDistanceToNowStrict(new Date(timestampMs), { addSuffix: true });
}
