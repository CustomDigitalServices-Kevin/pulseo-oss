'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { tickets, ticket_comments, audit_logs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { createCommentSchema } from '@/lib/validations/comments';
import { requireSession } from '@/lib/auth/session';
import { requireEffectiveRole, RoleError, getMemberRole } from '@/lib/auth/require-role';
import { TicketComment } from '@/types';
import { logger } from '@/lib/logger';
import { logActivityEvent } from '@/lib/activity/log-event';
import { sendTicketNotificationEmail } from '@/lib/email/tickets';
import {
  getTicketNotificationRecipients,
  getOrganizationSlug,
} from '@/lib/email/notifications';

export async function createComment(
  data: unknown
): Promise<{ success: boolean; error?: string; data?: TicketComment }> {
  try {
    const session = await requireSession();
    const validated = createCommentSchema.parse(data);

    const ticket = await db.query.tickets.findFirst({
      where: (t, { eq }) => eq(t.id, validated.ticket_id),
    });

    if (!ticket) {
      return { success: false, error: 'Ticket non trouve' };
    }

    await requireEffectiveRole(session.user.id, ticket.organization_id, 'viewer');

    const commentId = uuid();
    const now = new Date();

    // Determine if this comment constitutes the "first response" for SLA
    // (ticket.responded_at stamping). Only a gestionnaire/admin comment can
    // count as a response, and only if no response has been recorded yet.
    const memberRole = await getMemberRole(session.user.id, ticket.organization_id);
    const isStaffResponse =
      memberRole?.role === 'gestionnaire' || memberRole?.role === 'admin';
    const shouldStampResponse = isStaffResponse && !ticket.responded_at;

    const newComment = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(ticket_comments)
        .values({
          id: commentId,
          ticket_id: validated.ticket_id,
          author_id: session.user.id,
          content: validated.content,
          is_internal: validated.is_internal,
        })
        .returning();

      if (shouldStampResponse) {
        await tx
          .update(tickets)
          .set({ responded_at: now, updated_at: now })
          .where(eq(tickets.id, ticket.id));
      }

      return inserted;
    });

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: ticket.organization_id,
      entity_type: 'comment',
      entity_id: commentId,
      action: 'created',
      actor_id: session.user.id,
      changes: {
        is_internal: validated.is_internal,
      },
    });

    // Activity feed event (fire-and-forget, gated by ENABLE_ACTIVITY_LOGGING).
    // Scoped to the ticket's organization and anchored to the ticket id so the
    // feed aggregates comments per ticket, not per comment row.
    logActivityEvent({
      userId: session.user.id,
      organizationId: ticket.organization_id,
      eventType: 'ticket_commented',
      resourceId: validated.ticket_id,
    });

    // Internal comments are only visible to staff — do not email the client/guest.
    // Everyone else (including superadmins) still gets the notification.
    try {
      const [recipients, orgSlug, actor] = await Promise.all([
        getTicketNotificationRecipients({
          orgId: ticket.organization_id,
          ticketCreatorId: validated.is_internal ? null : ticket.creator_id,
          guestEmail: validated.is_internal ? null : ticket.guest_email,
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
          type: 'commented',
          ticket,
          creatorEmail: email,
          orgSlug,
          actorName,
          commentPreview: validated.content,
        });
      }
    } catch (emailError) {
      logger.error('Notification email failed (comment)', { error: String(emailError) });
    }

    revalidatePath('/clients', 'layout');
    return { success: true, data: newComment };
  } catch (error) {
    if (error instanceof RoleError) {
      return { success: false, error: error.message };
    }
    logger.error('Create comment failed', { error: String(error) });
    return {
      success: false,
      error: 'Erreur lors de la creation du commentaire',
    };
  }
}
