import { describe, expect, it } from 'vitest';

import {
  HISTORY_RANGES,
  RANGE_SPECS,
  alignToStep,
  createPrng,
  generateSeries,
  hashSeed,
  isHistoryRange,
  mockNow,
  pointCount,
  sliceRange
} from '@/lib/mock/history';

/** Fixed end of series so the assertions describe the generator, not the clock. */
const END = Date.UTC(2026, 8, 23, 12, 0, 0);

const END_VALUE = 52_811.89;

const DAY_MS = 24 * 60 * 60 * 1_000;

describe('seeded generator', () => {
  it('replays the same sequence for the same seed', () => {
    const first = createPrng('portfolio:1M');
    const second = createPrng('portfolio:1M');

    const left = Array.from({ length: 8 }, () => first());
    const right = Array.from({ length: 8 }, () => second());

    expect(left).toEqual(right);
  });

  it('diverges for different seeds', () => {
    const left = Array.from({ length: 4 }, createPrng('portfolio'));
    const right = Array.from({ length: 4 }, createPrng('ethereum'));

    expect(left).not.toEqual(right);
  });

  it('stays inside [0, 1)', () => {
    const next = createPrng('range');

    for (let draw = 0; draw < 1_000; draw += 1) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('hashes a seed to a stable 32-bit integer', () => {
    expect(hashSeed('portfolio')).toBe(hashSeed('portfolio'));
    expect(hashSeed('portfolio')).not.toBe(hashSeed('portfolios'));
    expect(hashSeed('portfolio')).toBeLessThan(2 ** 32);
    expect(Number.isInteger(hashSeed(''))).toBe(true);
  });
});

describe('generateSeries', () => {
  it('produces identical points for identical inputs', () => {
    const options = {
      seed: 'portfolio',
      range: '1Y' as const,
      endValue: END_VALUE,
      endTimestamp: END
    };

    expect(generateSeries(options)).toEqual(generateSeries(options));
  });

  it('produces a different curve when the seed changes', () => {
    const base = { range: '1M' as const, endValue: END_VALUE, endTimestamp: END };

    const left = generateSeries({ ...base, seed: 'portfolio' }).map((point) => point.value);
    const right = generateSeries({ ...base, seed: 'ethereum' }).map((point) => point.value);

    expect(left).not.toEqual(right);
    expect(left).toHaveLength(right.length);
  });

  it.each(HISTORY_RANGES)('ends on the current value for %s', (range) => {
    const spec = RANGE_SPECS[range];
    const points = generateSeries({
      seed: 'portfolio',
      range,
      endValue: END_VALUE,
      endTimestamp: END
    });

    expect(points).toHaveLength(pointCount(spec));
    expect(points[points.length - 1]?.value).toBe(END_VALUE);
    expect(points[points.length - 1]?.timestamp).toBe(alignToStep(END, spec.stepMs));
  });

  it.each(HISTORY_RANGES)('spaces %s samples by its own step', (range) => {
    const spec = RANGE_SPECS[range];
    const points = generateSeries({
      seed: 'portfolio',
      range,
      endValue: END_VALUE,
      endTimestamp: END
    });

    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1]?.timestamp ?? 0;
      const current = points[index]?.timestamp ?? 0;
      expect(current - previous).toBe(spec.stepMs);
    }
  });

  it('stays positive and moves without exploding over a year', () => {
    const points = generateSeries({
      seed: 'portfolio',
      range: '1Y',
      endValue: END_VALUE,
      endTimestamp: END
    });
    const values = points.map((point) => point.value);
    const ratio = Math.max(...values) / Math.min(...values);

    expect(Math.min(...values)).toBeGreaterThan(0);
    expect(ratio).toBeGreaterThan(1.02);
    expect(ratio).toBeLessThan(5);
  });

  it('rounds every sample to cents', () => {
    const points = generateSeries({
      seed: 'token',
      range: '1W',
      endValue: 12.5,
      endTimestamp: END
    });

    for (const point of points) {
      expect(point.value).toBe(Math.round(point.value * 100) / 100);
    }
  });

  it('scales with the value it is asked to end on', () => {
    const small = generateSeries({
      seed: 'portfolio',
      range: '1M',
      endValue: 100,
      endTimestamp: END
    });
    const large = generateSeries({
      seed: 'portfolio',
      range: '1M',
      endValue: 10_000,
      endTimestamp: END
    });

    small.forEach((point, index) => {
      const scaled = point.value * 100;
      const expected = large[index]?.value ?? 0;
      // Both sides are rounded to cents, so the products may differ by the
      // rounding of one sample rather than by the shape of the curve.
      expect(Math.abs(scaled - expected)).toBeLessThan(1);
    });
  });
});

describe('sliceRange', () => {
  const year = generateSeries({
    seed: 'portfolio',
    range: '1Y',
    endValue: END_VALUE,
    endTimestamp: END
  });

  it('keeps only the samples inside the requested window', () => {
    const month = sliceRange(year, '1M', END);

    expect(month.length).toBeGreaterThan(28);
    expect(month.length).toBeLessThan(year.length);
    expect(month.every((point) => point.timestamp >= END - 30 * DAY_MS)).toBe(true);
    expect(month[month.length - 1]).toEqual(year[year.length - 1]);
  });

  it('returns the whole series for the widest range', () => {
    expect(sliceRange(year, '1Y', END)).toHaveLength(year.length);
  });
});

describe('range helpers', () => {
  it('aligns a timestamp down to a step boundary', () => {
    expect(alignToStep(1_000, 600)).toBe(600);
    expect(alignToStep(600, 600)).toBe(600);
    expect(alignToStep(0, 600)).toBe(0);
  });

  it('counts both ends of a range', () => {
    expect(pointCount(RANGE_SPECS['1D'])).toBe(49);
    expect(pointCount(RANGE_SPECS['1Y'])).toBe(366);
  });

  it('recognises only the supported ranges', () => {
    expect(isHistoryRange('1D')).toBe(true);
    expect(isHistoryRange('1Y')).toBe(true);
    expect(isHistoryRange('1H')).toBe(false);
    expect(isHistoryRange('')).toBe(false);
  });

  it('quantises the demo clock to the minute', () => {
    const now = mockNow();

    expect(now % 60_000).toBe(0);
    expect(Math.abs(Date.now() - now)).toBeLessThan(60_000);
  });
});
