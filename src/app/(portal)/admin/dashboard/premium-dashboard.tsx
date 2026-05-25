import Link from 'next/link';
import { Users, AlertTriangle, Building2, Timer } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { KpiCard } from '@/components/dashboards/kpi-card';
import { MultiSeriesChart } from '@/components/dashboards/multi-series-chart';
import { ActivityFeed } from '@/components/dashboards/activity-feed';
import { OrgsTable } from '@/components/dashboards/orgs-table';
import { cn } from '@/lib/utils';
import {
  getGlobalStats,
  getTopOrgs,
  getOrgCountStats,
  getOrgsWithoutAdminCount,
  getResolvedLast30d,
  getPriorWindowTotal,
  getMedianResponseTime,
} from '@/lib/stats/aggregations';
import {
  OKLCH_INFO,
  OKLCH_SUCCESS,
  OKLCH_DANGER,
  OKLCH_WARNING,
} from '@/lib/charts/tokens';
import { formatMedianMinutes } from '@/lib/format/duration';

// Static time-range options — the control is a visual stub for MVP, no wiring.
const TIME_RANGES = [
  { label: '7j', active: false },
  { label: '30j', active: true },
  { label: '90j', active: false },
] as const;

/**
 * Premium admin global dashboard — RSC.
 *
 * Widget order (per spec §5.2):
 *   1. Header + time-range stub
 *   2. Hero KPI (full width) with sparkline + delta vs prior 30d
 *   3. 3 secondary KPIs (users 7j, SLA en retard, organisations)
 *   4. Alerts strip
 *   5. Main graph (Créés + Résolus, stacked)
 *   6. Activity feed (side column on xl)
 *   7. Top 10 orgs table
 *
 * All data fetched in parallel via `Promise.all` — wrappers are cached 5 min.
 */
