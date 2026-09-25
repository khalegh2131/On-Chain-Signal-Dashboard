import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * First-paint placeholder for the DeFi route.
 *
 * Two protocol sections rather than one block: the route renders positions
 * grouped by protocol, and a single skeleton would promise a layout the real
 * content does not have.
 */

/** Sections shown before the protocol readers answer. */
const SECTIONS = [0, 1];

export default function DefiLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        {[0, 1, 2].map((tile) => (
          <Card key={tile} className="border-border/60 bg-card/50 p-6">
            <div className="space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-28" />
            </div>
          </Card>
        ))}
      </div>

      {SECTIONS.map((section) => (
        <Card key={section} className="border-border/60 bg-card/50">
          <CardHeader className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
