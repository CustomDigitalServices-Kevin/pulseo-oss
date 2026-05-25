'use server';

import { revalidatePath } from 'next/cache';
import { v4 as uuid } from 'uuid';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getSessionInfo } from '@/lib/auth/session';
import {
  projProjects,
  projRecipeTests,
  projRecipeEvents,
  type ProjRecipeTest,
  type ProjRecipeEvent,
} from '@/modules/projects/schema/tables';
import { hasProjectsAccess } from '@/modules/projects/lib/permissions';
import { writeProjectAuditLog } from '@/modules/projects/lib/audit';
import { isProjectsEnabled } from '@/modules/projects/feature-flag';
import {
  createRecipeTestSchema,
  updateRecipeTestSchema,
  changeRecipeStatusSchema,
  addRecipeCommentSchema,
  type CreateRecipeTestInput,
  type UpdateRecipeTestInput,
  type ChangeRecipeStatusInput,
  type AddRecipeCommentInput,
} from '@/modules/projects/lib/validations/recipe';
import { logger } from '@/lib/logger';

type Result<T> = { success: true; data: T } | { success: false; error: string };

function moduleGuard(): { error: string } | null {
  if (!isProjectsEnabled()) return { error: 'module_disabled' };
  return null;
}

/**
 * Charge un projet en s'assurant que la session a l'accès module ET que le
 * projet n'est pas soft-deleted. Retourne l'org_id pour audit log.
 */
async function loadProjectContext(
  projectId: string,
): Promise<{ userId: string; organizationId: string } | { error: string }> {
  const session = await getSessionInfo();
  if (!session) return { error: 'unauthenticated' };
  const [project] = await db
    .select({ id: projProjects.id, organization_id: projProjects.organization_id, deleted_at: projProjects.deleted_at })
    .from(projProjects)
    .where(eq(projProjects.id, projectId));
  if (!project) return { error: 'not_found' };
  if (project.deleted_at) return { error: 'project_deleted' };
  const ok = await hasProjectsAccess(session.userId, project.organization_id);
  if (!ok) return { error: 'forbidden' };
  return { userId: session.userId, organizationId: project.organization_id };
}

/**
 * Charge un test recette + son projet parent, check IDOR cross-project.
 */
async function loadRecipeContext(
  testId: string,
): Promise<
  | { userId: string; organizationId: string; test: ProjRecipeTest }
  | { error: string }
> {
  const session = await getSessionInfo();
  if (!session) return { error: 'unauthenticated' };
  const [row] = await db
    .select({
      test: projRecipeTests,
      project_org_id: projProjects.organization_id,
      project_deleted_at: projProjects.deleted_at,
    })
    .from(projRecipeTests)
    .innerJoin(projProjects, eq(projProjects.id, projRecipeTests.project_id))
    .where(eq(projRecipeTests.id, testId));
  if (!row) return { error: 'not_found' };
  if (row.project_deleted_at) return { error: 'project_deleted' };
  const ok = await hasProjectsAccess(session.userId, row.project_org_id);
  if (!ok) return { error: 'forbidden' };
  return { userId: session.userId, organizationId: row.project_org_id, test: row.test };
}

export async function listRecipeTests(
  projectId: string,
): Promise<Result<ProjRecipeTest[]>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const ctx = await loadProjectContext(projectId);
  if ('error' in ctx) return { success: false, error: ctx.error };

  try {
    const rows = await db
      .select()
      .from(projRecipeTests)
      .where(eq(projRecipeTests.project_id, projectId))
      .orderBy(asc(projRecipeTests.order_index), asc(projRecipeTests.created_at));
    return { success: true, data: rows };
  } catch (err) {
    logger.error('[projects/recipe/list] failed', { err: String(err), projectId });
    return { success: false, error: 'db_error' };
  }
}

export async function listRecipeEvents(
  testId: string,
): Promise<Result<ProjRecipeEvent[]>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const ctx = await loadRecipeContext(testId);
  if ('error' in ctx) return { success: false, error: ctx.error };

  try {
    const rows = await db
      .select()
      .from(projRecipeEvents)
      .where(eq(projRecipeEvents.recipe_test_id, testId))
      .orderBy(asc(projRecipeEvents.created_at));
    return { success: true, data: rows };
  } catch (err) {
    logger.error('[projects/recipe/events] failed', { err: String(err), testId });
    return { success: false, error: 'db_error' };
  }
}

export async function createRecipeTest(
  input: CreateRecipeTestInput,
): Promise<Result<{ id: string }>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const parsed = createRecipeTestSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'invalid_input' };

  const ctx = await loadProjectContext(parsed.data.projectId);
  if ('error' in ctx) return { success: false, error: ctx.error };

  // Calcule le prochain order_index pour l'ajouter en fin.
  const [max] = await db
    .select({ order_index: projRecipeTests.order_index })
    .from(projRecipeTests)
    .where(eq(projRecipeTests.project_id, parsed.data.projectId))
    .orderBy(asc(projRecipeTests.order_index));
  const nextOrder = max ? (max.order_index ?? 0) + 1 : 0;

  const id = uuid();
  try {
    await db.insert(projRecipeTests).values({
      id,
      project_id: parsed.data.projectId,
      order_index: nextOrder,
      title: parsed.data.title,
      expected_result: parsed.data.expected_result ?? null,
      status: 'a_faire',
      assignee_id: parsed.data.assignee_id ?? null,
      due_date: parsed.data.due_date ? new Date(parsed.data.due_date) : null,
    });
  } catch (err) {
    logger.error('[projects/recipe/create] insert failed', { err: String(err) });
    return { success: false, error: 'db_error' };
  }

  await writeProjectAuditLog({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    eventType: 'recipe_test_created',
    entityType: 'recipe_test',
    entityId: id,
    metadata: { project_id: parsed.data.projectId, title: parsed.data.title },
  });

  revalidatePath(`/clients/[slug]/projects/[id]`, 'page');
  return { success: true, data: { id } };
}

