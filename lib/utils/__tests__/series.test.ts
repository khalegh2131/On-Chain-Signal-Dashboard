import { describe, expect, it } from 'vitest';

import {
  buildSparklinePath,
  paddedValueDomain,
  seriesChange,
  valueExtent
} from '@/lib/utils/series';

describe('valueExtent', () => {
  it('finds the bounds of a normal series', () => {
    expect(valueExtent([3, 1, 4, 1, 5])).toEqual({ min: 1, max: 5 });
  });

  it('ignores values that are not finite numbers', () => {
    expect(valueExtent([2, Number.NaN, 8, Number.POSITIVE_INFINITY])).toEqual({ min: 2, max: 8 });
  });

  it('reports nothing for an empty or unusable series', () => {
    expect(valueExtent([])).toBeNull();
    expect(valueExtent([Number.NaN])).toBeNull();
  });
});

describe('paddedValueDomain', () => {
  it('adds a margin so the line never touches the plot edges', () => {
    const [min, max] = paddedValueDomain([100, 200], 0.1);

    expect(min).toBeCloseTo(90, 10);
    expect(max).toBeCloseTo(210, 10);
  });

  it('gives a flat series a band of its own', () => {
    const [min, max] = paddedValueDomain([500, 500, 500], 0.1);

    expect(min).toBeLessThan(500);
    expect(max).toBeGreaterThan(500);
    expect(max - min).toBeCloseTo(100, 10);
  });

  it('pads a flat series at zero with a usable default band', () => {
    const [min, max] = paddedValueDomain([0, 0]);

    expect(min).toBe(-1);
    expect(max).toBe(1);
  });

  it('falls back to a unit domain for an empty series', () => {
    expect(paddedValueDomain([])).toEqual([0, 1]);
  });
});

describe('seriesChange', () => {
  it('reports the absolute and relative move between the ends', () => {
    const change = seriesChange([100, 150, 125]);

    expect(change?.absolute).toBe(25);
    expect(change?.percent).toBeCloseTo(25, 10);
  });

  it('handles a decline', () => {
    const change = seriesChange([200, 150]);

    expect(change?.absolute).toBe(-50);
    expect(change?.percent).toBeCloseTo(-25, 10);
  });

  it('refuses to describe a change it cannot measure', () => {
    expect(seriesChange([100])).toBeNull();
    expect(seriesChange([])).toBeNull();
    expect(seriesChange([0, 50])?.percent).toBeNull();
  });
});

describe('buildSparklinePath', () => {
  const options = { width: 100, height: 32, padding: 2 };

  it('draws a move for every sample after the first', () => {
    const path = buildSparklinePath([1, 2, 3], options);

    expect(path.startsWith('M')).toBe(true);
    expect(path.match(/L/g)).toHaveLength(2);
    expect(path).not.toContain('NaN');
  });

  it('places higher values higher up the view box', () => {
    const path = buildSparklinePath([0, 10], options);
    const [first, second] = path.split('L');

    const startY = Number(first?.split(' ')[1]);
    const endY = Number(second?.split(' ')[1]);

    expect(endY).toBeLessThan(startY);
  });

  it('is deterministic for the same samples', () => {
    expect(buildSparklinePath([5, 3, 9, 2], options)).toBe(
      buildSparklinePath([5, 3, 9, 2], options)
    );
  });

  it('draws nothing when there is no line to draw', () => {
    expect(buildSparklinePath([], options)).toBe('');
    expect(buildSparklinePath([7], options)).toBe('');
    expect(buildSparklinePath([Number.NaN, Number.NaN], options)).toBe('');
  });

  it('keeps every point inside the view box', () => {
    const path = buildSparklinePath([1, 100, 4], options);
    const points = path.match(/-?\d+(\.\d+)?/g) ?? [];
    const coordinates = points.map(Number);

    for (let index = 0; index < coordinates.length; index += 1) {
      const isY = index % 2 === 1;
      expect(coordinates[index]).toBeGreaterThanOrEqual(0);
      expect(coordinates[index]).toBeLessThanOrEqual(isY ? options.height : options.width);
    }
  });
});
