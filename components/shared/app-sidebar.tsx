'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Menu } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useDemoMode } from '@/hooks';
import { cn } from '@/lib/utils';

import { NAV_ITEMS, isActiveRoute, type NavItem } from './nav-items';

/**
 * Primary navigation.
 *
 * The rail narrows to icons on tablets and opens fully on desktop, so the
 * dashboard keeps its whitespace instead of trading it for a permanent 256px
 * column. The same links are reused inside the mobile drawer rather than
 * duplicated, which is what keeps the two from drifting apart.
 *
 * `rail` distinguishes the two placements: breakpoint classes describe the
 * viewport, and the drawer is narrow at every viewport width, so it always asks
 * for the labelled form.
 */

interface SidebarLinkProps {
  item: NavItem;
  active: boolean;
  /** Rail placement: icon-only on tablet, labelled from `lg`. */
  rail?: boolean;
  /** Called after a link is followed, used to dismiss the mobile drawer. */
  onNavigate?: () => void;
}

function SidebarLink({ item, active, rail = false, onNavigate }: SidebarLinkProps) {
  return (
    <Link
      href={item.href}
      title={rail ? item.label : undefined}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        rail && 'md:justify-center lg:justify-start',
        active
          ? 'bg-accent/50 text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity duration-150 ease-out',
          active ? 'opacity-100' : 'opacity-0'
        )}
      />
      <item.icon className="h-4 w-4 shrink-0" />
      {rail ? (
        <>
          <span className="hidden truncate lg:inline">{item.label}</span>
          <span className="sr-only lg:hidden">{item.label}</span>
        </>
      ) : (
        <span className="truncate">{item.label}</span>
      )}
    </Link>
  );
}

function SidebarBrand({ rail = false, onNavigate }: { rail?: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href="/dashboard"
      onClick={onNavigate}
      aria-label="DeFi Portfolio Dashboard — go to dashboard"
      className={cn(
        'flex h-16 shrink-0 items-center gap-2.5 border-b border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        rail ? 'px-3 md:justify-center lg:justify-start lg:px-5' : 'px-5'
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
        <Activity className="h-4 w-4" />
      </span>
      {rail ? (
        <>
          <span className="hidden truncate text-sm font-medium tracking-tight lg:inline">
            Portfolio
          </span>
          <span className="sr-only lg:hidden">Portfolio</span>
        </>
      ) : (
        <span className="truncate text-sm font-medium tracking-tight">Portfolio</span>
      )}
    </Link>
  );
}

function DemoDataPill({ rail = false }: { rail?: boolean }) {
  const isDemo = useDemoMode();
  if (!isDemo) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 border-border/60 bg-muted/40 px-2 py-1 text-[11px] font-normal text-muted-foreground',
        rail && 'md:justify-center'
      )}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      {rail ? (
        <>
          <span className="hidden lg:inline">Demo data</span>
          <span className="sr-only lg:hidden">Demo data</span>
        </>
      ) : (
        <span>Demo data</span>
      )}
    </Badge>
  );
}

function SidebarFooter({ rail = false }: { rail?: boolean }) {
  return (
    <div className="shrink-0 space-y-3 border-t border-border/60 p-3">
      <div className={cn('flex', rail && 'md:justify-center lg:justify-start')}>
        <DemoDataPill rail={rail} />
      </div>
      <p
        className={cn(
          'px-1 text-[11px] leading-relaxed text-muted-foreground',
          rail && 'hidden lg:block'
        )}
      >
        Read-only. Connecting shares an address — never a signature or an approval.
      </p>
    </div>
  );
}

/** Persistent rail for tablet and desktop viewports. */
export function AppSidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border/60 bg-sidebar md:flex md:w-[4.75rem] lg:w-64',
        className
      )}
    >
      <SidebarBrand rail />
      <nav aria-label="Dashboard sections" className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {NAV_ITEMS.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            active={isActiveRoute(pathname, item.href)}
            rail
          />
        ))}
      </nav>
      <SidebarFooter rail />
    </aside>
  );
}

/** Trigger and panel shown below the `md` breakpoint. */
export function MobileNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('md:hidden', className)}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" title="Dashboard navigation" className="flex w-72 flex-col p-0">
        <SidebarBrand onNavigate={() => setOpen(false)} />
        <nav aria-label="Dashboard sections" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              active={isActiveRoute(pathname, item.href)}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </nav>
        <SidebarFooter />
      </SheetContent>
    </Sheet>
  );
}
