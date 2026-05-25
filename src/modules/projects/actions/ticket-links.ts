"use server";

import { revalidatePath } from "next/cache";
import { v4 as uuid } from "uuid";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tickets } from "@/lib/db/schema";
import { getSessionInfo } from "@/lib/auth/session";
import {
  projProjects,
  projDeliverables,
  projTicketLinks,
} from "@/modules/projects/schema/tables";
import { hasProjectsAccess } from "@/modules/projects/lib/permissions";
import { writeProjectAuditLog } from "@/modules/projects/lib/audit";
import { isProjectsEnabled } from "@/modules/projects/feature-flag";
import {
  createTicketLinkFromAnnotationSchema,
  type CreateTicketLinkFromAnnotationInput,
} from "@/modules/projects/lib/annotation-schema";
import { logger } from "@/lib/logger";

type Result<T> = { success: true; data: T } | { success: false; error: string };

function moduleGuard(): { error: string } | null {
  if (!isProjectsEnabled()) return { error: "module_disabled" };
  return null;
}

/**
 * P10 — Crée un ticket core + un lien proj_ticket_links pointant vers une
 * annotation de preview. Opération transactionnelle : si l'INSERT ticket OU
 * l'INSERT link échoue, rollback complet.
 *
 * Guards :
 *  - moduleGuard + session
 *  - project existe + non supprimé
 *  - hasProjectsAccess sur l'org du projet
 *  - Si annotation référence un deliverable_id, le deliverable doit appartenir au même projet (IDOR cross-deliverable)
 *  - Zod valide l'annotation (discriminated union + regex defensive)
 */
export async function createTicketLinkFromAnnotation(
  rawInput: CreateTicketLinkFromAnnotationInput,
): Promise<Result<{ ticketId: string; linkId: string; ticketNumber: number }>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const parsed = createTicketLinkFromAnnotationSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "invalid_input" };
  }
  const input = parsed.data;

  const session = await getSessionInfo();
  if (!session) return { success: false, error: "unauthenticated" };

  // Charge projet + IDOR
  const [project] = await db
    .select({
      id: projProjects.id,
      organization_id: projProjects.organization_id,
      deleted_at: projProjects.deleted_at,
    })
    .from(projProjects)
    .where(eq(projProjects.id, input.projectId));
  if (!project) return { success: false, error: "not_found" };
  if (project.deleted_at) return { success: false, error: "project_deleted" };

  const ok = await hasProjectsAccess(session.userId, project.organization_id);
  if (!ok) return { success: false, error: "forbidden" };

  // IDOR cross-deliverable : l'annotation pointe vers un deliverable, qui doit
  // appartenir au même projet.
  const [deliverable] = await db
    .select({
      id: projDeliverables.id,
      project_id: projDeliverables.project_id,
      deleted_at: projDeliverables.deleted_at,
    })
    .from(projDeliverables)
    .where(eq(projDeliverables.id, input.annotation.deliverable_id));
  if (!deliverable) return { success: false, error: "deliverable_not_found" };
  if (deliverable.project_id !== project.id) {
    return { success: false, error: "deliverable_cross_project" };
  }
  if (deliverable.deleted_at)
    return { success: false, error: "deliverable_deleted" };

  const ticketId = uuid();
  const linkId = uuid();
  let ticketNumber = 0;

  try {
    await db.transaction(async (tx) => {
      // Pattern existant `actions/tickets.ts` pour numérotation org-local.
      const [created] = await tx
        .insert(tickets)
        .values({
          id: ticketId,
          organization_id: project.organization_id,
          number: sql`(SELECT COALESCE(MAX(${tickets.number}), 0) + 1 FROM ${tickets} WHERE ${tickets.organization_id} = ${project.organization_id})`,
          title: input.title,
          description: input.description,
          priority: input.priority,
          category: input.category,
          status: "new",
          creator_id: session.userId,
        })
        .returning({ number: tickets.number });
      ticketNumber = created?.number ?? 0;

      await tx.insert(projTicketLinks).values({
        id: linkId,
        ticket_id: ticketId,
        project_id: project.id,
        deliverable_id: input.annotation.deliverable_id,
        preview_annotation: input.annotation,
        created_by: session.userId,
      });
    });
  } catch (err) {
    logger.error("[projects/ticket-links/create] failed", {
      err: String(err),
      projectId: project.id,
    });
    return { success: false, error: "db_error" };
  }

  await writeProjectAuditLog({
    organizationId: project.organization_id,
    actorId: session.userId,
    eventType: "ticket_link_created",
    entityType: "project",
    entityId: project.id,
    metadata: {
      ticket_id: ticketId,
      ticket_number: ticketNumber,
      annotation_type: input.annotation.type,
      deliverable_id: input.annotation.deliverable_id,
    },
  });

  revalidatePath(`/clients/[slug]/projects/${project.id}`, "page");
  revalidatePath(`/clients/[slug]/tickets`, "page");

  return {
    success: true,
    data: { ticketId, linkId, ticketNumber },
  };
}

/**
 * Liste les tickets liés à un projet (avec annotation info).
 */
