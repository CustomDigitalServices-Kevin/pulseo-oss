import { listOrganizations } from '@/actions/organizations';
import { db } from '@/lib/db';
import { tickets, contracts, organization_members } from '@/lib/db/schema';
import { count, eq, and } from 'drizzle-orm';
import Link from 'next/link';
import { z } from 'zod';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SpotlightCard } from '@/components/common/spotlight-card';
import {
  Plus,
  ArrowRight,
  Building2,
  Ticket,
  ScrollText,
  Calendar,
  ShieldAlert,
  X,
} from 'lucide-react';

const filtersSchema = z.object({
  missing_admin: z.enum(['1']).optional(),
});

export default async function ClientsAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('admin');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';
  const raw = await searchParams;
  const parsed = filtersSchema.safeParse({
    missing_admin: typeof raw.missing_admin === 'string' ? raw.missing_admin : undefined,
  });
  const filters = parsed.success ? parsed.data : {};

  const [orgs, ticketAgg, contractAgg, adminAgg] = await Promise.all([
    listOrganizations(),
    db
      .select({ orgId: tickets.organization_id, value: count() })
      .from(tickets)
      .groupBy(tickets.organization_id),
    db
      .select({ orgId: contracts.organization_id, value: count() })
      .from(contracts)
      .where(eq(contracts.status, 'active'))
      .groupBy(contracts.organization_id),
    db
      .select({ orgId: organization_members.organization_id, value: count() })
      .from(organization_members)
      .where(eq(organization_members.role, 'admin'))
      .groupBy(organization_members.organization_id),
  ]);

  const ticketByOrg = new Map(ticketAgg.map((r) => [r.orgId, Number(r.value)]));
  const activeContractByOrg = new Map(contractAgg.map((r) => [r.orgId, Number(r.value)]));
  const adminByOrg = new Map(adminAgg.map((r) => [r.orgId, Number(r.value)]));

  const orgStatsAll = orgs.map((org) => ({
    ...org,
    ticketCount: ticketByOrg.get(org.id) ?? 0,
    activeContractCount: activeContractByOrg.get(org.id) ?? 0,
    adminCount: adminByOrg.get(org.id) ?? 0,
  }));

  const orgStats =
    filters.missing_admin === '1'
      ? orgStatsAll.filter((o) => o.adminCount === 0)
      : orgStatsAll;
  void and;

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border"
            style={{
              background:
                'linear-gradient(180deg, color-mix(in oklch, oklch(0.625 0.205 264) 100%, white 12%), oklch(0.625 0.205 264))',
              borderColor: 'color-mix(in oklch, oklch(0.625 0.205 264) 50%, transparent)',
              boxShadow:
                '0 1px 0 0 oklch(1 0 0 / 0.20) inset, 0 4px 12px -2px oklch(0.625 0.205 264 / 0.45)',
            }}
          >
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-iridescent leading-tight">
              {t('orgs')}
            </h1>
            <p className="text-[15px] mt-1" style={{ color: 'var(--foreground-muted)' }}>
              {t('orgsCountLabel', {
                count: orgStats.length,
                suffix:
                  filters.missing_admin === '1'
                    ? t('orgsSuffixNoAdmin')
                    : t('orgsSuffixRegistered'),
              })}
            </p>
            {filters.missing_admin === '1' && (
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className="text-[12px] gap-1">
                  <ShieldAlert className="w-3 h-3" />
                  {t('badgeNoAdmin')}
                </Badge>
                <Link
                  href="/admin/clients"
                  className="text-[13px] text-foreground-muted hover:text-primary inline-flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  {tCommon('reset')}
                </Link>
              </div>
            )}
          </div>
        </div>
        <Link href="/admin/clients/new">
          <Button size="sm" className="gap-1.5 h-8 text-xs">
            <Plus className="w-3.5 h-3.5" />
            {t('createOrg')}
          </Button>
        </Link>
      </div>

      {/* Organizations grid — premium spotlight cards */}
      {orgStats.length === 0 ? (
        <SpotlightCard className="glow-border relative overflow-hidden rounded-xl bg-elevated border border-border">
          <div className="text-center py-16 px-6">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-2xl" />
              <div className="relative w-16 h-16 rounded-2xl bg-elevated border border-border flex items-center justify-center">
                <Building2 className="w-7 h-7" style={{ color: 'var(--foreground-subtle)' }} strokeWidth={1.5} />
              </div>
            </div>
            <h3 className="text-[15px] font-semibold">{t('orgsEmpty')}</h3>
            <p className="text-[15px] mt-1.5 max-w-sm mx-auto" style={{ color: 'var(--foreground-muted)' }}>
              {t('orgsEmptyHint')}
            </p>
            <Link href="/admin/clients/new">
              <Button size="sm" className="mt-5 h-9 text-xs gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                {t('orgsEmptyCta')}
              </Button>
            </Link>
          </div>
        </SpotlightCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-in-stagger">
          {orgStats.map((org) => {
            const tintColor = org.color_primary || 'oklch(0.625 0.205 264)';
            return (
              <Link key={org.id} href={`/admin/clients/${org.slug}`} className="block">
                <SpotlightCard
                  tintVar={tintColor}
                  className="glow-border group relative overflow-hidden rounded-xl bg-elevated border border-border min-h-[180px] cursor-pointer"
                >
                  {/* Halo */}
                  <div
                    aria-hidden
                    className="absolute -top-16 -right-16 w-44 h-44 rounded-full blur-3xl opacity-30 transition-opacity duration-500 group-hover:opacity-70"
                    style={{ background: `radial-gradient(circle, ${tintColor} 0%, transparent 65%)` }}
                  />
                  <div
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-px"
                    style={{
                      background: `linear-gradient(90deg, transparent, color-mix(in oklch, ${tintColor} 40%, transparent), transparent)`,
                    }}
                  />

                  <div className="relative p-5 h-full flex flex-col">
                    {/* Top: avatar + name */}
                    <div className="flex items-start gap-3">
                      <div
                        className="relative w-11 h-11 rounded-xl flex items-center justify-center text-base font-semibold shrink-0 border"
                        style={{
                          background: `linear-gradient(180deg, color-mix(in oklch, ${tintColor} 100%, white 12%), ${tintColor})`,
                          borderColor: `color-mix(in oklch, ${tintColor} 50%, transparent)`,
                          boxShadow: `0 1px 0 0 oklch(1 0 0 / 0.20) inset, 0 4px 12px -2px color-mix(in oklch, ${tintColor} 50%, transparent)`,
                        }}
                      >
                        <span className="text-white relative z-10">{org.name.charAt(0).toUpperCase()}</span>
                        <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/15" />
                      </div>
                      <div className="flex-1 min-w-0 leading-tight">
                        <p className="font-semibold text-[14px] truncate text-foreground">{org.name}</p>
                        <p className="text-[13px] mt-1 font-mono truncate" style={{ color: 'var(--foreground-subtle)' }}>
                          {org.slug}
                        </p>
                      </div>
                      <ArrowRight
                        className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
                        style={{ color: 'var(--foreground-subtle)' }}
                      />
                    </div>

                    {/* Description */}
                    {org.description && (
                      <p className="text-[13px] mt-3 line-clamp-2 leading-relaxed" style={{ color: 'var(--foreground-muted)' }}>
                        {org.description}
                      </p>
                    )}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Bottom: stats + date */}
                    <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--foreground-muted)' }}>
                          <Ticket className="w-3 h-3" />
                          <span className="tabular-nums font-medium">{org.ticketCount}</span>
                          <span className="text-[12px]" style={{ color: 'var(--foreground-subtle)' }}>{t('ticketsCountSuffix')}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--foreground-muted)' }}>
                          <ScrollText className="w-3 h-3" />
                          <span className="tabular-nums font-medium">{org.activeContractCount}</span>
                          <span className="text-[12px]" style={{ color: 'var(--foreground-subtle)' }}>{t('contractsCountSuffix')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[12px] tabular-nums" style={{ color: 'var(--foreground-subtle)' }}>
                        <Calendar className="w-3 h-3" />
                        {new Date(org.created_at).toLocaleDateString(dateLocale, {
                          day: 'numeric',
                          month: 'short',
                          year: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                </SpotlightCard>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
