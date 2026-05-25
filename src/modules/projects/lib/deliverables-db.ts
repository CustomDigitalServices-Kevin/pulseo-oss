/**
 * Helpers DB internes pour deliverables — appelés par actions/deliverables.ts
 * ET par l'API route streaming (upload). Pas un fichier `'use server'` pour
 * permettre l'export d'un helper non-Server-Action.
 *
 * Gotcha capturé P4a : Next.js 16 rejette tout export non-async dans un
 * fichier `'use server'`. L'helper `insertDeliverableWithVersioning` est
 * appelé en interne (pas via form action) — il vit ici.
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projDeliverables, projProjects } from '@/modules/projects/schema/tables';
import { writeProjectAuditLog } from '@/modules/projects/lib/audit';
import { enqueueVirusScan } from '@/modules/projects/lib/scan-enqueue';
import { enqueuePreviewJob } from '@/modules/projects/lib/preview-enqueue';
import { isLikelyFlowZip } from '@/modules/projects/lib/preview/flow';
import { isLikelyMsappZip } from '@/modules/projects/lib/preview/msapp';
import { isLikelySolutionZip } from '@/modules/projects/lib/preview/solution';
import { isLikelyPbixZip } from '@/modules/projects/lib/preview/pbix';
import {
  isFlowPreviewEnabled,
  isMsappPreviewEnabled,
  isSolutionPreviewEnabled,
  isPbixPreviewEnabled,
} from '@/modules/projects/feature-flag';

/**
 * Insert atomique d'une nouvelle version deliverable avec gestion is_latest.
 *
 * Si `markAsLatest=true` :
 *   UPDATE is_latest=false sur les latest existants kind='file' non supprimés
 *   INSERT is_latest=true
 *
 * Le tout en une transaction. L'UNIQUE partial index `proj_deliverables_latest_file_idx`
 * bloque les violations concurrentes (23505) — caller doit retry ou remonter
 * une erreur user.
 */
export async function insertDeliverableWithVersioning(opts: {
  id: string;
  projectId: string;
  organizationId: string;
  userId: string;
  version: string;
  filePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  markAsLatest: boolean;
}): Promise<void> {
  await db.transaction(async (tx) => {
    if (opts.markAsLatest) {
      await tx
        .update(projDeliverables)
        .set({ is_latest: false })
        .where(
          and(
            eq(projDeliverables.project_id, opts.projectId),
            eq(projDeliverables.kind, 'file'),
            eq(projDeliverables.is_latest, true),
            isNull(projDeliverables.deleted_at),
          ),
        );
    }
    await tx.insert(projDeliverables).values({
      id: opts.id,
      project_id: opts.projectId,
      kind: 'file',
      version: opts.version,
      is_latest: opts.markAsLatest,
      file_path: opts.filePath,
      original_name: opts.originalName,
      mime_type: opts.mimeType,
      size_bytes: opts.sizeBytes,
      // P4c : 'pending' par défaut. Worker scan-virus passe à 'clean' ou
      // 'infected'. Download route fail-closed n'accepte que 'clean'.
      virus_scan_status: 'pending',
      uploaded_by: opts.userId,
    });
  });

  // Enqueue virus scan — best-effort, ne throw jamais (voir scan-enqueue.ts)
  await enqueueVirusScan({
    entityType: 'deliverable',
    entityId: opts.id,
    filePath: opts.filePath,
  });

  // P5 : enqueue preview si ZIP détecté comme Power Automate flow.
  // Best-effort — le worker check fail-closed virus_scan_status='clean' avant de parser.
  if (isFlowPreviewEnabled() && /\.zip$/i.test(opts.originalName)) {
    try {
      const likely = await isLikelyFlowZip(opts.filePath, opts.sizeBytes);
      if (likely) {
        await enqueuePreviewJob({ deliverableId: opts.id, task: 'process-flow' });
      }
    } catch {
      // best-effort — si detection échoue, skip preview (deliverable reste sans preview_status)
    }
  }
  // P6 : MSAPP preview (power apps canvas) — .msapp ou ZIP avec CanvasManifest
  if (isMsappPreviewEnabled() && /\.(msapp|zip)$/i.test(opts.originalName)) {
    try {
      const likely = await isLikelyMsappZip(opts.filePath, opts.sizeBytes);
      if (likely) {
        await enqueuePreviewJob({ deliverableId: opts.id, task: 'process-msapp' });
      }
    } catch {
      // best-effort
    }
  }
  // P8 : Solution Dataverse preview — ZIP avec solution.xml/customizations.xml
  if (isSolutionPreviewEnabled() && /\.zip$/i.test(opts.originalName)) {
    try {
      const likely = await isLikelySolutionZip(opts.filePath, opts.sizeBytes);
      if (likely) {
        await enqueuePreviewJob({ deliverableId: opts.id, task: 'process-solution' });
      }
    } catch {
      // best-effort
    }
  }
  // P7 : PBIX preview Power BI — .pbix uniquement (pas de confusion avec autre format)
  if (isPbixPreviewEnabled() && /\.pbix$/i.test(opts.originalName)) {
    try {
      const likely = await isLikelyPbixZip(opts.filePath, opts.sizeBytes);
      if (likely) {
        await enqueuePreviewJob({ deliverableId: opts.id, task: 'process-pbix' });
      }
    } catch {
      // best-effort
    }
  }

  await writeProjectAuditLog({
    organizationId: opts.organizationId,
    actorId: opts.userId,
    eventType: 'deliverable_uploaded',
    entityType: 'deliverable',
    entityId: opts.id,
    metadata: {
      project_id: opts.projectId,
      version: opts.version,
      size_bytes: opts.sizeBytes,
      original_name: opts.originalName,
      is_latest: opts.markAsLatest,
    },
  });
}

