import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import * as React from 'react';

import { cn, formatPercent, formatUsd } from '@/lib/utils';

/**
 * Signed change indicator.
 *
 * The arrow carries the direction and the colour reinforces it, because a red
 * minus sign is easy to miss in a dense table while a green up-arrow is not.
 * Emerald marks a gain and the destructive token a loss — the accent is spent
 * here deliberately, and nowhere near it is another competing colour.
 */

export interface DeltaChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Signed change in percent; `null` renders an em dash. */
  percent?: number | null;
  /** Signed absolute change. Formatted as USD unless `absoluteFormat` says otherwise. */
  absolute?: number | null;
  /** How to render `absolute`. */
  absoluteFormat?: 'usd' | 'none';
  size?: 'sm' | 'md';
  /** Describes the window the change covers, e.g. `last 24 hours`. Read by screen readers. */
  window?: string;
}

const DeltaChip = React.forwardRef<HTMLSpanElement, DeltaChipProps>(
  (
    {
      percent,
      absolute,
      absoluteFormat = 'usd',
      size = 'sm',
      window: deltaWindow,
      className,
      ...props
    },
    ref
  ) => {
    const direction = percent === null || percent === undefined ? 0 : Math.sign(percent);
    const tone =
      direction > 0
        ? 'bg-success/10 text-success'
        : direction < 0
          ? 'bg-destructive/10 text-destructive'
          : 'bg-muted text-muted-foreground';

    const Arrow = direction > 0 ? ArrowUpRight : direction < 0 ? ArrowDownRight : Minus;

    const formattedPercent =
      percent === null || percent === undefined ? '—' : formatPercent(percent, { signed: true });
    const formattedAbsolute =
      absolute === null || absolute === undefined || absoluteFormat === 'none'
        ? null
        : formatUsd(absolute);

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1 rounded-full font-mono tabular-nums',
          size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
          tone,
          className
        )}
        {...props}
      >
        <Arrow aria-hidden="true" className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        <span>{formattedPercent}</span>
        {formattedAbsolute ? <span className="opacity-70">{formattedAbsolute}</span> : null}
        {deltaWindow ? (
          <span className="sr-only">
            {direction > 0 ? 'up' : direction < 0 ? 'down' : 'unchanged'} over the {deltaWindow}
          </span>
        ) : null}
      </span>
    );
  }
);
DeltaChip.displayName = 'DeltaChip';

export { DeltaChip };
