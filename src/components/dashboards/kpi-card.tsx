'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LineChart, Line } from 'recharts';
import { SpotlightCard } from '@/components/common/spotlight-card';
import { OKLCH_PRIMARY, OKLCH_SUCCESS, OKLCH_DANGER } from '@/lib/charts/tokens';
import { cn } from '@/lib/utils';

// Sparkline dimensions — fixed (no ResponsiveContainer) per spec mandate
// and to keep jsdom tests deterministic without a ResizeObserver measurement.
const SPARKLINE_WIDTH = 96;
const SPARKLINE_HEIGHT = 30;

export interface KpiCardProps {
  /** Short label shown above the value (e.g. "Tickets ouverts"). */
  label: string;
  /** Numeric or pre-formatted string value. Numbers are formatted in fr-FR by default. */
  value: number | string;
  /** Optional 30d sparkline data. Rendered as a Recharts LineChart. */
  sparkline?: Array<{ date: string; count: number }>;
  /**
   * Optional delta indicator (e.g. trend vs previous period).
   * Positive = green/up, negative = red/down, zero = neutral.
   */
  delta?: { value: number; unit?: string };
  /** If provided, the whole card becomes a link to this href. */
  href?: string;
  /** Optional icon shown top-left of the card. */
  icon?: ReactNode;
  /** oklch colour string forwarded to SpotlightCard's --tint CSS var. */
  tint?: string;
  /** Optional custom formatter for numeric values. */
  format?: (v: number) => string;
  /** Extra classes applied to the outer card. */
  className?: string;
}

const DEFAULT_FORMAT = (n: number): string => n.toLocaleString('fr-FR');

/**
 * Reusable KPI card — label + value, optional sparkline, optional delta,
 * optional clickable wrapper.
 *
 * This is a client component: it depends on SpotlightCard (which uses refs
 * and pointer events) and on Recharts for the sparkline.
 */
export function KpiCard({
  label,
  value,
  sparkline,
  delta,
  href,
  icon,
  tint,
  format = DEFAULT_FORMAT,
  className,
}: KpiCardProps) {
  const displayValue = typeof value === 'number' ? format(value) : value;

  const deltaEl = delta ? <DeltaPill value={delta.value} unit={delta.unit} /> : null;

  const body = (
    <SpotlightCard
      tintVar={tint}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border bg-elevated shadow-premium-sm',
        'p-4 transition-colors hover:border-border/80',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {icon ? (
            <div className="w-7 h-7 rounded-md bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center text-primary shrink-0">
              {icon}
            </div>
          ) : null}
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle truncate">
            {label}
          </p>
        </div>
        {deltaEl}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
          {displayValue}
        </p>
        {sparkline && sparkline.length > 1 ? (
          <div className="shrink-0">
            <LineChart
              width={SPARKLINE_WIDTH}
              height={SPARKLINE_HEIGHT}
              data={sparkline}
              margin={{ top: 2, right: 0, left: 0, bottom: 2 }}
            >
              <Line
                type="monotone"
                dataKey="count"
                stroke={tint ?? OKLCH_PRIMARY}
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </div>
        ) : null}
      </div>
    </SpotlightCard>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-xl"
      >
        {body}
      </Link>
    );
  }
  return body;
}

function DeltaPill({ value, unit }: { value: number; unit?: string }) {
  const sign: 'up' | 'down' | 'flat' = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const prefix = value > 0 ? '+' : '';
  // Use inline style for the ±colour so the shared palette constants stay
  // the single source of truth (Tailwind can't interpolate imports).
  const style =
    sign === 'up'
      ? { color: OKLCH_SUCCESS }
      : sign === 'down'
        ? { color: OKLCH_DANGER }
        : undefined;

  return (
    <span
      data-delta-sign={sign}
      style={style}
      className={cn(
        'inline-flex items-center gap-0.5 text-[13px] font-medium tabular-nums',
        sign === 'flat' && 'text-foreground-subtle',
      )}
    >
      {prefix}
      {value}
      {unit ?? ''}
    </span>
  );
}

export default KpiCard;
