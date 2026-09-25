import * as React from 'react';

import { getChainMetadata } from '@/config/chains';
import { cn } from '@/lib/utils';

/**
 * Chain badge.
 *
 * Holds no wallet state on purpose: the same marker is used for a connected
 * wallet, a chain row in the breakdown, and a token's origin. A chain the
 * dashboard has no metadata for is shown as unsupported rather than as a bare
 * number, because "Chain 137" tells a reader nothing.
 */

export interface ChainIndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Chain id; ids without metadata render as unsupported. */
  chainId?: number;
  /** Force the unsupported treatment, e.g. while the wallet sits on a foreign chain. */
  unsupported?: boolean;
  /** `full` uses the chain's display name, `short` its ticker-style label. */
  variant?: 'short' | 'full';
  /** Render only the colour dot, keeping the label for screen readers. */
  dotOnly?: boolean;
}

const ChainIndicator = React.forwardRef<HTMLSpanElement, ChainIndicatorProps>(
  (
    { chainId, unsupported = false, variant = 'short', dotOnly = false, className, ...props },
    ref
  ) => {
    const metadata = chainId === undefined ? undefined : getChainMetadata(chainId);
    const isUnsupported = unsupported || metadata === undefined;

    const label = isUnsupported
      ? 'Unsupported'
      : variant === 'full'
        ? metadata.name
        : metadata.shortName;

    return (
      <span
        ref={ref}
        title={label}
        className={cn(
          'inline-flex items-center gap-1.5 text-xs',
          isUnsupported ? 'text-destructive' : 'text-muted-foreground',
          className
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', isUnsupported && 'bg-destructive')}
          style={isUnsupported ? undefined : { backgroundColor: metadata.color }}
        />
        {dotOnly ? (
          <span className="sr-only">{label}</span>
        ) : (
          <span
            className={cn(
              'truncate',
              variant === 'short' && 'font-mono text-[11px] uppercase tracking-wide'
            )}
          >
            {label}
          </span>
        )}
      </span>
    );
  }
);
ChainIndicator.displayName = 'ChainIndicator';

export { ChainIndicator };
