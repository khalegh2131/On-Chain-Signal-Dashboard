'use client';

import { useTheme as useNextTheme } from 'next-themes';
import { useCallback } from 'react';

import { useMounted } from '@/hooks/use-mounted';

/** Themes the app supports; `system` defers to the operating system. */
export type AppTheme = 'light' | 'dark' | 'system';

export interface ThemeState {
  /** Stored preference, which may be `system`. */
  theme: AppTheme;
  /** Theme actually painted, always concrete. */
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: AppTheme) => void;
  /** Flip between light and dark, resolving `system` first. */
  toggleTheme: () => void;
  /** False until the client has read the persisted preference. */
  mounted: boolean;
}

/**
 * Theme state for the dashboard.
 *
 * Wraps `next-themes` so components never have to handle its `undefined`
 * values. `resolvedTheme` collapses to `dark` before mount — that is the
 * product's default surface, and committing to it keeps the server render and
 * the first client render identical instead of flashing.
 */
export function useTheme(): ThemeState {
  const { theme, resolvedTheme, setTheme } = useNextTheme();
  const mounted = useMounted();

  const resolved: 'light' | 'dark' = resolvedTheme === 'light' ? 'light' : 'dark';

  const toggleTheme = useCallback(() => {
    setTheme(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setTheme]);

  const applyTheme = useCallback(
    (next: AppTheme) => {
      setTheme(next);
    },
    [setTheme]
  );

  return {
    theme: (theme ?? 'system') as AppTheme,
    resolvedTheme: resolved,
    setTheme: applyTheme,
    toggleTheme,
    mounted
  };
}
