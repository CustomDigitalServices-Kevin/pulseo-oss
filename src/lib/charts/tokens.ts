/**
 * Shared Recharts design tokens — Pulseo dark-first palette.
 *
 * Single source of truth for tooltip / axis / grid styling across every chart
 * in the app. If you're tempted to redefine TOOLTIP_STYLE inline in a new
 * component — don't. Import from here.
 *
 * Colours are expressed in `oklch()` to stay consistent with the rest of the
 * design system (see `src/app/globals.css`).
 */
import type { CSSProperties } from 'react';

export const TOOLTIP_STYLE: CSSProperties = {
  borderRadius: '8px',
  border: '1px solid oklch(1 0 0 / 0.10)',
  background: 'oklch(0.205 0.007 270)',
  boxShadow: '0 12px 24px oklch(0 0 0 / 0.40), 0 0 0 1px oklch(1 0 0 / 0.04)',
  fontSize: '12px',
  color: 'oklch(0.985 0 0)',
  padding: '8px 12px',
};

export const TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: 'oklch(0.715 0.010 270)',
  marginBottom: 2,
  fontSize: 11,
};

export const AXIS_TICK = { fill: 'oklch(0.560 0.010 270)', fontSize: 11 } as const;

export const GRID_STROKE = 'oklch(1 0 0 / 0.06)' as const;

// Semantic palettes — reuse across charts so priority/status stay aligned.
export const OKLCH_SUCCESS = 'oklch(0.700 0.165 155)' as const;
export const OKLCH_DANGER = 'oklch(0.685 0.205 25)' as const;
export const OKLCH_WARNING = 'oklch(0.795 0.155 80)' as const;
export const OKLCH_INFO = 'oklch(0.700 0.165 230)' as const;
export const OKLCH_PRIMARY = 'oklch(0.625 0.205 264)' as const;
export const OKLCH_VIOLET = 'oklch(0.680 0.180 310)' as const;
export const OKLCH_MUTED = 'oklch(0.55 0.01 270)' as const;

/**
 * Rotating colour cycle for multi-series charts where each series maps to an
 * arbitrary entity (e.g. one line per organisation in a group dashboard).
 *
 * Uses fixed L=0.700 / C=0.165 across all hues so every series reads with the
 * same visual weight — no hue grabs focus. Hues chosen to be perceptually
 * distinct: indigo, emerald, orange, magenta, blue, yellow, teal, pink, mint,
 * red. Enough separation for ~10 series without collision.
 *
 * Callers use `orgColor(index)` rather than indexing directly so wrap-around
 * is handled automatically when a group holds more orgs than the cycle.
 */
export const ORG_COLOR_CYCLE: readonly string[] = [
  'oklch(0.700 0.165 264)',
  'oklch(0.700 0.165 155)',
  'oklch(0.700 0.165 30)',
  'oklch(0.700 0.165 310)',
  'oklch(0.700 0.165 220)',
  'oklch(0.700 0.165 80)',
  'oklch(0.700 0.165 190)',
  'oklch(0.700 0.165 350)',
  'oklch(0.700 0.165 130)',
  'oklch(0.700 0.165 5)',
] as const;

/**
 * Pick a distinct oklch colour for the N-th series in a multi-series chart.
 * Wraps around `ORG_COLOR_CYCLE.length` so callers don't have to bounds-check.
 */
export function orgColor(index: number): string {
  const len = ORG_COLOR_CYCLE.length;
  // Normalise negatives and non-integers defensively — charts should never
  // receive a bad index, but if they do we'd rather degrade than crash.
  const i = ((Math.floor(index) % len) + len) % len;
  return ORG_COLOR_CYCLE[i];
}
