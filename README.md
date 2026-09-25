# DeFi Portfolio Dashboard

[![Next.js](https://img.shields.io/badge/Next.js-14.2-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06b6d4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![wagmi](https://img.shields.io/badge/wagmi-2.x-1c1b1b)](https://wagmi.sh)
[![viem](https://img.shields.io/badge/viem-2.x-646cff)](https://viem.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981)](./LICENSE)

A multi-chain, read-only DeFi portfolio tracker. Paste an address and the dashboard assembles a
priced, chain-by-chain view of a wallet: token balances, NFT collections with floor prices, and
liquidity, lending, and staking positions across Ethereum, Arbitrum, and more — without ever
requesting a signature or a token approval.

![Dashboard Preview](/public/preview.png)

## ✨ Features

- **Multi-chain coverage** — Ethereum and Arbitrum, mainnet and testnet, behind a single address field. Chain metadata (explorer, native currency, accent colour) lives in one map, so adding a network does not touch the UI.
- **Real-time portfolio valuation** — balances are re-priced on a short polling interval with per-request cache lifetimes, so the headline number tracks the market rather than the last page load.
- **NFT gallery with floor prices** — collections are grouped by contract, spam-flagged airdrops are filtered out, and every card shows the collection floor next to the token held.
- **DeFi positions decoded** — Uniswap LP shares, Aave supplies and borrows, and Lido staking are unwrapped into their underlying tokens, with APY and unlock timing where the protocol exposes it.
- **Price and allocation charts** — portfolio value over time plus per-chain and per-asset breakdowns, sized for both a 4K dashboard and a phone screen.
- **Dark and light themes** — a dark-first interface with an emerald accent tuned for long sessions, and a light theme that keeps the same contrast ratios and chart legibility.
- **Responsive by default** — the sidebar collapses into a compact menu, tables reflow into cards, and charts resize without horizontal scrolling.

## 🛠️ Tech Stack

**Frontend**

- Next.js 14 (App Router) with React 18 and the React Server Components boundary used deliberately
- TypeScript in `strict` mode — no `any` in the domain layer
- Tailwind CSS 3.4 with shadcn/ui primitives, class-variance-authority, and HSL design tokens
- next-themes for class-based dark/light theming, sonner for toasts

**Web3**

- wagmi v2 for wallet state and typed contract reads
- viem v2 for encoding, chain definitions, and transports
- RainbowKit v2 for wallet connection, themed to the emerald accent
- Alchemy RPC transports with public RPC fallbacks for every chain

**Data**

- CoinGecko for token prices, market charts, and NFT floor prices
- Alchemy for balances, token metadata, and NFT ownership
- Redis (optional) for server-side response caching
- tRPC v11 with superjson for typed client/server boundaries

**Charts**

- Recharts for value, allocation, and sparkline visualisations

**State**

- TanStack Query v5 for server state, caching, and polling
- Zustand for local UI state such as the currency switcher and table preferences

## 🚀 Getting Started

### Prerequisites

- Node.js 18.18 or newer
- npm 9 or newer
- A WalletConnect Cloud project id (free) for wallet connections
- Optional: an Alchemy API key for faster, higher-quota RPC, and a CoinGecko API key for higher price-feed limits

### Install

```bash
git clone <your-fork-url> "DeFi Portfolio Dashboard"
cd "DeFi Portfolio Dashboard"
npm install
```

### Environment

Copy the example file and fill in what you have. Every key is optional — the app builds and runs
with an empty environment, degrading to public RPCs and the free price tier.

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_ALCHEMY_API_KEY` | Alchemy key used to build the RPC transports for every enabled chain. When empty, each chain falls back to its public RPC endpoint. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud project id required by RainbowKit's WalletConnect connector. A placeholder is used when unset so builds never fail. |
| `COINGECKO_API_KEY` | CoinGecko key for token prices, market charts, and NFT floor prices. `CG-` prefixed keys are routed to the Pro host automatically. |
| `REDIS_URL` | Optional Redis connection string for caching upstream API responses server-side and surviving provider rate limits. |

Only variables prefixed with `NEXT_PUBLIC_` reach the browser. Server-only secrets (`COINGECKO_API_KEY`, `REDIS_URL`) are read exclusively in route handlers and services.

### Run

```bash
npm run dev          # http://localhost:3000
npm run build        # production build
npm run start        # serve the production build
```

### Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server with hot reload |
| `npm run build` | Create an optimised production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint with the Next.js core-web-vitals ruleset |
| `npm run typecheck` | Type-check the project with `tsc --noEmit` |
| `npm run format` | Format the repository with Prettier and the Tailwind class sorter |
| `npm run test` | Run the full Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode while developing |
| `npm run test:cov` | Run the suite with a coverage report |

Regenerating the preview image:

```bash
node scripts/generate-preview.mjs
```

## 📁 Project Structure

```
.
├── app/
│   ├── (marketing)/            # Public landing page at /
│   ├── (dashboard)/            # Authenticated-style shell: sidebar nav + top bar
│   │   ├── dashboard/          # Net worth, allocation, recent activity
│   │   ├── portfolio/          # Token balances by chain
│   │   ├── nfts/               # Collection gallery with floor prices
│   │   └── defi/               # Liquidity, lending, and staking positions
│   ├── api/health/             # Liveness probe returning status, timestamp, version
│   ├── layout.tsx              # Fonts, theme provider, wallet providers, toaster
│   ├── error.tsx               # Styled runtime error boundary
│   ├── not-found.tsx           # Styled 404
│   └── globals.css             # Tailwind layers and the HSL design tokens
├── components/
│   ├── ui/                     # shadcn/ui primitives (button, card, tabs, …)
│   ├── wallet/                 # Wallet connection surface
│   ├── portfolio/              # Token tables and allocation views
│   ├── charts/                 # Recharts wrappers
│   ├── nfts/                   # Gallery grid and token cards
│   ├── shared/                 # Theme provider/toggle, page header, empty state, nav
│   └── providers.tsx           # wagmi + TanStack Query + RainbowKit composition
├── config/
│   ├── chains.ts               # Chain metadata map, active vs. defined chains
│   └── constants.ts            # App metadata, cache TTLs, heuristics, links
├── hooks/                      # Reusable client hooks
├── lib/
│   ├── web3/                   # wagmi config, RPC transports, chain helpers
│   ├── services/               # Provider clients (CoinGecko, and later Alchemy)
│   ├── api/                    # Fetch wrapper, URL safety guards, ApiResult helpers
│   └── utils/                  # cn(), formatters, env readers
├── types/                      # Domain types shared by every layer
├── public/                     # Static assets, preview image, favicon
├── scripts/                    # Build-time asset generation
└── .env.example                # Documented environment template
```

## 🏗️ Architecture

The codebase is layered so that no layer reaches past the one below it:

```
app/ routes  →  hooks/  →  lib/services/  →  lib/api/ (HTTP + safety guards)
     ↓                                          ↓
components/  ←  types/  ←  config/         upstream providers (Alchemy, CoinGecko)
```

- **Routes** (`app/`) own data fetching decisions and hand plain props to components. Route handlers under `app/api/` are the only server entry points.
- **Hooks** (`hooks/`) wrap TanStack Query around services, so components never call a provider directly and cache keys stay in one place.
- **Services** (`lib/services/`) normalise each provider's payload into the domain types in `types/`, returning an `ApiResult<T>` discriminated union instead of throwing. A rate-limited price feed dims a chart rather than blanking the page.
- **API clients** (`lib/api/`) hold the single fetch wrapper, which enforces the outbound allowlist and timeout budget.
- **Config** (`config/`) is the single source of truth for chain metadata, cache lifetimes, and heuristics such as liquidity-pool token detection.

**Read-only by design.** An address is the only input the dashboard accepts. There is no signing
path, no approval request, and no server-held key. Two constraints are enforced in code:

- Outbound requests are restricted to an allowlist of provider hosts, and loopback, private,
  link-local, and reserved addresses are rejected before any request leaves the server, so a
  crafted parameter cannot turn the API into a proxy.
- Server-side fetching validates the target URL protocol and host before dialling out, alongside
  per-request timeouts.

## 📚 Documentation

Delivery and governance documents live in [`docs/`](./docs). Read them in order:

| Document | What it covers |
|----------|----------------|
| [01-scope.md](./docs/01-scope.md) | Scope, final goal, assumptions, out-of-scope |
| [02-success-metrics.md](./docs/02-success-metrics.md) | Measurable success criteria and their measured results |
| [03-roadmap.md](./docs/03-roadmap.md) | Phased roadmap with inputs, outputs and exit conditions |
| [04-quality-gates.md](./docs/04-quality-gates.md) | Quality checklist per stage with its recorded result |
| [05-risk-register.md](./docs/05-risk-register.md) | Risks, warning signs, mitigations and rollback |
| [06-decision-log.md](./docs/06-decision-log.md) | Decisions, reasons and scope changes |
| [07-test-report.md](./docs/07-test-report.md) | Test and quality-control report |
| [08-handover.md](./docs/08-handover.md) | Setup, operation and handover guide |
| [09-independent-review.md](./docs/09-independent-review.md) | Independent review findings and follow-up |
| [10-final-summary.md](./docs/10-final-summary.md) | Final summary, lessons learned and next steps |

> The governance documents are written in Persian, the language of the project owner. Code, inline documentation and this README stay in English.

## 🤝 Available for Freelance Projects

**Khaleq Salehi** — full-stack engineer building production Web3 and data-heavy web applications.

- **Email:** [khaleq.sa@gmail.com](mailto:khaleq.sa@gmail.com)
- **WhatsApp / Telegram:** [+98 912 014 3697](https://wa.me/989120143697)

What I can build for you:

- **DeFi dashboards and analytics** — portfolio trackers, position monitors, and protocol dashboards wired to live on-chain and market data.
- **Wallet integration** — RainbowKit/wagmi/viem setup, multi-chain connection flows, account abstraction, and transaction UX.
- **On-chain data pipelines** — indexing, decoding, and caching layers that turn raw logs and RPC responses into typed, queryable APIs.
- **NFT products** — galleries, marketplaces, and collection analytics with metadata resolution, spam filtering, and floor-price feeds.
- **Performance and cost work** — RPC batching, caching strategy, bundle trimming, and Core Web Vitals for data-dense interfaces.

*Available for project-based collaborations worldwide, with crypto payments accepted in USDT, USDC, and ETH on Ethereum, Arbitrum, and Base.*

## 📄 License

Released under the [MIT License](./LICENSE).
