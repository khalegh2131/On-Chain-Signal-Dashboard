import Link from 'next/link';
import { Mail, MessageCircle } from 'lucide-react';

import { APP_NAME } from '@/config/constants';
import { cn } from '@/lib/utils';

import { NAV_ITEMS } from './nav-items';

/**
 * Application footer.
 *
 * Three quiet columns rather than a marketing block: the dashboard already earns
 * attention with its figures, and a loud footer under a dense table reads as an
 * advertisement. The contact details are real, so they are presented plainly
 * instead of behind a form.
 */

const CONTACT = {
  name: 'Khaleq Salehi',
  email: 'khaleq.sa@gmail.com',
  phone: '+98 912 014 3697',
  /** wa.me needs the number in E.164 without the leading plus. */
  whatsappUrl: 'https://wa.me/989120143697'
} as const;

const TAGLINE = 'Multi-chain portfolio tracking — read-only, no signatures, no approvals.';

export function AppFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('border-t border-border/60', className)}>
      <div className="mx-auto w-full max-w-7xl px-6 py-12 sm:px-8 lg:px-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <p className="text-sm font-medium tracking-tight text-foreground">{APP_NAME}</p>
            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">{TAGLINE}</p>
          </div>

          <nav aria-label="Footer" className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Sections
            </p>
            <ul className="space-y-2">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-xs text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Contact
            </p>
            <p className="text-xs text-foreground">{CONTACT.name}</p>
            <ul className="space-y-2">
              <li>
                <a
                  href={`mailto:${CONTACT.email}`}
                  className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <Mail aria-hidden="true" className="h-3.5 w-3.5" />
                  {CONTACT.email}
                </a>
              </li>
              <li>
                <a
                  href={CONTACT.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <MessageCircle aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="font-mono tabular-nums">{CONTACT.phone}</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-border/60 pt-6 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {APP_NAME}. Released under the MIT license.
          </p>
          <p>Market data by CoinGecko · RPC by Alchemy</p>
        </div>
      </div>
    </footer>
  );
}
