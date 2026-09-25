/**
 * Numeric helpers shared by the charts.
 *
 * Kept free of React and of any charting library so the same math drives the
 * recharts area chart, the SVG sparkline, and the tests.
 */

/** Lowest and highest finite value in a series, or `null` when there is none. */
export function valueExtent(values: readonly number[]): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  return min > max ? null : { min, max };
}

/**
 * Extent padded by a ratio so the drawn line never touches the plot edges.
 *
 * A flat series has no extent to pad, so it is given a band of its own around
 * the value: without it the line would be drawn on the axis and read as a bug.
 */
export function paddedValueDomain(values: readonly number[], ratio = 0.08): [number, number] {
  const extent = valueExtent(values);
  if (!extent) return [0, 1];

  const span = extent.max - extent.min;
  if (span === 0) {
    const pad = Math.max(Math.abs(extent.max) * ratio, 1);
    return [extent.max - pad, extent.max + pad];
  }

  const pad = span * ratio;
  return [extent.min - pad, extent.max + pad];
}

/**
 * Change between the first and last sample.
 *
 * `percent` is `null` when the series starts at or below zero, where a
 * percentage would be meaningless rather than merely large.
 */
export function seriesChange(
  values: readonly number[]
): { absolute: number; percent: number | null } | null {
  if (values.length < 2) return null;

  const first = values[0];
  const last = values[values.length - 1];
  if (first === undefined || last === undefined) return null;
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;

  const absolute = last - first;
  return { absolute, percent: first > 0 ? (absolute / first) * 100 : null };
}

export interface SparklinePathOptions {
  /** View-box width in user units. */
  width: number;
  /** View-box height in user units. */
  height: number;
  /** Vertical inset, in user units, so the extremes are not clipped. */
  padding?: number;
}

/**
 * SVG path for an inline trend line.
 *
 * The path is drawn in a normalised view box and stretched by the caller, so a
 * single path string works at every rendered size. Returns an empty string for
 * input that cannot describe a line, which the caller renders as nothing.
 */
export function buildSparklinePath(
  values: readonly number[],
  { width, height, padding = 2 }: SparklinePathOptions
): string {
  const extent = valueExtent(values);
  if (!extent || values.length < 2) return '';

  const span = extent.max - extent.min;
  const usableHeight = Math.max(height - padding * 2, 1);
  const stepX = width / (values.length - 1);
  const parts: string[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined) continue;

    const x = round(index * stepX);
    const ratio = span === 0 ? 0.5 : (value - extent.min) / span;
    const y = round(height - padding - ratio * usableHeight);
    parts.push(`${parts.length === 0 ? 'M' : 'L'}${x} ${y}`);
  }

  return parts.join(' ');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
