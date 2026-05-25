import { Ticket, AlertTriangle, Users, Timer } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { KpiCard } from '@/components/dashboards/kpi-card';
import { MultiSeriesChart } from '@/components/dashboards/multi-series-chart';
import { ActivityFeed } from '@/components/dashboards/activity-feed';
import { OrgsTable } from '@/components/dashboards/orgs-table';
import {
  getGroupStats,
  getTopOrgs,
  getCreatedLast30dByOrgInGroup,
  getMedianResponseTime,
} from '@/lib/stats/aggregations';
import {
  OKLCH_INFO,
  OKLCH_SUCCESS,
  OKLCH_DANGER,
  OKLCH_WARNING,
  orgColor,
} from '@/lib/charts/tokens';
import { formatMedianMinutes } from '@/lib/format/duration';

interface PremiumGroupDashboardProps {
  groupId: string;
  groupName: string;
}

/**
 * Group-scoped premium dashboard — RSC.
 *
 * Widget order (per spec §5.3):
 *   1. Header + subtitle (agrégé sur N orgs)
 *   2. 4 KPI strip (open / overdue / active 7d / median resolution)
 *   3. Multi-series 30-day chart, one line per org in the group
 *   4. Top orgs table (scoped to the group)
 *   5. Activity feed (scoped to the group)
 *
 * All data fetched in parallel; wrappers are 5-minute cached and tagged
 * `stats:group:<id>` so a per-group invalidation scrubs the full dashboard.
 *
 * Skips (vs spec §5.3):
 *   - Top users du groupe (SHOULD) — MVP
 *   - Donut SLA on-time/at-risk/overdue (SHOULD) — MVP
 *   - Répartition tickets par org — redundant with OrgsTable
 */
export async function PremiumGroupDashboard({
  groupId,
  groupName,
}: PremiumGroupDashboardProps) {
  const t = await getTranslations('groups');
  const [groupStats, topOrgs, perOrgSeries, median] = await Promise.all([
    getGroupStats(groupId),
    getTopOrgs({ limit: 100, scope: { type: 'group', id: groupId } }),
    getCreatedLast30dByOrgInGroup(groupId),
    getMedianResponseTime({ scope: { type: 'group', id: groupId } }),
  ]);

  // ── Median formatting ──────────────────────────────────────────────────────
  const medianLabel = formatMedianMinutes(median.median_minutes);

  // ── Per-org series for the graph ───────────────────────────────────────────
  // Every org in the group is represented — even those with zero tickets, so
  // the legend shows every filiale. `orgColor(i)` rotates oklch hues so lines
  // read as distinct.
  const series = perOrgSeries.map((o, i) => ({
    label: o.organization_name,
    slug: o.organization_slug,
    color: orgColor(i),
    data: o.data,
  }));

  const orgCount = groupStats.org_count;

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in">
      {/* 1. Header ----------------------------------------------------------- */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-iridescent leading-tight">
            {t('dashboardTitle', { name: groupName })}
          </h1>
          <p className="text-foreground-muted text-[15px] mt-1">
            {t('dashboardSubtitle', { count: orgCount })}
          </p>
        </div>
      </header>

      {/* 2. KPI strip -------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          label={t('kpiOpenTickets')}
          value={groupStats.open_tickets}
          tint={OKLCH_WARNING}
          icon={<Ticket className="w-3.5 h-3.5" />}
        />
        <KpiCard
          label={t('kpiOverdueSla')}
          value={groupStats.overdue_tickets}
          tint={OKLCH_DANGER}
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
        />
        <KpiCard
          label={t('kpiActiveUsers7d')}
          value={groupStats.active_users_7d}
          tint={OKLCH_INFO}
          icon={<Users className="w-3.5 h-3.5" />}
        />
        <KpiCard
          label={t('dashboardMedianResolution')}
          value={medianLabel}
          tint={OKLCH_SUCCESS}
          icon={<Timer className="w-3.5 h-3.5" />}
        />
      </div>

      {/* 3. Per-org 30j chart ----------------------------------------------- */}
      <section>
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle mb-2">
          {t('chartPerOrg30d')}
        </h2>
        <MultiSeriesChart height={280} series={series} />
      </section>

      {/* 4 & 5. Table orgs + Activity feed ---------------------------------- */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="xl:col-span-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle mb-2">
            {t('orgsOfGroup')}
          </h2>
          <OrgsTable rows={topOrgs} />
        </div>
        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle mb-2">
            {t('recentActivity')}
          </h2>
          <ActivityFeed scope={{ type: 'group', id: groupId }} limit={10} />
        </div>
      </section>
    </div>
  );
}