export async function listProjectTicketLinks(projectId: string): Promise<
  Result<
    Array<{
      linkId: string;
      ticketId: string;
      ticketNumber: number;
      ticketTitle: string;
      ticketStatus: string;
      ticketPriority: string;
      annotation: unknown;
      deliverableId: string | null;
      createdAt: Date;
    }>
  >
> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  const session = await getSessionInfo();
  if (!session) return { success: false, error: "unauthenticated" };

  const [project] = await db
    .select({
      id: projProjects.id,
      organization_id: projProjects.organization_id,
    })
    .from(projProjects)
    .where(eq(projProjects.id, projectId));
  if (!project) return { success: false, error: "not_found" };

  const ok = await hasProjectsAccess(session.userId, project.organization_id);
  if (!ok) return { success: false, error: "forbidden" };

  try {
    const rows = await db
      .select({
        linkId: projTicketLinks.id,
        ticketId: projTicketLinks.ticket_id,
        ticketNumber: tickets.number,
        ticketTitle: tickets.title,
        ticketStatus: tickets.status,
        ticketPriority: tickets.priority,
        annotation: projTicketLinks.preview_annotation,
        deliverableId: projTicketLinks.deliverable_id,
        createdAt: projTicketLinks.created_at,
      })
      .from(projTicketLinks)
      .innerJoin(tickets, eq(tickets.id, projTicketLinks.ticket_id))
      .where(eq(projTicketLinks.project_id, projectId))
      .orderBy(sql`${projTicketLinks.created_at} DESC`);
    return { success: true, data: rows };
  } catch (err) {
    logger.error("[projects/ticket-links/list] failed", {
      err: String(err),
      projectId,
    });
    return { success: false, error: "db_error" };
  }
}

/**
 * Lie un ticket EXISTANT à un projet existant (P12 — UX overhaul).
 *
 * Distinct de `createTicketLinkFromAnnotation` qui crée le ticket en même temps.
 * Ici, le ticket est déjà créé via la Server Action core `createTicket`. On
 * insère uniquement le lien dans `proj_ticket_links` après succès.
 *
 * Guards :
 *  - moduleGuard + session
 *  - ticket existe + non supprimé (soft delete ?)
 *  - projet existe + non supprimé
 *  - ticket.organization_id === project.organization_id (IDOR cross-org)
 *  - hasProjectsAccess sur l'org
 *  - uniqueIndex (ticket_id, project_id) auto-déduplique : si link existe, retourne success idempotent
 */
export async function linkExistingTicketToProject(
  ticketId: string,
  projectId: string,
): Promise<Result<{ linkId: string }>> {
  const guard = moduleGuard();
  if (guard) return { success: false, error: guard.error };

  if (typeof ticketId !== "string" || ticketId.length !== 36) {
    return { success: false, error: "invalid_input" };
  }
  if (typeof projectId !== "string" || projectId.length !== 36) {
    return { success: false, error: "invalid_input" };
  }

  const session = await getSessionInfo();
  if (!session) return { success: false, error: "unauthenticated" };

  // NB : table `tickets` core sans soft delete (schema.ts L246-280) — pas de
  // garde `isNull(deleted_at)` à ajouter. Un ticket `closed_at` peut légitimement
  // être rattaché à un projet a posteriori pour historique.
  const [ticket] = await db
    .select({ id: tickets.id, organization_id: tickets.organization_id })
    .from(tickets)
    .where(eq(tickets.id, ticketId));
  if (!ticket) return { success: false, error: "ticket_not_found" };

  const [project] = await db
    .select({
      id: projProjects.id,
      organization_id: projProjects.organization_id,
      deleted_at: projProjects.deleted_at,
    })
    .from(projProjects)
    .where(eq(projProjects.id, projectId));
  if (!project) return { success: false, error: "project_not_found" };
  if (project.deleted_at) return { success: false, error: "project_deleted" };

  if (ticket.organization_id !== project.organization_id) {
    return { success: false, error: "cross_org" };
  }

  const ok = await hasProjectsAccess(session.userId, project.organization_id);
  if (!ok) return { success: false, error: "forbidden" };

  const [existing] = await db
    .select({ id: projTicketLinks.id })
    .from(projTicketLinks)
    .where(
      sql`${projTicketLinks.ticket_id} = ${ticketId} AND ${projTicketLinks.project_id} = ${projectId}`,
    );
  if (existing) {
    return { success: true, data: { linkId: existing.id } };
  }

  const linkId = uuid();
  try {
    await db.insert(projTicketLinks).values({
      id: linkId,
      ticket_id: ticketId,
      project_id: projectId,
      deliverable_id: null,
      preview_annotation: null,
      created_by: session.userId,
    });
  } catch (err) {
    logger.error("[projects/ticket-links/link-existing] failed", {
      err: String(err),
      ticketId,
      projectId,
    });
    return { success: false, error: "db_error" };
  }

  await writeProjectAuditLog({
    organizationId: project.organization_id,
    actorId: session.userId,
    eventType: "ticket_link_created",
    entityType: "project",
    entityId: project.id,
    metadata: { ticket_id: ticketId, link_id: linkId, source: "ticket_form" },
  });

  revalidatePath(`/clients/[slug]/projects/${project.id}`, "page");
  revalidatePath(`/clients/[slug]/tickets`, "page");

  return { success: true, data: { linkId } };
}
