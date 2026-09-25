import { getAddress, isAddress } from 'viem';

import { ACTIVE_CHAINS, getChainMetadata } from '@/config/chains';
import { classifyToken } from '@/lib/services/balance.service';
import { toTokenAmount } from '@/lib/utils/format';
import type { CustomToken, TokenBalance } from '@/types';

/**
 * The reader's own watchlist.
 *
 * A wallet's indexed balances only cover tokens an indexer has seen it hold, so
 * a token bought outside that coverage would be invisible. These helpers are the
 * whole of the watchlist's behaviour — validating a draft, folding it into the
 * stored list, and turning a stored entry into a renderable row — kept free of
 * React and of storage so every rule below can be asserted directly.
 */

/** Storage key the watchlist lives under. Shared with older builds, so reads are sanitised. */
export const CUSTOM_TOKENS_STORAGE_KEY = 'defi-dashboard:custom-tokens';

/**
 * Cap on stored entries.
 *
 * A watchlist is a list a person maintains, not a migration dump; the ceiling
 * keeps a corrupt or hand-edited payload from turning every render into a long
 * balance read.
 */
export const MAX_CUSTOM_TOKENS = 50;

/**
 * Highest decimals a stored token may declare.
 *
 * ERC-20 stores decimals in a `uint8`, so 255 is the theoretical maximum, but
 * anything past 36 is a bug or a decimal-shifted lookalike and only exists to
 * overflow a display formatter.
 */
export const MAX_TOKEN_DECIMALS = 36;

/** Longest symbol the list can render without truncating mid-token. */
export const MAX_SYMBOL_LENGTH = 16;

/**
 * Identity of a watchlist entry.
 *
 * Chain id plus lowercased address, because the same address can hold different
 * tokens on different chains and checksum casing is not part of a contract's
 * identity.
 */
export function customTokenKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

/** Whether the watchlist can track a token on a chain this deployment reads. */
export function isTrackableChain(chainId: number): boolean {
  return ACTIVE_CHAINS.some((chain) => chain.id === chainId);
}

/** Why a draft was rejected. */
export type CustomTokenErrorCode =
  | 'invalid_address'
  | 'unsupported_chain'
  | 'invalid_decimals'
  | 'invalid_symbol'
  | 'already_tracked'
  | 'limit_reached';

/** What a validated draft carries forward: identity plus any reader-supplied overrides. */
export interface CustomTokenDraftValue {
  chainId: number;
  /** EIP-55 checksummed address. */
  address: `0x${string}`;
  /** Symbol override, or `undefined` to take the one the metadata read returns. */
  symbol?: string;
  /** Decimals override, or `undefined` to take the one the metadata read returns. */
  decimals?: number;
}

export type CustomTokenValidation =
  | { ok: true; value: CustomTokenDraftValue }
  | { ok: false; code: CustomTokenErrorCode; message: string };

/** What the dialog collects before the metadata read resolves. */
export interface CustomTokenDraft {
  chainId: number;
  address: string;
  /** Blank means "use whatever the contract reports". */
  symbol?: string;
  /** Blank means "use whatever the contract reports". */
  decimals?: string | number | null;
}

/**
 * Check a draft and normalise it.
 *
 * Address validation is viem's, so a mixed-case address with a broken checksum
 * is rejected rather than silently accepted — a mistyped address that still
 * parses is the one failure mode that would persist a wrong contract forever.
 */
