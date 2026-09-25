import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Liveness probe for uptime checks and container health gates.
 *
 * Deliberately dependency-free: it reports that the Next.js server is serving
 * requests, not that every upstream provider is reachable.
 */
export function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0'
  });
}
