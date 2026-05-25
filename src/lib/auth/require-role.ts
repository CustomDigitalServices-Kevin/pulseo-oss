import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getEffectiveRole, type Role } from './effective-role';

export type { Role };

const ROLE_RANK: Record<Role, number> = { viewer: 1, gestionnaire: 2, admin: 3 };

export class RoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoleError';
  }
}

export function hasMinRole(userRole: Role, minRole: Role): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole];
}

async function isSuperadmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ s: users.is_superadmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return !!row?.s;
}

/**
 * Vérifie qu'un utilisateur a au moins le rôle effectif requis sur une org.
 * Superadmin court-circuite (accès global). Sinon, agrège les 3 sources
 * (direct membership, group manager, team grant) via getEffectiveRole.
 *
 * Throw RoleError si insuffisant. Remplace l'ancien requireRole (roles.ts
 * déprécié supprimé en H5).
 */
export async function requireEffectiveRole(
  userId: string,
  orgId: string,
  minRole: Role,
): Promise<{ role: Role; isSuperadmin: boolean }> {
  if (await isSuperadmin(userId)) {
    return { role: 'admin', isSuperadmin: true };
  }

  const role = await getEffectiveRole(userId, orgId);

  if (!role) {
    throw new RoleError('Acces non autorise a cette organisation');
  }

  if (!hasMinRole(role, minRole)) {
    throw new RoleError(
      `Role insuffisant : ${minRole} requis, vous etes ${role}`,
    );
  }

  return { role, isSuperadmin: false };
}

/**
 * Retourne le rôle effectif d'un user sur une org (ou null si aucun accès).
 * Version non-throw, intégrant les 3 sources via getEffectiveRole +
 * court-circuit superadmin. Remplace l'ancien getMemberRole (roles.ts).
 */
export async function getMemberRole(
  userId: string,
  orgId: string,
): Promise<{ role: Role; isSuperadmin: boolean } | null> {
  if (await isSuperadmin(userId)) {
    return { role: 'admin', isSuperadmin: true };
  }
  const role = await getEffectiveRole(userId, orgId);
  if (!role) return null;
  return { role, isSuperadmin: false };
}
