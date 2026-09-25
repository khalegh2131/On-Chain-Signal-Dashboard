'use client';

import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { ChainIndicator } from '@/components/wallet/chain-indicator';
import { cn, formatTokenAmount, formatUsd } from '@/lib/utils';
import type { NftItem } from '@/types';

/**
 * One token in the gallery.
 *
 * The whole card is the link when a marketplace URL exists, rather than a button
 * hidden inside it: a nested interactive element would break keyboard order, and
 * an anchor is what a browser already knows how to open in a new tab. The
 * overlay is decoration for the same link, so it stays out of the accessibility
 * tree.
 */

export interface NftCardProps {
  item: NftItem;
  /** Aspect ratio for the artwork, varied across the column mosaic. */
  aspectClassName?: string;
  className?: string;
}

export function NftCard({ item, aspectClassName = 'aspect-square', className }: NftCardProps) {
  const [failed, setFailed] = useState(false);

  const media = item.imageUrl;
  const showImage = Boolean(media) && !failed;
  const label = item.name ?? `${item.collectionName} #${item.tokenId}`;
  const monogram =
    label
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 2)
      .toUpperCase() || item.tokenId.slice(0, 2);

  const body = (
    <>
      <div
        className={cn('relative w-full overflow-hidden rounded-lg bg-secondary', aspectClassName)}
      >
        {showImage && media ? (
          <Image
            src={media}
            alt={label}
            fill
            sizes="(min-width: 1280px) 22vw, (min-width: 640px) 30vw, 90vw"
            className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
            onError={() => setFailed(true)}
          />
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center text-sm font-medium text-muted-foreground"
          >
            {monogram}
          </span>
        )}

        <span className="absolute right-2 top-2 rounded-full bg-background/80 px-2 py-0.5 font-mono text-[11px] tabular-nums text-foreground backdrop-blur-sm">
          {item.floorPriceNative === null
            ? 'No floor'
            : `${formatTokenAmount(item.floorPriceNative, 2)} ETH`}
        </span>

        {item.openseaUrl ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-center gap-1.5 rounded-md bg-background/90 px-2 py-1.5 text-[11px] font-medium text-foreground opacity-0 backdrop-blur-sm transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <ExternalLink className="h-3 w-3" />
            Open on OpenSea
          </span>
        ) : null}
      </div>

      <div className="space-y-1 px-1 pt-3">
        <p className="truncate text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {item.collectionName}
        </p>
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        <div className="flex items-center justify-between gap-3 pt-2">
          <ChainIndicator chainId={item.chainId} />
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {item.floorPriceUsd === null ? '—' : formatUsd(item.floorPriceUsd)}
          </span>
        </div>
      </div>
    </>
  );

  if (!item.openseaUrl) {
    return (
      <article className={cn('break-inside-avoid', className)} aria-label={label}>
        {body}
      </article>
    );
  }

  return (
    <a
      href={item.openseaUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} — open on OpenSea in a new tab`}
      className={cn(
        'group block break-inside-avoid rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className
      )}
    >
      {body}
    </a>
  );
}
