import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * First-paint placeholder for the dashboard.
 *
 * It repeats the page's own rhythm — title block, hero card, chart, then the two
 * summary panels — so the figures land where they were framed for instead of
 * shifting the page when the first balance read resolves.
 */

/** Two summary panels sit side by side below the chart on wide screens. */
const PANELS = [0, 1];

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-12 w-56" />
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-32 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/50">
        <CardContent className="p-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-6 h-[240px] w-full" />
        </CardContent>
      </Card>

      <div className="grid gap-8 lg:grid-cols-2">
        {PANELS.map((panel) => (
          <Card key={panel} className="border-border/60 bg-card/50">
            <CardHeader className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-10/12" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
