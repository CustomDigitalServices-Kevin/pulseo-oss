/**
 * Enqueue helper pour virus scan.
 *
 * Pattern : après INSERT d'un `proj_document` ou `proj_deliverable` avec
 * `virus_scan_status='pending'`, appeler `enqueueVirusScan(...)` pour créer
 * une row `proj_scan_jobs` + ajouter un job graphile-worker.
 *
 * Best-effort : l'enqueue ne doit JAMAIS faire échouer le flow upload.
 * Si graphile-worker est down, le job n'est pas créé mais la row reste
 * 'pending' → download 403 fail-closed. Le cron de recovery peut ré-enqueuer
 * les rows orphelines (non implémenté en P4c, ajouté en P4d+ si besoin).
 */
import { v4 as uuid } from 'uuid';
import { db } from '@/lib/db';
import { projScanJobs } from '@/modules/projects/schema/tables';
import { logger } from '@/lib/logger';

export type ScanEntityType = 'document' | 'deliverable';

/**
 * Crée le tracking row `proj_scan_jobs` + enqueue job graphile-worker.
 * Ne throw jamais — error → log uniquement.
 */
export async function enqueueVirusScan(opts: {
  entityType: ScanEntityType;
  entityId: string;
  filePath: string;
}): Promise<void> {
  const jobId = uuid();
  try {
    await db.insert(projScanJobs).values({
      id: jobId,
      entity_type: opts.entityType,
      entity_id: opts.entityId,
      file_path: opts.filePath,
      status: 'pending',
    });
  } catch (err) {
    logger.error('[projects/scan-enqueue] insert job row failed', {
      err: String(err), entityType: opts.entityType, entityId: opts.entityId,
    });
    return;
  }

  try {
    // Import dynamique pour éviter de charger graphile-worker si le module
    // n'est pas activé ou si on tourne dans un test unit (mock via vi.mock).
    const { addJobToQueue } = await import('@/modules/projects/workers/queue');
    await addJobToQueue('scan-virus', { scan_job_id: jobId });
  } catch (err) {
    logger.error('[projects/scan-enqueue] add_job failed (row still pending)', {
      err: String(err), jobId,
    });
    // Row reste pending → sera ré-enqueuée par un futur cron recovery
  }
}
