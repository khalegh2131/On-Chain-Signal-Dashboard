// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useState as useReactState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCustomTokens } from '@/hooks/use-custom-tokens';
import { getTokenBalances } from '@/lib/api/alchemy.client';

/**
 * The watchlist against a stubbed chain.
 *
 * The distinction this file exists to protect is the one the UI keeps getting
 * wrong in practice: "the wallet holds none of this" and "the read failed" look
 * identical on screen at a zero balance, so only one of them may set `degraded`.
 */

vi.mock('@/lib/api/alchemy.client', () => ({
  getTokenBalances: vi.fn(),
  getTokenMetadata: vi.fn()
}));

// Partial mock: only the network call is stubbed. `priceKey` and the rest of the
// module stay real, because the balance reader imports them.
vi.mock('@/lib/services/price.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/price.service')>();
  return { ...actual, fetchTokenPrices: vi.fn(async () => ({})) };
});

const balances = vi.mocked(getTokenBalances);

const OWNER = '0x1234567890aBcDeF1234567890aBcDeF12345678' as `0x${string}`;

const WATCHED = {
  chainId: 11155111,
  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as `0x${string}`,
  symbol: 'WETH',
  name: 'Wrapped Ether',
  decimals: 18,
  addedAt: 1_700_000_000_000
};

function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function Harness({ address }: { address?: `0x${string}` }) {
  const { add, rows, tokens, error, degraded } = useCustomTokens({ address });
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    add(WATCHED);
  }, [add]);

  return (
    <div>
      <span data-testid="tokens">{tokens.length}</span>
      <span data-testid="rows">{rows.length}</span>
      <span data-testid="error">{error === null ? 'none' : error.message}</span>
      <span data-testid="degraded">{String(degraded)}</span>
      <span data-testid="balance">{String(rows[0]?.balance ?? -1)}</span>
      <span data-testid="custom">{String(rows[0]?.isCustom ?? false)}</span>
    </div>
  );
}

async function renderHarness(address?: `0x${string}`) {
  render(
    <Providers>
      <Harness address={address} />
    </Providers>
  );

  await waitFor(() => expect(screen.getByTestId('tokens')).toHaveTextContent('1'));
}

beforeEach(() => {
  balances.mockReset();
});

describe('useCustomTokens', () => {
  it('lists a watched token with no wallet connected and reads nothing', async () => {
    balances.mockResolvedValue([]);

    await renderHarness();

    expect(screen.getByTestId('rows')).toHaveTextContent('1');
    expect(screen.getByTestId('custom')).toHaveTextContent('true');
    expect(screen.getByTestId('error')).toHaveTextContent('none');
    expect(screen.getByTestId('degraded')).toHaveTextContent('false');
    expect(balances).not.toHaveBeenCalled();
  });

  it('treats a held-nothing read as a balance, not as a failure', async () => {
    balances.mockResolvedValue([]);

    await renderHarness(OWNER);

    await waitFor(() => expect(balances).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('balance')).toHaveTextContent('0'));
    expect(screen.getByTestId('error')).toHaveTextContent('none');
    expect(screen.getByTestId('degraded')).toHaveTextContent('false');
  });

  it('flags a chain read that failed without turning it into an error state', async () => {
    balances.mockRejectedValue(new Error('the RPC refused the call'));

    await renderHarness(OWNER);

    await waitFor(() => expect(screen.getByTestId('degraded')).toHaveTextContent('true'));
    expect(screen.getByTestId('error')).toHaveTextContent('none');
    expect(screen.getByTestId('rows')).toHaveTextContent('1');
  });
});
