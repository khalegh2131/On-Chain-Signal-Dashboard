'use client';

import { ChevronDown, KeyRound } from 'lucide-react';
import { useId, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ChainIndicator } from '@/components/wallet/chain-indicator';
import { POSITION_KIND_LABELS, PROTOCOL_LABELS } from '@/lib/mock';
import { cn, formatPercent, formatUsd } from '@/lib/utils';
import type { DefiPosition } from '@/types';

import { PositionDetail } from './position-detail';

/**
 * One DeFi position.
 *
 * The value leads because that is what a reader comes for, and the three states
 * that change what the number means — a band that has drifted out of range, a
 * debt attached to it, and a read that needed a credential we do not hold — are
 * shown next to it rather than buried in the disclosure. An out-of-range band is
 * the one state worth colouring: it means the position has stopped earning fees,
 * which is the single most expensive thing to miss.
 */

export interface PositionCardProps {
  position: DefiPosition;
}

export function PositionCard({ position }: PositionCardProps) {
  const [open, setOpen] = useState(false);
  const regionId = useId();

  const inRange = position.inRange ?? null;
  const netValue = position.valueUsd - position.debtUsd;

  return (
    <Card className="border-border/60 bg-card/50">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {PROTOCOL_LABELS[position.protocol]}
              </span>
              <ChainIndicator chainId={position.chainId} />
              <Badge variant="secondary" className="text-[10px] uppercase">
                {POSITION_KIND_LABELS[position.kind]}
              </Badge>
            </div>
            <p className="truncate text-sm font-medium text-foreground">{position.label}</p>
          </div>

          <div className="text-right">
            <p className="font-mono text-xl font-light tabular-nums text-foreground">
              {formatUsd(netValue)}
            </p>
            {position.debtUsd > 0 ? (
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {formatUsd(position.debtUsd)} debt
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {position.apy === null ? null : (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] tabular-nums text-primary">
              {formatPercent(position.apy, { signed: false })} APY
            </span>
          )}

          {inRange === null ? null : (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums',
                inRange ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
              )}
            >
              {inRange ? 'In range' : 'Out of range'}
            </span>
          )}

          {position.requiresCredential ? (
            <span
              title={position.note ?? undefined}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              <KeyRound aria-hidden="true" className="h-3 w-3" />
              Needs a credential
            </span>
          ) : null}

          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {position.tokens.length} {position.tokens.length === 1 ? 'token' : 'tokens'} underlying
          </span>
        </div>

        <div className="mt-4">
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
          {open ? <PositionDetail position={position} id={`${regionId}-body`} /> : null}
        </div>
      </CardContent>
    </Card>
  );
}
