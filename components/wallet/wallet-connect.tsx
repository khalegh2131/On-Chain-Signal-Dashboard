'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Check, ChevronDown, Copy, ExternalLink, LogOut, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useDisconnect } from 'wagmi';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { ACTIVE_CHAINS, getChainMetadata } from '@/config/chains';
import { useActiveChain } from '@/lib/web3/hooks';
import { cn, truncateAddress } from '@/lib/utils';

import { ChainIndicator } from './chain-indicator';

/**
 * Wallet entry point.
 *
 * Wraps RainbowKit's connector so the connection state looks like the rest of
 * the dashboard rather than like a wallet vendor's modal. Two affordances sit
 * side by side once connected: the address opens the account menu, and a
 * separate copy button writes it to the clipboard without a menu round-trip —
 * pasting an address is the single most common thing anyone does here.
 */

/** How long the copy confirmation stays on screen. */
const COPY_FEEDBACK_MS = 2_000;

export interface WalletConnectProps {
  className?: string;
  /** Button height, matched to the surface it sits on. */
  size?: 'sm' | 'default';
}

/** Monogram fallback for a wallet with no avatar, kept out of the image path. */
function WalletAvatar({ address, ensAvatar }: { address: string; ensAvatar?: string }) {
  const monogram = address.slice(2, 4).toUpperCase();

  return (
    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground">
      {monogram}
      {ensAvatar ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-cover bg-center"
          style={{ backgroundImage: `url(${ensAvatar})` }}
        />
      ) : null}
    </span>
  );
}

interface WalletChipProps {
  address: string;
  ensName?: string;
  ensAvatar?: string;
  chainId: number;
  /** RainbowKit reports a chain it has no configuration for. */
  unsupported: boolean;
  className?: string;
}

function WalletChip({
  address,
  ensName,
  ensAvatar,
  chainId,
  unsupported,
  className
}: WalletChipProps) {
  const { switchChain } = useActiveChain();
  const { disconnect } = useDisconnect();
  const [copied, setCopied] = useState(false);

  const metadata = getChainMetadata(chainId);
  const isUnsupported = unsupported || metadata === undefined;
  const chainLabel = metadata?.name ?? 'Unsupported network';
  const shortAddress = truncateAddress(address, 4);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyAddress = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success('Address copied');
    } catch {
      // Clipboard access is denied outside a secure context and in some browsers
      // without a user gesture; the address is still visible in the menu.
      toast.error('Could not copy the address');
    }
  }, [address]);

  const switchTargets = ACTIVE_CHAINS.filter((chain) => chain.id !== chainId);

  return (
    <div
      className={cn(
        'inline-flex items-center overflow-hidden rounded-md border border-border/60 bg-card/50',
        className
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Wallet ${shortAddress} on ${chainLabel}. Open account menu`}
            className="flex items-center gap-2 py-2 pl-2.5 pr-2 text-sm transition-colors duration-150 ease-out hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <WalletAvatar address={address} ensAvatar={ensAvatar} />
            <ChainIndicator chainId={chainId} unsupported={isUnsupported} dotOnly />
            <span className="hidden font-mono text-xs tabular-nums sm:inline">
              {ensName ?? shortAddress}
            </span>
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-normal">
            <span className="block font-mono text-xs tabular-nums text-foreground">
              {ensName ?? shortAddress}
            </span>
            <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ChainIndicator chainId={chainId} unsupported={isUnsupported} />
            </span>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => void copyAddress()}>
            {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            <span>Copy address</span>
          </DropdownMenuItem>

          {metadata ? (
            <DropdownMenuItem asChild>
              <a
                href={`${metadata.explorerUrl}/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                <span>View on {metadata.name}</span>
              </a>
            </DropdownMenuItem>
          ) : null}

          {isUnsupported && switchTargets.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-medium text-destructive">
                Wrong network — switch to continue reading
              </DropdownMenuLabel>
              {switchTargets.map((target) => (
                <DropdownMenuItem key={target.id} onSelect={() => switchChain(target.id)}>
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: target.color }}
                  />
                  <span>Switch to {target.name}</span>
                </DropdownMenuItem>
              ))}
            </>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => disconnect()}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            <span>Disconnect</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <span aria-hidden="true" className="h-4 w-px bg-border/60" />

      <button
        type="button"
        onClick={() => void copyAddress()}
        aria-label="Copy wallet address"
        className="px-2 py-2 text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {copied ? (
          <Check aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Copy aria-hidden="true" className="h-3.5 w-3.5" />
        )}
      </button>

      <span aria-live="polite" className="sr-only">
        {copied ? 'Address copied to clipboard' : ''}
      </span>
    </div>
  );
}

export function WalletConnect({ className, size = 'default' }: WalletConnectProps) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, mounted }) => {
        if (!mounted || !account || !chain) {
          return (
            <Button size={size} onClick={openConnectModal} className={className}>
              <Wallet aria-hidden="true" className="h-4 w-4" />
              Connect Wallet
            </Button>
          );
        }

        return (
          <WalletChip
            className={className}
            address={account.address}
            ensName={account.ensName ?? undefined}
            ensAvatar={account.ensAvatar ?? undefined}
            chainId={chain.id}
            unsupported={chain.unsupported === true}
          />
        );
      }}
    </ConnectButton.Custom>
  );
}
