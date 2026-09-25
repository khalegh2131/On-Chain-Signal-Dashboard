import { Images, LayoutDashboard, Layers, Wallet, type LucideIcon } from 'lucide-react';

/**
 * Route metadata shared by the sidebar, the mobile drawer, and the top bar.
 *
 * One list rather than three: a section that exists in the navigation but not in
 * the breadcrumb is a bug nobody notices until they are lost on a page.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: 'Net worth and chain split'
  },
  { href: '/portfolio', label: 'Portfolio', icon: Wallet, description: 'Token balances by chain' },
  { href: '/nfts', label: 'NFTs', icon: Images, description: 'Collections and floor prices' },
  { href: '/defi', label: 'DeFi', icon: Layers, description: 'Liquidity, lending, and staking' }
];

/**
 * Longest-prefix match, so a section stays highlighted on its nested routes.
 *
 * The trailing slash matters: a plain `startsWith('/nft')` would light up `/nfts`
 * for a hypothetical `/nft-market` route.
 */
export function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface Breadcrumb {
  label: string;
  /** Absent on the final crumb, which is the page being viewed. */
  href?: string;
}

/** Turn a URL segment into a readable label, e.g. `top-holders` → `Top holders`. */
function toSegmentLabel(segment: string): string {
  const words = segment.replace(/[-_]+/g, ' ').trim();
  if (words.length === 0) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Trail for the top bar, derived from the path.
 *
 * Known sections use the navigation's own label so the two can never disagree;
 * anything else falls back to a title-cased segment.
 */
export function toBreadcrumb(pathname: string): Breadcrumb[] {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) return [{ label: 'Home' }];

  const [root, ...rest] = segments;
  const match = NAV_ITEMS.find((item) => item.href === `/${root}`);
  const trail: Breadcrumb[] = [
    match
      ? { label: match.label, href: rest.length > 0 ? match.href : undefined }
      : { label: toSegmentLabel(root ?? ''), href: rest.length > 0 ? `/${root}` : undefined }
  ];

  for (const [index, segment] of rest.entries()) {
    const isLast = index === rest.length - 1;
    trail.push({
      label: toSegmentLabel(segment),
      href: isLast ? undefined : `/${segments.slice(0, index + 2).join('/')}`
    });
  }

  return trail;
}