export function validateCustomToken(draft: CustomTokenDraft): CustomTokenValidation {
  const chainId = Number(draft.chainId);

  if (!Number.isInteger(chainId) || !isTrackableChain(chainId)) {
    return {
      ok: false,
      code: 'unsupported_chain',
      message: `Chain ${draft.chainId} is not one this dashboard reads — pick one of ${ACTIVE_CHAINS.map(
        (chain) => chain.name
      ).join(', ')}`
    };
  }

  const rawAddress = typeof draft.address === 'string' ? draft.address.trim() : '';
  if (rawAddress.length === 0) {
    return {
      ok: false,
      code: 'invalid_address',
      message: 'Enter a contract address to look it up'
    };
  }

  if (!isAddress(rawAddress)) {
    return {
      ok: false,
      code: 'invalid_address',
      message: `"${rawAddress}" is not a valid EVM address — expected 0x followed by 40 hex characters`
    };
  }

  const symbol = typeof draft.symbol === 'string' ? draft.symbol.trim() : '';
  if (symbol.length > MAX_SYMBOL_LENGTH) {
    return {
      ok: false,
      code: 'invalid_symbol',
      message: `A symbol longer than ${MAX_SYMBOL_LENGTH} characters will not fit in the list — shorten it or clear the field`
    };
  }

  const decimals = parseDecimalsInput(draft.decimals);
  if (decimals === 'invalid') {
    return {
      ok: false,
      code: 'invalid_decimals',
      message: `Decimals must be a whole number between 0 and ${MAX_TOKEN_DECIMALS}`
    };
  }

  return {
    ok: true,
    value: {
      chainId,
      address: checksumAddress(rawAddress),
      symbol: symbol.length > 0 ? symbol : undefined,
      decimals: decimals ?? undefined
    }
  };
}

/**
 * Read the optional decimals field.
 *
 * A blank field, `null` and `undefined` all mean "not overridden"; anything else
 * has to be a whole number in range, and `'invalid'` distinguishes that from an
 * absent value without collapsing both to `undefined`.
 */
export function parseDecimalsInput(
  value: string | number | null | undefined
): number | null | 'invalid' {
  if (value === null || value === undefined) return null;

  const text = typeof value === 'string' ? value.trim() : value;
  if (text === '') return null;

  const decimals = Number(text);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_TOKEN_DECIMALS)
    return 'invalid';

  return decimals;
}

/** EIP-55 form of an address already known to be valid. */
function checksumAddress(address: string): `0x${string}` {
  try {
    return getAddress(address);
  } catch {
    // `isAddress` accepted it, so this is unreachable; lowercasing keeps a valid
    // address usable rather than failing the whole submission.
    return address.toLowerCase() as `0x${string}`;
  }
}

/**
 * Fold a validated draft into one stored entry.
 *
 * Metadata the reader supplied wins over the on-chain read, because a contract
 * that reports no symbol or the wrong decimals is exactly why the fields exist.
 */
export function toCustomToken(
  value: CustomTokenDraftValue,
  metadata: { symbol?: string | null; name?: string | null; decimals?: number | null } = {},
  addedAt: number = Date.now()
): CustomToken {
  const metaSymbol = typeof metadata.symbol === 'string' ? metadata.symbol.trim() : '';
  const metaName = typeof metadata.name === 'string' ? metadata.name.trim() : '';
  const symbol =
    value.symbol ?? (metaSymbol.length > 0 ? metaSymbol : shortenAddressLabel(value.address));
  const decimals = value.decimals ?? normaliseDecimals(metadata.decimals);

  return {
    chainId: value.chainId,
    address: value.address,
    symbol,
    name: value.symbol ?? (metaName.length > 0 ? metaName : symbol),
    decimals,
    addedAt
  };
}

/** Accept a metadata decimals value only when it describes a real ERC-20. */
function normaliseDecimals(decimals: number | null | undefined): number {
  if (
    typeof decimals === 'number' &&
    Number.isInteger(decimals) &&
    decimals >= 0 &&
    decimals <= MAX_TOKEN_DECIMALS
  ) {
    return decimals;
  }
  // The ERC-20 default, matching what the balance reader assumes when metadata fails.
  return 18;
}

/** Label used when neither the reader nor the contract produced a symbol. */
function shortenAddressLabel(address: string): string {
  return `${address.slice(0, 5)}…${address.slice(-3)}`;
}

/**
 * Add an entry to the watchlist.
 *
 * Re-adding a tracked token replaces it in place rather than appending a second
 * row, which is what keeps the list's order stable when a reader corrects a
 * symbol. Past the cap the oldest entry is dropped, so the list keeps working
 * instead of refusing the newest addition.
 */
export function addCustomToken(
  tokens: readonly CustomToken[],
  token: CustomToken,
  limit: number = MAX_CUSTOM_TOKENS
): CustomToken[] {
  const key = customTokenKey(token.chainId, token.address);
  const existingIndex = tokens.findIndex(
    (entry) => customTokenKey(entry.chainId, entry.address) === key
  );

  if (existingIndex >= 0) {
    const next = [...tokens];
    next[existingIndex] = token;
    return next;
  }

  const next = [...tokens, token];
  if (next.length <= limit || limit <= 0) return next;

  // Sorted by when each was added so the entry dropped is the least recently
  // added one, whatever order the list happened to be in.
  return next.sort((left, right) => left.addedAt - right.addedAt).slice(next.length - limit);
}

