'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LegendPayload } from 'recharts';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  TOOLTIP_STYLE,
  TOOLTIP_LABEL_STYLE,
  AXIS_TICK,
  GRID_STROKE,
} from '@/lib/charts/tokens';

export interface MultiSeriesChartProps {
  /**
   * One entry per series. `slug` is used as the dataKey (must be unique
   * across series); `label` is the legend text; `color` is an oklch string.
   */
  series: Array<{
    label: string;
    slug: string;
    color: string;
    data: Array<{ date: string; count: number }>;
  }>;
  /** Chart height in px. Defaults to 280. */
  height?: number;
  /** Optional Y-axis label. Rendered rotated -90° inside the axis gutter. */
  yLabel?: string;
  /**
   * When true, all `<Area>` components share a `stackId` so values stack
   * vertically instead of overlapping. Unstacked (default) preserves the
   * existing behaviour.
   */
  stacked?: boolean;
  className?: string;
}

/**
 * Multi-series area chart — one `<Area>` per series, shared X axis on `date`.
 *
 * Legend is interactive: clicking a series label toggles its visibility.
 * Merges all series' date keys into a single dataset so Recharts can plot
 * them on a shared axis even if some series are sparse.
 */
export function MultiSeriesChart({
  series,
  height = 280,
  yLabel,
  stacked = false,
  className,
}: MultiSeriesChartProps) {
  // Pre-compute merged dataset: one row per unique date, one column per slug.
  const merged = useMemo(() => mergeByDate(series), [series]);
  const t = useTranslations('dashboard');

  // Visibility map keyed by slug. Starts with everything visible.
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  // Recharts typings describe dataKey as `string | number | ((obj: any) => any)`.
  // We only ever set `dataKey={s.slug}` (a string) so narrow defensively.
  const onLegendClick = useCallback((entry: LegendPayload) => {
    const dk = entry.dataKey;
    if (typeof dk !== 'string') return;
    setHidden((h) => ({ ...h, [dk]: !h[dk] }));
  }, []);

  if (series.length === 0 || merged.length === 0) {
    return (
      <div
        className={cn(
          'rounded-xl border border-border bg-elevated p-8 text-center text-sm text-foreground-subtle',
          className,
        )}
        style={{ height }}
      >
        {t('chartEmpty')}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-elevated p-3 shadow-premium-sm w-full',
        className,
      )}
      style={{ height, minWidth: 280 }}
    >
      {/*
       * ResponsiveContainer measures its parent via ResizeObserver; in jsdom
       * tests we polyfill RO with a noop so it never fires. We still render
       * reliably in the browser, and the tests wrap the component in a
       * fixed-size div + polyfilled RO to keep the SVG measurable.
       */}
      <ResponsiveContainer width="100%" height="100%" debounce={0}>
        <AreaChart data={merged} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.slug} id={`grad-${s.slug}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="2 4"
            stroke={GRID_STROKE}
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            width={yLabel ? 44 : 32}
            label={
              yLabel
                ? {
                    value: yLabel,
                    angle: -90,
                    position: 'insideLeft',
                    fill: AXIS_TICK.fill,
                    fontSize: AXIS_TICK.fontSize,
                    style: { textAnchor: 'middle' },
                  }
                : undefined
            }
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
          <Legend
            onClick={onLegendClick}
            wrapperStyle={{ fontSize: 11, cursor: 'pointer' }}
            iconType="circle"
          />
          {series.map((s) => (
            <Area
              key={s.slug}
              type="monotone"
              dataKey={s.slug}
              name={s.label}
              stroke={s.color}
              fill={`url(#grad-${s.slug})`}
              strokeWidth={1.75}
              hide={!!hidden[s.slug]}
              isAnimationActive={false}
              {...(stacked ? { stackId: '1' } : {})}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Merge per-series `{date, count}` rows into a single `{date, slug1, slug2,…}`
 * array ordered by date ascending. Missing values default to 0.
 */
function mergeByDate(
  series: MultiSeriesChartProps['series'],
): Array<Record<string, string | number>> {
  const byDate = new Map<string, Record<string, string | number>>();
  for (const s of series) {
    for (const pt of s.data) {
      const row = byDate.get(pt.date) ?? { date: pt.date };
      row[s.slug] = pt.count;
      byDate.set(pt.date, row);
    }
  }
  // Ensure every row has every slug key (0 fill).
  for (const row of byDate.values()) {
    for (const s of series) {
      if (row[s.slug] === undefined) row[s.slug] = 0;
    }
  }
  return Array.from(byDate.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}

export default MultiSeriesChart;
