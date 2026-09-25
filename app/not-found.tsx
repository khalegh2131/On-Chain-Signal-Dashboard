import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="font-mono text-sm text-primary">404</p>
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">This route holds no assets</h1>
        <p className="max-w-md text-balance text-sm text-muted-foreground">
          The page you asked for does not exist. It may have been renamed, or the link that brought
          you here pointed at a chain we do not index yet.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
