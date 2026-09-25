'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Plus, TriangleAlert } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { isAddress } from 'viem';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ACTIVE_CHAINS } from '@/config/chains';
import { useCustomTokens } from '@/hooks/use-custom-tokens';
import { getTokenMetadata } from '@/lib/api/alchemy.client';
import { toAppError } from '@/lib/api/errors';
import {
  MAX_CUSTOM_TOKENS,
  MAX_TOKEN_DECIMALS,
  toCustomToken,
  validateCustomToken
} from '@/lib/custom-tokens';
import { cn } from '@/lib/utils';

/**
 * Add a token to the watchlist.
 *
 * The contract address is the only required field, and it is checked twice: once
 * locally so a malformed address never leaves the browser, and once against the
 * chain itself, because a syntactically valid address can still be an empty
 * account. What the chain reports then prefills the overrides, which exist for
 * the contracts that report nothing usable — a token with no symbol, or one that
 * declares the wrong decimals.
 *
 * An unreachable metadata read does not block the reader forever, but it does
 * block the *submit* until decimals are supplied: guessing them would value the
 * holding off by a factor of a trillion, and a wrong number in a portfolio is
 * worse than an extra field.
 */

/** How the lookup on the chain is cached; contract metadata is effectively immutable. */
const METADATA_STALE_MS = 10 * 60_000;

export interface AddTokenDialogProps {
  /** Button height, matched to the surface it sits on. */
  size?: 'sm' | 'default';
  className?: string;
}

