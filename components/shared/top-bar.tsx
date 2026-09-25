'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

import { ThemeToggle } from '@/components/shared/theme-toggle';
import { WalletConnect } from '@/components/wallet/wallet-connect';
import { cn } from '@/lib/utils';

import { toBreadcrumb } from './nav-items';
import { MobileNav } from './app-sidebar';

/**
 * Sticky application header.
 *
 * Translucent rather than opaque so content scrolling underneath still reads as
 * continuous movement, with the blur kept subtle — a heavy frosted panel would
 * fight the flat surfaces everywhere else in the dashboard.
 */
export function TopBar({ className }: { className?: string }) {
  const pathname = usePathname();
  const trail = toBreadcrumb(pathname);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 sm:px-6 lg:px-8',
        className
      )}
    >
      <MobileNav className="-ml-2" />

      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-sm">
          {trail.map((crumb, index) => (
            <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <ChevronRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                />
              ) : null}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="truncate text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current="page" className="truncate font-medium text-foreground">
                  {crumb.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <ThemeToggle />
        <WalletConnect />
      </div>
    </header>
  );
}
