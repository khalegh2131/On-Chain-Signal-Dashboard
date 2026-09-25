import { describe, expect, it } from 'vitest';

import { readStoredValue, writeStoredValue } from '@/hooks/use-local-storage';

/**
 * The hook's storage layer, tested without a DOM.
 *
 * `localStorage` itself is the browser's, and every failure mode that matters
 * here happens in the two pure steps around it: deciding what a stored string
 * means, and deciding whether a value can be stored at all.
 */

describe('readStoredValue', () => {
  it('falls back when the key was never written', () => {
    expect(readStoredValue(null, 'default')).toBe('default');
  });

  it('decodes each JSON shape it is given', () => {
    expect(readStoredValue('"1M"', '1D')).toBe('1M');
    expect(readStoredValue('42', 0)).toBe(42);
    expect(readStoredValue('true', false)).toBe(true);
    expect(readStoredValue('[1,2,3]', [])).toEqual([1, 2, 3]);
    expect(readStoredValue('{"theme":"dark"}', {})).toEqual({ theme: 'dark' });
  });

  it('falls back on a corrupt payload rather than throwing', () => {
    expect(readStoredValue('not json', 'fallback')).toBe('fallback');
    expect(readStoredValue('{"truncated":', 'fallback')).toBe('fallback');
    // `undefined` is what an older serializer would have written for a miss.
    expect(readStoredValue('undefined', 'fallback')).toBe('fallback');
  });

  it('returns a stored null as null, since null is a value a caller may have set', () => {
    expect(readStoredValue('null', 'fallback')).toBeNull();
  });
});

describe('writeStoredValue', () => {
  it('round-trips every shape the hook stores', () => {
    const samples: unknown[] = ['1M', 0, -1.5, true, null, [], ['1D'], { range: '1M' }];

    for (const sample of samples) {
      const serialized = writeStoredValue(sample);
      expect(serialized).not.toBeNull();
      expect(readStoredValue(serialized, 'fallback')).toEqual(sample);
    }
  });

  it('reports values it cannot represent instead of writing a broken payload', () => {
    expect(writeStoredValue(undefined)).toBeNull();
    expect(writeStoredValue(() => 'nope')).toBeNull();
    expect(writeStoredValue(Symbol('nope'))).toBeNull();
  });

  it('reports a cycle rather than throwing', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(writeStoredValue(cyclic)).toBeNull();
  });
});
