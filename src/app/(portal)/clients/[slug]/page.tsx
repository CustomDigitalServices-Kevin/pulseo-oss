import { getOrganization } from '@/actions/organizations';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { tickets, contracts } from '@/lib/db/schema';
import { eq, and, count, notInArray } from 'drizzle-orm';
import { getLocale, getTranslations } from 'next-intl/server';
import { requireSession } from '@/lib/auth/session';
import { getMemberRole, hasMinRole } from '@/lib/auth/require-role';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SpotlightCard } from '@/components/common/spotlight-card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Ticket,
  ScrollText,
  ArrowRight,
  Plus,
  Timer,
  TrendingUp,
} from 'lucide-react';
import { RecentTicketsGrid } from '@/components/tickets/recent-tickets-grid';
import { isProjectsEnabled } from '@/modules/projects/feature-flag';
import ProjectsOverviewBlock from './projects/_overview-block';
import {
  OrgLogo,
  dbSizeToInternal,
  type LogoBackground,
  type LogoShape,
} from '@/components/organizations/org-logo';

export default async function ClientDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireSession();
  const t = await getTranslations('clients');
  const locale = await getLocale();
  void locale;
  const orgResult = await getOrganization(slug);

  if (!orgResult.success || !orgResult.data) {
    notFound();
  }

  const org = orgResult.data;

  const memberInfo = await getMemberRole(session.user.id, org.id);
  if (!memberInfo) notFound();

  const isGestionnaire = hasMinRole(memberInfo.role, 'gestionnaire');
  const projectsEnabled = isProjectsEnabled();

  const [openTickets, totalTickets, activeContracts] = await Promise.all([
    db
      .select({ count: count() })
      .from(tickets)
      .where(
        and(
          eq(tickets.organization_id, org.id),
          notInArray(tickets.status, ['closed', 'resolved'])
        )
      )
      .then((r) => r[0].count),
    db
      .select({ count: count() })
      .from(tickets)
      .where(eq(tickets.organization_id, org.id))
      .then((r) => r[0].count),
    db
      .select({ count: count() })
      .from(contracts)
      .where(and(eq(contracts.organization_id, org.id), eq(contracts.status, 'active')))
      .then((r) => r[0].count),
  ]);

  // Calcul du delai moyen de resolution
  const closedTickets = await db.query.tickets.findMany({
    where: (t, { and, eq }) =>
      and(eq(t.organization_id, org.id), eq(t.status, 'closed')),
    columns: { created_at: true, closed_at: true },
  });

  let avgResolutionDays: number | null = null;
  if (closedTickets.length > 0) {
    const totalMs = closedTickets.reduce((sum, t) => {
      if (t.closed_at) {
        return sum + (new Date(t.closed_at).getTime() - new Date(t.created_at).getTime());
      }
      return sum;
    }, 0);
    avgResolutionDays = Math.round((totalMs / closedTickets.length) / (1000 * 60 * 60 * 24) * 10) / 10;
  }

  // Taux de resolution
  const resolutionRate = totalTickets > 0
    ? Math.round((closedTickets.length / totalTickets) * 100)
    : 0;

  // Contrat actif principal (pour jauge)
  let activeContract: { name: string; quota: number; consumed: number } | null = null;
  if (isGestionnaire) {
    const contract = await db.query.contracts.findFirst({
      where: (c, { and, eq }) =>
        and(eq(c.organization_id, org.id), eq(c.status, 'active')),
      orderBy: (c, { desc }) => [desc(c.created_at)],
    });
    if (contract) {
      activeContract = {
        name: contract.name,
        quota: parseFloat(contract.quota_hours),
        consumed: parseFloat(contract.consumed_hours),
      };
    }
  }

  const recentTickets = await db.query.tickets.findMany({
    where: (t, { eq }) => eq(t.organization_id, org.id),
    orderBy: (t, { desc }) => [desc(t.created_at)],
    limit: 9,
  });

  const kpis = [
    {
      label: t('kpiOpenTickets'),
      value: openTickets,
      sub: t('kpiOpenTicketsSub', { count: totalTickets }),
      icon: Ticket,
      tintColor: 'oklch(0.625 0.205 264)',
      href: `/clients/${slug}/tickets`,
    },
    {
      label: t('kpiResolutionRate'),
      value: `${resolutionRate}%`,
      sub: t('kpiResolutionRateSub', { count: closedTickets.length }),
      icon: TrendingUp,
      tintColor: 'oklch(0.700 0.165 155)',
      href: `/clients/${slug}/tickets?status=closed`,
    },
    {
      label: t('kpiAvgDelay'),
      value: avgResolutionDays !== null ? `${avgResolutionDays} j` : '-',
      sub: t('kpiAvgDelaySub'),
      icon: Timer,
      tintColor: 'oklch(0.795 0.155 80)',
      href: `/clients/${slug}/tickets`,
    },
    ...(isGestionnaire
      ? [
          {
            label: t('kpiActiveContracts'),
            value: activeContracts,
            sub: t('kpiActiveContractsSub'),
            icon: ScrollText,
            tintColor: 'oklch(0.680 0.180 310)',
            href: `/clients/${slug}/contracts`,
          },
        ]
      : []),
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <OrgLogo
            name={org.name}
            logoUrl={org.logo_url ?? null}
            background={(org.logo_background ?? 'auto') as LogoBackground}
            shape={(org.logo_shape ?? 'square') as LogoShape}
            size={dbSizeToInternal(org.logo_size)}
            fallbackColor={org.color_primary ?? '#2563EB'}
          />
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-iridescent leading-tight">
              {org.name}
            </h1>
            {org.description && (
              <p className="text-[15px] text-foreground-muted mt-1">{org.description}</p>
            )}
          </div>
        </div>
        <Link href={`/clients/${slug}/tickets/new`}>
          <Button variant="cta" size="xl" className="gap-2">
            <Plus className="w-[18px] h-[18px]" strokeWidth={2.5} />
            {t('newTicket')}
          </Button>
        </Link>
      </div>

      {/* KPI Cards — clickable, premium style */}
      <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const tintColor = kpi.tintColor;
          return (
            <Link key={kpi.label} href={kpi.href} className="block">
              <SpotlightCard
                tintVar={tintColor}
                className="glow-border group relative overflow-hidden rounded-xl bg-elevated border border-border min-h-[124px] cursor-pointer"
              >
                <div
                  aria-hidden
                  className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-40 transition-opacity duration-500 group-hover:opacity-80"
                  style={{ background: `radial-gradient(circle, ${tintColor} 0%, transparent 65%)` }}
                />
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent, color-mix(in oklch, ${tintColor} 35%, transparent), transparent)`,
                  }}
                />
                <div className="relative p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.08em] truncate" style={{ color: 'var(--foreground-subtle)' }}>
                      {kpi.label}
                    </p>
                    <div
                      className="relative w-7 h-7 rounded-md flex items-center justify-center shrink-0 border"
                      style={{
                        backgroundColor: `color-mix(in oklch, ${tintColor} 14%, transparent)`,
                        borderColor: `color-mix(in oklch, ${tintColor} 28%, transparent)`,
                        boxShadow: `0 0 16px -4px color-mix(in oklch, ${tintColor} 55%, transparent)`,
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" style={{ color: tintColor }} strokeWidth={2.25} />
                    </div>
                  </div>
                  <p className="text-[26px] font-semibold tracking-[-0.02em] tabular-nums leading-none text-foreground">
                    {kpi.value}
                  </p>
                  <p className="text-[13px] mt-1.5 truncate" style={{ color: 'var(--foreground-subtle)' }}>
                    {kpi.sub}
                  </p>
                </div>
              </SpotlightCard>
            </Link>
          );
        })}
      </div>

      {/* Bloc Projets — admin/gestionnaire ORG + flag on uniquement */}
      {isGestionnaire && projectsEnabled && (
        <ProjectsOverviewBlock orgId={org.id} slug={slug} />
      )}

      {/* Contract usage gauge (gestionnaire+ only) */}
      {isGestionnaire && activeContract && (
        <Card className="border border-border bg-elevated shadow-premium-sm">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-[15px] font-semibold flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-[oklch(0.680_0.180_310)]/12 ring-1 ring-[oklch(0.680_0.180_310)]/25 flex items-center justify-center">
                <ScrollText className="w-3.5 h-3.5 text-[oklch(0.680_0.180_310)]" />
              </div>
              <span>{t('contractUsage', { name: activeContract.name })}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              <div className="flex items-end justify-between">
                <p className={`text-[26px] font-semibold tracking-[-0.02em] tabular-nums leading-none ${activeContract.consumed > activeContract.quota ? 'text-destructive' : 'text-foreground'}`}>
                  {activeContract.consumed.toFixed(1)}<span className="text-sm font-normal text-foreground-subtle"> / {activeContract.quota.toFixed(0)} h</span>
                </p>
                <p className="text-[14px] text-foreground-muted tabular-nums">
                  {activeContract.quota > 0
                    ? `${Math.min(Math.round((activeContract.consumed / activeContract.quota) * 100), 100)}%`
                    : '0%'}
                </p>
              </div>
              <div className="w-full bg-canvas border border-border rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    activeContract.consumed > activeContract.quota
                      ? 'bg-destructive'
                      : activeContract.consumed / activeContract.quota > 0.8
                        ? 'bg-[oklch(0.795_0.155_80)]'
                        : 'bg-[oklch(0.700_0.165_155)]'
                  }`}
                  style={{
                    width: `${Math.min(
                      activeContract.quota > 0
                        ? (activeContract.consumed / activeContract.quota) * 100
                        : 0,
                      100
                    )}%`,
                  }}
                />
              </div>
              <p className="text-[13px] text-foreground-subtle tabular-nums">
                {t('contractHoursRemaining', {
                  hours: Math.max(activeContract.quota - activeContract.consumed, 0).toFixed(1),
                })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Tickets — grille cards premium (remplace l'ancienne liste fine) */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center">
              <Ticket className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                {t('recentTickets')}
              </h2>
              <p className="text-[13px] text-foreground-subtle">
                {t('recentTicketsSub')}
              </p>
            </div>
          </div>
          <Link href={`/clients/${slug}/tickets`}>
            <Button
              variant="ghost"
              size="sm"
              className="text-[14px] text-foreground-muted hover:text-foreground gap-1"
            >
              {t('viewAllTickets')}
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>

        {recentTickets.length === 0 ? (
          <Card className="border border-white/10 bg-white/[0.03] backdrop-blur-xl">
            <CardContent className="text-center py-12">
              <div className="relative w-14 h-14 mx-auto mb-4">
                <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-xl" />
                <div className="relative w-14 h-14 rounded-2xl bg-elevated border border-border flex items-center justify-center">
                  <Ticket className="w-6 h-6 text-foreground-subtle" strokeWidth={1.5} />
                </div>
              </div>
              <p className="text-[14px] text-foreground-muted">{t('ticketsEmpty')}</p>
              <Link href={`/clients/${slug}/tickets/new`}>
                <Button variant="cta" size="lg" className="mt-5 gap-2">
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                  {t('createFirstTicket')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <RecentTicketsGrid tickets={recentTickets} slug={slug} />
        )}
      </section>
    </div>
  );
}
