'use server';

import { db } from '@/lib/db';
import {
  organization_groups,
  organizations,
  organization_group_managers,
} from '@/lib/db/schema';
import { getSessionInfo } from '@/lib/auth/session';
import {
  createGroupSchema,
  updateGroupSchema,
  attachOrgSchema,
  addGroupManagerSchema,
  removeGroupManagerSchema,
} from '@/lib/validations/groups';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';

async function requireSuperadmin() {
  const session = await getSessionInfo();
  if (!session) throw new Error('Authentification requise');
  if (!session.isSuperadmin) throw new Error('Accès réservé superadmin');
  return session;
}

export async function createGroup(input: unknown) {
  await requireSuperadmin();
  const parsed = createGroupSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      'Données invalides : ' + parsed.error.issues.map((i) => i.message).join(', '),
    );
  }
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(organization_groups)
    .values({
      id,
      name: parsed.data.name,
      slug: parsed.data.slug,
      logo_url: parsed.data.logo_url ?? null,
    })
    .returning();
  logger.info('[GROUPS] created', { id: row.id, slug: row.slug });
  revalidatePath('/admin/groups');
  return row;
}

export async function updateGroup(input: unknown) {
  await requireSuperadmin();
  const parsed = updateGroupSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error('Données invalides');
  }
  const { id, ...patch } = parsed.data;
  if (Object.keys(patch).length === 0) return;
  await db
    .update(organization_groups)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(organization_groups.id, id));
  logger.info('[GROUPS] updated', { id });
  revalidatePath('/admin/groups');
  revalidatePath(`/admin/groups/${id}`);
}

export async function attachOrgToGroup(input: unknown) {
  await requireSuperadmin();
  const parsed = attachOrgSchema.safeParse(input);
  if (!parsed.success) throw new Error('Données invalides');
  await db
    .update(organizations)
    .set({ group_id: parsed.data.group_id, updated_at: new Date() })
    .where(eq(organizations.id, parsed.data.organization_id));
  logger.info('[GROUPS] org attached', {
    org: parsed.data.organization_id,
    group: parsed.data.group_id,
  });
  revalidatePath('/admin/groups');
  revalidatePath('/admin/clients');
}

export async function addGroupManager(input: unknown) {
  await requireSuperadmin();
  const parsed = addGroupManagerSchema.safeParse(input);
  if (!parsed.success) throw new Error('Données invalides');
  await db.insert(organization_group_managers).values({
    id: crypto.randomUUID(),
    group_id: parsed.data.group_id,
    user_id: parsed.data.user_id,
  });
  revalidatePath(`/admin/groups/${parsed.data.group_id}`);
}

export async function removeGroupManager(input: unknown) {
  await requireSuperadmin();
  const parsed = removeGroupManagerSchema.safeParse(input);
  if (!parsed.success) throw new Error('Données invalides');
  await db
    .delete(organization_group_managers)
    .where(
      and(
        eq(organization_group_managers.group_id, parsed.data.group_id),
        eq(organization_group_managers.user_id, parsed.data.user_id),
      ),
    );
  revalidatePath(`/admin/groups/${parsed.data.group_id}`);
}

/**
 * Supprime un groupe. Cascade :
 *  - `organizations.group_id` passe à NULL (orgs conservées, « détachées »)
 *  - `organization_group_managers` CASCADE (gestionnaires perdent leur rôle hérité)
 * Superadmin uniquement. Idempotent — renvoie `{ deleted: boolean }`.
 */
export async function deleteGroup(input: unknown) {
  await requireSuperadmin();
  const schema = z.object({ group_id: z.string().min(1) });
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error('Données invalides');

  const [existing] = await db
    .select({ id: organization_groups.id, slug: organization_groups.slug, name: organization_groups.name })
    .from(organization_groups)
    .where(eq(organization_groups.id, parsed.data.group_id))
    .limit(1);
  if (!existing) {
    return { deleted: false };
  }

  // Count orgs that will be detached for operator feedback / logs.
  const [{ orgsDetached }] = await db
    .select({ orgsDetached: sql<number>`COUNT(*)::int` })
    .from(organizations)
    .where(eq(organizations.group_id, parsed.data.group_id));

  await db.delete(organization_groups).where(eq(organization_groups.id, parsed.data.group_id));

  logger.info('[GROUPS] deleted', {
    id: existing.id,
    slug: existing.slug,
    name: existing.name,
    orgs_detached: orgsDetached,
  });
  revalidatePath('/admin/groups');
  revalidatePath('/admin/clients');
  return { deleted: true };
}
