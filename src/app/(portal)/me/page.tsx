import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq, inArray, asc } from 'drizzle-orm';
import {
  ArrowRight,
  Building2,
  Compass,
  Layers,
  Shield,
  Users,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getSessionInfo } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  organization_group_managers,
  organization_groups,
  organization_members,
  organizations,
  team_members,
  team_organization_grants,
  teams,
} from '@/lib/db/schema';
import { SpotlightCard } from '@/components/common/spotlight-card';

const ROLE_LABEL_KEYS: Record<string, string> = {
  admin: 'roleAdmin',
  gestionnaire: 'roleGestionnaire',
  viewer: 'roleViewer',
};

type GroupRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

type TeamWithCount = TeamRow & { orgCount: number };

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  role: string;
};

export default async function MyContextsPage() {
  const session = await getSessionInfo();
  if (!session) redirect('/login');
  const { userId, isSuperadmin } = session;
  const t = await getTranslations('me');

  // Groupes : tous si superadmin, sinon uniquement ceux où l'user est gestionnaire.
  const groups: GroupRow[] = isSuperadmin
    ? await db
        .select({
          id: organization_groups.id,
          name: organization_groups.name,
          slug: organization_groups.slug,
          logo_url: organization_groups.logo_url,
        })
        .from(organization_groups)
        .orderBy(asc(organization_groups.name))
    : await db
        .select({
          id: organization_groups.id,
          name: organization_groups.name,
          slug: organization_groups.slug,
          logo_url: organization_groups.logo_url,
        })
        .from(organization_groups)
        .innerJoin(
          organization_group_managers,
          eq(organization_group_managers.group_id, organization_groups.id),
        )
        .where(eq(organization_group_managers.user_id, userId))
        .orderBy(asc(organization_groups.name));

  // Équipes dont l'user est membre.
  const teamMemberships: TeamRow[] = await db
    .select({
      id: teams.id,
      name: teams.name,
      slug: teams.slug,
      description: teams.description,
    })
    .from(teams)
    .innerJoin(team_members, eq(team_members.team_id, teams.id))
    .where(eq(team_members.user_id, userId))
    .orderBy(asc(teams.name));

  // Count d'orgs accessibles par équipe (une seule query agrégée).
  const teamIds = teamMemberships.map((t) => t.id);
  const teamGrants =
    teamIds.length > 0
      ? await db
          .select({ team_id: team_organization_grants.team_id })
          .from(team_organization_grants)
          .where(inArray(team_organization_grants.team_id, teamIds))
      : [];

  const grantCountByTeam = teamGrants.reduce<Map<string, number>>((acc, row) => {
    acc.set(row.team_id, (acc.get(row.team_id) ?? 0) + 1);
    return acc;
  }, new Map());

  const teamsWithCount: TeamWithCount[] = teamMemberships.map((t) => ({
    ...t,
    orgCount: grantCountByTeam.get(t.id) ?? 0,
  }));

  // Memberships directs sur organisations.
  const directOrgs: OrgRow[] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      logo_url: organizations.logo_url,
      role: organization_members.role,
    })
    .from(organizations)
    .innerJoin(
      organization_members,
      eq(organization_members.organization_id, organizations.id),
    )
    .where(eq(organization_members.user_id, userId))
    .orderBy(asc(organizations.name));

  const hasAnyContext =
    isSuperadmin ||
    groups.length > 0 ||
    teamsWithCount.length > 0 ||
    directOrgs.length > 0;

  if (!hasAnyContext) {
    return (
      <div className="p-6 lg:p-8 animate-in">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start gap-3 mb-6">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border"
              style={{
                background:
                  'linear-gradient(180deg, color-mix(in oklch, oklch(0.62 0.12 250) 100%, white 12%), oklch(0.62 0.12 250))',
                borderColor:
                  'color-mix(in oklch, oklch(0.62 0.12 250) 50%, transparent)',
                boxShadow:
                  '0 1px 0 0 oklch(1 0 0 / 0.20) inset, 0 4px 12px -2px oklch(0.62 0.12 250 / 0.45)',
              }}
            >
              <Compass className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-[26px] font-semibold tracking-[-0.02em] leading-tight">
                {t('spacesTitle')}
              </h1>
              <p
                className="text-[15px] mt-1"
                style={{ color: 'var(--foreground-muted)' }}
              >
                {t('spacesContextsOfAccess')}
              </p>
            </div>
          </div>

          <SpotlightCard className="glow-border relative overflow-hidden rounded-xl bg-elevated border border-border">
            <div className="text-center py-16 px-6">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-2xl" />
                <div className="relative w-16 h-16 rounded-2xl bg-elevated border border-border flex items-center justify-center">
                  <Compass
                    className="w-7 h-7"
                    style={{ color: 'var(--foreground-subtle)' }}
                    strokeWidth={1.5}
                  />
                </div>
              </div>
              <h3 className="text-[15px] font-semibold">{t('spacesNoAccessTitle')}</h3>
              <p
                className="text-[15px] mt-1.5 max-w-sm mx-auto"
                style={{ color: 'var(--foreground-muted)' }}
              >
                {t('spacesNoAccessHint')}
              </p>
            </div>
          </SpotlightCard>
        </div>
      </div>
    );
  }

  const isSuperadminOnly =
    isSuperadmin &&
    groups.length === 0 &&
    teamsWithCount.length === 0 &&
    directOrgs.length === 0;

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-in">
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in oklch, oklch(0.62 0.12 250) 100%, white 12%), oklch(0.62 0.12 250))',
            borderColor:
              'color-mix(in oklch, oklch(0.62 0.12 250) 50%, transparent)',
            boxShadow:
              '0 1px 0 0 oklch(1 0 0 / 0.20) inset, 0 4px 12px -2px oklch(0.62 0.12 250 / 0.45)',
          }}
        >
          <Compass className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] leading-tight">
            {t('spacesTitle')}
          </h1>
          <p
            className="text-[15px] mt-1"
            style={{ color: 'var(--foreground-muted)' }}
          >
            {t('spacesSubtitleChoose')}
          </p>
        </div>
      </div>

      {isSuperadmin && (
        <Section
          title={t('administration')}
          icon={<Shield className="w-4 h-4" style={{ color: 'var(--foreground-muted)' }} />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-in-stagger">
            <ContextCard
              href="/admin/dashboard"
              tintColor="oklch(0.65 0.18 280)"
              icon={<Shield className="w-4 h-4 text-white" />}
              title={t('adminConsoleTitle')}
              subtitle={t('adminConsoleSubtitle')}
              description={t('adminConsoleDesc')}
              ctaLabel={t('enterSpace')}
            />
          </div>
          {isSuperadminOnly && (
            <p
              className="text-[14px] mt-3"
              style={{ color: 'var(--foreground-subtle)' }}
            >
              {t('superadminOnly')}
            </p>
          )}
        </Section>
      )}

      {groups.length > 0 && (
        <Section
          title={t('sectionGroups')}
          count={groups.length}
          icon={<Layers className="w-4 h-4" style={{ color: 'var(--foreground-muted)' }} />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-in-stagger">
            {groups.map((g) => (
              <ContextCard
                key={g.id}
                href={`/groups/${g.slug}/dashboard`}
                tintColor="oklch(0.68 0.18 155)"
                logoUrl={g.logo_url}
                initial={g.name.charAt(0).toUpperCase()}
                icon={<Layers className="w-4 h-4 text-white" />}
                title={g.name}
                subtitle={g.slug}
                description={
                  isSuperadmin
                    ? t('groupSuperadminAccess')
                    : t('groupManagerAccess')
                }
                ctaLabel={t('enterSpace')}
              />
            ))}
          </div>
        </Section>
      )}

      {teamsWithCount.length > 0 && (
        <Section
          title={t('sectionTeams')}
          count={teamsWithCount.length}
          icon={<Users className="w-4 h-4" style={{ color: 'var(--foreground-muted)' }} />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-in-stagger">
            {teamsWithCount.map((team) => (
              <ContextCard
                key={team.id}
                href="/me"
                tintColor="oklch(0.70 0.17 30)"
                initial={team.name.charAt(0).toUpperCase()}
                icon={<Users className="w-4 h-4 text-white" />}
                title={team.name}
                subtitle={team.slug}
                description={
                  team.orgCount === 0
                    ? t('teamNoOrgsAccessible')
                    : t('teamOrgsAccessible', { count: team.orgCount })
                }
                ctaLabel={t('enterSpace')}
              />
            ))}
          </div>
        </Section>
      )}

      {directOrgs.length > 0 && (
        <Section
          title={t('organizationsTitle')}
          count={directOrgs.length}
          icon={<Building2 className="w-4 h-4" style={{ color: 'var(--foreground-muted)' }} />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-in-stagger">
            {directOrgs.map((o) => {
              const roleKey = ROLE_LABEL_KEYS[o.role];
              const roleLabel = roleKey ? t(roleKey) : o.role;
              return (
                <ContextCard
                  key={o.id}
                  href={`/clients/${o.slug}`}
                  tintColor="oklch(0.65 0.15 220)"
                  logoUrl={o.logo_url}
                  initial={o.name.charAt(0).toUpperCase()}
                  icon={<Building2 className="w-4 h-4 text-white" />}
                  title={o.name}
                  subtitle={o.slug}
                  description={t('roleLabel', { role: roleLabel })}
                  ctaLabel={t('enterSpace')}
                />
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {typeof count === 'number' && (
          <span
            className="text-[13px] tabular-nums"
            style={{ color: 'var(--foreground-subtle)' }}
          >
            ({count})
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function ContextCard({
  href,
  tintColor,
  icon,
  title,
  subtitle,
  description,
  logoUrl,
  initial,
  ctaLabel,
}: {
  href: string;
  tintColor: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  logoUrl?: string | null;
  initial?: string;
  ctaLabel: string;
}) {
  return (
    <Link href={href} className="block">
      <SpotlightCard
        tintVar={tintColor}
        className="glow-border group relative overflow-hidden rounded-xl bg-elevated border border-border min-h-[160px] cursor-pointer"
      >
        <div
          aria-hidden
          className="absolute -top-16 -right-16 w-44 h-44 rounded-full blur-3xl opacity-30 transition-opacity duration-500 group-hover:opacity-70"
          style={{
            background: `radial-gradient(circle, ${tintColor} 0%, transparent 65%)`,
          }}
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
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="w-full h-full object-cover" />
              ) : initial ? (
                <span className="text-white">{initial}</span>
              ) : (
                icon
              )}
            </div>
            <div className="flex-1 min-w-0 leading-tight">
              <p className="font-semibold text-[14px] truncate text-foreground">
                {title}
              </p>
              <p
                className="text-[13px] mt-1 font-mono truncate"
                style={{ color: 'var(--foreground-subtle)' }}
              >
                {subtitle}
              </p>
            </div>
            <ArrowRight
              className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
              style={{ color: 'var(--foreground-subtle)' }}
            />
          </div>
          <div className="flex-1" />
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
            <p
              className="text-[13px] truncate"
              style={{ color: 'var(--foreground-muted)' }}
            >
              {description}
            </p>
            <span
              className="text-[13px] font-medium shrink-0 inline-flex items-center gap-1 transition-all group-hover:translate-x-0.5"
              style={{ color: tintColor }}
            >
              {ctaLabel}
              <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </SpotlightCard>
    </Link>
  );
}
