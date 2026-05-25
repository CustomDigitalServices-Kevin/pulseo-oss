'use server';

import { revalidatePath } from 'next/cache';
import { v4 as uuid } from 'uuid';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getSessionInfo } from '@/lib/auth/session';
import {
  projProjects,
  projDocuments,
  type ProjDocument,
} from '@/modules/projects/schema/tables';
import { hasProjectsAccess } from '@/modules/projects/lib/permissions';
import { writeProjectAuditLog } from '@/modules/projects/lib/audit';
import { isProjectsEnabled } from '@/modules/projects/feature-flag';
import {
  DOCUMENT_ALLOWED_MIMES,
  DOCUMENT_CATEGORIES,
  DOCUMENT_MAX_BYTES,
  type DocumentCategory,
} from '@/modules/projects/lib/validations/documents';
import {
  writeProjectFile,
  deleteProjectFile,
  sanitizeOriginalName,
} from '@/modules/projects/lib/storage';
import { enqueueVirusScan } from '@/modules/projects/lib/scan-enqueue';
import { logger } from '@/lib/logger';

type Result<T> = { success: true; data: T } | { success: false; error: string };

function moduleGuard(): { error: string } | null {
  if (!isProjectsEnabled()) return { error: 'module_disabled' };
  return null;
}

async function loadProjectContext(
  projectId: string,
): Promise<{ userId: string; organizationId: string } | { error: string }> {
  const session = await getSessionInfo();
  if (!session) return { error: 'unauthenticated' };
  const [project] = await db
    .select({
      id: projProjects.id,
      organization_id: projProjects.organization_id,
      deleted_at: projProjects.deleted_at,
    })
    .from(projProjects)
    .where(eq(projProjects.id, projectId));
  if (!project) return { error: 'not_found' };
  if (project.deleted_at) return { error: 'project_deleted' };
  const ok = await hasProjectsAccess(session.userId, project.organization_id);
  if (!ok) return { error: 'forbidden' };
  return { userId: session.userId, organizationId: project.organization_id };
}

export async function listDocuments(projectId: string): Promise<Result<ProjDocument[]>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const ctx = await loadProjectContext(projectId);
  if ('error' in ctx) return { success: false, error: ctx.error };

  try {
    const rows = await db
      .select()
      .from(projDocuments)
      .where(and(eq(projDocuments.project_id, projectId), isNull(projDocuments.deleted_at)))
      .orderBy(desc(projDocuments.uploaded_at));
    return { success: true, data: rows };
  } catch (err) {
    logger.error('[projects/docs/list] failed', { err: String(err), projectId });
    return { success: false, error: 'db_error' };
  }
}

/**
 * Upload de document via FormData. Le file est lu en mémoire (limite 20 MB
 * donc acceptable pour un MVP). Validation : category, mime type, taille,
 * nom. Écrit sur disque puis insère la row.
 */
export async function uploadDocument(formData: FormData): Promise<Result<{ id: string }>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const projectId = String(formData.get('projectId') ?? '');
  const category = String(formData.get('category') ?? '') as DocumentCategory;
  const file = formData.get('file');

  if (!projectId || !category || !(DOCUMENT_CATEGORIES as readonly string[]).includes(category)) {
    return { success: false, error: 'invalid_input' };
  }
  if (!(file instanceof File)) return { success: false, error: 'invalid_input' };
  if (file.size === 0) return { success: false, error: 'empty_file' };
  if (file.size > DOCUMENT_MAX_BYTES) return { success: false, error: 'file_too_large' };
  if (!DOCUMENT_ALLOWED_MIMES.has(file.type)) return { success: false, error: 'mime_not_allowed' };

  const ctx = await loadProjectContext(projectId);
  if ('error' in ctx) return { success: false, error: ctx.error };

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = sanitizeOriginalName(file.name);

  let stored: Awaited<ReturnType<typeof writeProjectFile>>;
  try {
    stored = await writeProjectFile({
      organizationId: ctx.organizationId,
      projectId,
      scope: 'docs',
      originalName: safeName,
      content: buffer,
    });
  } catch (err) {
    logger.error('[projects/docs/upload] fs write failed', { err: String(err), projectId });
    return { success: false, error: 'storage_error' };
  }

  const id = uuid();
  try {
    await db.insert(projDocuments).values({
      id,
      project_id: projectId,
      category,
      file_path: stored.filePath,
      original_name: safeName,
      mime_type: file.type,
      size_bytes: stored.sizeBytes,
      // P4c : 'pending' par défaut — worker scan-virus passe à 'clean'.
      virus_scan_status: 'pending',
      uploaded_by: ctx.userId,
    });
  } catch (err) {
    // Rollback fichier si l'insert DB fail — évite orphelin sur disque.
    await deleteProjectFile(stored.filePath).catch(() => undefined);
    logger.error('[projects/docs/upload] db insert failed', { err: String(err), projectId });
    return { success: false, error: 'db_error' };
  }

  // P4c : enqueue scan virus (best-effort, ne throw jamais)
  await enqueueVirusScan({
    entityType: 'document',
    entityId: id,
    filePath: stored.filePath,
  });

  await writeProjectAuditLog({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    eventType: 'document_uploaded',
    entityType: 'document',
    entityId: id,
    metadata: { project_id: projectId, category, size_bytes: stored.sizeBytes, original_name: safeName },
  });

  revalidatePath(`/clients/[slug]/projects/[id]`, 'page');
  return { success: true, data: { id } };
}

/**
 * Soft-delete : marque deleted_at, conserve le fichier sur disque (purge en
 * cron séparé — P4+).
 */
export async function softDeleteDocument(documentId: string): Promise<Result<null>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const session = await getSessionInfo();
  if (!session) return { success: false, error: 'unauthenticated' };

  // Charge doc + project en 1 query + IDOR check inline.
  const [row] = await db
    .select({
      doc_id: projDocuments.id,
      doc_deleted: projDocuments.deleted_at,
      project_org_id: projProjects.organization_id,
    })
    .from(projDocuments)
    .innerJoin(projProjects, eq(projProjects.id, projDocuments.project_id))
    .where(eq(projDocuments.id, documentId));
  if (!row) return { success: false, error: 'not_found' };
  if (row.doc_deleted) return { success: false, error: 'already_deleted' };

  const ok = await hasProjectsAccess(session.userId, row.project_org_id);
  if (!ok) return { success: false, error: 'forbidden' };

  try {
    await db
      .update(projDocuments)
      .set({ deleted_at: new Date() })
      .where(eq(projDocuments.id, documentId));
  } catch (err) {
    logger.error('[projects/docs/delete] failed', { err: String(err), documentId });
    return { success: false, error: 'db_error' };
  }

  await writeProjectAuditLog({
    organizationId: row.project_org_id,
    actorId: session.userId,
    eventType: 'document_deleted',
    entityType: 'document',
    entityId: documentId,
  });

  revalidatePath(`/clients/[slug]/projects/[id]`, 'page');
  return { success: true, data: null };
}
