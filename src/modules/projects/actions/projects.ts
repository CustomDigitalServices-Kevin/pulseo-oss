"use server";

import { revalidatePath } from "next/cache";
import { v4 as uuid } from "uuid";
import { and, eq, isNull, desc, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { getSessionInfo } from "@/lib/auth/session";
import {
  projProjects,
  projTicketLinks,
} from "@/modules/projects/schema/tables";
import { sql } from "drizzle-orm";
import { hasProjectsAccess } from "@/modules/projects/lib/permissions";
import { writeProjectAuditLog } from "@/modules/projects/lib/audit";
import { isProjectsEnabled } from "@/modules/projects/feature-flag";
import {
  createProjectActionInputSchema,
  updateProjectSchema,
  listProjectsSchema,
  type CreateProjectActionInput,
  type UpdateProjectInput,
  type ListProjectsInput,
} from "@/modules/projects/lib/validations/projects";
import { logger } from "@/lib/logger";

type Result<T> = { success: true; data: T } | { success: false; error: string };

/**
 * Guard module : défense en profondeur si le flag est flipé à chaud. Routes
 * RSC font déjà le check, mais un formulaire client resté ouvert pourrait
 * soumettre après le flip. On rejette avant toute DB call.
 */
function moduleGuard(): { error: string } | null {
  if (!isProjectsEnabled()) return { error: "module_disabled" };
  return null;
}

async function requireAccess(
  orgId: string,
): Promise<{ userId: string } | { error: string }> {
  const session = await getSessionInfo();
  if (!session) return { error: "unauthenticated" };
  const ok = await hasProjectsAccess(session.userId, orgId);
  if (!ok) return { error: "forbidden" };
  return { userId: session.userId };
}

export async function listProjects(
  input: ListProjectsInput,
): Promise<Result<Array<typeof projProjects.$inferSelect>>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const parsed = listProjectsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid_input" };

  const access = await requireAccess(parsed.data.organizationId);
  if ("error" in access) return { success: false, error: access.error };

  const conditions: SQL[] = [
    eq(projProjects.organization_id, parsed.data.organizationId),
  ];
  if (!parsed.data.includeDeleted)
    conditions.push(isNull(projProjects.deleted_at));
  if (parsed.data.status)
    conditions.push(eq(projProjects.status, parsed.data.status));

  try {
    const data = await db
      .select()
      .from(projProjects)
      .where(and(...conditions))
      .orderBy(desc(projProjects.updated_at));
    return { success: true, data };
  } catch (err) {
    logger.error("[projects/listProjects] select failed", { err: String(err) });
    return { success: false, error: "db_error" };
  }
}

export async function createProject(
  input: CreateProjectActionInput,
): Promise<Result<{ id: string }>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const parsed = createProjectActionInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid_input" };

  const access = await requireAccess(parsed.data.organizationId);
  if ("error" in access) return { success: false, error: access.error };

  const id = uuid();
  try {
    await db.insert(projProjects).values({
      id,
      organization_id: parsed.data.organizationId,
      name: parsed.data.name,
      type: parsed.data.type,
      status: parsed.data.status,
      description: parsed.data.description,
      started_at: parsed.data.started_at
        ? new Date(parsed.data.started_at)
        : null,
      target_date: parsed.data.target_date
        ? new Date(parsed.data.target_date)
        : null,
      created_by: access.userId,
    });
  } catch (err) {
    logger.error("[projects/createProject] insert failed", {
      err: String(err),
    });
    return { success: false, error: "db_error" };
  }

  await writeProjectAuditLog({
    organizationId: parsed.data.organizationId,
    actorId: access.userId,
    eventType: "project_created",
    entityType: "project",
    entityId: id,
    metadata: {
      name: parsed.data.name,
      type: parsed.data.type,
      status: parsed.data.status,
    },
  });

  revalidateProjectPaths();
  return { success: true, data: { id } };
}

type LoadOptions = { requireDeleted?: boolean };

async function loadProjectForWrite(
  projectId: string,
  opts: LoadOptions = {},
): Promise<
  | { project: typeof projProjects.$inferSelect; userId: string }
  | { error: string }
