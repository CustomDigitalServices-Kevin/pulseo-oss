'use server';

/**
 * Server action : vue synthétique "Projets" pour la page d'organisation.
 *
 * Consommée par `routes/org-projects-overview.tsx` (Server Component monté
 * dans `(portal)/clients/[slug]/page.tsx` via shim).
 *
 * ⚠ RBAC : utilise `hasProjectsAccess` (superadmin OU admin/gestionnaire org
 * OU team soustraitant avec grant). L'appelant UI dans `page.tsx` gate
 * actuellement avec `isGestionnaire` (admin/gestionnaire ORG uniquement),
 * donc les team soustraitants ne voient PAS ce bloc. Divergence volontaire :
 * le RBAC interne du module reste plus permissif pour rester réutilisable
 * depuis d'autres entry points.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getSessionInfo } from '@/lib/auth/session';
import { hasProjectsAccess } from '@/modules/projects/lib/permissions';
import { isProjectsEnabled } from '@/modules/projects/feature-flag';
import { logger } from '@/lib/logger';

export type OrgProjectsOverview = {
  kpis: {
    activeCount: number;
    latestDeliverables: number;
    recipePercent: number | null;
  };
  recentProjects: Array<{
    id: string;
    name: string;
    status: string;
    updatedAt: string;
    docsCount: number;
    deliverablesCount: number;
    testsPassed: number;
    testsTotal: number;
  }>;
};

type KpiRow = {
  active_count: number;
  latest_deliverables: number;
  recipe_percent: number | null;
};

type TopRow = {
  id: string;
  name: string;
  status: string;
  updated_at: Date | string;
  docs_count: number;
  deliverables_count: number;
  tests_passed: number;
  tests_total: number;
};

export async function getOrgProjectsOverview(
  orgId: string,
): Promise<OrgProjectsOverview | null> {
  if (!isProjectsEnabled()) return null;

  const session = await getSessionInfo();
  if (!session) return null;

  const ok = await hasProjectsAccess(session.userId, orgId);
  if (!ok) return null;

  try {
    const [kpiResult, topResult] = await Promise.all([
      db.execute(sql`
        SELECT
          (SELECT COUNT(*)::int FROM projects.proj_projects
            WHERE organization_id = ${orgId}
              AND deleted_at IS NULL
              AND status NOT IN ('valide', 'archive')) AS active_count,
          (SELECT COUNT(*)::int FROM projects.proj_deliverables d
             JOIN projects.proj_projects p ON p.id = d.project_id
            WHERE p.organization_id = ${orgId}
              AND p.deleted_at IS NULL
              AND d.deleted_at IS NULL
              AND d.is_latest = true
              AND d.virus_scan_status = 'clean') AS latest_deliverables,
          (SELECT
             CASE WHEN COUNT(*) = 0 THEN NULL
                  ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE t.status = 'ok') / COUNT(*))::int
             END
             FROM projects.proj_recipe_tests t
             JOIN projects.proj_projects p ON p.id = t.project_id
            WHERE p.organization_id = ${orgId} AND p.deleted_at IS NULL) AS recipe_percent
      `),
      db.execute(sql`
        SELECT p.id, p.name, p.status, p.updated_at,
          (SELECT COUNT(*)::int FROM projects.proj_documents d
            WHERE d.project_id = p.id AND d.deleted_at IS NULL) AS docs_count,
          (SELECT COUNT(*)::int FROM projects.proj_deliverables dl
            WHERE dl.project_id = p.id AND dl.is_latest = true AND dl.deleted_at IS NULL) AS deliverables_count,
          (SELECT COUNT(*) FILTER (WHERE t.status = 'ok')::int FROM projects.proj_recipe_tests t
            WHERE t.project_id = p.id) AS tests_passed,
          (SELECT COUNT(*)::int FROM projects.proj_recipe_tests t
            WHERE t.project_id = p.id) AS tests_total
        FROM projects.proj_projects p
        WHERE p.organization_id = ${orgId} AND p.deleted_at IS NULL
        ORDER BY p.updated_at DESC
        LIMIT 3
      `),
    ]);

    const kpiRows = (kpiResult as unknown as { rows: KpiRow[] }).rows;
    const k = kpiRows[0];
    if (!k) {
      logger.error('[projects/org-overview] empty KPI row', { orgId });
      return null;
    }

    const topRows = (topResult as unknown as { rows: TopRow[] }).rows;

    return {
      kpis: {
        activeCount: k.active_count,
        latestDeliverables: k.latest_deliverables,
        recipePercent: k.recipe_percent,
      },
      recentProjects: topRows.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        updatedAt: typeof r.updated_at === 'string' ? r.updated_at : r.updated_at.toISOString(),
        docsCount: r.docs_count,
        deliverablesCount: r.deliverables_count,
        testsPassed: r.tests_passed,
        testsTotal: r.tests_total,
      })),
    };
  } catch (err) {
    logger.error('[projects/org-overview] query failed', { err: String(err), orgId });
    return null;
  }
}
