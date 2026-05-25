import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, organization_members, organization_group_managers } from '@/lib/db/schema';
import { getEffectiveRole, type Role } from './effective-role';

const RANK: Record<Role, number> = { viewer: 1, gestionnaire: 2, admin: 3 };

async function isSuperadmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ s: users.is_superadmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return !!row?.s;
}

/**
 * Vérifie qu'un user peut accéder à une organisation (lecture a minima).
 * Superadmin passe toujours ; sinon, getEffectiveRole doit retourner un rôle.
 */
export async function canAccessOrg(userId: string, orgId: string): Promise<boolean> {
  if (await isSuperadmin(userId)) return true;
  return (await getEffectiveRole(userId, orgId)) !== null;
}

/**
 * Vérifie qu'un user peut accéder à un groupe d'organisations.
 * Superadmin ou gestionnaire explicite du groupe.
 */
export async function canAccessGroup(userId: string, groupId: string): Promise<boolean> {
  if (await isSuperadmin(userId)) return true;
  const [row] = await db
    .select({ id: organization_group_managers.id })
    .from(organization_group_managers)
    .where(and(
      eq(organization_group_managers.user_id, userId),
      eq(organization_group_managers.group_id, groupId),
    ))
    .limit(1);
  return !!row;
}

/**
 * Règles spec §3.3 :
 * 1. Rôle strictement inférieur (admin manage gest/viewer, gest manage viewer).
 * 5. Superadmin override : toujours.
 */
export async function canManageMember(
  actorId: string, targetId: string, orgId: string,
): Promise<boolean> {
  if (await isSuperadmin(actorId)) return true;
  const [actorRole, targetRole] = await Promise.all([
    getEffectiveRole(actorId, orgId),
    getEffectiveRole(targetId, orgId),
  ]);
  if (!actorRole || !targetRole) return false;
  return RANK[actorRole] > RANK[targetRole];
}

/**
 * Règles spec §3.3 :
 * 2. Anti-lockout : self-removal interdit (même superadmin).
 * 3. Dernier admin direct : bloque retrait si la cible est admin direct et qu'il n'en reste pas d'autre.
 * 4. Grants team ≠ gouvernance : admin hérité team ne compte pas pour règle 3.
 * 5. Superadmin override pour règle 1.
 */
export async function canRemoveMember(
  actorId: string, targetId: string, orgId: string,
): Promise<boolean> {
  if (actorId === targetId) return false; // règle 2

  const isActorSuper = await isSuperadmin(actorId);

  if (!isActorSuper) {
    if (!(await canManageMember(actorId, targetId, orgId))) return false;
  }

  // Règle 3 : si la cible est admin DIRECT, vérifier qu'il reste au moins 1 autre admin direct
  const [targetDirect] = await db
    .select({ role: organization_members.role })
    .from(organization_members)
    .where(and(
      eq(organization_members.user_id, targetId),
      eq(organization_members.organization_id, orgId),
    ))
    .limit(1);

  if (targetDirect?.role === 'admin') {
    const result = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM organization_members
       WHERE organization_id = ${orgId} AND role = 'admin' AND user_id != ${targetId}
    `);
    const rows = (result as unknown as { rows: Array<{ count: number }> }).rows;
    const count = rows[0]?.count ?? 0;
    if (count < 1) return false;
  }

  return true;
}
