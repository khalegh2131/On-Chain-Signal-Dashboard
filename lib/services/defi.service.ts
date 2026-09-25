import { createPublicClient, http, parseAbi, parseUnits } from 'viem';
import { mainnet } from 'viem/chains';

import { CHAIN_METADATA } from '@/config/chains';
import { LIDO_READ_RPC_URL, STETH_ADDRESS } from '@/config/constants';
import { toChainReadError } from '@/lib/api/errors';
import { ALLOWED_UPSTREAM_HOSTS, assertSafeUrl } from '@/lib/api/http';
import { createSubgraphClient, uniswapV3Subgraph } from '@/lib/api/thegraph.client';
import { applyPrices } from '@/lib/services/balance.service';
import { fetchTokenPrices } from '@/lib/services/price.service';
import { readEnv } from '@/lib/utils/env';
import { toTokenAmount } from '@/lib/utils/format';
import type {
  Chain,
  ChainReadError,
  DefiPosition,
  DefiPositionKind,
  DefiPositionsResult,
  DefiProtocol,
  TokenBalance
} from '@/types';

/** ERC-20 surface needed to read an on-chain stake. */
const ERC20_ABI = parseAbi(['function balanceOf(address owner) view returns (uint256)']);

/** Positions per subgraph page. */
const POSITION_PAGE_SIZE = 100;

/** Pages fetched per protocol, so one enormous LP history cannot stall a request. */
const MAX_POSITION_PAGES = 2;

/** Chain DeFi positions are read from; none of these protocols exist on testnets. */
const DEFI_CHAIN_ID = mainnet.id;

/** Chains the DeFi readers cover when a caller does not name any. */
const DEFAULT_DEFI_CHAINS: readonly Chain[] = Object.values(CHAIN_METADATA).filter(
  (chain) => !chain.isTestnet
);

/** Aave reports rates in ray, which has 27 decimals. */
const RAY = 1e27;

/**
 * Uniswap V3 positions for one owner.
 *
 * `owner` is matched lowercased because the subgraph stores it as `Bytes`.
 * Amounts come back as decimal strings in token units, already scaled by the
 * subgraph's own `BigDecimal` handling.
 */
const UNISWAP_POSITIONS_QUERY = /* GraphQL */ `
  query Positions($owner: String!, $first: Int!, $skip: Int!) {
    positions(
      first: $first
      skip: $skip
      where: { owner: $owner, liquidity_gt: "0" }
      orderBy: liquidity
      orderDirection: desc
    ) {
      id
      liquidity
      pool {
        id
        feeTier
      }
      token0 {
        id
        symbol
        name
        decimals
      }
      token1 {
        id
        symbol
        name
        decimals
      }
      depositedToken0
      depositedToken1
    }
  }
`;

/**
 * Aave V3 supplies and borrows per reserve.
 *
 * Follows the published Aave V3 subgraph schema; like every deployment on the
 * decentralized network it needs a Graph API key before it will answer.
 */
const AAVE_USER_RESERVES_QUERY = /* GraphQL */ `
  query UserReserves($owner: String!, $first: Int!, $skip: Int!) {
    userReserves(first: $first, skip: $skip, where: { user: $owner }) {
      id
      currentATokenBalance
      currentVariableDebt
      currentStableDebt
      reserve {
        id
        symbol
        name
        decimals
        liquidityRate
      }
    }
  }
`;

interface SubgraphToken {
  id: string;
  symbol: string;
  name: string;
  decimals: string;
}

interface UniswapPositionNode {
  id: string;
  liquidity: string;
  pool: { id: string; feeTier: string };
  token0: SubgraphToken;
  token1: SubgraphToken;
  depositedToken0: string;
  depositedToken1: string;
}

interface UniswapPositionsData {
  positions: UniswapPositionNode[];
}

interface AaveReserveNode {
  id: string;
  symbol: string;
  name: string;
  decimals: string;
  liquidityRate: string;
}

