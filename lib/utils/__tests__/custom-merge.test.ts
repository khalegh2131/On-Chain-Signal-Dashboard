import { describe, expect, it } from 'vitest';

import { mergeTokenRows, tokenRowKey } from '@/lib/utils/custom-merge';
import { NATIVE_TOKEN_ADDRESS, type TokenBalance } from '@/types';

/** Minimal row factory: only the fields a merge reads are meaningful here. */
function row(
  input: Partial<TokenBalance> & { chainId: number; address: `0x${string}` }
): TokenBalance {
  return {
    symbol: 'TKN',
    name: 'Token',
    decimals: 18,
    kind: 'erc20',
    rawBalance: '0',
    balance: 0,
    isPriceable: true,
    priceUsd: null,
    valueUsd: null,
    ...input
  };
}

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const;

describe('tokenRowKey', () => {
  it('ignores address casing so a checksummed and a lowercase spelling match', () => {
    expect(tokenRowKey({ chainId: 1, address: WETH })).toBe(
      tokenRowKey({ chainId: 1, address: WETH.toLowerCase() as `0x${string}` })
    );
  });

  it('separates the same address on different chains', () => {
    expect(tokenRowKey({ chainId: 1, address: NATIVE_TOKEN_ADDRESS })).not.toBe(
      tokenRowKey({ chainId: 42161, address: NATIVE_TOKEN_ADDRESS })
    );
  });
});

describe('mergeTokenRows', () => {
  it('returns a copy of the base when nothing is watched', () => {
    const base = [row({ chainId: 1, address: WETH })];
    const merged = mergeTokenRows(base, []);

    expect(merged.rows).toEqual(base);
    expect(merged.rows).not.toBe(base);
    expect(merged.addedValueUsd).toBe(0);
  });

  it('appends watched rows the balance read did not cover', () => {
    const base = [row({ chainId: 1, address: WETH })];
    const watched = [row({ chainId: 1, address: NATIVE_TOKEN_ADDRESS, valueUsd: 42 })];

    const merged = mergeTokenRows(base, watched);

    expect(merged.rows).toHaveLength(2);
    expect(merged.addedValueUsd).toBe(42);
  });

  it('keeps the balance read on a collision rather than listing the row twice', () => {
    const held = row({ chainId: 1, address: WETH, balance: 3, valueUsd: 9000 });
    const watched = row({ chainId: 1, address: WETH.toLowerCase() as `0x${string}`, valueUsd: 0 });

    const merged = mergeTokenRows([held], [watched]);

    expect(merged.rows).toHaveLength(1);
    expect(merged.rows[0]).toBe(held);
    expect(merged.addedValueUsd).toBe(0);
  });

  it('counts an unpriced watched row as zero rather than propagating null', () => {
    const merged = mergeTokenRows([], [row({ chainId: 1, address: WETH, valueUsd: null })]);

    expect(merged.rows).toHaveLength(1);
    expect(merged.addedValueUsd).toBe(0);
  });
});
