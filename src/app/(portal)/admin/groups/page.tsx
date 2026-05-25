import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  organization_groups,
  organizations,
  organization_group_managers,
} from '@/lib/db/schema';
import { count } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { SpotlightCard } from '@/components/common/spotlight-card';
import { Plus, Layers, Building2, ShieldCheck, ArrowRight } from 'lucide-react';

export default async function AdminGroupsPage() {
  await requireAdmin();
  const t = await getTranslations('admin');

  const [groupsRows, orgAgg, mgrAgg] = await Promise.all([
    db
      .select({
        id: organization_groups.id,
        name: organization_groups.name,
        slug: organization_groups.slug,
        logo_url: organization_groups.logo_url,
        created_at: organization_groups.created_at,
      })
      .from(organization_groups)
      .orderBy(organization_groups.name),
    db
      .select({ groupId: organizations.group_id, value: count() })
      .from(organizations)
      .groupBy(organizations.group_id),
    db
      .select({
        groupId: organization_group_managers.group_id,
        value: count(),
      })
      .from(organization_group_managers)
      .groupBy(organization_group_managers.group_id),
  ]);

  const orgsByGroup = new Map(
    orgAgg
      .filter((r): r is { groupId: string; value: number } => r.groupId !== null)
      .map((r) => [r.groupId, Number(r.value)]),
  );
  const mgrsByGroup = new Map(mgrAgg.map((r) => [r.groupId, Number(r.value)]));

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border"
            style={{
              background:
                'linear-gradient(180deg, color-mix(in oklch, oklch(0.68 0.18 155) 100%, white 12%), oklch(0.68 0.18 155))',
              borderColor: 'color-mix(in oklch, oklch(0.68 0.18 155) 50%, transparent)',
              boxShadow:
                '0 1px 0 0 oklch(1 0 0 / 0.20) inset, 0 4px 12px -2px oklch(0.68 0.18 155 / 0.45)',
            }}
          >
            <Layers className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] leading-tight">
              {t('groups')}
            </h1>
            <p className="text-[15px] mt-1" style={{ color: 'var(--foreground-muted)' }}>
              {t('groupsCountLabel', { count: groupsRows.length })}
            </p>
          </div>
        </div>
        <Link href="/admin/groups/new">
          <Button size="sm" className="gap-1.5 h-8 text-xs">
            <Plus className="w-3.5 h-3.5" />
            {t('createGroup')}
          </Button>
        </Link>
      </div>

      {groupsRows.length === 0 ? (
        <SpotlightCard className="glow-border relative overflow-hidden rounded-xl bg-elevated border border-border">
          <div className="text-center py-16 px-6">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-2xl" />
              <div className="relative w-16 h-16 rounded-2xl bg-elevated border border-border flex items-center justify-center">
                <Layers className="w-7 h-7" style={{ color: 'var(--foreground-subtle)' }} strokeWidth={1.5} />
              </div>
            </div>
            <h3 className="text-[15px] font-semibold">{t('groupsEmpty')}</h3>
            <p className="text-[15px] mt-1.5 max-w-sm mx-auto" style={{ color: 'var(--foreground-muted)' }}>
              {t('groupsEmptyHint')}
            </p>
            <Link href="/admin/groups/new">
              <Button size="sm" className="mt-5 h-9 text-xs gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                {t('createGroupCta')}
              </Button>
            </Link>
          </div>
        </SpotlightCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-in-stagger">
          {groupsRows.map((g) => {
            const orgCount = orgsByGroup.get(g.id) ?? 0;
            const mgrCount = mgrsByGroup.get(g.id) ?? 0;
            const tintColor = 'oklch(0.68 0.18 155)';
            return (
              <Link key={g.id} href={`/admin/groups/${g.slug}`} className="block">
                <SpotlightCard
                  tintVar={tintColor}
                  className="glow-border group relative overflow-hidden rounded-xl bg-elevated border border-border min-h-[160px] cursor-pointer"
                >
                  <div
                    aria-hidden
                    className="absolute -top-16 -right-16 w-44 h-44 rounded-full blur-3xl opacity-30 transition-opacity duration-500 group-hover:opacity-70"
                    style={{ background: `radial-gradient(circle, ${tintColor} 0%, transparent 65%)` }}
                  />
                  <div className="relative p-5 h-full flex flex-col">
                    <div className="flex items-start gap-3">
                      <div
                        className="relative w-11 h-11 rounded-xl flex items-center justify-center text-base font-semibold shrink-0 border overflow-hidden"
                        style={{
                          background: `linear-gradient(180deg, color-mix(in oklch, ${tintColor} 100%, white 12%), ${tintColor})`,
                          borderColor: `color-mix(in oklch, ${tintColor} 50%, transparent)`,
                        }}
                      >
                        {g.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={g.logo_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white">{g.name.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 leading-tight">
                        <p className="font-semibold text-[14px] truncate text-foreground">{g.name}</p>
                        <p className="text-[13px] mt-1 font-mono truncate" style={{ color: 'var(--foreground-subtle)' }}>
                          {g.slug}
                        </p>
                      </div>
                      <ArrowRight
                        className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
                        style={{ color: 'var(--foreground-subtle)' }}
                      />
                    </div>
                    <div className="flex-1" />
                    <div className="mt-4 pt-3 border-t border-border flex items-center gap-4">
                      <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--foreground-muted)' }}>
                        <Building2 className="w-3 h-3" />
                        <span className="tabular-nums font-medium">{orgCount}</span>
                        <span className="text-[12px]" style={{ color: 'var(--foreground-subtle)' }}>
                          {t('groupOrgSuffix', { count: orgCount })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--foreground-muted)' }}>
                        <ShieldCheck className="w-3 h-3" />
                        <span className="tabular-nums font-medium">{mgrCount}</span>
                        <span className="text-[12px]" style={{ color: 'var(--foreground-subtle)' }}>
                          {t('groupManagerSuffix', { count: mgrCount })}
                        </span>
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
