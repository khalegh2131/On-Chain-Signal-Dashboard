'use client';

import { useQuery } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useAccount } from 'wagmi';

import { SectionHeading } from '@/components/shared/section-heading';
import { StatCard } from '@/components/shared/stat-card';
import { WalletConnect } from '@/components/wallet/wallet-connect';
import { createMockDefiPositions } from '@/lib/mock';
import { fetchDefiPositions } from '@/lib/services/defi.service';
import { formatUsd } from '@/lib/utils';
import type { DefiPositionsResult } from '@/types';

import { PositionList } from './position-list';

/**
 * DeFi page composition.
 *
 * A live read needs the indexer credentials named in the notes panel, so the
 * route is usable without them: the demo positions stand in while no wallet is
 * connected, and a connected wallet that the readers can only partly cover gets
 * its real positions *plus* the reasons the rest are missing. Neither path ever
 * shows a guessed balance.
 */

/** Subgraph reads are billed per query, so positions are cached far longer than balances. */
const POSITION_STALE_MS = 5 * 60_000;

export function DefiView() {
  const { address, isConnected } = useAccount();
  const demo = !isConnected;

  const { data, isLoading, isError, error, refetch } = useQuery<DefiPositionsResult>({
    queryKey: ['defi-positions', address ?? ''],
    queryFn: () => fetchDefiPositions(address as `0x${string}`),
    enabled: Boolean(address),
    staleTime: POSITION_STALE_MS
  });

  const positions = useMemo(
    () => (demo ? createMockDefiPositions() : (data?.positions ?? [])),
    [demo, data]
  );

  const notes = useMemo(() => {
    if (demo) return [];
    return [...(data?.notes ?? []), ...(data?.errors ?? []).map((entry) => entry.message)];
  }, [demo, data]);

  const totals = useMemo(() => {
    const value = positions.reduce(
      (total, position) => total + position.valueUsd - position.debtUsd,
      0
    );
    return {
      value,
      count: positions.length,
      protocols: new Set(positions.map((position) => position.protocol)).size
    };
  }, [positions]);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-3">
        <StatCard
          label="Net position value"
          value={formatUsd(totals.value)}
          isLoading={!demo && isLoading}
        />
        <StatCard
          label="Positions"
          value={String(totals.count)}
          hint={demo ? 'Demo snapshot' : 'Decoded on-chain'}
          isLoading={!demo && isLoading}
        />
        <StatCard
          label="Protocols"
          value={String(totals.protocols)}
          hint="With an open position"
          isLoading={!demo && isLoading}
        />
      </div>

      {demo ? (
        <p className="text-xs text-muted-foreground">
          Showing a demo snapshot - connect a wallet to read the positions a real address holds.
        </p>
      ) : null}

      {notes.length > 0 ? (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />
            Coverage
          </p>
          <ul className="mt-2 space-y-1.5">
            {notes.map((note) => (
              <li key={note} className="text-[11px] leading-relaxed text-muted-foreground">
                {note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <SectionHeading
          eyebrow="Open positions"
          title="Unwrapped holdings"
          description="Each position is valued from the tokens behind it, so a liquidity band and a plain balance are priced the same way."
          className="mb-6"
        />

        <PositionList
          positions={positions}
          isLoading={!demo && isLoading}
          isError={!demo && isError}
          errorMessage={error?.message}
          onRetry={retry}
          emptyAction={<WalletConnect />}
        />
      </div>
    </div>
  );
}
