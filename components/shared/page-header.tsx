import type { ReactNode } from 'react';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description: string;
  /** Action slot rendered on the right, typically a filter or refresh control. */
  actions?: ReactNode;
  className?: string;
}

/** Title block shared by every dashboard route, so spacing stays consistent. */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

interface EmptyStateProps {
  /** Lucide icon element rendered inside the muted badge. */
  icon: ReactNode;
  title: string;
  description: string;
  /** Optional call to action shown under the copy. */
  action?: ReactNode;
  className?: string;
}

/** Card used by routes that have no data to show yet, with guidance instead of a blank panel. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <Card className={cn('border-dashed', className)}>
      <CardHeader className="items-center gap-3 py-14 text-center">
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="max-w-md text-balance">{description}</CardDescription>
        {action ? <div className="mt-4">{action}</div> : null}
      </CardHeader>
    </Card>
  );
}
