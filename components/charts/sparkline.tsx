import * as React from 'react';

import { buildSparklinePath } from '@/lib/utils/series';
import { cn } from '@/lib/utils';

/**
 * Inline trend line.
 *
 * Colours come from `currentColor`, so a caller sets `text-primary` or
 * `text-destructive` and the line follows the theme and the sign of the change
 * without this component knowing either. It draws into a fixed view box and
 * stretches, which means one path string works at every rendered size.
 */

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 32;

export interface SparklineProps extends Omit<React.SVGProps<SVGSVGElement>, 'values'> {
  /** Samples, oldest first. Fewer than two draws nothing. */
  values: readonly number[];
  /** Accessible description. Omit when the line only decorates an adjacent figure. */
  label?: string;
}

export function Sparkline({ values, label, className, ...props }: SparklineProps) {
  const path = buildSparklinePath(values, {
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    padding: 3
  });

  if (path.length === 0) return null;

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('overflow-visible', className)}
      {...props}
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        // Keeps the hairline at 1.5px however far the view box is stretched.
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
