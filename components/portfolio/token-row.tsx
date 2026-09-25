'use client';

import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { useId, useState } from 'react';

import { DeltaChip } from '@/components/shared/delta-chip';
import { Badge } from '@/components/ui/badge';
import { ChainIndicator } from '@/components/wallet/chain-indicator';
import { cn, formatPercent, formatTokenAmount, formatUsd, truncateAddress } from '@/lib/utils';
import type { TokenAssetKind, TokenBalance } from '@/types';

/**
 * One held asset.
 *
 * The row answers three questions in reading order — what is it, what is it
 * worth, how did it move — and puts everything else behind a disclosure. An
 * expanded region is always present in the DOM so `aria-controls` resolves
 * whether or not it is open; toggling the contents rather than the container
 * avoids the display-utility conflicts that come with hiding a grid.
 */

const KIND_LABELS: Record<TokenAssetKind, string> = {
  native: 'Native gas token',
  erc20: 'ERC-20',
  lp: 'Liquidity pool share',
  nft: 'NFT'
};

/**
 * Token mark with a monogram fallback.
 *
 * A plain `img` rather than `next/image` on purpose: token logos come from
 * whatever host a third-party metadata feed points at, and the image optimiser
 * refuses an unlisted hostname by throwing — which would take the row down
 * rather than degrade to the monogram.
 */
function TokenAvatar({ token }: { token: TokenBalance }) {
  const [failed, setFailed] = useState(false);
  const monogram =
    token.symbol
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 2)
      .toUpperCase() || '?';
  const showImage = Boolean(token.logoUrl) && !failed;

  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-[11px] font-medium text-secondary-foreground">
      {showImage ? (
        <img
          src={token.logoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : null}
      {showImage ? null : <span aria-hidden="true">{monogram}</span>}
    </span>
  );
}

export interface TokenRowProps extends React.HTMLAttributes<HTMLDivElement> {
  token: TokenBalance;
  /** Share of the portfolio total, in `[0, 1]`. */
  share?: number;
}

const TokenRow = React.forwardRef<HTMLDivElement, TokenRowProps>(
  ({ token, share, className, ...props }, ref) => {
    const [open, setOpen] = useState(false);
    const regionId = useId();

    const value = token.valueUsd;
    const change = token.change24h ?? null;

    return (
      <div ref={ref} className={cn('py-4', className)} {...props}>
        <div className="flex items-center gap-3">
          <TokenAvatar token={token} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">{token.symbol}</span>
              <ChainIndicator chainId={token.chainId} />
              {token.isCustom ? (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  custom
                </Badge>
              ) : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">{token.name}</p>
          </div>

          <div className="shrink-0 text-right">
            <p className="font-mono text-sm tabular-nums text-foreground">
              {value === null ? 'Not priced' : formatUsd(value)}
            </p>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatTokenAmount(token.balance)} {token.symbol}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 pl-12">
          <div className="flex items-center gap-2">
            {token.isPriceable ? (
              <DeltaChip percent={change} window="last 24 hours" />
            ) : (
              <span className="text-[11px] text-muted-foreground">Valued from pool reserves</span>
            )}
            {share !== undefined ? (
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {formatPercent(share * 100, { signed: false })} of portfolio
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setOpen((previous) => !previous)}
            aria-expanded={open}
            aria-controls={regionId}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {open ? 'Hide details' : 'Details'}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-150 ease-out',
                open && 'rotate-180'
              )}
            />
          </button>
        </div>

        <div id={regionId}>
          {open ? (
            <dl className="mt-3 grid gap-x-6 gap-y-3 border-t border-border/60 pl-12 pt-3 text-xs sm:grid-cols-2">
              <Detail
                label="Contract"
                value={
                  <span className="font-mono tabular-nums">
                    {truncateAddress(token.address, 6)}
                  </span>
                }
              />
              <Detail
                label="Price"
                value={
                  <span className="font-mono tabular-nums">
                    {token.priceUsd === null ? 'Unavailable' : formatUsd(token.priceUsd)}
                  </span>
                }
              />
              <Detail label="Kind" value={KIND_LABELS[token.kind]} />
              <Detail
                label="Decimals"
                value={<span className="font-mono tabular-nums">{token.decimals}</span>}
              />
            </dl>
          ) : null}
        </div>
      </div>
    );
  }
);
TokenRow.displayName = 'TokenRow';

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

export { TokenRow };
