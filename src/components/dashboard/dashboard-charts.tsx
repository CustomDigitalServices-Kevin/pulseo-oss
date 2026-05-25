'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  TOOLTIP_STYLE,
  TOOLTIP_LABEL_STYLE,
  AXIS_TICK,
  GRID_STROKE,
  OKLCH_PRIMARY,
  OKLCH_SUCCESS,
  OKLCH_DANGER,
  OKLCH_WARNING,
  OKLCH_INFO,
  OKLCH_VIOLET,
  OKLCH_MUTED,
} from '@/lib/charts/tokens';

interface DashboardChartsProps {
  statusData: { name: string; value: number }[];
  priorityData: { name: string; value: number }[];
  ticketsByOrg: { name: string; count: number }[];
}

// Sober, dark-aware palette aligned with Pulseo design tokens.
const STATUS_COLORS = [
  OKLCH_PRIMARY, // new
  OKLCH_WARNING, // in progress
  OKLCH_VIOLET,  // waiting
  OKLCH_SUCCESS, // resolved
  OKLCH_MUTED,   // closed
];
const PRIORITY_COLORS = [
  OKLCH_MUTED,   // low
  OKLCH_INFO,    // medium
  OKLCH_WARNING, // high
  OKLCH_DANGER,  // critical
];

export function DashboardCharts({
  statusData,
  priorityData,
  ticketsByOrg,
}: DashboardChartsProps) {
  const filteredStatus = statusData.filter((d) => d.value > 0);
  const filteredPriority = priorityData.filter((d) => d.value > 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Card className="border border-border bg-elevated shadow-premium-sm">
        <CardHeader className="pb-2 border-b border-border">
          <CardTitle className="text-[12px] font-semibold text-foreground-subtle uppercase tracking-[0.08em]">
            Tickets par statut
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {filteredStatus.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-[15px] text-foreground-subtle">
              Aucune donnée
            </div>
          ) : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={filteredStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={88}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {statusData.map((_, index) => (
                      <Cell
                        key={`status-${index}`}
                        fill={STATUS_COLORS[index % STATUS_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {filteredStatus.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 justify-center">
              {statusData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-[13px] text-foreground-muted">
                  <div
                    className="w-2 h-2 rounded-full ring-2 ring-elevated"
                    style={{ backgroundColor: STATUS_COLORS[i % STATUS_COLORS.length] }}
                  />
                  <span>{d.name}</span>
                  <span className="text-foreground-subtle font-mono tabular-nums">{d.value}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-border bg-elevated shadow-premium-sm">
        <CardHeader className="pb-2 border-b border-border">
          <CardTitle className="text-[12px] font-semibold text-foreground-subtle uppercase tracking-[0.08em]">
            Tickets par priorité
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {filteredPriority.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-[15px] text-foreground-subtle">
              Aucune donnée
            </div>
          ) : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={filteredPriority}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={88}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {priorityData.map((_, index) => (
                      <Cell
                        key={`priority-${index}`}
                        fill={PRIORITY_COLORS[index % PRIORITY_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {filteredPriority.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 justify-center">
              {priorityData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-[13px] text-foreground-muted">
                  <div
                    className="w-2 h-2 rounded-full ring-2 ring-elevated"
                    style={{ backgroundColor: PRIORITY_COLORS[i % PRIORITY_COLORS.length] }}
                  />
                  <span>{d.name}</span>
                  <span className="text-foreground-subtle font-mono tabular-nums">{d.value}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {ticketsByOrg.length > 0 && (
        <Card className="md:col-span-2 border border-border bg-elevated shadow-premium-sm">
          <CardHeader className="pb-2 border-b border-border">
            <CardTitle className="text-[12px] font-semibold text-foreground-subtle uppercase tracking-[0.08em]">
              Tickets par organisation
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ticketsByOrg} barCategoryGap="25%">
                  <CartesianGrid
                    strokeDasharray="2 4"
                    stroke={GRID_STROKE}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={AXIS_TICK}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={AXIS_TICK}
                  />
                  <Tooltip
                    cursor={{ fill: 'oklch(1 0 0 / 0.04)' }}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                  />
                  <Bar dataKey="count" fill={OKLCH_PRIMARY} radius={[6, 6, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