/**
 * Promote une version existante en latest (transaction atomique).
 * UPDATE tous les current latest → false, puis UPDATE cible → true.
 */
export async function promoteVersionInTx(deliverableId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        project_id: projDeliverables.project_id,
        kind: projDeliverables.kind,
      })
      .from(projDeliverables)
      .where(eq(projDeliverables.id, deliverableId));
    if (!target || target.kind !== 'file') return;

    await tx
      .update(projDeliverables)
      .set({ is_latest: false })
      .where(
        and(
          eq(projDeliverables.project_id, target.project_id),
          eq(projDeliverables.kind, 'file'),
          eq(projDeliverables.is_latest, true),
          isNull(projDeliverables.deleted_at),
        ),
      );
    await tx
      .update(projDeliverables)
      .set({ is_latest: true })
      .where(eq(projDeliverables.id, deliverableId));
  });
}

/**
 * Soft-delete un deliverable en transaction. Si la row est latest=true,
 * promote le file suivant le plus récent (non supprimé) en latest.
 */
export async function softDeleteDeliverableInTx(opts: {
  deliverableId: string;
  projectId: string;
  wasLatest: boolean;
  kind: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(projDeliverables)
      .set({ deleted_at: new Date(), is_latest: false })
      .where(eq(projDeliverables.id, opts.deliverableId));

    if (opts.wasLatest && opts.kind === 'file') {
      const [next] = await tx
        .select({ id: projDeliverables.id })
        .from(projDeliverables)
        .where(
          and(
            eq(projDeliverables.project_id, opts.projectId),
            eq(projDeliverables.kind, 'file'),
            isNull(projDeliverables.deleted_at),
          ),
        )
        .orderBy(desc(projDeliverables.uploaded_at))
        .limit(1);
      if (next) {
        await tx
          .update(projDeliverables)
          .set({ is_latest: true })
          .where(eq(projDeliverables.id, next.id));
      }
    }
  });
}

/**
 * Charge un deliverable + org via projet parent, single query, avec IDOR
 * fields nécessaires pour les Server Actions mutatrices.
 */
export async function loadDeliverableWithOrg(deliverableId: string): Promise<
  {
    id: string;
    project_id: string;
    kind: string;
    version: string;
    is_latest: boolean;
    deleted_at: Date | null;
    project_org_id: string;
  } | null
> {
  const [row] = await db
    .select({
      id: projDeliverables.id,
      project_id: projDeliverables.project_id,
      kind: projDeliverables.kind,
      version: projDeliverables.version,
      is_latest: projDeliverables.is_latest,
      deleted_at: projDeliverables.deleted_at,
      project_org_id: projProjects.organization_id,
    })
    .from(projDeliverables)
    .innerJoin(projProjects, eq(projProjects.id, projDeliverables.project_id))
    .where(eq(projDeliverables.id, deliverableId));
  return row ?? null;
}
