'use client';

import { Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks';
import { cn } from '@/lib/utils';

/**
 * Theme switcher.
 *
 * Both icons stay mounted and cross-fade rather than swapping, so the control
 * never changes shape mid-interaction and the server render matches the first
 * client render. It stays inert until the persisted preference has been read,
 * which stops a click from toggling away from a theme nobody chose.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme, mounted } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('relative', className)}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      disabled={!mounted}
      onClick={toggleTheme}
    >
      <Sun
        aria-hidden="true"
        className={cn(
          'h-4 w-4 transition-all duration-150 ease-out',
          isDark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
        )}
      />
      <Moon
        aria-hidden="true"
        className={cn(
          'absolute h-4 w-4 transition-all duration-150 ease-out',
          isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'
        )}
      />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
