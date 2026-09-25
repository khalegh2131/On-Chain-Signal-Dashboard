'use client';

import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn, formatTokenAmount, formatUsd } from '@/lib/utils';
import type { DefiPosition } from '@/types';

/**
 * The part of a position that is only worth showing once asked for.
 *
 * Everything here is what the reader needs in order to reconcile a figure: which
 * tokens are actually locked up, what the band is, and where the protocol lists
 * it. Keeping it collapsed means the summary row stays one line per position and
 * a wallet with a dozen positions is still scannable.
 */

export interface PositionDetailProps {
  position: DefiPosition;
  /** Id of the region, so the toggle's `aria-controls` resolves. */
  id: string;
}

export function PositionDetail({ position, id }: PositionDetailProps) {
  const range = position.priceRange ?? null;

  return (
    <div id={id} className="mt-4 space-y-4 border-t border-border/60 pt-4">
      <dl className="grid gap-x-6 gap-y-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
          <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Underlying
          </dt>
          <dd className="space-y-1">
            {position.tokens.length === 0 ? (
              <span className="text-muted-foreground">No tokens decoded</span>
            ) : (
              position.tokens.map((token) => (
                <span
                  key={`${token.chainId}:${token.address}`}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatTokenAmount(token.balance)} {token.symbol}
                  </span>
                  <span className="font-mono tabular-nums text-foreground">
                    {token.valueUsd === null ? 'Not priced' : formatUsd(token.valueUsd)}
                  </span>
                </span>
              ))
            )}
          </dd>
        </div>

        <Detail
          label="Fee tier"
          value={
            position.feeTier === null || position.feeTier === undefined
              ? 'Not applicable'
              : `${position.feeTier.toFixed(2)}%`
          }
        />

        <Detail
          label="Range"
          value={
            range === null ? (
              'Not applicable'
            ) : (
              <span className="font-mono text-[11px] tabular-nums">
                {formatTokenAmount(range.lower, 4)} - {formatTokenAmount(range.upper, 4)}{' '}
                {range.quotePerBase}
              </span>
            )
          }
        />
      </dl>

      {position.debtUsd > 0 ? (
        <p className="text-xs text-muted-foreground">
          Debt outstanding:{' '}
          <span className="font-mono tabular-nums text-foreground">
            {formatUsd(position.debtUsd)}
          </span>
        </p>
      ) : null}

      {position.note ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{position.note}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        {position.positionUrl ? (
          <a
            href={position.positionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-foreground underline-offset-4 transition-colors duration-150 ease-out hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ExternalLink aria-hidden="true" className="h-3 w-3" />
            Open on the protocol
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className={cn('text-foreground', typeof value === 'string' && 'text-xs')}>{value}</dd>
    </div>
  );
}
