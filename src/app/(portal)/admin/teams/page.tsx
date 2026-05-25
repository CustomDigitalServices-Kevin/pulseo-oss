import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { teams, team_members, team_organization_grants } from '@/lib/db/schema';
import { count, asc } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { SpotlightCard } from '@/components/common/spotlight-card';
import { Plus, Users2, UserCheck, Building2, ArrowRight } from 'lucide-react';

export default async function AdminTeamsPage() {
  await requireAdmin();
  const tr = await getTranslations('admin');

  const [rows, memberAgg, grantAgg] = await Promise.all([
    db
      .select({
        id: teams.id,
        name: teams.name,
        slug: teams.slug,
        description: teams.description,
        created_at: teams.created_at,
      })
      .from(teams)
      .orderBy(asc(teams.name)),
    db
      .select({ teamId: team_members.team_id, value: count() })
      .from(team_members)
      .groupBy(team_members.team_id),
    db
      .select({ teamId: team_organization_grants.team_id, value: count() })
      .from(team_organization_grants)
      .groupBy(team_organization_grants.team_id),
  ]);

  const memberByTeam = new Map(memberAgg.map((r) => [r.teamId, Number(r.value)]));
  const grantByTeam = new Map(grantAgg.map((r) => [r.teamId, Number(r.value)]));

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-in">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border"
            style={{
              background:
                'linear-gradient(180deg, color-mix(in oklch, oklch(0.70 0.17 30) 100%, white 12%), oklch(0.70 0.17 30))',
              borderColor: 'color-mix(in oklch, oklch(0.70 0.17 30) 50%, transparent)',
              boxShadow:
                '0 1px 0 0 oklch(1 0 0 / 0.20) inset, 0 4px 12px -2px oklch(0.70 0.17 30 / 0.45)',
            }}
          >
            <Users2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] leading-tight">
              {tr('teams')}
            </h1>
            <p className="text-[15px] mt-1" style={{ color: 'var(--foreground-muted)' }}>
              {tr('teamsCountLabel', { count: rows.length })}
            </p>
          </div>
        </div>
        <Link href="/admin/teams/new">
          <Button size="sm" className="gap-1.5 h-8 text-xs">
            <Plus className="w-3.5 h-3.5" />
            {tr('createTeam')}
          </Button>
        </Link>
      </div>

      {rows.length === 0 ? (
        <SpotlightCard className="glow-border relative overflow-hidden rounded-xl bg-elevated border border-border">
          <div className="text-center py-16 px-6">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-2xl" />
              <div className="relative w-16 h-16 rounded-2xl bg-elevated border border-border flex items-center justify-center">
                <Users2 className="w-7 h-7" style={{ color: 'var(--foreground-subtle)' }} strokeWidth={1.5} />
              </div>
            </div>
            <h3 className="text-[15px] font-semibold">{tr('teamsEmpty')}</h3>
            <p className="text-[15px] mt-1.5 max-w-sm mx-auto" style={{ color: 'var(--foreground-muted)' }}>
              {tr('teamsEmptyHint')}
            </p>
            <Link href="/admin/teams/new">
              <Button size="sm" className="mt-5 h-9 text-xs gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                {tr('createTeamCta')}
              </Button>
            </Link>
          </div>
        </SpotlightCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-in-stagger">
          {rows.map((t) => {
            const memberCount = memberByTeam.get(t.id) ?? 0;
            const grantCount = grantByTeam.get(t.id) ?? 0;
            const tintColor = 'oklch(0.70 0.17 30)';
            return (
              <Link key={t.id} href={`/admin/teams/${t.slug}`} className="block">
                <SpotlightCard
                  tintVar={tintColor}
                  className="glow-border group relative overflow-hidden rounded-xl bg-elevated border border-border min-h-[180px] cursor-pointer"
                >
                  <div
                    aria-hidden
                    className="absolute -top-16 -right-16 w-44 h-44 rounded-full blur-3xl opacity-30 transition-opacity duration-500 group-hover:opacity-70"
                    style={{ background: `radial-gradient(circle, ${tintColor} 0%, transparent 65%)` }}
                  />
                  <div className="relative p-5 h-full flex flex-col">
                    <div className="flex items-start gap-3">
                      <div
                        className="relative w-11 h-11 rounded-xl flex items-center justify-center text-base font-semibold shrink-0 border"
                        style={{
                          background: `linear-gradient(180deg, color-mix(in oklch, ${tintColor} 100%, white 12%), ${tintColor})`,
                          borderColor: `color-mix(in oklch, ${tintColor} 50%, transparent)`,
                        }}
                      >
                        <span className="text-white">{t.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0 leading-tight">
                        <p className="font-semibold text-[14px] truncate text-foreground">{t.name}</p>
                        <p className="text-[13px] mt-1 font-mono truncate" style={{ color: 'var(--foreground-subtle)' }}>
                          {t.slug}
                        </p>
                      </div>
                      <ArrowRight
                        className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
                        style={{ color: 'var(--foreground-subtle)' }}
                      />
                    </div>
                    {t.description && (
                      <p className="text-[13px] mt-3 line-clamp-2 leading-relaxed" style={{ color: 'var(--foreground-muted)' }}>
                        {t.description}
                      </p>
                    )}
                    <div className="flex-1" />
                    <div className="mt-4 pt-3 border-t border-border flex items-center gap-4">
                      <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--foreground-muted)' }}>
                        <UserCheck className="w-3 h-3" />
                        <span className="tabular-nums font-medium">{memberCount}</span>
                        <span className="text-[12px]" style={{ color: 'var(--foreground-subtle)' }}>
                          {tr('teamMemberSuffix', { count: memberCount })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--foreground-muted)' }}>
                        <Building2 className="w-3 h-3" />
                        <span className="tabular-nums font-medium">{grantCount}</span>
                        <span className="text-[12px]" style={{ color: 'var(--foreground-subtle)' }}>
                          {tr('groupOrgSuffix', { count: grantCount })}
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
