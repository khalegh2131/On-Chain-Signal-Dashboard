import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names and resolve conflicting Tailwind utilities.
 * Later values win, which lets a caller's `className` reliably override a variant.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
