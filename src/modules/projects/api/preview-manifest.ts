import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { promises as fs } from 'fs';
import { db } from '@/lib/db';
import { getSessionInfo } from '@/lib/auth/session';
import { isProjectsEnabled } from '@/modules/projects/feature-flag';
import { writeProjectAuditLog } from '@/modules/projects/lib/audit';
import { logger } from '@/lib/logger';
import path from 'path';

/**
 * GET /api/projects/deliverables/[id]/preview-manifest
 *
 * Sert le manifest JSON d'un deliverable (Flow/MSAPP/PBIX/Solution). Mêmes
 * guards IDOR + fail-closed que le download. L'appelant (client preview) doit
 * avoir le droit de voir le deliverable pour lire son manifest.
 *
 * Le manifest est un petit JSON (~kb) qui décrit la structure à rendre côté
 * client. Il ne contient pas de secrets (la spec §"Audit logging" impose que
 * les tokens/secrets ne soient jamais dans les manifests).
 */
export async function handlePreviewManifest(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!isProjectsEnabled()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const session = await getSessionInfo();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { id } = await context.params;
  try {
    const result = await db.execute(sql`
      SELECT
        d.id AS deliverable_id,
        d.preview_status,
        d.preview_manifest_path,
        d.virus_scan_status,
        p.organization_id
      FROM projects.proj_deliverables d
      JOIN projects.proj_projects p ON p.id = d.project_id
      WHERE d.id = ${id}
        AND d.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND d.kind = 'file'
        AND d.virus_scan_status = 'clean'
        AND EXISTS (
          SELECT 1 FROM "public"."users"
           WHERE id = ${session.userId} AND is_superadmin = true
          UNION ALL
          SELECT 1 FROM "public"."organization_members" om
           WHERE om.user_id = ${session.userId}
             AND om.organization_id = p.organization_id
             AND om.role IN ('gestionnaire', 'admin')
          UNION ALL
          SELECT 1 FROM "public"."team_members" tm
           JOIN "public"."team_organization_grants" tog ON tog.team_id = tm.team_id
           WHERE tm.user_id = ${session.userId}
             AND tog.organization_id = p.organization_id
        )
    `);

    const rows = (result as unknown as {
      rows: Array<{
        deliverable_id: string;
        preview_status: string | null;
        preview_manifest_path: string | null;
        organization_id: string;
      }>;
    }).rows;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const row = rows[0];

    if (row.preview_status !== 'ready' || !row.preview_manifest_path) {
      return NextResponse.json(
        { error: 'preview_not_ready', status: row.preview_status ?? 'none' },
        { status: 409 },
      );
    }

    // Garde anti-traversal : manifest doit vivre sous STORAGE_PATH
    const storageRoot = path.resolve(process.env.STORAGE_PATH || '/opt/pulseo-storage');
    const normalized = path.resolve(row.preview_manifest_path);
    if (!normalized.startsWith(storageRoot + path.sep)) {
      logger.error('[projects/preview-manifest] path traversal attempt', { path: row.preview_manifest_path });
      return NextResponse.json({ error: 'invalid_manifest' }, { status: 500 });
    }

    const content = await fs.readFile(normalized, 'utf8');

    await writeProjectAuditLog({
      organizationId: row.organization_id,
      actorId: session.userId,
      eventType: 'deliverable_preview_viewed',
      entityType: 'deliverable',
      entityId: row.deliverable_id,
    });

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    logger.error('[projects/preview-manifest] failed', { err: String(err), id });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
