/**
 * Test fixtures — seed helpers réutilisables par les suites Phase B+.
 *
 * Ces helpers assument que le test file a mocké @/lib/db vers @/test/db-test :
 *
 *   vi.mock('@/lib/db', async () => {
 *     const mod = await import('@/test/db-test');
 *     const schema = await import('@/lib/db/schema');
 *     return { db: mod.db, schema };
 *   });
 *
 * Chaque fonction retourne les IDs générés pour chaînage.
 * IDs sont des UUIDs (varchar(36)).
 */
import { db } from './db-test';
import {
  users, organizations, organization_members, organization_groups,
  organization_group_managers, teams, team_members, team_organization_grants,
} from '@/lib/db/schema';
import type { Role } from '@/lib/auth/effective-role';

export async function makeUser(
  superadmin = false,
  email?: string,
  name?: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: email ?? `${id}@test.io`,
    name: name ?? null,
    emailVerified: true,
    is_superadmin: superadmin,
  });
  return id;
}

export async function makeOrg(groupId: string | null = null): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(organizations).values({ id, name: `Org ${id}`, slug: id, group_id: groupId });
  return id;
}

export async function addMember(userId: string, orgId: string, role: Role): Promise<void> {
  await db.insert(organization_members).values({
    id: crypto.randomUUID(), organization_id: orgId, user_id: userId, role,
  });
}

export async function makeGroup(name?: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(organization_groups).values({
    id,
    name: name ?? `Group ${id}`,
    slug: id,
  });
  return id;
}

export async function addGroupManager(userId: string, groupId: string): Promise<void> {
  await db.insert(organization_group_managers).values({
    id: crypto.randomUUID(), group_id: groupId, user_id: userId,
  });
}

export async function makeTeam(createdBy: string, name?: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(teams).values({
    id,
    name: name ?? `Team ${id}`,
    slug: id,
    created_by_user_id: createdBy,
  });
  return id;
}

export async function addTeamMember(userId: string, teamId: string): Promise<void> {
  await db.insert(team_members).values({
    id: crypto.randomUUID(), team_id: teamId, user_id: userId,
  });
}

export async function addTeamGrant(
  teamId: string, orgId: string, role: Role, grantedBy: string,
): Promise<void> {
  await db.insert(team_organization_grants).values({
    id: crypto.randomUUID(), team_id: teamId, organization_id: orgId, role, granted_by_user_id: grantedBy,
  });
}
