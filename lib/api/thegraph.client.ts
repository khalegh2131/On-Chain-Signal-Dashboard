import { GRAPH_HOSTS, SUBGRAPHS, graphGatewayUrl } from '@/config/constants';
import { AppError, UpstreamError, toAppError } from '@/lib/api/errors';
import { fetchJsonOrThrow } from '@/lib/api/http';

/** GraphQL response envelope, including the partial-data-with-errors case. */
export interface SubgraphResponse<T> {
  data?: T | null;
  errors?: { message: string; path?: (string | number)[] }[];
}

export interface SubgraphQueryOptions {
  /** Hosts the client may dial. Defaults to the published Graph gateways. */
  allowedHosts?: readonly string[];
  timeoutMs?: number;
}

export interface SubgraphClient {
  url: string;
  query<TData, TVariables extends Record<string, unknown> = Record<string, unknown>>(
    gql: string,
    variables?: TVariables
  ): Promise<TData>;
}

/**
 * Run one GraphQL query against a subgraph.
 *
 * Query and variables travel as separate fields so values are bound by the
 * subgraph rather than interpolated into the document text — the same reason SQL
 * is parameterised, and it keeps a caller's address out of the query string.
 */
export async function query<
  TData,
  TVariables extends Record<string, unknown> = Record<string, unknown>
>(
  subgraphUrl: string,
  gql: string,
  variables?: TVariables,
  options: SubgraphQueryOptions = {}
): Promise<TData> {
  const { allowedHosts = GRAPH_HOSTS, timeoutMs } = options;

  let envelope: SubgraphResponse<TData>;
  try {
    envelope = await fetchJsonOrThrow<SubgraphResponse<TData>>(subgraphUrl, {
      method: 'POST',
      body: { query: gql, variables: variables ?? {} },
      allowedHosts,
      timeoutMs,
      service: 'thegraph'
    });
  } catch (error) {
    throw explainFailure(error);
  }

  if (envelope.errors && envelope.errors.length > 0) {
    throw new UpstreamError(
      'thegraph',
      400,
      `Subgraph rejected the query: ${formatErrors(envelope.errors)}`
    );
  }

  if (envelope.data === undefined || envelope.data === null) {
    throw new UpstreamError('thegraph', 502, 'Subgraph answered without data or errors');
  }

  return envelope.data;
}

/** Bind a subgraph URL so call sites do not repeat it on every query. */
export function createSubgraphClient(
  subgraphUrl: string,
  options: SubgraphQueryOptions = {}
): SubgraphClient {
  return {
    url: subgraphUrl,
    query: (gql, variables) => query(subgraphUrl, gql, variables, options)
  };
}

/**
 * Resolve the published Uniswap V3 subgraph client.
 *
 * Decentralized-network deployments are gated behind a Graph API key, so this
 * returns `null` when none is configured and callers report the protocol as
 * unsupported rather than querying an endpoint that would answer 401.
 */
export function uniswapV3Subgraph(options: SubgraphQueryOptions = {}): SubgraphClient | null {
  const url = graphGatewayUrl(SUBGRAPHS.uniswapV3);
  return url ? createSubgraphClient(url, options) : null;
}

/** Replace gateway auth failures with the variable that fixes them. */
function explainFailure(error: unknown): AppError {
  const failure = toAppError(error, { service: 'thegraph' });

  if (failure.status === 401 || failure.status === 403) {
    return new UpstreamError(
      'thegraph',
      failure.status,
      `The Graph gateway rejected the request (${failure.status}) — decentralized subgraphs need an API key in GRAPH_API_KEY`
    );
  }

  return failure;
}

function formatErrors(errors: { message: string }[]): string {
  return errors.map((error) => error.message).join('; ');
}
