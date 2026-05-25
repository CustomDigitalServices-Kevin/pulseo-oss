import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { organization_members, tickets } from '@/lib/db/schema';
import { and, count, eq, inArray, notInArray } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SpotlightCard } from '@/components/common/spotlight-card';
import { ArrowRight, Building2, Ticket } from 'lucide-react';
import {
  OrgLogo,
  dbSizeToInternal,
  type LogoBackground,
  type LogoShape,
} from '@/components/organizations/org-logo';

/**
 * Landing page for users who belong to 1..N organisations. Lists every org
 * the current user is a member of with a quick-count of open tickets, and
 * acts as the breadcrumb target for the `/clients` segment. Superadmins
 * still have the richer admin interface under `/admin/clients` — this page
 * is the default surface for every role.
 */
export default async function ClientsIndexPage() {
  const session = await requireSession();
  const t = await getTranslations('clients');

  const memberships = await db
    .select({
      orgId: organization_members.organization_id,
      role: organization_members.role,
    })
    .from(organization_members)
    .where(eq(organization_members.user_id, session.user.id));

  if (memberships.length === 0) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl animate-in">
        <h1 className="text-[22px] font-semibold tracking-tight">{t('myOrgs')}</h1>
        <p className="text-[15px] text-foreground-muted mt-1">
          {t('myOrgsEmpty')}
        </p>
        <SpotlightCard className="glow-border mt-6 relative overflow-hidden rounded-xl bg-elevated border border-border">
          <div className="p-8 text-center">
            <Building2 className="w-8 h-8 mx-auto text-foreground-subtle/50" />
            <p className="text-[15px] text-foreground-muted mt-3">
              {t('myOrgsHint')}
            </p>
          </div>
        </SpotlightCard>
      </div>
    );
  }

  const orgIds = memberships.map((m) => m.orgId);

  const [orgs, openCounts] = await Promise.all([
    db.query.organizations.findMany({
      where: (o, { inArray: ia }) => ia(o.id, orgIds),
      columns: {
        id: true,
        name: true,
        slug: true,
        description: true,
        color_primary: true,
        logo_url: true,
        logo_background: true,
        logo_shape: true,
        logo_size: true,
      },
    }),
    db
      .select({
        orgId: tickets.organization_id,
        count: count(),
      })
      .from(tickets)
      .where(
        and(
          inArray(tickets.organization_id, orgIds),
          notInArray(tickets.status, ['closed', 'resolved'])
        )
      )
      .groupBy(tickets.organization_id),
  ]);

  const openByOrg = new Map(openCounts.map((r) => [r.orgId, Number(r.count)]));
  const roleByOrg = new Map(memberships.map((m) => [m.orgId, m.role]));

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in max-w-5xl">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-iridescent leading-tight">
          {t('myOrgs')}
        </h1>
        <p className="text-[15px] text-foreground-muted mt-1">
          {t('myOrgsCount', { count: orgs.length })}
        </p>
      </div>

      {orgs.length === 1 ? (
        <Card className="border border-border bg-elevated shadow-premium-sm">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-[15px] font-semibold">{t('quickAccess')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <Link
              href={`/clients/${orgs[0].slug}`}
              className="list-item-premium group flex items-center justify-between p-4 border border-border rounded-md"
            >
              <div className="flex items-center gap-3">
                <OrgLogo
                  name={orgs[0].name}
                  logoUrl={orgs[0].logo_url ?? null}
                  background={(orgs[0].logo_background ?? 'auto') as LogoBackground}
                  shape={(orgs[0].logo_shape ?? 'square') as LogoShape}
                  size={dbSizeToInternal(orgs[0].logo_size)}
                  fallbackColor={orgs[0].color_primary ?? '#2563EB'}
                />
                <div>
                  <p className="font-medium text-[14px]">{orgs[0].name}</p>
                  <p className="text-[13px] text-foreground-subtle font-mono">{orgs[0].slug}</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-foreground-subtle group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-in-stagger">
          {orgs.map((org) => {
            const tintColor = org.color_primary ?? 'oklch(0.625 0.205 264)';
            const openCount = openByOrg.get(org.id) ?? 0;
            const role = roleByOrg.get(org.id) ?? 'viewer';
            return (
              <Link key={org.id} href={`/clients/${org.slug}`} className="block">
                <SpotlightCard
                  tintVar={tintColor}
                  className="glow-border group relative overflow-hidden rounded-xl bg-elevated border border-border min-h-[160px] cursor-pointer"
                >
                  <div
                    aria-hidden
                    className="absolute -top-16 -right-16 w-44 h-44 rounded-full blur-3xl opacity-25 transition-opacity duration-500 group-hover:opacity-60"
                    style={{ background: `radial-gradient(circle, ${tintColor} 0%, transparent 65%)` }}
                  />
                  <div className="relative p-5 h-full flex flex-col">
                    <div className="flex items-start gap-3">
                      <OrgLogo
                        name={org.name}
                        logoUrl={org.logo_url ?? null}
                        background={(org.logo_background ?? 'auto') as LogoBackground}
                        shape={(org.logo_shape ?? 'square') as LogoShape}
                        size="md"
                        fallbackColor={tintColor}
                        className="shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[14px] truncate">{org.name}</p>
                        <p className="text-[13px] font-mono mt-1 truncate" style={{ color: 'var(--foreground-subtle)' }}>
                          {org.slug}
                        </p>
                      </div>
                      <ArrowRight
                        className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
                        style={{ color: 'var(--foreground-subtle)' }}
                      />
                    </div>
                    <div className="flex-1" />
                    <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[13px]" style={{ color: 'var(--foreground-muted)' }}>
                      <div className="flex items-center gap-1.5">
                        <Ticket className="w-3 h-3" />
                        <span className="tabular-nums font-medium">{openCount}</span>
                        <span className="text-[12px]" style={{ color: 'var(--foreground-subtle)' }}>
                          {t('ticketsOpenCount', { count: openCount })}
                        </span>
                      </div>
                      <span className="text-[12px] uppercase tracking-[0.08em]" style={{ color: 'var(--foreground-subtle)' }}>
                        {role}
                      </span>
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