interface AaveUserReserveNode {
  id: string;
  currentATokenBalance: string;
  currentVariableDebt: string;
  currentStableDebt: string;
  reserve: AaveReserveNode;
}

interface AaveUserReservesData {
  userReserves: AaveUserReserveNode[];
}

/**
 * A position before prices are known.
 *
 * Protocol readers produce these, one price lookup covers all of them, and
 * {@link finalize} turns them into valued positions — pricing once per read
 * rather than once per protocol keeps the request inside CoinGecko's burst limit.
 */
interface PositionDraft {
  id: string;
  chainId: number;
  protocol: DefiProtocol;
  kind: DefiPositionKind;
  label: string;
  tokens: TokenBalance[];
  /** Tokens owed, valued the same way as the supplied side. */
  debtTokens: TokenBalance[];
  apy: number | null;
  poolAddress?: `0x${string}`;
}

/** One protocol's contribution, including why it produced nothing. */
interface ProtocolRead {
  drafts: PositionDraft[];
  notes: string[];
  errors: ChainReadError[];
}

/**
 * Decoded DeFi positions across chains.
 *
 * Protocols this deployment cannot read are reported in `notes` and contribute
 * nothing: a missing credential degrades to an explanation, never to a fabricated
 * balance or a position that silently looks empty.
 */
export async function fetchDefiPositions(
  address: `0x${string}`,
  chains: readonly Chain[] = DEFAULT_DEFI_CHAINS
): Promise<DefiPositionsResult> {
  const reads = await Promise.all([
    readUniswapPositions(address, chains),
    readAavePositions(address, chains),
    readLidoPosition(address, chains)
  ]);

  return {
    positions: await finalize(reads.flatMap((read) => read.drafts)),
    errors: reads.flatMap((read) => read.errors),
    notes: reads.flatMap((read) => read.notes)
  };
}

/** Uniswap V3 LP positions, when a Graph API key makes the subgraph reachable. */
async function readUniswapPositions(
  owner: `0x${string}`,
  chains: readonly Chain[]
): Promise<ProtocolRead> {
  const read: ProtocolRead = { drafts: [], notes: [], errors: [] };
  const client = uniswapV3Subgraph();

  if (!client) {
    read.notes.push(
      'Uniswap v3 positions need a Graph API key — set GRAPH_API_KEY to read them from the subgraph'
    );
    return read;
  }

  const covered = chains.filter((chain) => chain.id === DEFI_CHAIN_ID);
  for (const skipped of chains.filter((chain) => chain.id !== DEFI_CHAIN_ID)) {
    read.notes.push(
      `Uniswap v3 positions on ${skipped.name} are not read — only the verified mainnet subgraph id ships in config`
    );
  }

  if (covered.length === 0) return read;

  try {
    for (let page = 0; page < MAX_POSITION_PAGES; page += 1) {
      const data = await client.query<UniswapPositionsData>(UNISWAP_POSITIONS_QUERY, {
        owner: owner.toLowerCase(),
        first: POSITION_PAGE_SIZE,
        skip: page * POSITION_PAGE_SIZE
      });

      for (const node of data.positions) {
        const draft = toUniswapDraft(node);
        if (draft) read.drafts.push(draft);
      }

      if (data.positions.length < POSITION_PAGE_SIZE) break;
    }
  } catch (error) {
    read.errors.push(toChainReadError(DEFI_CHAIN_ID, error, 'thegraph'));
  }

  return read;
}

