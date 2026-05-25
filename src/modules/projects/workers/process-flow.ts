/**
 * Job graphile-worker process-flow — extrait + parse un deliverable Flow
 * Power Automate + écrit manifest JSON sur disque.
 *
 * Payload : `{ preview_job_id: string }`
 *
 * Flow :
 *  1. Lire row `proj_preview_jobs` par id
 *  2. Lire row `proj_deliverables` (parent)
 *  3. Check kind='file' + virus_scan_status='clean' (fail-closed)
 *  4. processFlowZip(file_path)
 *  5. Écrire manifest dans `<STORAGE>/projects/<org>/<proj>/manifests/<deliverable_id>.json`
 *  6. UPDATE proj_deliverables.preview_status='ready' + preview_manifest_path
 *  7. UPDATE proj_preview_jobs.status='ready'
 *  Sur erreur : status='failed' + last_error, graphile-worker retry (default 3×)
 */
import { eq } from 'drizzle-orm';
import { promises as fs } from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import {
  projPreviewJobs,
  projDeliverables,
  projProjects,
} from '@/modules/projects/schema/tables';
import { processFlowZip } from '@/modules/projects/lib/preview/flow';
import { logger } from '@/lib/logger';

interface Payload {
  preview_job_id: string;
}

const STORAGE_ROOT = process.env.STORAGE_PATH || '/opt/pulseo-storage';

export async function processFlowHandler(rawPayload: unknown): Promise<void> {
  const payload = rawPayload as Payload;
  if (!payload?.preview_job_id) {
    logger.error('[process-flow] missing preview_job_id');
    return;
  }

  const [job] = await db
    .select()
    .from(projPreviewJobs)
    .where(eq(projPreviewJobs.id, payload.preview_job_id));
  if (!job) {
    logger.error('[process-flow] preview_job row not found', {
      jobId: payload.preview_job_id,
    });
    return;
  }
  if (job.status !== 'pending' && job.status !== 'running') {
    return; // idempotent
  }

  await db
    .update(projPreviewJobs)
    .set({ status: 'running', attempts: job.attempts + 1, updated_at: new Date() })
    .where(eq(projPreviewJobs.id, job.id));

  // Charge deliverable + project pour chemin manifest
  const [row] = await db
    .select({
      id: projDeliverables.id,
      project_id: projDeliverables.project_id,
      kind: projDeliverables.kind,
      virus_scan_status: projDeliverables.virus_scan_status,
      file_path: projDeliverables.file_path,
      size_bytes: projDeliverables.size_bytes,
      org_id: projProjects.organization_id,
    })
    .from(projDeliverables)
    .innerJoin(projProjects, eq(projProjects.id, projDeliverables.project_id))
    .where(eq(projDeliverables.id, job.deliverable_id));
  if (!row) {
    await markFailed(job.id, 'deliverable_not_found');
    return;
  }

  if (row.kind !== 'file' || !row.file_path) {
    await markFailed(job.id, 'invalid_kind');
    return;
  }

  // Fail-closed : ne jamais processer un fichier non-scanné ou infected
  if (row.virus_scan_status !== 'clean') {
    await markFailed(job.id, `unsafe_scan_status: ${row.virus_scan_status}`);
    return;
  }

  let manifest;
  try {
    manifest = await processFlowZip({
      zipPath: row.file_path,
      zipSizeBytes: Number(row.size_bytes) || 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markFailed(job.id, `parse_error: ${msg}`);
    await db
      .update(projDeliverables)
      .set({ preview_status: 'failed' })
      .where(eq(projDeliverables.id, row.id));
    throw err; // graphile retry
  }

  // Écris manifest sur disque
  const manifestDir = path.join(
    STORAGE_ROOT, 'projects', row.org_id, row.project_id, 'manifests',
  );
  await fs.mkdir(manifestDir, { recursive: true, mode: 0o750 });
  const manifestPath = path.join(manifestDir, `${row.id}.json`);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o640 });

  // Update deliverable + job
  await db
    .update(projDeliverables)
    .set({
      preview_status: 'ready',
      preview_manifest_path: manifestPath,
    })
    .where(eq(projDeliverables.id, row.id));
  await db
    .update(projPreviewJobs)
    .set({ status: 'ready', updated_at: new Date() })
    .where(eq(projPreviewJobs.id, job.id));

  logger.info('[process-flow] OK', {
    deliverableId: row.id,
    nodes: manifest.nodes.length,
    edges: manifest.edges.length,
  });
}

async function markFailed(jobId: string, reason: string): Promise<void> {
  await db
    .update(projPreviewJobs)
    .set({ status: 'failed', last_error: reason, updated_at: new Date() })
    .where(eq(projPreviewJobs.id, jobId));
}
