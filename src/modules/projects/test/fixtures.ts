import { v4 as uuid } from 'uuid';
import { db, projectsSchema, coreSchema } from './db-test';
import type { NewProjProject } from '@/modules/projects/schema/tables';

export async function makeUser(overrides: Partial<typeof coreSchema.users.$inferInsert> = {}) {
  const id = overrides.id ?? uuid();
  const email = overrides.email ?? `${id}@test.local`;
  // ⚠ Drizzle attend les TS keys (camelCase). Le schema core utilise
  // `emailVerified` (TS) → `email_verified` (DB). Ne PAS écrire email_verified ici.
  const [u] = await db.insert(coreSchema.users).values({
    id, email, emailVerified: true, is_superadmin: false,
    ...overrides,
  }).returning();
  return u;
}

export async function makeOrg(overrides: Partial<typeof coreSchema.organizations.$inferInsert> = {}) {
  const id = overrides.id ?? uuid();
  const [o] = await db.insert(coreSchema.organizations).values({
    id, name: `Org ${id.slice(0, 8)}`, slug: `org-${id.slice(0, 8)}`,
    ...overrides,
  }).returning();
  return o;
}

export async function makeMembership(userId: string, orgId: string, role: 'admin' | 'gestionnaire' | 'viewer' = 'viewer') {
  await db.insert(coreSchema.organization_members).values({
    id: uuid(), user_id: userId, organization_id: orgId, role,
  });
}

export async function makeProject(overrides: Partial<NewProjProject> & { organization_id: string; created_by: string }) {
  const id = overrides.id ?? uuid();
  const [p] = await db.insert(projectsSchema.projProjects).values({
    id, name: 'Test project', type: 'dev', status: 'chiffrage',
    ...overrides,
  }).returning();
  return p;
}