export function AddTokenDialog({ size = 'default', className }: AddTokenDialogProps) {
  const [open, setOpen] = useState(false);
  const [chainId, setChainId] = useState<number>(ACTIVE_CHAINS[0]?.id ?? 1);
  const [address, setAddress] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimals, setDecimals] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const { add, isTracked, isFull } = useCustomTokens();

  const trimmedAddress = address.trim();
  const lookupEnabled = open && isAddress(trimmedAddress);

  const metadata = useQuery({
    queryKey: ['token-metadata', chainId, trimmedAddress.toLowerCase()],
    queryFn: () => {
      const chain = ACTIVE_CHAINS.find((entry) => entry.id === chainId);
      if (!chain) throw new Error(`Chain ${chainId} is not one this dashboard reads`);
      return getTokenMetadata(trimmedAddress as `0x${string}`, chain);
    },
    enabled: lookupEnabled,
    staleTime: METADATA_STALE_MS
  });

  const resolved = metadata.data;

  // Prefill from the chain without overwriting anything already typed: the
  // overrides exist for exactly the contracts this read gets wrong.
  useEffect(() => {
    if (!resolved) return;
    setSymbol((current) => (current.trim().length > 0 ? current : (resolved.symbol ?? '')));
    setDecimals((current) =>
      current.trim().length > 0
        ? current
        : resolved.decimals === null
          ? ''
          : String(resolved.decimals)
    );
  }, [resolved]);

  const validation = useMemo(
    () => validateCustomToken({ chainId, address: trimmedAddress, symbol, decimals }),
    [chainId, trimmedAddress, symbol, decimals]
  );

  const lookupError = metadata.error ? toAppError(metadata.error, { service: 'alchemy' }) : null;
  const decimalsSupplied = decimals.trim().length > 0;
  const canSubmit =
    validation.ok && !metadata.isLoading && (!lookupError || decimalsSupplied) && !isFull;

  const reset = useCallback(() => {
    setAddress('');
    setSymbol('');
    setDecimals('');
    setSubmitted(false);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      // A dismissed dialog should not remember a half-typed address.
      if (!next) reset();
    },
    [reset]
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitted(true);
      if (!validation.ok || !canSubmit) return;

      const alreadyWatched = isTracked(validation.value.chainId, validation.value.address);
      add(
        toCustomToken(validation.value, {
          symbol: resolved?.symbol ?? null,
          name: resolved?.name ?? null,
          decimals: resolved?.decimals ?? null
        })
      );

      toast.success(
        alreadyWatched
          ? `${validation.value.address.slice(0, 6)}… updated on the watchlist`
          : `Watching ${resolved?.symbol ?? validation.value.symbol ?? 'token'}`
      );
      handleOpenChange(false);
    },
    [add, canSubmit, handleOpenChange, isTracked, resolved, validation]
  );

  // A malformed address is reported as it is typed rather than only on submit.
  // The submit button stays disabled until the address is valid, so a
  // submit-time message would never reach the reader and the button would look
  // broken with no explanation.
  const addressError =
    !validation.ok && validation.code === 'invalid_address' && trimmedAddress.length > 0
      ? validation.message
      : null;
  const otherError =
    submitted && !validation.ok && validation.code !== 'invalid_address'
      ? validation.message
      : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size={size}
          className={className}
          disabled={isFull}
          title={
            isFull
              ? `The watchlist holds its maximum of ${MAX_CUSTOM_TOKENS} tokens — remove one to add another`
              : undefined
          }
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add token
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a custom token</DialogTitle>
          <DialogDescription>
            Watch a contract the balance indexer has not seen this address hold. It is read on the
            chain you pick, stored in this browser only, and shown in the token list even when the
            wallet holds none of it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="add-token-chain" className="text-xs font-medium text-foreground">
              Chain
            </label>
            <select
              id="add-token-chain"
              value={chainId}
              onChange={(event) => setChainId(Number(event.target.value))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {ACTIVE_CHAINS.map((chain) => (
                <option key={chain.id} value={chain.id}>
                  {chain.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Only chains this dashboard reads can be watched.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="add-token-address" className="text-xs font-medium text-foreground">
              Contract address
            </label>
            <Input
              id="add-token-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={addressError !== null}
              aria-describedby={addressError ? 'add-token-address-error' : undefined}
              className="font-mono text-xs"
            />
            {addressError ? (
              <p
                id="add-token-address-error"
                role="alert"
                className="flex items-start gap-1.5 text-[11px] text-destructive"
              >
                <TriangleAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                <span className="font-mono">{addressError}</span>
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                The address is checked on the chain before anything is stored.
              </p>
            )}
          </div>

          <div className="rounded-md border border-border/60 bg-muted/30 p-3">
            {!isAddress(trimmedAddress) ? (
              <p className="text-[11px] text-muted-foreground">
                Symbol and decimals are read from the contract once the address is complete.
              </p>
            ) : metadata.isLoading ? (
              <p
                aria-live="polite"
                className="flex items-center gap-2 text-[11px] text-muted-foreground"
              >
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                Reading contract metadata on{' '}
                {ACTIVE_CHAINS.find((chain) => chain.id === chainId)?.name ?? `chain ${chainId}`}…
              </p>
            ) : lookupError ? (
              <p
                aria-live="polite"
                className="flex items-start gap-1.5 text-[11px] text-destructive"
              >
                <TriangleAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>{lookupError.message}</span>
              </p>
            ) : resolved ? (
              <p
                aria-live="polite"
                className="flex items-start gap-1.5 text-[11px] text-muted-foreground"
              >
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-px h-3.5 w-3.5 shrink-0 text-primary"
                />
                <span>
                  Resolved as{' '}
                  <span className="font-medium text-foreground">
                    {resolved.name ?? 'unnamed contract'}
                  </span>{' '}
                  · <span className="font-mono tabular-nums">{resolved.decimals ?? '—'}</span>{' '}
                  decimals
                  {resolved.symbol ? (
                    <>
                      {' '}
                      · symbol <span className="font-mono">{resolved.symbol}</span>
                    </>
                  ) : null}
                </span>
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="add-token-symbol" className="text-xs font-medium text-foreground">
                Symbol override
              </label>
              <Input
                id="add-token-symbol"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                placeholder={resolved?.symbol ?? 'Optional'}
                autoComplete="off"
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="add-token-decimals" className="text-xs font-medium text-foreground">
                Decimals override
              </label>
              <Input
                id="add-token-decimals"
                value={decimals}
                onChange={(event) => setDecimals(event.target.value)}
                inputMode="numeric"
                placeholder={
                  resolved?.decimals === null
                    ? 'Optional'
                    : String(resolved?.decimals ?? 'Optional')
                }
                autoComplete="off"
                className="font-mono"
              />
            </div>
          </div>

          {otherError ? (
            <p role="alert" className="text-[11px] text-destructive">
              {otherError}
            </p>
          ) : null}

          {!canSubmit && validation.ok && lookupError && !decimalsSupplied ? (
            <p className="text-[11px] text-muted-foreground">
              Decimals must be supplied by hand to add this contract — the chain could not be read,
              and assuming them would misvalue the balance by orders of magnitude.
            </p>
          ) : null}

          {isFull ? (
            <p className="text-[11px] text-muted-foreground">
              The watchlist holds its maximum of{' '}
              <span className="font-mono tabular-nums">{MAX_CUSTOM_TOKENS}</span> tokens.
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              size="sm"
              disabled={!canSubmit}
              className={cn(!canSubmit && 'opacity-60')}
            >
              {metadata.isLoading ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Plus aria-hidden="true" className="h-4 w-4" />
              )}
              Add to watchlist
            </Button>
          </DialogFooter>

          <p className="text-[11px] text-muted-foreground">
            Decimals above <span className="font-mono tabular-nums">{MAX_TOKEN_DECIMALS}</span> are
            rejected — no ERC-20 has ever needed them.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
