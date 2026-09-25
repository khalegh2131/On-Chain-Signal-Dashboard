import { describe, expect, it } from 'vitest';

import { readStoredValue, writeStoredValue } from '@/hooks/use-local-storage';
import {
  MAX_CUSTOM_TOKENS,
  addCustomToken,
  customTokenChainIds,
  customTokenKey,
  dedupeCustomTokens,
  isTracked,
  parseDecimalsInput,
  removeCustomToken,
  sanitizeCustomTokens,
  toCustomToken,
  toCustomTokenBalance,
  validateCustomToken
} from '@/lib/custom-tokens';
import type { CustomToken } from '@/types';

/** Circle's USDC deployment: a real address, and a valid EIP-55 checksum. */
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
/** The same address with one letter's case flipped, which breaks the checksum. */
const USDC_BAD_CHECKSUM = '0xA0B86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
/** Uniswap's governance token, used where a second distinct address is needed. */
const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
/** Chain ids the dashboard reads, and one it does not. */
const SEPOLIA = 11155111;
const ETHEREUM = 1;
const UNSUPPORTED = 137;

describe('customTokenKey', () => {
  it('keys on chain plus the lowercased address, so casing is not identity', () => {
    expect(customTokenKey(ETHEREUM, USDC)).toBe(customTokenKey(ETHEREUM, USDC.toLowerCase()));
    expect(customTokenKey(ETHEREUM, USDC)).toBe(`${ETHEREUM}:${USDC.toLowerCase()}`);
  });

  it('keeps the same address on two chains apart', () => {
    expect(customTokenKey(ETHEREUM, USDC)).not.toBe(customTokenKey(SEPOLIA, USDC));
  });
});

describe('validateCustomToken', () => {
  it('accepts a checksummed address on a chain the dashboard reads', () => {
    const result = validateCustomToken({ chainId: SEPOLIA, address: USDC });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      chainId: SEPOLIA,
      address: USDC,
      symbol: undefined,
      decimals: undefined
    });
  });

  it('checksums a lowercase address rather than storing it as typed', () => {
    const result = validateCustomToken({ chainId: SEPOLIA, address: USDC.toLowerCase() });
    expect(result.ok && result.value.address).toBe(USDC);
  });

  it('rejects an address that is not forty hex characters', () => {
    const result = validateCustomToken({ chainId: SEPOLIA, address: '0xnotanaddress' });
    expect(result).toMatchObject({ ok: false, code: 'invalid_address' });
    expect(result.ok === false && result.message).toContain('0xnotanaddress');
  });

  it('rejects a mixed-case address whose checksum does not match', () => {
    // viem skips the checksum for uniformly-cased input, so the failure only
    // exists for input that mixes case.
    expect(validateCustomToken({ chainId: SEPOLIA, address: USDC_BAD_CHECKSUM })).toMatchObject({
      ok: false,
      code: 'invalid_address'
    });
  });

  it('rejects an empty address with guidance rather than a parse message', () => {
    const result = validateCustomToken({ chainId: SEPOLIA, address: '   ' });
    expect(result).toMatchObject({ ok: false, code: 'invalid_address' });
    expect(result.ok === false && result.message).toContain('Enter a contract address');
  });

  it('rejects a chain the dashboard does not read', () => {
    const result = validateCustomToken({ chainId: UNSUPPORTED, address: USDC });
    expect(result).toMatchObject({ ok: false, code: 'unsupported_chain' });
    expect(result.ok === false && result.message).toContain('Sepolia');
  });

  it('carries symbol and decimals overrides through when they are supplied', () => {
    const result = validateCustomToken({
      chainId: SEPOLIA,
      address: USDC,
      symbol: '  USDC  ',
      decimals: '6'
    });
    expect(result.ok && result.value.symbol).toBe('USDC');
    expect(result.ok && result.value.decimals).toBe(6);
  });

  it('rejects decimals that are not a whole number in range', () => {
    const cases = ['6.5', 'many', '-1', '40'];
    for (const decimals of cases) {
      expect(validateCustomToken({ chainId: SEPOLIA, address: USDC, decimals })).toMatchObject({
        ok: false,
        code: 'invalid_decimals'
      });
    }
  });

  it('treats a blank decimals field as "not overridden"', () => {
    expect(validateCustomToken({ chainId: SEPOLIA, address: USDC, decimals: '' })).toMatchObject({
      ok: true,
      value: { decimals: undefined }
    });
    expect(validateCustomToken({ chainId: SEPOLIA, address: USDC, decimals: null })).toMatchObject({
      ok: true,
      value: { decimals: undefined }
    });
  });

  it('rejects a symbol too long for a row', () => {
    const result = validateCustomToken({
      chainId: SEPOLIA,
      address: USDC,
      symbol: 'A'.repeat(20)
    });
    expect(result).toMatchObject({ ok: false, code: 'invalid_symbol' });
  });
});

