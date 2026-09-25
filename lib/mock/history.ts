/**
 * Deterministic series generation for the value chart.
 *
 * Every number here comes from a seeded PRNG rather than `Math.random`, so the
 * same inputs always produce the same samples. That matters in two places: the
 * server render and the first client render agree on the curve, and a snapshot
 * of the dashboard can be reproduced later from its seed alone.
 *
 * A range is generated at its own resolution instead of being sliced out of one
 * daily series: a single day cut from daily closes is one point, which is not a
 * chart. The walk itself is geometric — log-returns are drawn from a normal
 * distribution scaled by the range's annualised volatility — so a value can
 * never go negative and short ranges look far calmer than long ones.
 */

/** Selectable windows for the value chart, shortest first. */
export const HISTORY_RANGES = ['1D', '1W', '1M', '1Y'] as const;

export type HistoryRange = (typeof HISTORY_RANGES)[number];

/** One sample of a value series. */
export interface HistoryPoint {
  /** Epoch milliseconds of the sample. */
  timestamp: number;
  /** Portfolio or asset value at that moment. */
  value: number;
}

/** Resolution, volatility, and freshness of one selectable range. */
export interface RangeSpec {
  /** Window width, used to derive how many samples a range holds. */
  days: number;
  /** Spacing between samples. */
  stepMs: number;
  /** Annualised volatility fed into the walk. */
  annualVolatility: number;
  /** How long a series for this range stays fresh before it is fetched again. */
  staleTimeMs: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR_MS = 365 * DAY;

/**
 * Ranges the chart offers.
 *
 * Volatility is annualised and shared across the curve, so the per-step shock is
 * derived from the step length: a 30-minute bucket moves about 0.4% while a
 * daily bucket moves about 2%, which is the behaviour of the assets being shown.
 */
export const RANGE_SPECS: Record<HistoryRange, RangeSpec> = {
  '1D': { days: 1, stepMs: 30 * MINUTE, annualVolatility: 0.55, staleTimeMs: MINUTE },
  '1W': { days: 7, stepMs: 4 * HOUR, annualVolatility: 0.5, staleTimeMs: 5 * MINUTE },
  '1M': { days: 30, stepMs: 12 * HOUR, annualVolatility: 0.45, staleTimeMs: 10 * MINUTE },
  '1Y': { days: 365, stepMs: DAY, annualVolatility: 0.4, staleTimeMs: 30 * MINUTE }
};

/** Narrow an arbitrary string to a supported range. */
export function isHistoryRange(value: string): value is HistoryRange {
  return (HISTORY_RANGES as readonly string[]).includes(value);
}

/**
 * FNV-1a over the seed string.
 *
 * A numeric state is all the generator needs, and hashing the text keeps the
 * seed readable at the call site (`'portfolio:1M'`) without letting a long
 * label stall the walk. The `>>> 0` keeps every step in unsigned 32-bit space,
 * which `Math.imul` otherwise leaves open to sign extension.
 */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * mulberry32: a small, fast, well-distributed 32-bit generator.
 *
 * Returns a function producing a uniform value in `[0, 1)`. Chosen over a
 * linear congruential generator because sequential LCG outputs correlate in
 * their low bits, which shows up as a visible sawtooth in a plotted walk.
 */
export function createPrng(seed: string | number): () => number {
  // A zero state would make the first output depend only on the increment, so
  // the empty-string seed falls back to a fixed odd constant.
  let state = (typeof seed === 'number' ? seed >>> 0 : hashSeed(seed)) || 0x9e3779b9;

  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Standard normal deviate via Box-Muller, drawn from the supplied generator. */
function standardNormal(next: () => number): number {
  // `log(0)` is `-Infinity`; clamping keeps a rare exact zero from producing one.
  const uniform = Math.max(next(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(uniform)) * Math.cos(2 * Math.PI * next());
}

/** Snap a timestamp down to a step boundary, so an axis label cannot crawl. */
export function alignToStep(timestamp: number, stepMs: number): number {
  return Math.floor(timestamp / stepMs) * stepMs;
}

/** Coarsest resolution a demo timestamp is allowed to have. */
const CLOCK_BUCKET_MS = 60_000;

/**
 * The current time, rounded down to the minute.
 *
 * Demo data has to produce identical output on the server and during hydration,
 * and a raw `Date.now()` cannot guarantee that. Bucketing it costs nothing
 * visible — series snap to their own step anyway — and closes the mismatch
 * window to the chance of straddling a minute boundary mid-render.
 */
export function mockNow(): number {
  return alignToStep(Date.now(), CLOCK_BUCKET_MS);
}

/** How many samples a range holds, inclusive of both ends. */
export function pointCount(spec: RangeSpec): number {
  return Math.round((spec.days * DAY) / spec.stepMs) + 1;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface GenerateSeriesOptions {
  /** Seed for the walk. Reusing a seed reproduces the series exactly. */
  seed: string;
  range: HistoryRange;
  /** Value the series should end on, i.e. today's total. */
  endValue: number;
  /** Epoch milliseconds the series ends at; snapped down to the range's step. */
  endTimestamp: number;
  /** Decimal places to keep. Money defaults to cents. */
  precision?: number;
}

/**
 * A realistic series ending on `endValue`.
 *
 * The walk is normalised so its final sample is exactly `endValue`: a chart whose
 * last point disagreed with the headline figure above it would be worse than no
 * chart at all. Subtracting the final log level rather than dividing by it keeps
 * the sum of log-returns unchanged, so the shape of the curve is untouched.
 */
export function generateSeries({
  seed,
  range,
  endValue,
  endTimestamp,
  precision = 2
}: GenerateSeriesOptions): HistoryPoint[] {
  const spec = RANGE_SPECS[range];
  const count = pointCount(spec);
  const next = createPrng(`${seed}:${range}`);
  // Volatility scales with the square root of time, as a random walk demands.
  const stepSigma = spec.annualVolatility * Math.sqrt(spec.stepMs / YEAR_MS);
  const end = alignToStep(endTimestamp, spec.stepMs);

  const levels = new Array<number>(count);
  let level = 0;

  for (let index = 0; index < count; index += 1) {
    // Half the variance as drift, so a series with a wide shock band is still
    // centred on the value it ends at rather than trending away from it.
    level += stepSigma * stepSigma * 0.5 + stepSigma * standardNormal(next);
    levels[index] = level;
  }

  const finalLevel = levels[count - 1] ?? 0;
  const points = new Array<HistoryPoint>(count);

  for (let index = 0; index < count; index += 1) {
    const offset = (count - 1 - index) * spec.stepMs;
    points[index] = {
      timestamp: end - offset,
      value: roundTo(endValue * Math.exp((levels[index] ?? 0) - finalLevel), precision)
    };
  }

  return points;
}

/**
 * The tail of a fixed-step series that falls inside a range window.
 *
 * The window start is snapped to the same step the series is built on. Without
 * that, the earliest sample — which sits up to one step before the exact window
 * edge — would be dropped, and a year of daily closes would answer a year-long
 * request with 365 points instead of 366.
 */
export function sliceRange(
  points: readonly HistoryPoint[],
  range: HistoryRange,
  endTimestamp: number
): HistoryPoint[] {
  const stepMs = RANGE_SPECS[range].stepMs;
  const from = alignToStep(endTimestamp, stepMs) - RANGE_SPECS[range].days * DAY;
  return points.filter((point) => point.timestamp >= from);
}
