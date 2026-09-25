import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Section heading.
 *
 * Distinct from `PageHeader`: this one labels a block inside a page, so it is
 * quieter and repeats on every route. Fixing the eyebrow, title, and description
 * in one component is what keeps the vertical rhythm identical between sections
 * that were written weeks apart.
 */

export interface SectionHeadingProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Short label above the title, e.g. `Allocation`. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Trailing slot for a control that belongs to the section, e.g. a range switcher. */
  actions?: React.ReactNode;
  /** Heading level, so the document outline stays correct per page. */
  as?: 'h2' | 'h3';
}

const SectionHeading = React.forwardRef<HTMLDivElement, SectionHeadingProps>(
  ({ eyebrow, title, description, actions, as: Heading = 'h2', className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}
      {...props}
    >
      <div className="space-y-1.5">
        {eyebrow ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <Heading className="text-lg font-medium tracking-tight text-foreground">{title}</Heading>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
);
SectionHeading.displayName = 'SectionHeading';

export { SectionHeading };
