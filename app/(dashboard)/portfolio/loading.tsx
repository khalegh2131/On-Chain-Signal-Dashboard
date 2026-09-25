import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** First-paint placeholder for the portfolio route: four tiles, then the table. */

/** Matches the four summary tiles the view renders. */
const TILES = [0, 1, 2, 3];

/** Rows shown before the real balances arrive. */
const ROWS = [0, 1, 2, 3, 4, 5];

export default function PortfolioLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {TILES.map((tile) => (
          <Card key={tile} className="border-border/60 bg-card/50 p-6">
            <div className="space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-4 w-16" />
            </div>
          </Card>
        ))}
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader className="flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-10 w-full sm:max-w-xs" />
          <Skeleton className="h-9 w-36" />
        </CardHeader>
        <CardContent className="divide-y divide-border/60 pt-0">
          {ROWS.map((row) => (
            <div key={row} className="flex items-center gap-3 py-4">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