/** Drop an entry from the watchlist by identity; a key that is not there is a no-op. */
export function removeCustomToken(
  tokens: readonly CustomToken[],
  chainId: number,
  address: string
): CustomToken[] {
  const key = customTokenKey(chainId, address);
  return tokens.filter((entry) => customTokenKey(entry.chainId, entry.address) !== key);
}

/** Whether a token is already on the watchlist. */
export function isTracked(
  tokens: readonly CustomToken[],
  chainId: number,
  address: string
): boolean {
  const key = customTokenKey(chainId, address);
  return tokens.some((entry) => customTokenKey(entry.chainId, entry.address) === key);
}

/**
 * Collapse duplicates that a hand-edited or older payload may contain.
 *
 * The last entry for a key wins, since a later one is the more recent intent,
 * and the survivor keeps the position of the first so the list does not reshuffle
 * on every read.
 */
export function dedupeCustomTokens(tokens: readonly CustomToken[]): CustomToken[] {
  const byKey = new Map<string, CustomToken>();

  for (const token of tokens) {
    const key = customTokenKey(token.chainId, token.address);
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...token, addedAt: existing.addedAt } : token);
  }

  return Array.from(byKey.values());
}

/**
 * Turn a stored payload into entries safe to render.
 *
 * Storage is shared with older builds, other tabs, and anyone with devtools, so
 * every field is checked rather than trusted: a row that cannot be described
 * completely is dropped, because a half-parsed token would render as a nameless
 * address with the wrong decimals.
 */
export function sanitizeCustomTokens(raw: unknown): CustomToken[] {
  if (!Array.isArray(raw)) return [];

  const tokens: CustomToken[] = [];

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as Record<string, unknown>;

    const chainId = Number(candidate.chainId);
    const address = typeof candidate.address === 'string' ? candidate.address.trim() : '';
    if (!Number.isInteger(chainId) || !isTrackableChain(chainId)) continue;
    if (!isAddress(address)) continue;

    const decimals = parseDecimalsInput(
      typeof candidate.decimals === 'number' || typeof candidate.decimals === 'string'
        ? candidate.decimals
        : null
    );
    if (decimals === 'invalid' || decimals === null) continue;

    const symbol = typeof candidate.symbol === 'string' ? candidate.symbol.trim() : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    if (symbol.length === 0 || symbol.length > MAX_SYMBOL_LENGTH) continue;

    const addedAt = Number(candidate.addedAt);

    tokens.push({
      chainId,
      address: checksumAddress(address),
      symbol,
      name: name.length > 0 ? name : symbol,
      decimals,
      addedAt: Number.isFinite(addedAt) ? addedAt : 0
    });
  }

  return dedupeCustomTokens(tokens);
}

/**
 * Render one watchlist entry as a portfolio row.
 *
 * The row starts at a zero balance with no price: a watched token is worth
 * showing whether or not the wallet holds it, and rendering it as an error would
 * make "not held" indistinguishable from "read failed". The balance reader and
 * the price lookup fill in the two fields that can be known.
 */
export function toCustomTokenBalance(token: CustomToken, rawBalance = '0'): TokenBalance {
  const decimals = token.decimals;
  const kind = classifyToken({
    chainId: token.chainId,
    address: token.address,
    symbol: token.symbol,
    name: token.name
  });

  return {
    chainId: token.chainId,
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals,
    kind,
    rawBalance,
    balance: toTokenAmount(rawBalance, decimals),
    isPriceable: kind !== 'lp',
    priceUsd: null,
    valueUsd: null,
    isCustom: true
  };
}

/** Chains a watchlist spans, used to size the balance read. */
export function customTokenChainIds(tokens: readonly CustomToken[]): number[] {
  return Array.from(new Set(tokens.map((token) => token.chainId))).filter(
    (chainId) => getChainMetadata(chainId) !== undefined
  );
}
