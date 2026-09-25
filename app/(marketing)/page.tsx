import Link from 'next/link';
import {
  ArrowRight,
  ChartLine,
  Images,
  Layers,
  MonitorSmartphone,
  ShieldCheck,
  SunMoon,
  Wallet
} from 'lucide-react';

import { ThemeToggle } from '@/components/shared/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { APP_NAME, EXTERNAL_LINKS } from '@/config/constants';

const FEATURES = [
  {
    icon: Wallet,
    title: 'Multi-chain by design',
    description:
      'Ethereum, Arbitrum One, and their testnets behind one address field. Chain metadata drives labels, explorers, and accents so new networks drop in without touching the UI.'
  },
  {
    icon: ChartLine,
    title: 'Real-time valuation',
    description:
      'Token balances are re-priced on a short polling interval, so the headline number tracks the market instead of the moment you last refreshed.'
  },
  {
    icon: Images,
    title: 'NFT gallery with floors',
    description:
      'Collections are grouped by contract, spam-flagged airdrops are filtered out, and each card shows the collection floor next to the token you actually hold.'
  },
  {
    icon: Layers,
    title: 'DeFi positions decoded',
    description:
      'Uniswap LP shares, Aave supplies and borrows, and Lido staking are unwrapped into their underlying tokens with APY and unlock timing.'
  },
  {
    icon: SunMoon,
    title: 'Dark and light themes',
    description:
      'A dark-first interface tuned for long sessions, with a light theme that keeps the same contrast ratios and chart legibility.'
  },
  {
    icon: MonitorSmartphone,
    title: 'Responsive from phone to desk',
    description:
      'Sidebar navigation collapses into a compact menu, tables become cards, and charts resize without horizontal scroll.'
  }
] as const;

export default function MarketingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] bg-[radial-gradient(60%_60%_at_50%_50%,hsl(var(--primary)/0.18),transparent)]" />

      <header className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            DP
          </span>
          <span className="text-sm font-semibold">{APP_NAME}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <a href="#features">Features</a>
          </Button>
          <ThemeToggle />
          <Button size="sm" asChild>
            <Link href="/dashboard">
              Open dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-6">
        <section className="py-20 text-center sm:py-28">
          <Badge variant="outline" className="mb-6 border-primary/30 bg-primary/10 text-primary">
            Read-only · No signatures · No approvals
          </Badge>
          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            Every token, NFT, and DeFi position — in one place
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
            Paste an address and get a priced, chain-by-chain view of a wallet: token balances,
            collection floors, liquidity pools, lending markets, and staking positions. Nothing to
            sign, nothing to approve.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/dashboard">
                Open the dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={EXTERNAL_LINKS.wagmi} target="_blank" rel="noreferrer">
                Built on wagmi + viem
              </a>
            </Button>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            Testnets enabled by default — Sepolia and Arbitrum Sepolia.
          </p>
        </section>

        <section id="features" className="scroll-mt-20 pb-24">
          <div className="mb-10 flex flex-col items-center gap-3 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Built for people who actually hold these assets
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              The dashboard reads public chain data only. That constraint shapes every feature
              below.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title} className="h-full bg-card/60 backdrop-blur">
                <CardHeader>
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <feature.icon className="h-5 w-5" />
                  </span>
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                  <CardDescription className="leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          <Card className="mt-12 border-primary/20 bg-primary/5">
            <CardHeader className="flex-row items-start gap-4 space-y-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="space-y-1.5">
                <CardTitle className="text-base">A read-only stance, enforced in code</CardTitle>
                <CardDescription className="leading-relaxed">
                  Addresses are the only input. Outbound requests are restricted to an allowlist of
                  data providers, and private or loopback addresses are rejected before any request
                  leaves the server — so a crafted parameter can never turn the API into a proxy.
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        </section>
      </main>

      <footer className="relative z-10 border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs text-muted-foreground sm:flex-row">
          <p>
            © {new Date().getFullYear()} {APP_NAME}. Released under the MIT license.
          </p>
          <p>Market data by CoinGecko · RPC by Alchemy</p>
        </div>
      </footer>
    </div>
  );
}