describe('parseDecimalsInput', () => {
  it('distinguishes an absent override from an invalid one', () => {
    expect(parseDecimalsInput(undefined)).toBeNull();
    expect(parseDecimalsInput(null)).toBeNull();
    expect(parseDecimalsInput('')).toBeNull();
    expect(parseDecimalsInput('6')).toBe(6);
    expect(parseDecimalsInput(0)).toBe(0);
    expect(parseDecimalsInput('1e2')).toBe('invalid');
    expect(parseDecimalsInput('37')).toBe('invalid');
  });
});

describe('toCustomToken', () => {
  it('takes the on-chain metadata when the reader overrode nothing', () => {
    const token = toCustomToken(
      { chainId: SEPOLIA, address: USDC },
      { symbol: 'usdc', name: 'USD Coin', decimals: 6 },
      1_000
    );

    expect(token).toEqual({
      chainId: SEPOLIA,
      address: USDC,
      symbol: 'usdc',
      name: 'USD Coin',
      decimals: 6,
      addedAt: 1_000
    });
  });

  it('lets a reader override a contract that reports nothing useful', () => {
    const token = toCustomToken(
      { chainId: SEPOLIA, address: USDC, symbol: 'USDC', decimals: 6 },
      { symbol: null, name: null, decimals: null },
      1_000
    );

    expect(token.symbol).toBe('USDC');
    expect(token.decimals).toBe(6);
  });

  it('falls back to a shortened address and the ERC-20 default when metadata is empty', () => {
    const token = toCustomToken({ chainId: SEPOLIA, address: USDC }, {}, 0);
    expect(token.symbol).toBe(`${USDC.slice(0, 5)}…${USDC.slice(-3)}`);
    expect(token.name).toBe(token.symbol);
    expect(token.decimals).toBe(18);
  });

  it('ignores metadata decimals that cannot describe an ERC-20', () => {
    expect(toCustomToken({ chainId: SEPOLIA, address: USDC }, { decimals: -3 }).decimals).toBe(18);
    expect(toCustomToken({ chainId: SEPOLIA, address: USDC }, { decimals: 4_000 }).decimals).toBe(
      18
    );
  });
});

function token(overrides: Partial<CustomToken> = {}): CustomToken {
  return {
    chainId: SEPOLIA,
    address: USDC,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    addedAt: 0,
    ...overrides
  };
}

describe('addCustomToken', () => {
  it('appends a token that is not tracked yet', () => {
    const next = addCustomToken([], token());
    expect(next).toHaveLength(1);
  });

  it('replaces in place when the same address is added again in different casing', () => {
    const first = token({ symbol: 'USDC' });
    const second = token({ address: USDC.toLowerCase() as `0x${string}`, symbol: 'usdc-v2' });

    const next = addCustomToken([first], second);

    expect(next).toHaveLength(1);
    expect(next[0]?.symbol).toBe('usdc-v2');
  });

  it('replaces in place when the same address is added again with different decimals', () => {
    const next = addCustomToken([token({ decimals: 6 })], token({ decimals: 18 }));
    expect(next).toHaveLength(1);
    expect(next[0]?.decimals).toBe(18);
  });

  it('keeps the same address on another chain as a separate entry', () => {
    const next = addCustomToken([token()], token({ chainId: 1, addedAt: 1 }));
    expect(next).toHaveLength(2);
  });

  it('keeps entries in the order they were added', () => {
    const a = token({ address: USDC, addedAt: 1 });
    const other = token({ address: UNI, addedAt: 2 });
    expect(addCustomToken([a], other).map((entry) => entry.addedAt)).toEqual([1, 2]);
  });

  it('drops the oldest entry once the list is full', () => {
    const tokens = [token({ addedAt: 1 }), token({ chainId: 1, addedAt: 2 })];
    const next = addCustomToken(tokens, token({ chainId: 42161, addedAt: 3 }), 2);

    expect(next).toHaveLength(2);
    expect(next.map((entry) => entry.addedAt)).toEqual([2, 3]);
  });

  it('never exceeds the default ceiling', () => {
    let tokens: CustomToken[] = [];
    for (let index = 0; index < MAX_CUSTOM_TOKENS + 5; index += 1) {
      tokens = addCustomToken(
        tokens,
        token({ address: `0x${index.toString(16).padStart(40, '0')}`, addedAt: index })
      );
    }

    expect(tokens).toHaveLength(MAX_CUSTOM_TOKENS);
    expect(tokens[0]?.addedAt).toBe(5);
  });
});

describe('removeCustomToken', () => {
  it('removes by chain and address regardless of casing', () => {
    const removed = removeCustomToken([token()], SEPOLIA, USDC.toLowerCase());
    expect(removed).toHaveLength(0);
  });

  it('leaves the list untouched when the key is not present', () => {
    expect(removeCustomToken([token()], 1, USDC)).toHaveLength(1);
  });

  it('removes only the chain that was named', () => {
    const tokens = [token({ chainId: 1 }), token({ chainId: SEPOLIA })];
    const removed = removeCustomToken(tokens, 1, USDC);
    expect(removed.map((entry) => entry.chainId)).toEqual([SEPOLIA]);
  });
});

