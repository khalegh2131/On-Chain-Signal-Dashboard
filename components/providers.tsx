'use client';

import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { useState, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';

import { useMounted } from '@/hooks';
import { config } from '@/lib/web3/config';

/** Emerald is the product accent, so RainbowKit is themed to match rather than default blue. */
const rainbowKitTheme = {
  dark: darkTheme({
    accentColor: '#10b981',
    accentColorForeground: 'white',
    borderRadius: 'medium',
    overlayBlur: 'small'
  }),
  light: lightTheme({
    accentColor: '#059669',
    accentColorForeground: 'white',
    borderRadius: 'medium'
  })
};

export function Providers({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const mounted = useMounted();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // On-chain balances are polled deliberately; refetch-on-focus would
            // double the RPC load whenever a user tabs back into the dashboard.
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1
          }
        }
      })
  );

  const isDark = !mounted || resolvedTheme !== 'light';

  return (
    <WagmiProvider config={config} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={isDark ? rainbowKitTheme.dark : rainbowKitTheme.light}
          modalSize="compact"
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
