'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getSessionInfo } from '@/lib/auth/session';
import {
  projProjects,
  projDeliverables,
  type ProjDeliverable,
} from '@/modules/projects/schema/tables';
import { hasProjectsAccess } from '@/modules/projects/lib/permissions';
import { writeProjectAuditLog } from '@/modules/projects/lib/audit';
import { isProjectsEnabled } from '@/modules/projects/feature-flag';
import {
  listDeliverablesInputSchema,
  promoteVersionInputSchema,
  softDeleteDeliverableInputSchema,
  type ListDeliverablesInput,
} from '@/modules/projects/lib/validations/deliverables';
import {
  loadDeliverableWithOrg,
  promoteVersionInTx,
  softDeleteDeliverableInTx,
} from '@/modules/projects/lib/deliverables-db';
import { logger } from '@/lib/logger';

type Result<T> = { success: true; data: T } | { success: false; error: string };

function moduleGuard(): { error: string } | null {
  if (!isProjectsEnabled()) return { error: 'module_disabled' };
  return null;
}

/**
 * Liste les deliverables d'un projet, triés par date d'upload décroissante.
 * `includeDeleted=true` inclut les rows soft-deleted (superadmin UI).
 */
export async function listDeliverables(
  rawInput: ListDeliverablesInput,
): Promise<Result<ProjDeliverable[]>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const parsed = listDeliverablesInputSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: 'invalid_input' };
  const { projectId, includeDeleted } = parsed.data;

  const session = await getSessionInfo();
  if (!session) return { success: false, error: 'unauthenticated' };

  // Charge le projet pour IDOR check (évite d'exposer la liste avant l'auth).
  const [project] = await db
    .select({
      id: projProjects.id,
      organization_id: projProjects.organization_id,
      deleted_at: projProjects.deleted_at,
    })
    .from(projProjects)
    .where(eq(projProjects.id, projectId));
  if (!project) return { success: false, error: 'not_found' };
  if (project.deleted_at) return { success: false, error: 'project_deleted' };

  const ok = await hasProjectsAccess(session.userId, project.organization_id);
  if (!ok) return { success: false, error: 'forbidden' };

  try {
    const rows = await db
      .select()
      .from(projDeliverables)
      .where(
        includeDeleted
          ? eq(projDeliverables.project_id, projectId)
          : and(
              eq(projDeliverables.project_id, projectId),
              isNull(projDeliverables.deleted_at),
            ),
      )
      .orderBy(desc(projDeliverables.uploaded_at));
    return { success: true, data: rows };
  } catch (err) {
    logger.error('[projects/deliverables/list] failed', { err: String(err), projectId });
    return { success: false, error: 'db_error' };
  }
}

/**
 * Promote une version en latest (pour kind='file' uniquement).
 * No-op si déjà latest.
 */
export async function promoteDeliverableVersion(
  rawInput: { deliverableId: string },
): Promise<Result<null>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const parsed = promoteVersionInputSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: 'invalid_input' };
  const { deliverableId } = parsed.data;

  const session = await getSessionInfo();
  if (!session) return { success: false, error: 'unauthenticated' };

  const row = await loadDeliverableWithOrg(deliverableId);
  if (!row) return { success: false, error: 'not_found' };
  if (row.deleted_at) return { success: false, error: 'deleted' };
  if (row.kind !== 'file') return { success: false, error: 'invalid_kind' };

  const ok = await hasProjectsAccess(session.userId, row.project_org_id);
  if (!ok) return { success: false, error: 'forbidden' };

  if (row.is_latest) return { success: true, data: null };

  try {
    await promoteVersionInTx(deliverableId);
  } catch (err) {
    logger.error('[projects/deliverables/promote] failed', {
      err: String(err), deliverableId,
    });
    return { success: false, error: 'db_error' };
  }

  await writeProjectAuditLog({
    organizationId: row.project_org_id,
    actorId: session.userId,
    eventType: 'deliverable_uploaded',
    entityType: 'deliverable',
    entityId: deliverableId,
    metadata: { action: 'promoted_to_latest', version: row.version, project_id: row.project_id },
  });

  revalidatePath('/clients/[slug]/projects/[id]', 'page');
  return { success: true, data: null };
}

/**
 * Soft-delete un deliverable. Fichier disque conservé (purge cron 720j).
 * Si la row était latest, promote le file suivant le plus récent.
 */
export async function softDeleteDeliverable(
  rawInput: { deliverableId: string },
): Promise<Result<null>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const parsed = softDeleteDeliverableInputSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: 'invalid_input' };
  const { deliverableId } = parsed.data;

  const session = await getSessionInfo();
  if (!session) return { success: false, error: 'unauthenticated' };

  const row = await loadDeliverableWithOrg(deliverableId);
  if (!row) return { success: false, error: 'not_found' };
  if (row.deleted_at) return { success: false, error: 'already_deleted' };

  const ok = await hasProjectsAccess(session.userId, row.project_org_id);
  if (!ok) return { success: false, error: 'forbidden' };

  try {
    await softDeleteDeliverableInTx({
      deliverableId,
      projectId: row.project_id,
      wasLatest: row.is_latest,
      kind: row.kind,
    });
  } catch (err) {
    logger.error('[projects/deliverables/delete] failed', { err: String(err), deliverableId });
    return { success: false, error: 'db_error' };
  }

  await writeProjectAuditLog({
    organizationId: row.project_org_id,
    actorId: session.userId,
    eventType: 'deliverable_deleted',
    entityType: 'deliverable',
    entityId: deliverableId,
    metadata: { project_id: row.project_id, was_latest: row.is_latest },
  });

  revalidatePath('/clients/[slug]/projects/[id]', 'page');
  return { success: true, data: null };
}

/**
 * Restore un deliverable soft-deleted. is_latest reste false — le user
 * promote explicitement si besoin.
 */
export async function restoreDeliverable(
  rawInput: { deliverableId: string },
): Promise<Result<null>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const parsed = softDeleteDeliverableInputSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: 'invalid_input' };
  const { deliverableId } = parsed.data;

  const session = await getSessionInfo();
  if (!session) return { success: false, error: 'unauthenticated' };

  const row = await loadDeliverableWithOrg(deliverableId);
  if (!row) return { success: false, error: 'not_found' };
  if (!row.deleted_at) return { success: false, error: 'not_deleted' };

  const ok = await hasProjectsAccess(session.userId, row.project_org_id);
  if (!ok) return { success: false, error: 'forbidden' };

  try {
    await db
      .update(projDeliverables)
      .set({ deleted_at: null })
      .where(eq(projDeliverables.id, deliverableId));
  } catch (err) {
    logger.error('[projects/deliverables/restore] failed', { err: String(err), deliverableId });
    return { success: false, error: 'db_error' };
  }

  await writeProjectAuditLog({
    organizationId: row.project_org_id,
    actorId: session.userId,
    eventType: 'deliverable_uploaded',
    entityType: 'deliverable',
    entityId: deliverableId,
    metadata: { action: 'restored', project_id: row.project_id },
  });

  revalidatePath('/clients/[slug]/projects/[id]', 'page');
  return { success: true, data: null };
}