describe('isTracked', () => {
  it('matches case-insensitively on the same chain', () => {
    expect(isTracked([token()], SEPOLIA, USDC.toLowerCase())).toBe(true);
    expect(isTracked([token()], 1, USDC)).toBe(false);
  });
});

describe('dedupeCustomTokens', () => {
  it('collapses a key that appears twice, keeping the later entry', () => {
    const next = dedupeCustomTokens([
      token({ symbol: 'first', addedAt: 5 }),
      token({ address: USDC.toLowerCase() as `0x${string}`, symbol: 'second', addedAt: 9 })
    ]);

    expect(next).toHaveLength(1);
    expect(next[0]?.symbol).toBe('second');
    // The position of the first occurrence is kept so the list does not reshuffle.
    expect(next[0]?.addedAt).toBe(5);
  });

  it('leaves a list with no duplicates alone', () => {
    const tokens = [token({ chainId: 1 }), token({ chainId: SEPOLIA })];
    expect(dedupeCustomTokens(tokens)).toHaveLength(2);
  });
});

describe('sanitizeCustomTokens', () => {
  it('returns an empty list for payloads that are not arrays', () => {
    for (const raw of [null, undefined, 'nope', 42, { chainId: 1 }]) {
      expect(sanitizeCustomTokens(raw)).toEqual([]);
    }
  });

  it('keeps well-formed entries and drops the rest', () => {
    const cleaned = sanitizeCustomTokens([
      token(),
      { chainId: SEPOLIA, address: 'not-an-address', symbol: 'X', decimals: 6, addedAt: 0 },
      { chainId: UNSUPPORTED, address: USDC, symbol: 'X', decimals: 6, addedAt: 0 },
      { chainId: SEPOLIA, address: USDC, symbol: '', decimals: 6, addedAt: 0 },
      { chainId: SEPOLIA, address: UNI, symbol: 'UNI', decimals: 6, addedAt: 0 },
      null,
      'nope'
    ]);

    expect(cleaned.map((entry) => entry.symbol)).toEqual(['USDC', 'UNI']);
  });

  it('drops an entry whose decimals cannot be trusted', () => {
    const cleaned = sanitizeCustomTokens([
      { chainId: SEPOLIA, address: USDC, symbol: 'USDC', decimals: 'lots', addedAt: 0 }
    ]);
    expect(cleaned).toEqual([]);
  });

  it('collapses duplicates in a hand-edited payload', () => {
    const cleaned = sanitizeCustomTokens([token(), token({ symbol: 'usdc-2' })]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]?.symbol).toBe('usdc-2');
  });

  it('defaults a missing name to the symbol', () => {
    const cleaned = sanitizeCustomTokens([
      { chainId: SEPOLIA, address: USDC, symbol: 'USDC', decimals: 6, addedAt: 0 }
    ]);
    expect(cleaned[0]?.name).toBe('USDC');
  });
});

describe('persistence round-trip', () => {
  it('survives a write and read through the storage layer', () => {
    const tokens = [token({ addedAt: 1_700_000_000_000 })];

    const serialized = writeStoredValue(tokens);
    expect(serialized).not.toBeNull();

    const restored = sanitizeCustomTokens(readStoredValue<unknown>(serialized, []));
    expect(restored).toEqual(tokens);
  });

  it('falls back to an empty list when storage holds something else entirely', () => {
    const restored = sanitizeCustomTokens(readStoredValue<unknown>('{"customTokens":true}', []));
    expect(restored).toEqual([]);
  });
});

describe('toCustomTokenBalance', () => {
  it('renders a watched token with a zero balance and no price, never an error', () => {
    const row = toCustomTokenBalance(token());

    expect(row).toMatchObject({
      chainId: SEPOLIA,
      address: USDC,
      symbol: 'USDC',
      decimals: 6,
      balance: 0,
      isCustom: true,
      priceUsd: null,
      valueUsd: null
    });
  });

  it('scales a raw balance by the stored decimals', () => {
    const row = toCustomTokenBalance(token({ decimals: 6 }), '12500000');
    expect(row.balance).toBe(12.5);
  });

  it('classifies a pool share as an LP row rather than pricing it', () => {
    const row = toCustomTokenBalance(token({ symbol: 'UNI-V2', name: 'Uniswap V2 ETH/USDC' }));
    expect(row.kind).toBe('lp');
    expect(row.isPriceable).toBe(false);
  });
});

describe('customTokenChainIds', () => {
  it('lists each chain once, in first-seen order', () => {
    const chains = customTokenChainIds([
      token({ chainId: 1 }),
      token({ chainId: SEPOLIA }),
      token({ chainId: 1 })
    ]);
    expect(chains).toEqual([1, SEPOLIA]);
  });
});
