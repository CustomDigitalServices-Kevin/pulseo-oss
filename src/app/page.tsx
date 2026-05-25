import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getSession, isUserAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  users,
  organization_members,
  organization_group_managers,
  team_members,
  organization_groups,
  teams,
  organizations,
} from '@/lib/db/schema';

/**
 * Strict allowlist for `last_context_path`. Keeps the server from ever
 * following a value like `/clients/../evil`, `/clients/%40attacker`, an
 * absolute URL, or anything that is not our known internal segment shape.
 *
 * Allowed shapes:
 *   /clients/<slug>[/<more>]
 *   /groups/<slug>[/<more>]
 *   /admin[/<more>]
 *
 * Segments after the first are constrained to printable, non-space chars to
 * keep the regex readable; they can include nested slugs, dots (e.g. ids),
 * dashes, etc.
 */
const SAFE_CONTEXT_PATH = /^\/(?:clients|groups)\/[A-Za-z0-9][A-Za-z0-9_-]*(?:\/[^\s?#]*)?$|^\/admin(?:\/[^\s?#]*)?$/;

function isSafeContextPath(path: string | null): path is string {
  if (!path) return false;
  if (path.length > 2048) return false;
  return SAFE_CONTEXT_PATH.test(path);
}

/**
 * Landing page `/` — post-login redirection hub.
 *
 * Spec §4.3 ordering:
 *   1. No session → /login
 *   2. `users.last_context_path` valid → redirect there
 *   3. User has exactly 1 context → redirect to that context
 *   4. Superadmin → /admin/dashboard
 *   5. Default → /me
 *
 * The middleware (`src/proxy.ts`) runs in edge runtime and cannot use
 * Drizzle, so this resolution happens here in a Server Component.
 *
 * Deep links (e.g. /clients/acme) bypass this page entirely; the target
 * layout re-runs its own `canAccessOrg` check and may 403 the user.
 */
export default async function Home() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const userId = session.user.id;
  const isAdmin = await isUserAdmin(userId);

  // 1. Preferred context memorized on last visit.
  const [row] = await db
    .select({ last: users.last_context_path })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const lastPath = row?.last ?? null;
  if (isSafeContextPath(lastPath)) {
    redirect(lastPath);
  }

  // 2. User has exactly one accessible context → redirect straight there.
  //    We consider three top-level context sources:
  //      - direct org memberships     → /clients/<slug>
  //      - group-manager assignments  → /groups/<slug>
  //      - team memberships           → /teams/<slug> (not built yet)
  //    When the total count is 1, the destination is unambiguous.
  const [directOrgs, managedGroups, memberTeams] = await Promise.all([
    db
      .select({ slug: organizations.slug })
      .from(organization_members)
      .innerJoin(organizations, eq(organizations.id, organization_members.organization_id))
      .where(eq(organization_members.user_id, userId)),
    db
      .select({ slug: organization_groups.slug })
      .from(organization_group_managers)
      .innerJoin(
        organization_groups,
        eq(organization_groups.id, organization_group_managers.group_id),
      )
      .where(eq(organization_group_managers.user_id, userId)),
    db
      .select({ slug: teams.slug })
      .from(team_members)
      .innerJoin(teams, eq(teams.id, team_members.team_id))
      .where(eq(team_members.user_id, userId)),
  ]);

  const totalContexts = directOrgs.length + managedGroups.length + memberTeams.length;
  if (totalContexts === 1) {
    if (directOrgs.length === 1) redirect(`/clients/${directOrgs[0].slug}`);
    if (managedGroups.length === 1) redirect(`/groups/${managedGroups[0].slug}`);
    // Teams don't have their own landing yet (Phase D2+). Fall through to /me
    // which lists contexts; keeps the user from hitting a 404 team route.
  }

  // 3. Superadmin fallback (no pinned context, not single-context).
  if (isAdmin) {
    redirect('/admin/dashboard');
  }

  // 4. Default: Mes espaces page (built in Task D2).
  redirect('/me');
}
