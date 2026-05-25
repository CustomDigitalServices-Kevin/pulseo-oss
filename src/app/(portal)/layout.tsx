import { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq, inArray, asc } from 'drizzle-orm';
import { getSession, isUserAdmin } from '@/lib/auth/session';
import {
  SidebarTree,
  type SidebarGroupNode,
  type SidebarOrgNode,
  type SidebarOrgRole,
  type SidebarTeamNode,
} from '@/components/layout/sidebar-tree';
import { Header } from '@/components/layout/header';
import { LegalFooter } from '@/components/legal/legal-footer';
import { AnimatedBackground } from '@/components/layout/animated-background';
import { Toaster } from '@/components/ui/sonner';
import { ErrorBoundary } from '@/components/common/error-boundary';
import { CommandPalette } from '@/components/common/command-palette';
import { getRecentNotifications } from '@/lib/notifications';
import { isProjectsEnabled } from '@/modules/projects/feature-flag';
import { TourProvider } from '@/components/tour/tour-provider';
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

/**
 * Normalise la valeur `role` SQL (varchar non contraint au niveau DB) vers le
 * union TypeScript attendu par la sidebar. Tout rôle inconnu est replié sur
 * `viewer` (lecture seule) pour ne jamais accorder plus de permissions que
 * promis par le type.
 */
function normalizeRole(raw: string): SidebarOrgRole {
  if (raw === 'admin' || raw === 'gestionnaire' || raw === 'viewer') return raw;
  return 'viewer';
}

async function fetchSidebarData(userId: string, isSuperadmin: boolean): Promise<{
  groups: SidebarGroupNode[];
  teams: SidebarTeamNode[];
  autonomousOrgs: SidebarOrgNode[];
}> {
  // 1. Groupes : tous pour superadmin, sinon ceux dont l'user est gestionnaire.
  const groupsRaw = isSuperadmin
    ? await db
        .select({
          id: organization_groups.id,
          name: organization_groups.name,
          slug: organization_groups.slug,
        })
        .from(organization_groups)
        .orderBy(asc(organization_groups.name))
    : await db
        .select({
          id: organization_groups.id,
          name: organization_groups.name,
          slug: organization_groups.slug,
        })
        .from(organization_groups)
        .innerJoin(
          organization_group_managers,
          eq(organization_group_managers.group_id, organization_groups.id),
        )
        .where(eq(organization_group_managers.user_id, userId))
        .orderBy(asc(organization_groups.name));

  // 2. Orgs des groupes — une seule query pour l'ensemble des group_ids (évite N+1).
  const groupIds = groupsRaw.map((g) => g.id);
  const groupOrgRows =
    groupIds.length === 0
      ? []
      : await db
          .select({
            id: organizations.id,
            slug: organizations.slug,
            name: organizations.name,
            group_id: organizations.group_id,
          })
          .from(organizations)
          .where(inArray(organizations.group_id, groupIds))
          .orderBy(asc(organizations.name));

  const orgsByGroup = new Map<string, SidebarOrgNode[]>();
  for (const row of groupOrgRows) {
    if (!row.group_id) continue;
    const bucket = orgsByGroup.get(row.group_id) ?? [];
    // Rôle hérité via membership groupe = gestionnaire (modélisation C-phase).
    // Pour un superadmin on garde aussi 'gestionnaire' (le badge reflète le
    // rôle effectif côté groupe, pas la capacité plateforme).
    bucket.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      role: 'gestionnaire',
    });
    orgsByGroup.set(row.group_id, bucket);
  }

  const groupNodes: SidebarGroupNode[] = groupsRaw.map((g) => ({
    id: g.id,
    slug: g.slug,
    name: g.name,
    orgs: orgsByGroup.get(g.id) ?? [],
  }));

  // 3. Équipes : toutes pour superadmin, sinon celles dont l'user est membre.
  const teamsRaw = isSuperadmin
    ? await db
        .select({ id: teams.id, name: teams.name, slug: teams.slug })
        .from(teams)
        .orderBy(asc(teams.name))
    : await db
        .select({ id: teams.id, name: teams.name, slug: teams.slug })
        .from(teams)
        .innerJoin(team_members, eq(team_members.team_id, teams.id))
        .where(eq(team_members.user_id, userId))
        .orderBy(asc(teams.name));

  // 4. Orgs accessibles par les teams — single query sur l'ensemble des team_ids.
  const teamIds = teamsRaw.map((t) => t.id);
  const teamOrgRows =
    teamIds.length === 0
      ? []
      : await db
          .select({
            team_id: team_organization_grants.team_id,
            id: organizations.id,
            slug: organizations.slug,
            name: organizations.name,
            role: team_organization_grants.role,
          })
          .from(team_organization_grants)
          .innerJoin(
            organizations,
            eq(organizations.id, team_organization_grants.organization_id),
          )
          .where(inArray(team_organization_grants.team_id, teamIds))
          .orderBy(asc(organizations.name));

  const orgsByTeam = new Map<string, SidebarOrgNode[]>();
  for (const row of teamOrgRows) {
    const bucket = orgsByTeam.get(row.team_id) ?? [];
    bucket.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      role: normalizeRole(row.role),
    });
    orgsByTeam.set(row.team_id, bucket);
  }

  const teamNodes: SidebarTeamNode[] = teamsRaw.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    orgs: orgsByTeam.get(t.id) ?? [],
  }));

  // 5. Orgs accessibles via membership direct.
  //
  // Avant un fix antérieur ce bucket était restreint aux orgs avec
  // `group_id IS NULL`, ce qui rendait la sidebar entièrement vide pour un
  // viewer rattaché à une org sous-groupée : pas gestionnaire du groupe →
  // bucket `groups` vide ; org sous-groupée → bucket autonome vide. Le viewer
  // ne pouvait plus naviguer vers ses tickets.
  //
  // Fix : on récupère tous les memberships directs, puis on exclut ici (côté
  // serveur) les orgs déjà rendues via `groups` ou `teams` pour éviter
  // l'affichage en double quand l'user cumule plusieurs rattachements.
  const directMembershipRows = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      role: organization_members.role,
    })
    .from(organizations)
    .innerJoin(
      organization_members,
      eq(organization_members.organization_id, organizations.id),
    )
    .where(eq(organization_members.user_id, userId))
    .orderBy(asc(organizations.name));

  const idsAlreadyShown = new Set<string>([
    ...groupNodes.flatMap((g) => g.orgs.map((o) => o.id)),
    ...teamNodes.flatMap((tm) => tm.orgs.map((o) => o.id)),
  ]);

  const autonomousOrgs: SidebarOrgNode[] = directMembershipRows
    .filter((o) => !idsAlreadyShown.has(o.id))
    .map((o) => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      role: normalizeRole(o.role),
    }));

  return { groups: groupNodes, teams: teamNodes, autonomousOrgs };
}