> {
  const session = await getSessionInfo();
  if (!session) return { error: "unauthenticated" };
  const [row] = await db
    .select()
    .from(projProjects)
    .where(eq(projProjects.id, projectId));
  if (!row) return { error: "not_found" };

  // Filtrage soft-delete : par défaut on refuse de muter un projet déjà supprimé.
  // `requireDeleted: true` est utilisé par `restoreProject` qui attend l'inverse.
  if (opts.requireDeleted) {
    if (row.deleted_at === null) return { error: "not_deleted" };
  } else {
    if (row.deleted_at !== null) return { error: "already_deleted" };
  }

  const ok = await hasProjectsAccess(session.userId, row.organization_id);
  if (!ok) return { error: "forbidden" };
  return { project: row, userId: session.userId };
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
): Promise<Result<null>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid_input" };

  const ctx = await loadProjectForWrite(projectId);
  if ("error" in ctx) return { success: false, error: ctx.error };

  const set: Partial<typeof projProjects.$inferInsert> = {
    updated_at: new Date(),
  };
  if (parsed.data.name !== undefined) set.name = parsed.data.name;
  if (parsed.data.type !== undefined) set.type = parsed.data.type;
  if (parsed.data.status !== undefined) set.status = parsed.data.status;
  if (parsed.data.description !== undefined)
    set.description = parsed.data.description;
  if (parsed.data.started_at !== undefined)
    set.started_at = parsed.data.started_at
      ? new Date(parsed.data.started_at)
      : null;
  if (parsed.data.target_date !== undefined)
    set.target_date = parsed.data.target_date
      ? new Date(parsed.data.target_date)
      : null;

  try {
    await db
      .update(projProjects)
      .set(set)
      .where(eq(projProjects.id, projectId));
  } catch (err) {
    logger.error("[projects/updateProject] update failed", {
      err: String(err),
      projectId,
    });
    return { success: false, error: "db_error" };
  }

  await writeProjectAuditLog({
    organizationId: ctx.project.organization_id,
    actorId: ctx.userId,
    eventType: "project_updated",
    entityType: "project",
    entityId: projectId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  revalidateProjectPaths();
  return { success: true, data: null };
}

export async function softDeleteProject(
  projectId: string,
): Promise<Result<null>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const ctx = await loadProjectForWrite(projectId);
  if ("error" in ctx) return { success: false, error: ctx.error };

  try {
    await db
      .update(projProjects)
      .set({ deleted_at: new Date(), updated_at: new Date() })
      .where(eq(projProjects.id, projectId));
  } catch (err) {
    logger.error("[projects/softDeleteProject] update failed", {
      err: String(err),
      projectId,
    });
    return { success: false, error: "db_error" };
  }

  await writeProjectAuditLog({
    organizationId: ctx.project.organization_id,
    actorId: ctx.userId,
    eventType: "project_soft_deleted",
    entityType: "project",
    entityId: projectId,
  });

  revalidateProjectPaths();
  return { success: true, data: null };
}

export async function restoreProject(projectId: string): Promise<Result<null>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const ctx = await loadProjectForWrite(projectId, { requireDeleted: true });
  if ("error" in ctx) return { success: false, error: ctx.error };

  try {
    await db
      .update(projProjects)
      .set({ deleted_at: null, updated_at: new Date() })
      .where(eq(projProjects.id, projectId));
  } catch (err) {
    logger.error("[projects/restoreProject] update failed", {
      err: String(err),
      projectId,
    });
    return { success: false, error: "db_error" };
  }

  await writeProjectAuditLog({
    organizationId: ctx.project.organization_id,
    actorId: ctx.userId,
    eventType: "project_restored",
    entityType: "project",
    entityId: projectId,
  });

  revalidateProjectPaths();
  return { success: true, data: null };
}

/**
 * Revalide la liste ET les pages de détail (`/projects/[id]`). Sans le second
 * appel, un client déjà sur `/clients/<slug>/projects/<id>` voit les anciennes
 * données après une mutation jusqu'au prochain hard reload.
 */
function revalidateProjectPaths(): void {
  revalidatePath(`/clients/[slug]/projects`, "page");
  revalidatePath(`/clients/[slug]/projects/[id]`, "page");
}

/**
 * Variante de `listProjects` qui enrichit chaque projet avec le compteur de
 * tickets liés via `proj_ticket_links`. Utilisé par la vue Kanban (UX
 * overhaul) pour afficher le badge "N tickets" sur chaque card.
 *
 * Pattern : LEFT JOIN + COUNT GROUP BY id projet, scoped à l'organization.
 * Exclut systématiquement les projets `deleted_at IS NOT NULL`.
 */
export type ProjectWithCount = typeof projProjects.$inferSelect & {
  ticket_count: number;
};

export async function listProjectsWithCounts(
  organizationId: string,
): Promise<Result<ProjectWithCount[]>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  if (typeof organizationId !== "string" || organizationId.length !== 36) {
    return { success: false, error: "invalid_input" };
  }

  const access = await requireAccess(organizationId);
  if ("error" in access) return { success: false, error: access.error };

  try {
    const rows = await db
      .select({
        id: projProjects.id,
        organization_id: projProjects.organization_id,
        name: projProjects.name,
        type: projProjects.type,
        status: projProjects.status,
        description: projProjects.description,
        started_at: projProjects.started_at,
        target_date: projProjects.target_date,
        closed_at: projProjects.closed_at,
        deleted_at: projProjects.deleted_at,
        created_by: projProjects.created_by,
        created_at: projProjects.created_at,
        updated_at: projProjects.updated_at,
        ticket_count:
          sql<number>`COALESCE(COUNT(${projTicketLinks.id}), 0)::int`.as(
            "ticket_count",
          ),
      })
      .from(projProjects)
      .leftJoin(
        projTicketLinks,
        eq(projTicketLinks.project_id, projProjects.id),
      )
      .where(
        and(
          eq(projProjects.organization_id, organizationId),
          isNull(projProjects.deleted_at),
        ),
      )
      .groupBy(projProjects.id)
      .orderBy(desc(projProjects.updated_at));

    return { success: true, data: rows };
  } catch (err) {
    logger.error("[projects/listProjectsWithCounts] select failed", {
      err: String(err),
    });
    return { success: false, error: "db_error" };
  }
}

/**
 * Met à jour uniquement le statut d'un projet (UX overhaul — quick status
 * change depuis la card Kanban). Wrapper léger autour d'`updateProject`
 * qui réutilise la validation Zod et l'audit log.
 */
export async function updateProjectStatus(
  projectId: string,
  status: string,
): Promise<Result<null>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  // updateProject valide le statut via updateProjectSchema (z.enum).
  const r = await updateProject(projectId, { status: status as never });
  return r;
}
