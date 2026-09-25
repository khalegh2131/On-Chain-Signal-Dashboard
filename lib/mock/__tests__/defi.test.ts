import { describe, expect, it } from 'vitest';
import { getAddress, isAddress } from 'viem';

import { ACTIVE_CHAINS } from '@/config/chains';
import {
  MOCK_DEFI_POSITIONS,
  POSITION_KIND_LABELS,
  PROTOCOL_LABELS,
  createMockDefiPositions,
  explorerAddressUrl
} from '@/lib/mock/defi';
import type { DefiPosition } from '@/types';

const positions = createMockDefiPositions();

function find(id: string): DefiPosition {
  const position = positions.find((entry) => entry.id === id);
  if (!position) throw new Error(`no demo position ${id}`);
  return position;
}

const UNISWAP_MAINNET = 'uniswap-v3:1:0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640';
const UNISWAP_ARBITRUM = 'uniswap-v3:42161:0x92c63d0e701CAAe670C9415d91C474F686298f00';
const AAVE_MAINNET = 'aave-v3:1:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const LIDO_MAINNET = 'lido:1:0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';

describe('createMockDefiPositions', () => {
  it('covers liquidity, lending and staking', () => {
    expect(new Set(positions.map((position) => position.kind))).toEqual(
      new Set(['liquidity', 'lending', 'staking'])
    );
  });

  it('covers two chains, because the dashboard is multi-chain by design', () => {
    expect(new Set(positions.map((position) => position.chainId))).toEqual(new Set([1, 42161]));
  });

  it('leaves the active chains untouched, since no protocol here runs on a testnet', () => {
    const activeIds = new Set(ACTIVE_CHAINS.map((chain) => chain.id));
    for (const position of positions) {
      expect(activeIds.has(position.chainId)).toBe(false);
    }
  });

  it('gives every position a unique id that names its protocol and chain', () => {
    const ids = positions.map((position) => position.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const position of positions) {
      expect(position.id.startsWith(`${position.protocol}:${position.chainId}:`)).toBe(true);
    }
  });

  it('uses a real, checksummed pool address for every position', () => {
    for (const position of positions) {
      expect(position.poolAddress).toBeDefined();
      expect(isAddress(position.poolAddress as string)).toBe(true);
      expect(getAddress(position.poolAddress as string)).toBe(position.poolAddress);
    }
  });

  it('values each position as the sum of its priced tokens', () => {
    for (const position of positions) {
      const expected = position.tokens.reduce((total, token) => total + (token.valueUsd ?? 0), 0);
      expect(position.valueUsd).toBeCloseTo(expected, 6);
      expect(position.valueUsd).toBeGreaterThan(0);
    }
  });

  it('carries no debt, since every demo position is a supply side one', () => {
    for (const position of positions) {
      expect(position.debtUsd).toBe(0);
      expect(position.unlockAt).toBeNull();
    }
  });

  it('prices every underlying token it lists', () => {
    for (const position of positions) {
      for (const token of position.tokens) {
        expect(token.priceUsd).not.toBeNull();
        expect(token.balance).toBeGreaterThan(0);
        // Base units round-trip through the token's own decimals.
        expect(Number(token.rawBalance)).toBeGreaterThan(0);
      }
    }
  });

  it('rebuilds an identical set on every call, so a render cannot wobble', () => {
    expect(createMockDefiPositions()).toEqual(positions);
  });
});