function parseSidebarCookie(raw: string | undefined): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'boolean') out[key] = value;
    }
    return out;
  } catch {
    // Cookie malformé ou tronqué — on ignore silencieusement.
    return {};
  }
}

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  const [admin, recentNotifications, hasResponsibleRole, userProfile] =
    await Promise.all([
      isUserAdmin(session.user.id),
      getRecentNotifications(session.user.id, 10),
      db
        .select({ id: organization_members.id })
        .from(organization_members)
        .where(
          and(
            eq(organization_members.user_id, session.user.id),
            inArray(organization_members.role, ['gestionnaire', 'admin'])
          )
        )
        .limit(1)
        .then((rows) => rows.length > 0),
      db.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, session.user.id),
        columns: { avatar_url: true, tour_completed_at: true },
      }),
    ]);

  const notifications = recentNotifications.map((n) => ({
    id: n.id,
    title: n.title,
    description: n.description,
    time: n.time,
    createdAt: n.createdAt.toISOString(),
  }));

  // Flag `ENABLE_PROJECTS_MODULE` évalué server-side ici : `process.env.ENABLE_*`
  // retourne undefined côté browser (flags non `NEXT_PUBLIC_*`) → obligatoire de
  // passer le booléen en prop aux composants client.
  const projectsEnabled = isProjectsEnabled();

  const [sidebarData, cookieStore] = await Promise.all([
    fetchSidebarData(session.user.id, admin),
    cookies(),
  ]);
  const defaultCollapsed = parseSidebarCookie(
    cookieStore.get('pulseo_sidebar')?.value,
  );

  // Onboarding tour: auto-start on first portal visit. The user can skip
  // (driver.js Escape / X / overlay click) — we mark tour_completed_at on
  // any tour close (done or skip) via the `markTourCompleted` action. The
  // help button in the header relaunches the tour without DB writes.
  const tourAutoStart = userProfile?.tour_completed_at == null;
  // Pick the first reachable org slug (autonomous → first group org → first team org).
  // Used by the Help button to deep-link the tour to a tickets page.
  const firstOrgSlug =
    sidebarData.autonomousOrgs[0]?.slug ??
    sidebarData.groups.flatMap((g) => g.orgs)[0]?.slug ??
    sidebarData.teams.flatMap((tm) => tm.orgs)[0]?.slug ??
    null;

  return (
    <>
      {/* Le fond animé est rendu sur tout le viewport (position:fixed) avant
          le conteneur interactif. Le body porte déjà `bg-background` + mesh
          gradient dans globals.css — pas de surcouche opaque ici. */}
      <AnimatedBackground />

      {/* Conteneur portail transparent : laisse transparaître les spots. */}
      <div className="relative z-10 flex h-screen w-full">
        <SidebarTree
          user={{ id: session.user.id, isSuperadmin: admin }}
          groups={sidebarData.groups}
          teams={sidebarData.teams}
          autonomousOrgs={sidebarData.autonomousOrgs}
          defaultCollapsed={defaultCollapsed}
          projectsEnabled={projectsEnabled}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            userEmail={session.user.email}
            userName={session.user.name}
            isAdmin={admin}
            notifications={notifications}
            avatarUrl={userProfile?.avatar_url ?? null}
          />

          {/* Main en pleine largeur avec voile semi-transparent pour lisibilité
              sans masquer le fond animé (backdrop-blur renforce l'effet glass). */}
          <main className="flex-1 overflow-y-auto bg-background/40 backdrop-blur-md">
            <ErrorBoundary>{children}</ErrorBoundary>
            <LegalFooter />
          </main>
        </div>
      </div>

      {/* Global command palette (Cmd+K / Ctrl+K) */}
      <CommandPalette isAdmin={admin} canAccessDocuments={admin || hasResponsibleRole} />

      {/* Onboarding tour — auto-start on first visit, replayable via Help button */}
      <TourProvider autoStart={tourAutoStart} fallbackOrgSlug={firstOrgSlug} />

      <Toaster />
    </>
  );
}
