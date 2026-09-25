// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AddTokenDialog } from '@/components/portfolio/add-token-dialog';
import { getTokenMetadata } from '@/lib/api/alchemy.client';
import { CUSTOM_TOKENS_STORAGE_KEY } from '@/lib/custom-tokens';

/**
 * The add-token flow end to end.
 *
 * Storage is asserted rather than the toast: what the reader keeps between
 * visits is the watchlist itself, and a toast that fires without a stored row
 * would be the visible half of a bug.
 */

vi.mock('@/lib/api/alchemy.client', () => ({
  getTokenMetadata: vi.fn(),
  getTokenBalances: vi.fn()
}));

const metadata = vi.mocked(getTokenMetadata);
type MetadataResult = Awaited<ReturnType<typeof getTokenMetadata>>;

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function storedTokens(): { symbol?: string }[] {
  const raw = window.localStorage.getItem(CUSTOM_TOKENS_STORAGE_KEY);
  return raw === null ? [] : (JSON.parse(raw) as { symbol?: string }[]);
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  render(
    <Providers>
      <AddTokenDialog />
    </Providers>
  );

  await user.click(screen.getByRole('button', { name: /^add token$/i }));
  return screen.findByLabelText(/contract address/i);
}

beforeEach(() => {
  metadata.mockReset();
});

describe('AddTokenDialog', () => {
  it('reports a malformed address as it is typed and stores nothing', async () => {
    const user = userEvent.setup();
    metadata.mockResolvedValue({
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18
    } as MetadataResult);

    const input = await openDialog(user);
    await user.type(input, '0xnot-an-address');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(metadata).not.toHaveBeenCalled();
    expect(storedTokens()).toEqual([]);
  });

  it('reads the contract on the chain and keeps the token once submitted', async () => {
    const user = userEvent.setup();
    metadata.mockResolvedValue({
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18
    } as MetadataResult);

    const input = await openDialog(user);
    await user.type(input, WETH);

    await waitFor(() => expect(screen.getByText('Wrapped Ether')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /add to watchlist/i }));

    await waitFor(() => expect(storedTokens()).toHaveLength(1));
    expect(storedTokens()[0]?.symbol).toBe('WETH');
  });

  it('blocks the submit when the chain cannot be read until decimals are supplied by hand', async () => {
    const user = userEvent.setup();
    metadata.mockRejectedValue(new Error('the chain did not answer'));

    const input = await openDialog(user);
    await user.type(input, WETH);

    await waitFor(() => expect(metadata).toHaveBeenCalled());
    const submit = screen.getByRole('button', { name: /add to watchlist/i });

    // Nothing was resolved, so decimals stay unknown and guessing them would
    // misvalue the holding; the form refuses until the reader supplies them.
    await waitFor(() => expect(screen.queryByText(/Resolved as/)).not.toBeInTheDocument());
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/decimals override/i), '18');
    await waitFor(() => expect(submit).not.toBeDisabled());

    await user.click(submit);
    await waitFor(() => expect(storedTokens()).toHaveLength(1));
  });
});