/** Aave V3 supplies and borrows, from the deployment named in the environment. */
async function readAavePositions(
  owner: `0x${string}`,
  chains: readonly Chain[]
): Promise<ProtocolRead> {
  const read: ProtocolRead = { drafts: [], notes: [], errors: [] };
  const url = readEnv(process.env.AAVE_V3_SUBGRAPH_URL);

  if (!url) {
    read.notes.push(
      'Aave v3 positions need a subgraph URL — set AAVE_V3_SUBGRAPH_URL to the deployment you want read'
    );
    return read;
  }

  if (!chains.some((chain) => chain.id === DEFI_CHAIN_ID)) return read;

  try {
    const client = createSubgraphClient(url);

    for (let page = 0; page < MAX_POSITION_PAGES; page += 1) {
      const data = await client.query<AaveUserReservesData>(AAVE_USER_RESERVES_QUERY, {
        owner: owner.toLowerCase(),
        first: POSITION_PAGE_SIZE,
        skip: page * POSITION_PAGE_SIZE
      });

      for (const node of data.userReserves) {
        const draft = toAaveDraft(node);
        if (draft) read.drafts.push(draft);
      }

      if (data.userReserves.length < POSITION_PAGE_SIZE) break;
    }
  } catch (error) {
    read.errors.push(toChainReadError(DEFI_CHAIN_ID, error, 'thegraph'));
  }

  return read;
}

/**
 * Lido stETH stake, read from the token contract itself.
 *
 * The balance is a plain `balanceOf`, so this is real without any indexer — but
 * the endpoint still passes the same SSRF gate as every other outbound host
 * before it is dialled.
 */
async function readLidoPosition(
  owner: `0x${string}`,
  chains: readonly Chain[]
): Promise<ProtocolRead> {
  const read: ProtocolRead = { drafts: [], notes: [], errors: [] };

  if (!chains.some((chain) => chain.id === DEFI_CHAIN_ID)) return read;

  try {
    assertSafeUrl(LIDO_READ_RPC_URL, ALLOWED_UPSTREAM_HOSTS);

    const client = createPublicClient({ chain: mainnet, transport: http(LIDO_READ_RPC_URL) });
    const raw = await client.readContract({
      address: STETH_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [owner]
    });

    if (raw === 0n) return read;

    read.drafts.push({
      id: `lido:${DEFI_CHAIN_ID}:${STETH_ADDRESS.toLowerCase()}`,
      chainId: DEFI_CHAIN_ID,
      protocol: 'lido',
      kind: 'staking',
      label: 'stETH stake',
      tokens: [
        makeToken({
          chainId: DEFI_CHAIN_ID,
          address: STETH_ADDRESS,
          symbol: 'STETH',
          name: 'Lido Staked Ether',
          decimals: 18,
          raw
        })
      ],
      debtTokens: [],
      // Lido's staking rate comes from its oracle, which this reader does not decode.
      apy: null,
      poolAddress: STETH_ADDRESS
    });
  } catch (error) {
    read.errors.push(toChainReadError(DEFI_CHAIN_ID, error, 'lido'));
  }

  return read;
}

/** Price every draft once, then compute each position's USD value from the priced rows. */
async function finalize(drafts: readonly PositionDraft[]): Promise<DefiPosition[]> {
  if (drafts.length === 0) return [];

  const prices = await fetchTokenPrices(
    drafts.flatMap((draft) =>
      [...draft.tokens, ...draft.debtTokens].map((token) => ({
        address: token.address,
        chainId: token.chainId
      }))
    )
  );

  return drafts.map((draft) => {
    const tokens = applyPrices(draft.tokens, prices);
    const debtTokens = applyPrices(draft.debtTokens, prices);

    return {
      id: draft.id,
      chainId: draft.chainId,
      protocol: draft.protocol,
      kind: draft.kind,
      label: draft.label,
      tokens,
      valueUsd: sumValue(tokens),
      debtUsd: sumValue(debtTokens),
      apy: draft.apy,
      poolAddress: draft.poolAddress,
      unlockAt: null
    };
  });
}

