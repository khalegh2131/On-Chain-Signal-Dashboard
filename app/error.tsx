'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the browser console and in server logs so a failing RPC read
    // can be traced without a reproduction step.
    console.error('Unhandled dashboard error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="font-mono text-sm text-destructive">Runtime error</p>
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Something broke while reading data
        </h1>
        <p className="max-w-md text-balance text-sm text-muted-foreground">
          An upstream provider may be rate limiting or unreachable. Retrying usually resolves it; if
          it persists, the failing provider is named in the console.
        </p>
        {error.digest ? (
          <p className="font-mono text-xs text-muted-foreground">digest: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.assign('/dashboard')}>
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
