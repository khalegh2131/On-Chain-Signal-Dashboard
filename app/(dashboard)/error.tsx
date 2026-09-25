'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Dashboard-scoped error boundary.
 *
 * The shell outside this boundary — sidebar, top bar, footer — is unaffected, so
 * a failing data read costs the reader the panel and not the navigation. The
 * digest is shown because it is the only handle on a server-side failure that a
 * reader can quote back without opening a console.
 */
export default function DashboardError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Kept in the console so a provider that started rejecting can be identified
    // from the message rather than from a reproduction.
    console.error('Dashboard route failed to render:', error);
  }, [error]);

  return (
    <Card className="border-border/60 bg-card/50">
      <CardContent className="flex flex-col items-center gap-6 py-20 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Dashboard error
        </p>

        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            This panel could not be rendered
          </h1>
          <p className="mx-auto max-w-md text-balance text-sm text-muted-foreground">
            Most often this is an upstream provider refusing a read — a rate limit or a dropped
            connection. Retrying is usually enough; the sidebar and the rest of the app stay usable
            either way.
          </p>
          {error.digest ? (
            <p className="font-mono text-xs text-muted-foreground">digest: {error.digest}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.assign('/dashboard')}>
            Reload dashboard
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