describe('liquidity positions', () => {
  it('names the pair and the fee tier in the label', () => {
    expect(find(UNISWAP_MAINNET).label).toBe('WETH / USDC 0.05%');
    expect(find(UNISWAP_ARBITRUM).label).toBe('ARB / WETH 0.30%');
  });

  it('records the fee tier as a percentage', () => {
    expect(find(UNISWAP_MAINNET).feeTier).toBe(0.05);
    expect(find(UNISWAP_ARBITRUM).feeTier).toBe(0.3);
  });

  it('holds two underlying tokens per pool', () => {
    expect(find(UNISWAP_MAINNET).tokens).toHaveLength(2);
    expect(find(UNISWAP_ARBITRUM).tokens).toHaveLength(2);
  });

  it('quotes a band in the pool own ratio, with a live spot price inside it', () => {
    const range = find(UNISWAP_MAINNET).priceRange;
    expect(range).not.toBeNull();
    if (!range) return;

    expect(range.quotePerBase).toBe('USDC per WETH');
    expect(range.current).toBeGreaterThan(range.lower);
    expect(range.current).toBeLessThan(range.upper);
  });

  it('reports a band that spot has left behind as out of range', () => {
    const position = find(UNISWAP_ARBITRUM);
    const range = position.priceRange;
    expect(range).not.toBeNull();
    if (!range) return;

    expect(position.inRange).toBe(false);
    expect(range.current).toBeLessThan(range.lower);
  });

  it('reports an in-range band as in range', () => {
    expect(find(UNISWAP_MAINNET).inRange).toBe(true);
  });

  it('leaves fee APR unset, because it is not derivable from the LP share alone', () => {
    expect(find(UNISWAP_MAINNET).apy).toBeNull();
    expect(find(UNISWAP_ARBITRUM).apy).toBeNull();
  });

  it('links to the pool it names', () => {
    expect(find(UNISWAP_MAINNET).positionUrl).toBe(
      'https://app.uniswap.org/explore/pools/ethereum/0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640'
    );
    expect(find(UNISWAP_ARBITRUM).positionUrl).toContain('arbitrum');
  });

  it('says why a live read is not attempted instead of presenting a figure as read', () => {
    expect(find(UNISWAP_MAINNET).requiresCredential).toBe(true);
    expect(find(UNISWAP_MAINNET).note).toContain('GRAPH_API_KEY');
  });
});

describe('lending position', () => {
  it('is an Aave USDC supply with a reported APY', () => {
    const position = find(AAVE_MAINNET);
    expect(position.protocol).toBe('aave-v3');
    expect(position.kind).toBe('lending');
    expect(position.tokens[0]?.symbol).toBe('USDC');
    expect(position.apy).toBe(4.62);
  });

  it('carries a band-free, fee-free shape', () => {
    expect(find(AAVE_MAINNET).priceRange ?? null).toBeNull();
    expect(find(AAVE_MAINNET).inRange).toBeNull();
    expect(find(AAVE_MAINNET).feeTier).toBeNull();
  });

  it('names the deployment variable that would make a live read possible', () => {
    expect(find(AAVE_MAINNET).note).toContain('AAVE_V3_SUBGRAPH_URL');
    expect(find(AAVE_MAINNET).requiresCredential).toBe(true);
  });
});

describe('staking position', () => {
  it('is the Lido stETH balance, readable without an indexer', () => {
    const position = find(LIDO_MAINNET);
    expect(position.kind).toBe('staking');
    expect(position.tokens[0]?.symbol).toBe('stETH');
    expect(position.requiresCredential).toBe(false);
    expect(position.note).toBeUndefined();
  });

  it('leaves the staking rate unset rather than inventing one', () => {
    expect(find(LIDO_MAINNET).apy).toBeNull();
  });
});

describe('explorerAddressUrl', () => {
  it('builds a link from the chain own explorer', () => {
    expect(explorerAddressUrl(1, '0xabc')).toBe('https://etherscan.io/address/0xabc');
    expect(explorerAddressUrl(42161, '0xabc')).toBe('https://arbiscan.io/address/0xabc');
  });

  it('returns nothing for a chain with no known explorer', () => {
    expect(explorerAddressUrl(999_999, '0xabc')).toBeNull();
  });
});

describe('labels', () => {
  it('names every protocol and kind a position can carry', () => {
    for (const position of positions) {
      expect(PROTOCOL_LABELS[position.protocol]).toBeTruthy();
      expect(POSITION_KIND_LABELS[position.kind]).toBeTruthy();
    }
  });
});

describe('demo dataset shape', () => {
  it('exposes the raw table with the same ids the valued set carries', () => {
    expect(MOCK_DEFI_POSITIONS.map((position) => position.id)).toEqual(
      positions.map((position) => position.id)
    );
  });

  it('uses only addresses the dataset can be linked from', () => {
    for (const position of MOCK_DEFI_POSITIONS) {
      expect(isAddress(position.poolAddress)).toBe(true);
      expect(isAddress(position.tokens[0]?.address ?? '')).toBe(true);
    }
  });
});
