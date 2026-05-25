import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getSessionInfo } from '@/lib/auth/session';
import { isProjectsEnabled } from '@/modules/projects/feature-flag';
import { readProjectFile } from '@/modules/projects/lib/storage';
import { writeProjectAuditLog } from '@/modules/projects/lib/audit';
import { logger } from '@/lib/logger';

/**
 * Handler GET `/api/projects/documents/[id]/download`.
 *
 * Pattern IDOR inline (cf spec §"Sécurité uploads" — pattern de référence) :
 * 1 seule query joint `proj_documents` + `proj_projects` + `hasProjectsAccess`
 * via `SELECT EXISTS`. Zéro row retournée = 403 (pas 404 pour éviter le
 * leak d'existence).
 *
 * Fail-closed P4c : virus_scan_status DOIT être 'clean'. Les rows P2
 * 'skipped' sont backfillées à 'clean' par la migration 0004. Nouvelles
 * uploads = 'pending' → worker scan-virus → 'clean'|'infected'.
 */
export async function handleDocumentDownload(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!isProjectsEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const session = await getSessionInfo();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { id } = await context.params;

  try {
    const result = await db.execute(sql`
      SELECT
        d.id AS doc_id,
        d.file_path,
        d.mime_type,
        d.original_name,
        d.size_bytes,
        d.virus_scan_status,
        p.organization_id
      FROM projects.proj_documents d
      JOIN projects.proj_projects p ON p.id = d.project_id
      WHERE d.id = ${id}
        AND d.deleted_at IS NULL
        AND p.deleted_at IS NULL
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
        doc_id: string;
        file_path: string;
        mime_type: string;
        original_name: string;
        size_bytes: number | string;
        virus_scan_status: string;
        organization_id: string;
      }>;
    }).rows;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const row = rows[0];

    const content = await readProjectFile(row.file_path);

    await writeProjectAuditLog({
      organizationId: row.organization_id,
      actorId: session.userId,
      eventType: 'document_downloaded',
      entityType: 'document',
      entityId: row.doc_id,
    });

    // Content-Disposition RFC 5987 pour noms non-ASCII.
    const encodedName = encodeURIComponent(row.original_name);
    return new NextResponse(new Uint8Array(content), {
      status: 200,
      headers: {
        'Content-Type': row.mime_type || 'application/octet-stream',
        'Content-Length': String(content.length),
        'Content-Disposition': `attachment; filename="${row.original_name.replace(/"/g, '')}"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    logger.error('[projects/api/download] failed', { err: String(err), id });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
