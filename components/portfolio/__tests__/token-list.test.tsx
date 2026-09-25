// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TokenList } from '@/components/portfolio/token-list';
import type { TokenBalance } from '@/types';

/** Row factory; only the fields the list renders are meaningful here. */
function token(input: { symbol: string; valueUsd: number; chainId?: number }): TokenBalance {
  const chainId = input.chainId ?? 1;

  return {
    chainId,
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    symbol: input.symbol,
    name: `${input.symbol} token`,
    decimals: 18,
    kind: 'erc20',
    rawBalance: '1000000000000000000',
    balance: 1,
    isPriceable: true,
    priceUsd: input.valueUsd,
    valueUsd: input.valueUsd
  };
}

describe('TokenList', () => {
  it('offers a next step instead of a blank panel when nothing is held', () => {
    render(
      <TokenList
        tokens={[]}
        totalValue={0}
        emptyAction={<button type="button">Connect a wallet</button>}
      />
    );

    expect(screen.getByText('No token balances yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect a wallet' })).toBeInTheDocument();
  });

  it('renders the read failure with a retry that calls back', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <TokenList
        tokens={[]}
        totalValue={0}
        isError
        errorMessage="Balances could not be read."
        onRetry={onRetry}
      />
    );

    expect(screen.getByText('Balances could not be read.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('narrows the rows as a search is typed', async () => {
    const user = userEvent.setup();

    render(
      <TokenList
        tokens={[
          token({ symbol: 'WETH', valueUsd: 7000 }),
          token({ symbol: 'USDC', valueUsd: 2400 }),
          token({ symbol: 'ARB', valueUsd: 900 })
        ]}
        totalValue={10300}
      />
    );

    expect(screen.getAllByRole('button', { name: /details/i })).toHaveLength(3);

    await user.type(screen.getByLabelText('Search holdings'), 'usdc');

    expect(screen.getAllByRole('button', { name: /details/i })).toHaveLength(1);
    expect(screen.getByText('USDC')).toBeInTheDocument();
  });

  it('shows the loading skeletons rather than a spinner', () => {
    const { container } = render(<TokenList tokens={[]} totalValue={0} isLoading />);

    expect(screen.queryByText('No token balances yet')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot], .animate-pulse').length).toBeGreaterThan(0);
  });
});
