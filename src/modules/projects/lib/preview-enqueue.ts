/**
 * Enqueue helper pour preview jobs (P5+).
 *
 * Pattern similaire à scan-enqueue : crée une row `proj_preview_jobs` +
 * ajoute un job graphile-worker avec le nom de task approprié.
 *
 * Best-effort : si graphile-worker ou DB fail, log et retourne. Le caller
 * (upload deliverable) ne doit pas échouer à cause du preview.
 */
import { v4 as uuid } from 'uuid';
import { db } from '@/lib/db';
import { projPreviewJobs, projDeliverables } from '@/modules/projects/schema/tables';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import {
  isFlowPreviewEnabled,
  isMsappPreviewEnabled,
  isSolutionPreviewEnabled,
  isPbixPreviewEnabled,
} from '@/modules/projects/feature-flag';

export type PreviewTask = 'process-flow' | 'process-msapp' | 'process-pbix' | 'process-solution';

/**
 * Enqueue un job de preview pour un deliverable. Seuls les previews dont
 * le feature flag est ON sont enqueued.
 */
export async function enqueuePreviewJob(opts: {
  deliverableId: string;
  task: PreviewTask;
}): Promise<void> {
  // Gate par feature flag — chaque preview a le sien
  if (opts.task === 'process-flow' && !isFlowPreviewEnabled()) return;
  if (opts.task === 'process-msapp' && !isMsappPreviewEnabled()) return;
  if (opts.task === 'process-solution' && !isSolutionPreviewEnabled()) return;
  if (opts.task === 'process-pbix' && !isPbixPreviewEnabled()) return;

  const jobId = uuid();
  try {
    await db.insert(projPreviewJobs).values({
      id: jobId,
      deliverable_id: opts.deliverableId,
      status: 'pending',
    });
  } catch (err) {
    logger.error('[preview-enqueue] insert job row failed', {
      err: String(err), deliverableId: opts.deliverableId, task: opts.task,
    });
    return;
  }

  // Marque le deliverable preview_status=pending
  await db
    .update(projDeliverables)
    .set({ preview_status: 'pending' })
    .where(eq(projDeliverables.id, opts.deliverableId))
    .catch((err) => {
      logger.error('[preview-enqueue] update deliverable status failed', { err: String(err) });
    });

  try {
    const { addJobToQueue } = await import('@/modules/projects/workers/queue');
    await addJobToQueue(opts.task, { preview_job_id: jobId });
  } catch (err) {
    logger.error('[preview-enqueue] add_job failed (row still pending)', {
      err: String(err), jobId, task: opts.task,
    });
  }
}
