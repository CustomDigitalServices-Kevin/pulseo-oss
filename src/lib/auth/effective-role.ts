import { cache } from 'react';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export type Role = 'admin' | 'gestionnaire' | 'viewer';

const ROLE_RANK: Record<Role, number> = { admin: 3, gestionnaire: 2, viewer: 1 };

function highest(roles: Role[]): Role | null {
  if (roles.length === 0) return null;
  return roles.reduce<Role>(
    (best, r) => (ROLE_RANK[r] > ROLE_RANK[best] ? r : best),
    roles[0],
  );
}

/**
 * Rôle effectif d'un user sur une org, agrégeant 3 sources en 1 query SQL (CTE UNION ALL) :
 *   1. organization_members (rôle direct)
 *   2. organization_group_managers (gestionnaire hérité via groupe)
 *   3. team_organization_grants via team_members (rôle hérité via équipe)
 *
 * Retourne le rôle le plus fort (admin > gestionnaire > viewer), ou null si aucun accès.
 * Mémoïsé par requête HTTP via React.cache.
 * Superadmin est une couche distincte — court-circuité en amont dans les helpers canX.
 */
export const getEffectiveRole = cache(
  async (userId: string, orgId: string): Promise<Role | null> => {
    const result = await db.execute(sql`
      WITH sources AS (
        SELECT role FROM organization_members
         WHERE user_id = ${userId} AND organization_id = ${orgId}
        UNION ALL
        SELECT 'gestionnaire' AS role
          FROM organization_group_managers gm
          JOIN organizations o ON o.group_id = gm.group_id
         WHERE gm.user_id = ${userId} AND o.id = ${orgId}
        UNION ALL
        SELECT tog.role
          FROM team_organization_grants tog
          JOIN team_members tm ON tm.team_id = tog.team_id
         WHERE tm.user_id = ${userId} AND tog.organization_id = ${orgId}
      )
      SELECT role FROM sources
    `);

    const rows = (result as unknown as { rows: Array<{ role: string }> }).rows;
    const roles = rows.map((r) => r.role as Role);
    return highest(roles);
  },
);

/**
 * Entrée verbeuse de provenance d'un rôle pour un couple (user, org).
 * Utilisée dans le drawer détail membre (spec §6.4) pour expliquer pourquoi
 * un user a accès à une org : membership direct, gestion de groupe parent,
 * ou grant via une équipe dont il est membre.
 */
export type RoleSourceEntry =
  | { kind: 'direct'; role: Role; since: string }
  | { kind: 'group_manager'; groupId: string; groupName: string; since: string }
  | { kind: 'team_grant'; teamId: string; teamName: string; role: Role; since: string };

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return String(v);
}

/**
 * Liste l'ensemble des chemins qui accordent l'accès (userId → orgId).
 * Zéro entrée = aucun accès hors superadmin.
 * Ordre : direct → group_manager → team_grant, plus ancien en premier.
 */
export async function getRoleSources(
  userId: string,
  orgId: string,
): Promise<RoleSourceEntry[]> {
  const [directRes, groupRes, teamRes] = await Promise.all([
    db.execute(sql`
      SELECT role, created_at
        FROM organization_members
       WHERE user_id = ${userId} AND organization_id = ${orgId}
    `),
    db.execute(sql`
      SELECT og.id AS group_id, og.name AS group_name, gm.created_at
        FROM organization_group_managers gm
        JOIN organizations o ON o.group_id = gm.group_id
        JOIN organization_groups og ON og.id = gm.group_id
       WHERE gm.user_id = ${userId} AND o.id = ${orgId}
    `),
    db.execute(sql`
      SELECT t.id AS team_id, t.name AS team_name, tog.role, tog.created_at
        FROM team_organization_grants tog
        JOIN team_members tm ON tm.team_id = tog.team_id
        JOIN teams t ON t.id = tog.team_id
       WHERE tm.user_id = ${userId} AND tog.organization_id = ${orgId}
    `),
  ]);

  const direct = (directRes as unknown as {
    rows: Array<{ role: string; created_at: unknown }>;
  }).rows.map<RoleSourceEntry>((r) => ({
    kind: 'direct',
    role: r.role as Role,
    since: toIso(r.created_at),
  }));

  const group = (groupRes as unknown as {
    rows: Array<{ group_id: string; group_name: string; created_at: unknown }>;
  }).rows.map<RoleSourceEntry>((r) => ({
    kind: 'group_manager',
    groupId: r.group_id,
    groupName: r.group_name,
    since: toIso(r.created_at),
  }));

  const team = (teamRes as unknown as {
    rows: Array<{ team_id: string; team_name: string; role: string; created_at: unknown }>;
  }).rows.map<RoleSourceEntry>((r) => ({
    kind: 'team_grant',
    teamId: r.team_id,
    teamName: r.team_name,
    role: r.role as Role,
    since: toIso(r.created_at),
  }));

  return [...direct, ...group, ...team].sort((a, b) => a.since.localeCompare(b.since));
}
