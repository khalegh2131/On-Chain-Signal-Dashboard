import { format } from 'date-fns';

import type { HistoryRange } from '@/lib/mock/history';

/**
 * Chart colours.
 *
 * Values are literals rather than Tailwind tokens because SVG presentation
 * attributes — `stroke`, `fill`, `stop-color` — cannot resolve CSS custom
 * properties. Both themes are spelled out so nothing here can be correct in one
 * mode and wrong in the other, and the accent stays the same emerald the rest of
 * the interface uses: `#10b981` on dark, stepped down to `#059669` on white where
 * the lighter green loses contrast.
 */

export interface ChartPalette {
  /** Grid line colour, kept faint enough to sit behind the data. */
  grid: string;
  /** Axis tick label colour. */
  axis: string;
  /** The single accent line. */
  accent: string;
  /** Top of the gradient wash under the line. */
  accentFillFrom: string;
  /** Bottom of the gradient wash, fully transparent. */
  accentFillTo: string;
  /** Hover crosshair. */
  cursor: string;
  /** Tooltip surface, matching the popover token. */
  tooltipSurface: string;
  tooltipBorder: string;
}

const DARK_PALETTE: ChartPalette = {
  grid: 'rgba(255, 255, 255, 0.07)',
  axis: '#a1a1aa',
  accent: '#10b981',
  accentFillFrom: 'rgba(16, 185, 129, 0.25)',
  accentFillTo: 'rgba(16, 185, 129, 0)',
  cursor: 'rgba(255, 255, 255, 0.18)',
  tooltipSurface: 'rgba(24, 24, 27, 0.96)',
  tooltipBorder: 'rgba(63, 63, 70, 0.7)'
};

const LIGHT_PALETTE: ChartPalette = {
  grid: 'rgba(24, 24, 27, 0.07)',
  axis: '#71717a',
  accent: '#059669',
  accentFillFrom: 'rgba(5, 150, 105, 0.2)',
  accentFillTo: 'rgba(5, 150, 105, 0)',
  cursor: 'rgba(24, 24, 27, 0.18)',
  tooltipSurface: 'rgba(255, 255, 255, 0.98)',
  tooltipBorder: 'rgba(228, 228, 231, 0.9)'
};

/** Palette for the resolved theme; anything other than `light` is treated as dark. */
export function chartPalette(theme: 'light' | 'dark'): ChartPalette {
  return theme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
}

/**
 * Tick and tooltip time formats per range.
 *
 * Chosen so adjacent ticks never carry the same label: a day range reads to the
 * minute, a year range only to the day.
 */
const AXIS_FORMATS: Record<HistoryRange, string> = {
  '1D': 'HH:mm',
  '1W': 'EEE HH:mm',
  '1M': 'MMM d',
  '1Y': 'MMM d'
};

const TOOLTIP_FORMATS: Record<HistoryRange, string> = {
  '1D': 'MMM d, HH:mm',
  '1W': 'EEE d MMM, HH:mm',
  '1M': 'MMM d, yyyy',
  '1Y': 'MMM d, yyyy'
};

/** Compact axis label for a sample. */
export function formatAxisTimestamp(timestampMs: number, range: HistoryRange): string {
  return format(new Date(timestampMs), AXIS_FORMATS[range]);
}

/** Full timestamp for the tooltip, where there is room for it. */
export function formatTooltipTimestamp(timestampMs: number, range: HistoryRange): string {
  return format(new Date(timestampMs), TOOLTIP_FORMATS[range]);
}