function toUniswapDraft(node: UniswapPositionNode): PositionDraft | undefined {
  const token0 = toPositionToken(node.token0, node.depositedToken0);
  const token1 = toPositionToken(node.token1, node.depositedToken1);
  if (!token0 || !token1) return undefined;

  const feeTier = Number(node.pool.feeTier) / 10_000;

  return {
    id: `uniswap-v3:${DEFI_CHAIN_ID}:${node.id}`,
    chainId: DEFI_CHAIN_ID,
    protocol: 'uniswap-v3',
    kind: 'liquidity',
    label: `${token0.symbol} / ${token1.symbol} ${feeTier.toFixed(2)}%`,
    tokens: [token0, token1],
    debtTokens: [],
    apy: null,
    poolAddress: node.pool.id as `0x${string}`
  };
}

function toAaveDraft(node: AaveUserReserveNode): PositionDraft | undefined {
  const decimals = Number(node.reserve.decimals);
  if (!Number.isFinite(decimals) || decimals < 0) return undefined;

  const supplied = toRawUnits(node.currentATokenBalance);
  const debt = toRawUnits(node.currentVariableDebt) + toRawUnits(node.currentStableDebt);
  if (supplied === 0n && debt === 0n) return undefined;

  const address = node.reserve.id as `0x${string}`;
  const supplyToken =
    supplied > 0n
      ? makeToken({
          chainId: DEFI_CHAIN_ID,
          address,
          symbol: node.reserve.symbol,
          name: node.reserve.name,
          decimals,
          raw: supplied
        })
      : null;
  const debtToken =
    debt > 0n
      ? makeToken({
          chainId: DEFI_CHAIN_ID,
          address,
          symbol: node.reserve.symbol,
          name: node.reserve.name,
          decimals,
          raw: debt
        })
      : null;

  return {
    id: `aave-v3:${DEFI_CHAIN_ID}:${node.id}`,
    chainId: DEFI_CHAIN_ID,
    protocol: 'aave-v3',
    kind: debt > 0n && supplied === 0n ? 'borrowing' : 'lending',
    label: debt > 0n ? `${node.reserve.symbol} debt` : `${node.reserve.symbol} supply`,
    tokens: supplyToken ? [supplyToken] : [],
    debtTokens: debtToken ? [debtToken] : [],
    apy: decodeRay(node.reserve.liquidityRate)
  };
}

function toPositionToken(token: SubgraphToken, amount: string): TokenBalance | undefined {
  const decimals = Number(token.decimals);
  if (!Number.isFinite(decimals) || decimals < 0) return undefined;

  const raw = toRawAmount(amount, decimals);
  if (raw === undefined) return undefined;

  return makeToken({
    chainId: DEFI_CHAIN_ID,
    address: token.id as `0x${string}`,
    symbol: token.symbol,
    name: token.name,
    decimals,
    raw
  });
}

function makeToken(input: {
  chainId: number;
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  raw: bigint;
}): TokenBalance {
  const { chainId, address, symbol, name, decimals, raw } = input;

  return {
    chainId,
    address,
    symbol: symbol.toUpperCase(),
    name,
    decimals,
    kind: 'erc20',
    rawBalance: raw.toString(),
    balance: toTokenAmount(raw, decimals),
    isPriceable: true,
    priceUsd: null,
    valueUsd: null
  };
}

/** Total USD of the rows a price lookup covered; unpriced rows contribute nothing. */
function sumValue(tokens: readonly TokenBalance[]): number {
  return tokens.reduce((total, token) => total + (token.valueUsd ?? 0), 0);
}

/** Decimal string from a subgraph into base units. */
function toRawAmount(amount: string, decimals: number): bigint | undefined {
  try {
    return parseUnits(amount, decimals);
  } catch {
    return undefined;
  }
}

function toRawUnits(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

/** Ray-encoded annual rate into percent, or `null` when it is not a usable number. */
function decodeRay(rate: string): number | null {
  const value = Number(rate);
  if (!Number.isFinite(value) || value <= 0) return null;
  return (value / RAY) * 100;
}
