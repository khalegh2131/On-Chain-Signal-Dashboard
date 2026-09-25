'use client';

import { useAccount } from 'wagmi';

/**
 * Whether the dashboard is showing demo data.
 *
 * Disconnection is the trigger: the shell, the charts, and the allocation split
 * all have something real to show without an address, and rendering them from a
 * fixed dataset is what makes the app legible on first run. Every surface that
 * reports a figure reads this flag so none of them can label the same number
 * differently.
 */
export function useDemoMode(): boolean {
  const { isConnected } = useAccount();
  return !isConnected;
}
