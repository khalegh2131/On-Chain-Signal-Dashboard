import { Card, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** First-paint placeholder for the gallery, matching the filter bar and mosaic. */

/** Tiles shown before the indexer answers. */
const TILES = [0, 1, 2, 3, 4, 5, 6, 7];

/** Artwork ratios, cycled so the placeholder mosaic has the gallery's rhythm. */
const ASPECTS = ['aspect-square', 'aspect-[4/5]', 'aspect-[5/6]', 'aspect-[3/4]'] as const;

export default function NftsLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader className="flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-10 w-full sm:max-w-xs" />
          <Skeleton className="h-9 w-64" />
        </CardHeader>
      </Card>

      <div className="columns-1 gap-6 sm:columns-2 lg:columns-3 xl:columns-4" aria-hidden="true">
        {TILES.map((tile) => (
          <div key={tile} className="mb-6 break-inside-avoid space-y-3">
            <Skeleton className={`w-full rounded-lg ${ASPECTS[tile % ASPECTS.length]}`} />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