export async function updateRecipeTest(
  testId: string,
  input: UpdateRecipeTestInput,
): Promise<Result<null>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const parsed = updateRecipeTestSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'invalid_input' };

  const ctx = await loadRecipeContext(testId);
  if ('error' in ctx) return { success: false, error: ctx.error };

  const set: Partial<typeof projRecipeTests.$inferInsert> = { updated_at: new Date() };
  if (parsed.data.title !== undefined) set.title = parsed.data.title;
  if (parsed.data.expected_result !== undefined) set.expected_result = parsed.data.expected_result ?? null;
  if (parsed.data.status !== undefined) set.status = parsed.data.status;
  if (parsed.data.assignee_id !== undefined) set.assignee_id = parsed.data.assignee_id ?? null;
  if (parsed.data.due_date !== undefined) {
    set.due_date = parsed.data.due_date ? new Date(parsed.data.due_date) : null;
  }
  if (parsed.data.order_index !== undefined) set.order_index = parsed.data.order_index;

  try {
    await db.update(projRecipeTests).set(set).where(eq(projRecipeTests.id, testId));
  } catch (err) {
    logger.error('[projects/recipe/update] failed', { err: String(err), testId });
    return { success: false, error: 'db_error' };
  }

  await writeProjectAuditLog({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    eventType: 'recipe_test_updated',
    entityType: 'recipe_test',
    entityId: testId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  revalidatePath(`/clients/[slug]/projects/[id]`, 'page');
  return { success: true, data: null };
}

export async function changeRecipeStatus(
  testId: string,
  input: ChangeRecipeStatusInput,
): Promise<Result<null>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const parsed = changeRecipeStatusSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'invalid_input' };

  const ctx = await loadRecipeContext(testId);
  if ('error' in ctx) return { success: false, error: ctx.error };

  const oldStatus = ctx.test.status;
  if (oldStatus === parsed.data.status) return { success: true, data: null };

  try {
    await db
      .update(projRecipeTests)
      .set({ status: parsed.data.status, updated_at: new Date() })
      .where(eq(projRecipeTests.id, testId));

    await db.insert(projRecipeEvents).values({
      id: uuid(),
      recipe_test_id: testId,
      actor_id: ctx.userId,
      event_type: 'status_change',
      old_value: oldStatus,
      new_value: parsed.data.status,
      note: parsed.data.note ?? null,
    });
  } catch (err) {
    logger.error('[projects/recipe/status] failed', { err: String(err), testId });
    return { success: false, error: 'db_error' };
  }

  await writeProjectAuditLog({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    eventType: 'recipe_test_status_changed',
    entityType: 'recipe_test',
    entityId: testId,
    metadata: { from: oldStatus, to: parsed.data.status },
  });

  revalidatePath(`/clients/[slug]/projects/[id]`, 'page');
  return { success: true, data: null };
}

export async function addRecipeComment(
  testId: string,
  input: AddRecipeCommentInput,
): Promise<Result<{ id: string }>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const parsed = addRecipeCommentSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'invalid_input' };

  const ctx = await loadRecipeContext(testId);
  if ('error' in ctx) return { success: false, error: ctx.error };

  const id = uuid();
  try {
    await db.insert(projRecipeEvents).values({
      id,
      recipe_test_id: testId,
      actor_id: ctx.userId,
      event_type: 'comment',
      note: parsed.data.note,
    });
  } catch (err) {
    logger.error('[projects/recipe/comment] failed', { err: String(err), testId });
    return { success: false, error: 'db_error' };
  }

  await writeProjectAuditLog({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    eventType: 'recipe_test_commented',
    entityType: 'recipe_test',
    entityId: testId,
  });

  revalidatePath(`/clients/[slug]/projects/[id]`, 'page');
  return { success: true, data: { id } };
}

export async function deleteRecipeTest(testId: string): Promise<Result<null>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const ctx = await loadRecipeContext(testId);
  if ('error' in ctx) return { success: false, error: ctx.error };

  try {
    await db.delete(projRecipeTests).where(eq(projRecipeTests.id, testId));
  } catch (err) {
    logger.error('[projects/recipe/delete] failed', { err: String(err), testId });
    return { success: false, error: 'db_error' };
  }

  await writeProjectAuditLog({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    eventType: 'recipe_test_deleted',
    entityType: 'recipe_test',
    entityId: testId,
  });

  revalidatePath(`/clients/[slug]/projects/[id]`, 'page');
  return { success: true, data: null };
}
