'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { getChainMetadata } from '@/config/chains';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { getTokenBalances } from '@/lib/api/alchemy.client';
import {
  CUSTOM_TOKENS_STORAGE_KEY,
  MAX_CUSTOM_TOKENS,
  addCustomToken,
  customTokenKey,
  isTracked,
  removeCustomToken,
  sanitizeCustomTokens,
  toCustomTokenBalance
} from '@/lib/custom-tokens';
import { applyPrices } from '@/lib/services/balance.service';
import { fetchTokenPrices } from '@/lib/services/price.service';
import type { CustomToken, TokenBalance } from '@/types';

/**
 * The reader's watched tokens, with whatever the wallet actually holds of them.
 *
 * Two independent things happen here and they are deliberately allowed to fail
 * separately. The list itself lives in storage and always renders, so a watched
 * token is visible whether or not the wallet holds it and whether or not any
 * chain answered. The balances are a read on top of that list: when it fails the
 * rows stay on screen at a zero balance with `degraded` set, because dropping
 * them would look like the token had been removed.
 */

/** Balances for a handful of watched contracts move no faster than the portfolio. */
const CUSTOM_BALANCE_STALE_MS = 30_000;
const CUSTOM_BALANCE_REFETCH_MS = 60_000;

export interface CustomTokensState {
  /** Every watched token, in the order it was added. */
  tokens: readonly CustomToken[];
  /** The same tokens as portfolio rows, priced where a quote exists. */
  rows: readonly TokenBalance[];
  /** True while the first balance read is in flight; rows are already renderable. */
  isLoading: boolean;
  /** A balance read failed, so the rows on screen carry zero balances. */
  degraded: boolean;
  error: Error | null;
  /** Re-run the balance read; a no-op when nothing is watched. */
  refetch: () => void;
  /** Watch a token. Re-adding one that is already watched replaces it in place. */
  add: (token: CustomToken) => void;
  /** Stop watching a token. */
  remove: (chainId: number, address: string) => void;
  /** Whether a chain-and-address pair is already watched. */
  isTracked: (chainId: number, address: string) => boolean;
  /** True once the list is at its ceiling, so the UI can explain the refusal. */
  isFull: boolean;
}

/** Stable key for a set of watched contracts, insensitive to casing and order. */
function readKey(tokens: readonly CustomToken[]): string {
  return tokens
    .map((token) => customTokenKey(token.chainId, token.address))
    .sort()
    .join('|');
}

interface CustomTokenRead {
  rows: TokenBalance[];
  degraded: boolean;
}

/**
 * Read held balances for a set of watched contracts.
 *
 * Each chain is read on its own and a failure there costs one row's balance, not
 * the whole list — the same posture the portfolio reader takes, for the same
 * reason: a rejected RPC on one network should not blank a watchlist covering
 * several.
 */
async function readCustomTokenRows(
  tokens: readonly CustomToken[],
  owner: `0x${string}`
): Promise<CustomTokenRead> {
  let degraded = false;

  const rows = await Promise.all(
    tokens.map(async (token) => {
      const chain = getChainMetadata(token.chainId);
      if (!chain) {
        degraded = true;
        return toCustomTokenBalance(token);
      }

      try {
        const balances = await getTokenBalances(owner, chain, [token.address]);
        const held = balances.find(
          (entry) => entry.contractAddress.toLowerCase() === token.address.toLowerCase()
        );
        return toCustomTokenBalance(token, held?.tokenBalance ?? '0');
      } catch {
        degraded = true;
        return toCustomTokenBalance(token);
      }
    })
  );

  const prices = await fetchTokenPrices(
    tokens.map((token) => ({ address: token.address, chainId: token.chainId }))
  );

  return { rows: applyPrices(rows, prices), degraded };
}

export interface UseCustomTokensOptions {
  /** Wallet to read balances for. Without one, rows render at a zero balance. */
  address?: `0x${string}`;
}

export function useCustomTokens(options: UseCustomTokensOptions = {}): CustomTokensState {
  const { address } = options;

  // Storage holds whatever a previous version or another tab wrote, so the value
  // is sanitised on read and only sanitised values are written back.
  const [stored, setStored] = useLocalStorage<unknown>(CUSTOM_TOKENS_STORAGE_KEY, []);
  const tokens = useMemo(() => sanitizeCustomTokens(stored), [stored]);

  const key = useMemo(() => readKey(tokens), [tokens]);
  const enabled = Boolean(address) && tokens.length > 0;

  const query = useQuery<CustomTokenRead>({
    queryKey: ['custom-tokens', address ?? '', key],
    queryFn: () => readCustomTokenRows(tokens, address as `0x${string}`),
    enabled,
    staleTime: CUSTOM_BALANCE_STALE_MS,
    refetchInterval: CUSTOM_BALANCE_REFETCH_MS
  });

  // Rendered before any read answers: a watched token is shown at a zero balance
  // rather than withheld, which is what keeps "not held" from looking like an error.
  const unread = useMemo(() => tokens.map((token) => toCustomTokenBalance(token)), [tokens]);
  const read = enabled ? query.data : undefined;
  const rows = read ? read.rows : unread;

  const add = useCallback(
    (token: CustomToken) => {
      setStored((previous: unknown) => addCustomToken(sanitizeCustomTokens(previous), token));
    },
    [setStored]
  );

  const remove = useCallback(
    (chainId: number, tokenAddress: string) => {
      setStored((previous: unknown) =>
        removeCustomToken(sanitizeCustomTokens(previous), chainId, tokenAddress)
      );
    },
    [setStored]
  );

  const isWatched = useCallback(
    (chainId: number, tokenAddress: string) => isTracked(tokens, chainId, tokenAddress),
    [tokens]
  );

  const { refetch: refetchQuery } = query;
  const refetch = useCallback(() => {
    if (!enabled) return;
    void refetchQuery();
  }, [enabled, refetchQuery]);

  return {
    tokens,
    rows,
    isLoading: enabled && query.isLoading,
    // Either the reader flagged a partial failure or the whole read rejected;
    // both mean the balances on screen are not to be trusted.
    degraded: enabled && (read?.degraded === true || query.isError),
    error: query.error,
    refetch,
    add,
    remove,
    isTracked: isWatched,
    isFull: tokens.length >= MAX_CUSTOM_TOKENS
  };
}
