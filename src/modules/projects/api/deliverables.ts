import { NextResponse, type NextRequest } from 'next/server';
import { Readable } from 'stream';
import { v4 as uuid } from 'uuid';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getSessionInfo } from '@/lib/auth/session';
import { isProjectsEnabled } from '@/modules/projects/feature-flag';
import { getStorageAdapter } from '@/modules/projects/lib/storage-adapter';
import { writeProjectAuditLog } from '@/modules/projects/lib/audit';
import { insertDeliverableWithVersioning } from '@/modules/projects/lib/deliverables-db';
import {
  uploadDeliverableMetaSchema,
  DELIVERABLE_ALLOWED_MIMES,
  DELIVERABLE_SIZE_LIMITS,
  categorizeDeliverable,
} from '@/modules/projects/lib/validations/deliverables';
import { hasProjectsAccess } from '@/modules/projects/lib/permissions';
import { projProjects } from '@/modules/projects/schema/tables';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * POST /api/projects/deliverables/upload
 *
 * Upload streaming — pipe req.body → LocalDiskAdapter sans buffer mémoire.
 * Permet PBIX 200MB / Solution 500MB sans bloquer le process Node.
 *
 * Gotcha: Server Action bodySizeLimit ~5MB. API route n'a pas de limite par
 * défaut mais le reverse proxy front doit avoir `client_max_body_size` >=
 * plus gros livrable (500M typique).
 *
 * Metadata via query params (pas headers custom — simplicité CORS) :
 *   ?projectId=<uuid>&version=<N.N>&originalName=<encoded>&mimeType=<mime>&markAsLatest=<bool>
 * Body = bytes bruts du fichier.
 */
export async function handleDeliverableUpload(req: NextRequest): Promise<NextResponse> {
  if (!isProjectsEnabled()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const session = await getSessionInfo();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Metadata dans query params
  const url = new URL(req.url);
  const metaParsed = uploadDeliverableMetaSchema.safeParse({
    projectId: url.searchParams.get('projectId') ?? '',
    version: url.searchParams.get('version') ?? '',
    originalName: url.searchParams.get('originalName') ?? '',
    mimeType: url.searchParams.get('mimeType') ?? '',
    markAsLatest: url.searchParams.get('markAsLatest') !== 'false',
  });
  if (!metaParsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const meta = metaParsed.data;

  if (!DELIVERABLE_ALLOWED_MIMES.has(meta.mimeType)) {
    return NextResponse.json({ error: 'mime_not_allowed' }, { status: 400 });
  }

  // Charge projet + IDOR
  const [project] = await db
    .select({
      id: projProjects.id,
      organization_id: projProjects.organization_id,
      deleted_at: projProjects.deleted_at,
    })
    .from(projProjects)
    .where(eq(projProjects.id, meta.projectId));
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (project.deleted_at) return NextResponse.json({ error: 'project_deleted' }, { status: 404 });

  const ok = await hasProjectsAccess(session.userId, project.organization_id);
  if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (!req.body) {
    return NextResponse.json({ error: 'empty_body' }, { status: 400 });
  }

  // Taille max selon extension (prime) + mime
  const category = categorizeDeliverable(meta.originalName, meta.mimeType);
  const maxBytes = DELIVERABLE_SIZE_LIMITS[category];

  // Convertit ReadableStream (Web API) → Node.js Readable stream.
  // Le cast via `never` est nécessaire car les types Web/Node sont
  // structurellement compatibles mais pas déclarés identiques.
  const nodeStream = Readable.fromWeb(req.body as never);

  const adapter = getStorageAdapter();
  let uploaded: { key: string; sizeBytes: number };
  try {
    uploaded = await adapter.upload({
      organizationId: project.organization_id,
      projectId: project.id,
      scope: 'deliverables',
      originalName: meta.originalName,
      stream: nodeStream,
      maxBytes,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'file_too_large') {
      return NextResponse.json(
        { error: 'file_too_large', maxBytes, category },
        { status: 413 },
      );
    }
    if (msg === 'empty_file') {
      return NextResponse.json({ error: 'empty_file' }, { status: 400 });
    }
    logger.error('[projects/api/deliverables/upload] storage failed', { err: msg });
    return NextResponse.json({ error: 'storage_error' }, { status: 500 });
  }

  const id = uuid();
  try {
    await insertDeliverableWithVersioning({
      id,
      projectId: project.id,
      organizationId: project.organization_id,
      userId: session.userId,
      version: meta.version,
      filePath: uploaded.key,
      originalName: meta.originalName,
      mimeType: meta.mimeType,
      sizeBytes: uploaded.sizeBytes,
      markAsLatest: meta.markAsLatest ?? true,
    });
  } catch (err) {
    // Rollback fichier si DB insert fail — évite orphelin disque
    await adapter.delete(uploaded.key).catch(() => undefined);
    const msg = err instanceof Error ? err.message : String(err);
    // UNIQUE partial index violation (course race) → caller retry
    if (msg.includes('unique') || msg.includes('23505')) {
      return NextResponse.json({ error: 'concurrent_upload' }, { status: 409 });
    }
    logger.error('[projects/api/deliverables/upload] db insert failed', { err: msg });
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json(
    {
      id,
      version: meta.version,
      sizeBytes: uploaded.sizeBytes,
      isLatest: meta.markAsLatest ?? true,
    },
    { status: 201 },
  );
}

/**
 * GET /api/projects/deliverables/[id]/download
 *
 * Download streaming avec IDOR inline + fail-closed virus scan.
 *
 * Fail-closed P4c : virus_scan_status DOIT être 'clean'. 'pending' ou
 * 'infected' ou 'error' → 403. La migration 0004 backfille 'skipped' → 'clean'
 * pour les rows pré-P4c.
 *
 * Gotcha : l'IDOR est fait en 1 seule query SQL (jointure + EXISTS superadmin
 * OR org role OR team grant). Zéro row → 403 (pas 404 pour pas leak existence).
 */
export async function handleDeliverableDownload(
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
        d.file_path,
        d.mime_type,
        d.original_name,
        d.size_bytes,
        d.virus_scan_status,
        d.kind,
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
        file_path: string;
        mime_type: string;
        original_name: string;
        size_bytes: number | string;
        virus_scan_status: string;
        kind: string;
        organization_id: string;
      }>;
    }).rows;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const row = rows[0];

    if (!row.file_path) {
      return NextResponse.json({ error: 'no_file' }, { status: 404 });
    }

    const adapter = getStorageAdapter();
    const stream = await adapter.download(row.file_path);

    await writeProjectAuditLog({
      organizationId: row.organization_id,
      actorId: session.userId,
      eventType: 'deliverable_downloaded',
      entityType: 'deliverable',
      entityId: row.deliverable_id,
    });

    const encodedName = encodeURIComponent(row.original_name);
    const cleanName = row.original_name.replace(/"/g, '');
    const size = typeof row.size_bytes === 'string' ? row.size_bytes : String(row.size_bytes);

    // Réponse streaming : convertit Node Readable → Web ReadableStream
    // pour NextResponse body.
    const webStream = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': row.mime_type || 'application/octet-stream',
        'Content-Length': size,
        'Content-Disposition': `attachment; filename="${cleanName}"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    logger.error('[projects/api/deliverables/download] failed', { err: String(err), id });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
