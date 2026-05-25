/**
 * RBAC helper local au module Projets.
 *
 * CONTRAINTE : lit les tables core en READ-ONLY uniquement. N'étend pas
 * `effectiveRoleFor` du core — duplication volontaire pour cloisonnement.
 *
 * Voir spec §"Scope RBAC" et §"IDOR sur download" pour le pattern
 * join-based à répliquer dans les Server Actions / API routes.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Retourne true si `userId` a accès au module Projets pour `orgId`.
 *
 * 3 chemins OR :
 *  1. superadmin plateforme (users.is_superadmin=true)
 *  2. membre direct de l'org avec role >= gestionnaire
 *  3. team member avec grant sur l'org (sous-traitant)
 *
 * Pour les LIST queries, ne pas appeler ce helper row par row —
 * inliner le EXISTS dans la requête de listage (cf spec pattern IDOR).
 */
export async function hasProjectsAccess(userId: string, orgId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM "public"."users"
       WHERE id = ${userId} AND is_superadmin = true
      UNION ALL
      SELECT 1 FROM "public"."organization_members" om
       WHERE om.user_id = ${userId}
         AND om.organization_id = ${orgId}
         AND om.role IN ('gestionnaire', 'admin')
      UNION ALL
      SELECT 1 FROM "public"."team_members" tm
       JOIN "public"."team_organization_grants" tog ON tog.team_id = tm.team_id
       WHERE tm.user_id = ${userId}
         AND tog.organization_id = ${orgId}
    ) AS has_access
  `);
  const row = (result as unknown as { rows: Array<{ has_access: boolean }> }).rows[0];
  return row?.has_access === true;
}
