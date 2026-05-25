'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { tickets, audit_logs, contracts, ticket_comments, ticket_attachments } from '@/lib/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import {
  createTicketSchema,
  updateTicketSchema,
  updateTicketStatusSchema,
  assignContractSchema,
  updateTimeSpentSchema,
  updateTicketTagsSchema,
  bulkUpdateTicketStatusSchema,
} from '@/lib/validations/tickets';
import { requireSession } from '@/lib/auth/session';
import { requireEffectiveRole, RoleError } from '@/lib/auth/require-role';
import { Ticket } from '@/types';
import { sendTicketNotificationEmail } from '@/lib/email/tickets';
import {
  getTicketNotificationRecipients,
  getOrganizationSlug,
} from '@/lib/email/notifications';
import { computeResolutionDue } from '@/lib/sla';
import { logger } from '@/lib/logger';
import { logActivityEvent } from '@/lib/activity/log-event';

interface ActionResult<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

export async function createTicket(
  data: unknown
): Promise<ActionResult<Ticket>> {
  logger.info('createTicket invoked');
  try {
    const session = await requireSession();
    const validated = createTicketSchema.parse(data);

    await requireEffectiveRole(session.user.id, validated.organization_id, 'viewer');

    const ticketId = uuid();
    const createdAt = new Date();

    // Compute SLA resolution_due_at if contract has SLA configured.
    // IDOR guard: the referenced contract MUST belong to the target org.
    let resolutionDueAt: Date | null = null;
    const contractId = validated.contract_id;
    if (contractId) {
      const contract = await db.query.contracts.findFirst({
        where: (c, { eq: e }) => e(c.id, contractId),
        columns: { organization_id: true, sla_resolution_hours: true },
      });
      if (!contract || contract.organization_id !== validated.organization_id) {
        logger.warn('createTicket rejected: invalid contract', {
          userId: session.user.id,
          orgId: validated.organization_id,
          contractId,
          contractOrgId: contract?.organization_id ?? null,
        });
        return { success: false, error: 'Contrat invalide pour cette organisation' };
      }
      if (contract.sla_resolution_hours) {
        resolutionDueAt = computeResolutionDue(createdAt, contract.sla_resolution_hours);
      }
    }

    // Advisory lock per-org pour serializer le MAX(number)+1 sous load
    // concurrent. Sans ce lock, deux INSERT simultanés lisent le même MAX et
    // l'un des deux fail avec unique_org_ticket_number (23505). Le lock est
    // transactional, donc relâché automatiquement au commit/rollback.
    const [newTicket] = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('ticket-num-' || ${validated.organization_id}))`,
      );
      return tx
        .insert(tickets)
        .values({
          id: ticketId,
          organization_id: validated.organization_id,
          number: sql`(SELECT COALESCE(MAX(${tickets.number}), 0) + 1 FROM ${tickets} WHERE ${tickets.organization_id} = ${validated.organization_id})`,
          title: validated.title,
          description: validated.description,
          priority: validated.priority,
          category: validated.category,
          tags: validated.tags ?? [],
          location: validated.location ?? null,
          scenario_steps: validated.scenario_steps ?? null,
          contract_id: validated.contract_id,
          creator_id: session.user.id,
          status: 'new',
          created_at: createdAt,
          updated_at: createdAt,
          resolution_due_at: resolutionDueAt,
        })
        .returning();
    });

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: validated.organization_id,
      entity_type: 'ticket',
      entity_id: ticketId,
      action: 'created',
      actor_id: session.user.id,
      changes: {
        title: validated.title,
        description: validated.description,
        priority: validated.priority,
      },
    });

    // Activity feed event (fire-and-forget, gated by ENABLE_ACTIVITY_LOGGING).
    // Placed after the audit_logs insert so a logging failure cannot block
    // either the ticket insert or the audit trail.
    logActivityEvent({
      userId: session.user.id,
      organizationId: validated.organization_id,
      eventType: 'ticket_created',
      resourceId: ticketId,
    });

    try {
      const [recipients, orgSlug, actor] = await Promise.all([
        getTicketNotificationRecipients({
          orgId: validated.organization_id,
          ticketCreatorId: session.user.id,
          guestEmail: null,
          excludeActorId: session.user.id,
        }),
        getOrganizationSlug(validated.organization_id),
        db.query.users.findFirst({
          where: (u, { eq: e }) => e(u.id, session.user.id),
          columns: { name: true, email: true },
        }),
      ]);
      const actorName = actor?.name ?? actor?.email ?? null;
      for (const email of recipients) {
        await sendTicketNotificationEmail({
          type: 'created',
          ticket: newTicket,
          creatorEmail: email,
          orgSlug,
          actorName,
        });
      }
    } catch (emailError) {
      logger.error('Notification email failed (create)', { error: String(emailError) });
    }

    revalidatePath('/clients', 'layout');
    logger.info('createTicket succeeded', {
      userId: session.user.id,
      orgId: validated.organization_id,
      ticketId,
      ticketNumber: newTicket.number,
    });
    return { success: true, data: newTicket };
  } catch (error) {
    if (error instanceof RoleError) {
      logger.warn('createTicket rejected: insufficient role', {
        reason: error.message,
      });
      return { success: false, error: error.message };
    }
    logger.error('Create ticket failed', { error: String(error) });
    return {
      success: false,
      error: 'Erreur lors de la creation du ticket',
    };
  }
}

export async function updateTicket(
  ticketId: string,
  data: unknown
): Promise<ActionResult<Ticket>> {
  try {
    const session = await requireSession();
    const validated = updateTicketSchema.parse(data);

    const ticket = await db.query.tickets.findFirst({
      where: (t, { eq }) => eq(t.id, ticketId),
    });

    if (!ticket) {
      return { success: false, error: 'Ticket non trouve' };
    }

    await requireEffectiveRole(session.user.id, ticket.organization_id, 'gestionnaire');

    if (ticket.status === 'closed') {
      return { success: false, error: 'Impossible de modifier un ticket ferme' };
    }

    const updateData: Partial<typeof tickets.$inferInsert> = { updated_at: new Date() };
    if (validated.title !== undefined) updateData.title = validated.title;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.priority !== undefined) updateData.priority = validated.priority;
    if (validated.category !== undefined) updateData.category = validated.category;
    if (validated.contract_id !== undefined) {
      // IDOR guard: the referenced contract MUST belong to the ticket's org.
      const nextContractId = validated.contract_id;
      if (nextContractId) {
        const newContract = await db.query.contracts.findFirst({
          where: (c, { eq: e }) => e(c.id, nextContractId),
          columns: { organization_id: true, sla_resolution_hours: true },
        });
        if (!newContract || newContract.organization_id !== ticket.organization_id) {
          return { success: false, error: 'Contrat invalide pour cette organisation' };
        }
        updateData.contract_id = nextContractId;
        updateData.resolution_due_at = newContract.sla_resolution_hours
          ? computeResolutionDue(ticket.created_at, newContract.sla_resolution_hours)
          : null;
      } else {
        updateData.contract_id = null;
        updateData.resolution_due_at = null;
      }
    }

    const [updatedTicket] = await db
      .update(tickets)
      .set(updateData)
      .where(eq(tickets.id, ticketId))
      .returning();

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: ticket.organization_id,
      entity_type: 'ticket',
      entity_id: ticketId,
      action: 'updated',
      actor_id: session.user.id,
      changes: validated,
    });

    try {
      const changedFields = Object.keys(validated).filter(
        (k) => (validated as Record<string, unknown>)[k] !== undefined
      );
      const [recipients, orgSlug, actor] = await Promise.all([
        getTicketNotificationRecipients({
          orgId: ticket.organization_id,
          ticketCreatorId: ticket.creator_id,
          guestEmail: ticket.guest_email,
          excludeActorId: session.user.id,
        }),
        getOrganizationSlug(ticket.organization_id),
        db.query.users.findFirst({
          where: (u, { eq: e }) => e(u.id, session.user.id),
          columns: { name: true, email: true },
        }),
      ]);
      const actorName = actor?.name ?? actor?.email ?? null;
      for (const email of recipients) {
        await sendTicketNotificationEmail({
          type: 'updated',
          ticket: updatedTicket,
          creatorEmail: email,
          orgSlug,
          actorName,
          changedFields,
        });
      }
    } catch (emailError) {
      logger.error('Notification email failed (update)', { error: String(emailError) });
    }

    revalidatePath('/clients', 'layout');
    return { success: true, data: updatedTicket };
  } catch (error) {
    if (error instanceof RoleError) {
      return { success: false, error: error.message };
    }
    logger.error('Update ticket failed', { error: String(error) });
    return {
      success: false,
      error: 'Erreur lors de la modification du ticket',
    };
  }
}

export async function updateTicketStatus(
  data: unknown
): Promise<ActionResult<Ticket>> {
  try {
    const session = await requireSession();
    const validated = updateTicketStatusSchema.parse(data);

    const ticket = await db.query.tickets.findFirst({
      where: (t, { eq }) => eq(t.id, validated.ticket_id),
    });

    if (!ticket) {
      return { success: false, error: 'Ticket non trouve' };
    }

    await requireEffectiveRole(session.user.id, ticket.organization_id, 'gestionnaire');

    const validTransitions: Record<string, string[]> = {
      new: ['in_progress', 'waiting_client'],
      in_progress: ['waiting_client', 'resolved', 'closed'],
      waiting_client: ['in_progress', 'resolved', 'closed'],
      resolved: ['closed'],
      closed: [],
    };

    if (!validTransitions[ticket.status]?.includes(validated.status)) {
      return {
        success: false,
        error: `Transition invalide: ${ticket.status} -> ${validated.status}`,
      };
    }

    const [updatedTicket] = await db
      .update(tickets)
      .set({
        status: validated.status,
        updated_at: new Date(),
        closed_at: validated.status === 'closed' ? new Date() : undefined,
      })
      .where(eq(tickets.id, validated.ticket_id))
      .returning();

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: ticket.organization_id,
      entity_type: 'ticket',
      entity_id: ticket.id,
      action: 'status_changed',
      actor_id: session.user.id,
      changes: {
        status: { old_value: ticket.status, new_value: validated.status },
      },
    });

    if (validated.notify_by_email !== false) {
      try {
        const [recipients, orgSlug, actor] = await Promise.all([
          getTicketNotificationRecipients({
            orgId: ticket.organization_id,
            ticketCreatorId: ticket.creator_id,
            guestEmail: ticket.guest_email,
            excludeActorId: session.user.id,
          }),
          getOrganizationSlug(ticket.organization_id),
          db.query.users.findFirst({
            where: (u, { eq: e }) => e(u.id, session.user.id),
            columns: { name: true, email: true },
          }),
        ]);
        const actorName = actor?.name ?? actor?.email ?? null;
        const emailType = validated.status === 'closed' ? 'closed' as const : 'status_changed' as const;
        for (const email of recipients) {
          await sendTicketNotificationEmail({
            type: emailType,
            ticket: updatedTicket,
            creatorEmail: email,
            orgSlug,
            actorName,
          });
        }
      } catch (emailError) {
        logger.error('Notification email failed (status)', { error: String(emailError) });
      }
    }

    revalidatePath('/clients', 'layout');
    return { success: true, data: updatedTicket };
  } catch (error) {
    if (error instanceof RoleError) {
      return { success: false, error: error.message };
    }
    logger.error('Update ticket status failed', { error: String(error) });
    return {
      success: false,
      error: 'Erreur lors de la mise a jour du statut',
    };
  }
}

export async function assignContract(
  data: unknown
): Promise<ActionResult<Ticket>> {
  try {
    const session = await requireSession();
    const validated = assignContractSchema.parse(data);

    const ticket = await db.query.tickets.findFirst({
      where: (t, { eq }) => eq(t.id, validated.ticket_id),
    });

    const contract = await db.query.contracts.findFirst({
      where: (c, { eq }) => eq(c.id, validated.contract_id),
    });

    if (!ticket || !contract) {
      return { success: false, error: 'Ticket ou contrat non trouve' };
    }

    if (ticket.organization_id !== contract.organization_id) {
      return { success: false, error: 'Organisation mismatch' };
    }

    await requireEffectiveRole(session.user.id, ticket.organization_id, 'gestionnaire');

    const [updatedTicket] = await db
      .update(tickets)
      .set({
        contract_id: validated.contract_id,
        updated_at: new Date(),
      })
      .where(eq(tickets.id, validated.ticket_id))
      .returning();

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: ticket.organization_id,
      entity_type: 'ticket',
      entity_id: ticket.id,
      action: 'contract_assigned',
      actor_id: session.user.id,
      changes: {
        contract_id: validated.contract_id,
      },
    });

    revalidatePath('/clients', 'layout');
    return { success: true, data: updatedTicket };
  } catch (error) {
    if (error instanceof RoleError) {
      return { success: false, error: error.message };
    }
    logger.error('Assign contract failed', { error: String(error) });
    return {
      success: false,
      error: 'Erreur lors de l\'assignation du contrat',
    };
  }
}

export async function updateTimeSpent(
  data: unknown
): Promise<ActionResult<Ticket>> {
  try {
    const session = await requireSession();
    const validated = updateTimeSpentSchema.parse(data);

    const ticket = await db.query.tickets.findFirst({
      where: (t, { eq }) => eq(t.id, validated.ticket_id),
    });

    if (!ticket) {
      return { success: false, error: 'Ticket non trouve' };
    }

    await requireEffectiveRole(session.user.id, ticket.organization_id, 'gestionnaire');

    // Atomically update contract consumed_hours + ticket time_spent_minutes.
    // Without a transaction a crash between the two updates could permanently
    // skew the contract's balance.
    const updatedTicket = await db.transaction(async (tx) => {
      if (ticket.contract_id) {
        const oldSpentHours = (ticket.time_spent_minutes || 0) / 60;
        const newSpentHours = validated.time_spent_minutes / 60;
        const delta = newSpentHours - oldSpentHours;

        if (delta !== 0) {
          await tx
            .update(contracts)
            .set({
              consumed_hours: sql`${contracts.consumed_hours}::numeric + ${delta}`,
              updated_at: new Date(),
            })
            .where(eq(contracts.id, ticket.contract_id));
        }
      }

      const [row] = await tx
        .update(tickets)
        .set({
          time_spent_minutes: validated.time_spent_minutes,
          updated_at: new Date(),
        })
        .where(eq(tickets.id, validated.ticket_id))
        .returning();

      return row;
    });

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: ticket.organization_id,
      entity_type: 'ticket',
      entity_id: ticket.id,
      action: 'time_updated',
      actor_id: session.user.id,
      changes: {
        time_spent_minutes: {
          old_value: ticket.time_spent_minutes,
          new_value: validated.time_spent_minutes,
        },
      },
    });

    revalidatePath('/clients', 'layout');
    return { success: true, data: updatedTicket };
  } catch (error) {
    if (error instanceof RoleError) {
      return { success: false, error: error.message };
    }
    logger.error('Update time spent failed', { error: String(error) });
    return {
      success: false,
      error: 'Erreur lors de la mise a jour du temps',
    };
  }
}

export async function closeTicket(
  ticketId: string
): Promise<ActionResult<Ticket>> {
  try {
    const session = await requireSession();

    const ticket = await db.query.tickets.findFirst({
      where: (t, { eq }) => eq(t.id, ticketId),
    });

    if (!ticket) {
      return { success: false, error: 'Ticket non trouve' };
    }

    await requireEffectiveRole(session.user.id, ticket.organization_id, 'gestionnaire');

    const [closedTicket] = await db
      .update(tickets)
      .set({
        status: 'closed',
        closed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(tickets.id, ticketId))
      .returning();

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: ticket.organization_id,
      entity_type: 'ticket',
      entity_id: ticket.id,
      action: 'closed',
      actor_id: session.user.id,
      changes: {
        status: 'closed',
        closed_at: new Date().toISOString(),
      },
    });

    try {
      const [recipients, orgSlug, actor] = await Promise.all([
        getTicketNotificationRecipients({
          orgId: ticket.organization_id,
          ticketCreatorId: ticket.creator_id,
          guestEmail: ticket.guest_email,
          excludeActorId: session.user.id,
        }),
        getOrganizationSlug(ticket.organization_id),
        db.query.users.findFirst({
          where: (u, { eq: e }) => e(u.id, session.user.id),
          columns: { name: true, email: true },
        }),
      ]);
      const actorName = actor?.name ?? actor?.email ?? null;
      for (const email of recipients) {
        await sendTicketNotificationEmail({
          type: 'closed',
          ticket: closedTicket,
          creatorEmail: email,
          orgSlug,
          actorName,
        });
      }
    } catch (emailError) {
      logger.error('Notification email failed (close)', { error: String(emailError) });
    }

    revalidatePath('/clients', 'layout');
    return { success: true, data: closedTicket };
  } catch (error) {
    if (error instanceof RoleError) {
      return { success: false, error: error.message };
    }
    logger.error('Close ticket failed', { error: String(error) });
    return {
      success: false,
      error: 'Erreur lors de la fermeture du ticket',
    };
  }
}

export async function updateTicketTags(
  data: unknown
): Promise<ActionResult<Ticket>> {
  try {
    const session = await requireSession();
    const validated = updateTicketTagsSchema.parse(data);

    const ticket = await db.query.tickets.findFirst({
      where: (t, { eq: e }) => e(t.id, validated.ticket_id),
    });

    if (!ticket) {
      return { success: false, error: 'Ticket non trouve' };
    }

    await requireEffectiveRole(session.user.id, ticket.organization_id, 'gestionnaire');

    const [updated] = await db
      .update(tickets)
      .set({ tags: validated.tags, updated_at: new Date() })
      .where(eq(tickets.id, validated.ticket_id))
      .returning();

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: ticket.organization_id,
      entity_type: 'ticket',
      entity_id: ticket.id,
      action: 'tags_updated',
      actor_id: session.user.id,
      changes: {
        tags: { old_value: ticket.tags, new_value: validated.tags },
      },
    });

    revalidatePath('/clients', 'layout');
    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof RoleError) {
      return { success: false, error: error.message };
    }
    logger.error('Update ticket tags failed', { error: String(error) });
    return { success: false, error: 'Erreur lors de la mise a jour des tags' };
  }
}

// Allowed transitions between ticket statuses (same as updateTicketStatus).
// Used by bulkUpdateTicketStatus to reject invalid bulk transitions.
const TICKET_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  new: ['in_progress', 'waiting_client'],
  in_progress: ['waiting_client', 'resolved', 'closed'],
  waiting_client: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed'],
  closed: [],
};

export async function bulkUpdateTicketStatus(
  data: unknown
): Promise<ActionResult<{ updated: number }>> {
  try {
    const session = await requireSession();
    const validated = bulkUpdateTicketStatusSchema.parse(data);

    // Load tickets and verify all belong to the same org
    const targetTickets = await db.query.tickets.findMany({
      where: (t, { inArray: ia }) => ia(t.id, validated.ticket_ids),
      columns: { id: true, organization_id: true, status: true },
    });

    if (targetTickets.length === 0) {
      return { success: false, error: 'Aucun ticket trouve' };
    }

    const orgIds = new Set(targetTickets.map((t) => t.organization_id));
    if (orgIds.size > 1) {
      return {
        success: false,
        error: 'Impossible de modifier des tickets de plusieurs organisations',
      };
    }

    const [firstTicket] = targetTickets;
    const orgId = firstTicket.organization_id;
    await requireEffectiveRole(session.user.id, orgId, 'gestionnaire');

    // Validate transitions. Silently skip tickets already in target status
    // (idempotent) so we don't touch their updated_at pointlessly.
    const toUpdate: string[] = [];
    const invalid: string[] = [];
    for (const t of targetTickets) {
      if (t.status === validated.status) continue;
      const allowed = TICKET_STATUS_TRANSITIONS[t.status] ?? [];
      if (!allowed.includes(validated.status)) {
        invalid.push(t.id);
      } else {
        toUpdate.push(t.id);
      }
    }

    if (invalid.length > 0) {
      return {
        success: false,
        error: `Transition invalide pour ${invalid.length} ticket${invalid.length > 1 ? 's' : ''} (statut actuel incompatible)`,
      };
    }

    if (toUpdate.length === 0) {
      // Nothing to change — all tickets already in target status.
      return { success: true, data: { updated: 0 } };
    }

    const now = new Date();
    const closedAt = validated.status === 'closed' ? now : null;

    // Filter by organization_id defensively to guarantee cross-org tickets
    // can never be modified, even if an attacker forges matching UUIDs.
    await db
      .update(tickets)
      .set({
        status: validated.status,
        updated_at: now,
        ...(closedAt ? { closed_at: closedAt } : {}),
      })
      .where(and(inArray(tickets.id, toUpdate), eq(tickets.organization_id, orgId)));

    // Single audit log entry summarizing the bulk operation
    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: orgId,
      entity_type: 'ticket',
      entity_id: toUpdate[0],
      action: 'bulk_status_changed',
      actor_id: session.user.id,
      changes: {
        new_status: validated.status,
        ticket_count: toUpdate.length,
        ticket_ids: toUpdate,
      },
    });

    revalidatePath('/clients', 'layout');
    return { success: true, data: { updated: toUpdate.length } };
  } catch (error) {
    if (error instanceof RoleError) {
      return { success: false, error: error.message };
    }
    logger.error('Bulk update tickets failed', { error: String(error) });
    return { success: false, error: 'Erreur lors de la mise a jour groupee' };
  }
}

export async function deleteTicket(
  ticketId: string
): Promise<ActionResult> {
  try {
    const session = await requireSession();

    const ticket = await db.query.tickets.findFirst({
      where: (t, { eq: colEq }) => colEq(t.id, ticketId),
    });

    if (!ticket) {
      return { success: false, error: 'Ticket non trouve' };
    }

    await requireEffectiveRole(session.user.id, ticket.organization_id, 'admin');

    // Atomically revert contract hours + delete children + delete ticket.
    await db.transaction(async (tx) => {
      if (ticket.contract_id && ticket.time_spent_minutes) {
        const hoursToRevert = ticket.time_spent_minutes / 60;
        await tx
          .update(contracts)
          .set({
            consumed_hours: sql`GREATEST(${contracts.consumed_hours}::numeric - ${hoursToRevert}, 0)`,
            updated_at: new Date(),
          })
          .where(eq(contracts.id, ticket.contract_id));
      }

      await tx.delete(ticket_comments).where(eq(ticket_comments.ticket_id, ticketId));
      await tx.delete(ticket_attachments).where(eq(ticket_attachments.ticket_id, ticketId));
      await tx.delete(tickets).where(eq(tickets.id, ticketId));
    });

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: ticket.organization_id,
      entity_type: 'ticket',
      entity_id: ticketId,
      action: 'deleted',
      actor_id: session.user.id,
      changes: {
        number: ticket.number,
        title: ticket.title,
      },
    });

    revalidatePath('/clients', 'layout');
    return { success: true };
  } catch (error) {
    if (error instanceof RoleError) {
      return { success: false, error: error.message };
    }
    logger.error('Delete ticket failed', { error: String(error) });
    return {
      success: false,
      error: 'Erreur lors de la suppression du ticket',
    };
  }
}
