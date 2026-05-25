/**
 * Job handler graphile-worker : scan virus via clamd INSTREAM.
 *
 * Payload : `{ scan_job_id: string }`
 *
 * Flow :
 *  1. Lire `proj_scan_jobs` row par id
 *  2. Open stream du fichier via StorageAdapter (anti-traversal built-in)
 *  3. Call clamav.scanStream()
 *  4. UPDATE `proj_scan_jobs` status + `proj_documents|proj_deliverables`.virus_scan_status
 *  5. Si infected : move fichier en quarantaine + audit log
 *  6. Retry graphile-worker (3x default) sur error
 */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  projScanJobs,
  projDocuments,
  projDeliverables,
} from '@/modules/projects/schema/tables';
import { scanStream } from '@/modules/projects/lib/clamav';
import { getStorageAdapter } from '@/modules/projects/lib/storage-adapter';
import { writeProjectAuditLog } from '@/modules/projects/lib/audit';
import { logger } from '@/lib/logger';
import { promises as fs } from 'fs';
import path from 'path';

interface Payload {
  scan_job_id: string;
}

const QUARANTINE_DIR = path.join(
  process.env.STORAGE_PATH || '/opt/pulseo-storage',
  'quarantine',
);

export async function scanVirusHandler(rawPayload: unknown): Promise<void> {
  const payload = rawPayload as Payload;
  if (!payload?.scan_job_id) {
    logger.error('[scan-virus] missing scan_job_id');
    return;
  }

  const [job] = await db
    .select()
    .from(projScanJobs)
    .where(eq(projScanJobs.id, payload.scan_job_id));
  if (!job) {
    logger.error('[scan-virus] scan_job row not found', { jobId: payload.scan_job_id });
    return;
  }
  if (job.status !== 'pending' && job.status !== 'running') {
    // Déjà terminé — idempotence
    return;
  }

  // Marque running
  await db
    .update(projScanJobs)
    .set({ status: 'running', attempts: job.attempts + 1, updated_at: new Date() })
    .where(eq(projScanJobs.id, job.id));

  const adapter = getStorageAdapter();
  let stream;
  try {
    stream = await adapter.download(job.file_path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markError(job.id, `open_stream: ${msg}`);
    throw err; // graphile-worker retry
  }

  const result = await scanStream(stream);

  if (result.status === 'clean') {
    // Pas besoin de tx : l'atomicité entre job + entity n'est pas critique.
    // Ordre : entity d'abord (priorité download), puis job status.
    await updateEntityStatus(job.entity_type, job.entity_id, 'clean');
    await db
      .update(projScanJobs)
      .set({ status: 'clean', scanned_at: new Date(), updated_at: new Date() })
      .where(eq(projScanJobs.id, job.id));
    return;
  }

  if (result.status === 'infected') {
    // Move fichier en quarantaine
    await fs.mkdir(QUARANTINE_DIR, { recursive: true, mode: 0o700 });
    const quarantinePath = path.join(QUARANTINE_DIR, `${job.id}_${path.basename(job.file_path)}`);
    try {
      await fs.rename(job.file_path, quarantinePath);
    } catch (err) {
      logger.error('[scan-virus] quarantine rename failed', {
        err: String(err), src: job.file_path, dest: quarantinePath,
      });
    }

    // Entity d'abord (bloquer download immédiatement), puis job status.
    await updateEntityStatus(job.entity_type, job.entity_id, 'infected');
    await db
      .update(projScanJobs)
      .set({
        status: 'infected',
        signature: result.signature,
        scanned_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(projScanJobs.id, job.id));

    // Audit log — obligatoire par spec §"Audit logging"
    const orgId = await lookupEntityOrgId(job.entity_type, job.entity_id);
    await writeProjectAuditLog({
      organizationId: orgId || 'unknown',
      actorId: null, // system
      eventType: 'virus_scan_infected_detected',
      entityType: job.entity_type === 'document' ? 'document' : 'deliverable',
      entityId: job.entity_id,
      metadata: { signature: result.signature, original_path: job.file_path },
    });

    logger.error('[scan-virus] INFECTED', {
      entityType: job.entity_type, entityId: job.entity_id, signature: result.signature,
    });
    return;
  }

  // error path
  await markError(job.id, result.reason);
  throw new Error(`scan_error: ${result.reason}`); // graphile-worker retry
}

async function markError(jobId: string, reason: string): Promise<void> {
  await db
    .update(projScanJobs)
    .set({ status: 'error', last_error: reason, updated_at: new Date() })
    .where(eq(projScanJobs.id, jobId));
}

async function updateEntityStatus(
  entityType: string,
  entityId: string,
  status: 'clean' | 'infected',
): Promise<void> {
  if (entityType === 'document') {
    await db
      .update(projDocuments)
      .set({ virus_scan_status: status })
      .where(eq(projDocuments.id, entityId));
  } else if (entityType === 'deliverable') {
    await db
      .update(projDeliverables)
      .set({ virus_scan_status: status })
      .where(eq(projDeliverables.id, entityId));
  }
}

async function lookupEntityOrgId(entityType: string, entityId: string): Promise<string | null> {
  try {
    if (entityType === 'document') {
      const { projProjects } = await import('@/modules/projects/schema/tables');
      const [row] = await db
        .select({ org_id: projProjects.organization_id })
        .from(projDocuments)
        .innerJoin(projProjects, eq(projProjects.id, projDocuments.project_id))
        .where(eq(projDocuments.id, entityId));
      return row?.org_id ?? null;
    }
    if (entityType === 'deliverable') {
      const { projProjects } = await import('@/modules/projects/schema/tables');
      const [row] = await db
        .select({ org_id: projProjects.organization_id })
        .from(projDeliverables)
        .innerJoin(projProjects, eq(projProjects.id, projDeliverables.project_id))
        .where(eq(projDeliverables.id, entityId));
      return row?.org_id ?? null;
    }
  } catch (err) {
    logger.error('[scan-virus] lookupEntityOrgId failed', { err: String(err) });
  }
  return null;
}