export async function PremiumGlobalDashboard() {
  const t = await getTranslations('admin');
  const locale = await getLocale();
  const numberLocale = locale === 'en' ? 'en-US' : 'fr-FR';
  const [global, topOrgs, orgCount, orgsWithoutAdmin, resolved30d, priorWindow, median] =
    await Promise.all([
      getGlobalStats(),
      getTopOrgs({ limit: 10, scope: { type: 'global' } }),
      getOrgCountStats(),
      getOrgsWithoutAdminCount(),
      getResolvedLast30d(),
      getPriorWindowTotal(),
      getMedianResponseTime({ scope: { type: 'global' } }),
    ]);

  // ── Hero KPI ───────────────────────────────────────────────────────────────
  const created30dTotal = global.created_last_30d.reduce((acc, r) => acc + r.count, 0);
  const deltaPct =
    priorWindow.prior_30d_total > 0
      ? Math.round(
          ((created30dTotal - priorWindow.prior_30d_total) / priorWindow.prior_30d_total) * 100,
        )
      : null;

  // ── Organisations KPI delta ────────────────────────────────────────────────
  // Per spec §5.2 : « delta = new orgs this month » (literal count, not trend).
  const orgsDelta = orgCount.new_this_month;

  // ── Alerts ────────────────────────────────────────────────────────────────
  // Shared helper: "Xh" under 72h, "Xj" beyond, "—" on null. Keeps the E3/E4
  // medians visually consistent now that group dashboards reuse the same
  // formatter.
  const medianLabel = formatMedianMinutes(median.median_minutes);

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in">
      {/* 1. Header ----------------------------------------------------------- */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-iridescent leading-tight">
            {t('dashboardTitle')}
          </h1>
          <p className="text-foreground-muted text-[15px] mt-1">
            {t('dashboardSubtitle')}
          </p>
        </div>
        <div
          role="group"
          aria-label={t('timeRange')}
          className="inline-flex items-center rounded-lg border border-border bg-elevated p-0.5 shadow-premium-sm"
        >
          {TIME_RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              aria-pressed={r.active}
              disabled
              className={
                r.active
                  ? 'px-3 py-1 text-[13px] font-medium rounded-md bg-primary/15 text-primary ring-1 ring-primary/25'
                  : 'px-3 py-1 text-[13px] font-medium rounded-md text-foreground-subtle'
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {/* 2. Hero KPI --------------------------------------------------------- */}
      <Link
        href="/admin/tickets?created_between=30d"
        className="block outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-xl"
      >
        <section className="rounded-xl border border-border bg-elevated shadow-premium-sm p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle">
                {t('activityTickets30d')}
              </p>
              <p className="mt-2 text-[40px] font-semibold tracking-[-0.02em] tabular-nums leading-none text-foreground">
                {created30dTotal.toLocaleString(numberLocale)}
              </p>
              <p className="text-[13px] text-foreground-subtle mt-2">
                {t('ticketsCreatedRecent')}
              </p>
            </div>
            {deltaPct !== null ? (
              <div
                data-delta-sign={deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'flat'}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[13px] font-medium tabular-nums border"
                style={{
                  color:
                    deltaPct > 0
                      ? OKLCH_SUCCESS
                      : deltaPct < 0
                        ? OKLCH_DANGER
                        : undefined,
                  borderColor:
                    deltaPct > 0
                      ? `color-mix(in oklch, ${OKLCH_SUCCESS} 30%, transparent)`
                      : deltaPct < 0
                        ? `color-mix(in oklch, ${OKLCH_DANGER} 30%, transparent)`
                        : 'var(--border)',
                  background:
                    deltaPct > 0
                      ? `color-mix(in oklch, ${OKLCH_SUCCESS} 12%, transparent)`
                      : deltaPct < 0
                        ? `color-mix(in oklch, ${OKLCH_DANGER} 12%, transparent)`
                        : undefined,
                }}
              >
                {t('deltaVsPrior', { sign: deltaPct > 0 ? '+' : '', pct: deltaPct })}
              </div>
            ) : null}
          </div>
          <div className="mt-4">
            <MultiSeriesChart
              height={120}
              series={[
                {
                  label: t('seriesCreated'),
                  slug: 'created',
                  color: OKLCH_INFO,
                  data: global.created_last_30d,
                },
              ]}
            />
          </div>
        </section>
      </Link>

      {/* 3. Secondary KPIs --------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard
          label={t('kpiActiveUsers7d')}
          value={global.active_users_7d}
          href="/admin/users?active=7d"
          icon={<Users className="w-3.5 h-3.5" />}
          tint={OKLCH_WARNING}
        />
        <KpiCard
          label={t('kpiOverdueSla')}
          value={global.overdue_tickets}
          href="/admin/tickets?sla=overdue"
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          tint={OKLCH_DANGER}
        />
        <KpiCard
          label={t('kpiOrganizations')}
          value={orgCount.total}
          delta={{ value: orgsDelta, unit: t('kpiOrganizationsDelta') }}
          href="/admin/clients"
          icon={<Building2 className="w-3.5 h-3.5" />}
          tint={OKLCH_INFO}
        />
      </div>

      {/* 4. Alerts strip ----------------------------------------------------- */}
      <section
        aria-label={t('alertsLabel')}
        className="grid grid-cols-1 md:grid-cols-3 gap-3"
      >
        <AlertRow
          href="/admin/organizations?missing_admin=1"
          icon={<Building2 className="w-3.5 h-3.5" />}
          tint={OKLCH_WARNING}
          title={t('alertOrgsNoAdmin', { count: orgsWithoutAdmin })}
          hint={t('alertOrgsNoAdminHint')}
        />
        <AlertRow
          href="/admin/tickets?sla=overdue"
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          tint={OKLCH_DANGER}
          title={t('alertOverdueSla', { count: global.overdue_tickets })}
          hint={t('alertOverdueSlaHint')}
        />
        <AlertRow
          icon={<Timer className="w-3.5 h-3.5" />}
          tint={OKLCH_INFO}
          title={t('alertMedianResolution', { value: medianLabel })}
          hint={t('alertMedianResolutionHint')}
        />
      </section>

      {/* 5 & 6. Graph + Activity feed --------------------------------------- */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="xl:col-span-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle mb-2">
            {t('chartCreatedVsResolved')}
          </h2>
          <MultiSeriesChart
            height={280}
            stacked
            series={[
              {
                label: t('seriesCreated'),
                slug: 'created',
                color: OKLCH_INFO,
                data: global.created_last_30d,
              },
              {
                label: t('seriesResolved'),
                slug: 'resolved',
                color: OKLCH_SUCCESS,
                data: resolved30d,
              },
            ]}
          />
        </div>
        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle mb-2">
            {t('recentActivity')}
          </h2>
          <ActivityFeed scope={{ type: 'global' }} limit={10} />
        </div>
      </section>

      {/* 7. Top orgs table -------------------------------------------------- */}
      <section>
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle mb-2">
          {t('topOrgs')}
        </h2>
        <OrgsTable rows={topOrgs} />
      </section>
    </div>
  );
}

// ─── AlertRow ────────────────────────────────────────────────────────────────

interface AlertRowProps {
  icon: React.ReactNode;
  tint: string;
  title: string;
  hint: string;
  href?: string;
}

function AlertRow({ icon, tint, title, hint, href }: AlertRowProps) {
  // Hover affordance only when the row actually navigates. A static alert
  // (no href) renders without transition/hover classes so users don't get
  // a false clickability signal.
  const body = (
    <div
      className={cn(
        'rounded-xl border border-border bg-elevated shadow-premium-sm p-3 flex items-center gap-3 h-full',
        href && 'transition-colors hover:border-border/80',
      )}
    >
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 border"
        style={{
          color: tint,
          backgroundColor: `color-mix(in oklch, ${tint} 14%, transparent)`,
          borderColor: `color-mix(in oklch, ${tint} 28%, transparent)`,
        }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-foreground truncate">{title}</p>
        <p className="text-[13px] text-foreground-subtle mt-0.5 truncate">{hint}</p>
      </div>
    </div>
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
