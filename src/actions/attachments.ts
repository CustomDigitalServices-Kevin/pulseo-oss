'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { ticket_attachments, audit_logs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { validateFile, sanitizeFilename } from '@/lib/utils/file-validation';
import { requireSession } from '@/lib/auth/session';
import { requireEffectiveRole, RoleError } from '@/lib/auth/require-role';
import { canAccessOrg } from '@/lib/auth/permissions';
import { TicketAttachment } from '@/types';
import { logger } from '@/lib/logger';

export async function uploadAttachment(
  ticketId: string,
  formData: FormData
): Promise<{ success: boolean; error?: string; data?: TicketAttachment }> {
  try {
    const session = await requireSession();
    const file = formData.get('file') as File;

    if (!file) {
      return { success: false, error: 'Aucun fichier fourni' };
    }

    const validation = await validateFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const ticket = await db.query.tickets.findFirst({
      where: (t, { eq }) => eq(t.id, ticketId),
    });

    if (!ticket) {
      return { success: false, error: 'Ticket non trouve' };
    }

    if (!(await canAccessOrg(session.user.id, ticket.organization_id))) {
      return { success: false, error: 'Acces non autorise' };
    }

    const storagePath = process.env.STORAGE_PATH || './storage';
    const attachmentPath = path.join(
      storagePath,
      ticket.organization_id,
      'tickets',
      ticketId
    );

    if (!existsSync(attachmentPath)) {
      await mkdir(attachmentPath, { recursive: true });
    }

    const fileId = uuid();
    const filename = sanitizeFilename(file.name);
    // Extract the extension only when there is a real dot in the filename;
    // otherwise we'd end up using the whole name as the "extension".
    const dotIdx = filename.lastIndexOf('.');
    const ext = dotIdx > 0 ? filename.slice(dotIdx + 1) : 'bin';
    const safeFilename = `${fileId}.${ext}`;
    const filePath = path.join(attachmentPath, safeFilename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const attachmentId = uuid();
    const [newAttachment] = await db
      .insert(ticket_attachments)
      .values({
        id: attachmentId,
        ticket_id: ticketId,
        uploaded_by_id: session.user.id,
        filename: filename,
        file_key: safeFilename,
        file_size_bytes: file.size,
        mime_type: file.type,
      })
      .returning();

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: ticket.organization_id,
      entity_type: 'attachment',
      entity_id: attachmentId,
      action: 'uploaded',
      actor_id: session.user.id,
      changes: {
        filename: filename,
        file_size_bytes: file.size,
      },
    });

    revalidatePath(`/clients`);
    return { success: true, data: newAttachment };
  } catch (error) {
    logger.error('Upload attachment failed', { error: String(error) });
    return {
      success: false,
      error: 'Erreur lors de l\'upload de la piece jointe',
    };
  }
}

export async function deleteAttachment(
  attachmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSession();

    const attachment = await db.query.ticket_attachments.findFirst({
      where: (a, { eq }) => eq(a.id, attachmentId),
    });

    if (!attachment) {
      return { success: false, error: 'Piece jointe non trouvee' };
    }

    const ticket = await db.query.tickets.findFirst({
      where: (t, { eq }) => eq(t.id, attachment.ticket_id),
    });

    if (!ticket) {
      return { success: false, error: 'Ticket non trouve' };
    }

    // Allow deletion by the original uploader OR any gestionnaire/admin.
    const isUploader = attachment.uploaded_by_id === session.user.id;
    if (!isUploader) {
      await requireEffectiveRole(session.user.id, ticket.organization_id, 'gestionnaire');
    } else {
      // Uploader still needs an access path to the org (any of the 3 sources).
      if (!(await canAccessOrg(session.user.id, ticket.organization_id))) {
        return { success: false, error: 'Acces non autorise' };
      }
    }

    const storagePath = process.env.STORAGE_PATH || './storage';
    const filePath = path.join(
      storagePath,
      ticket.organization_id,
      'tickets',
      ticket.id,
      attachment.file_key
    );

    try {
      await unlink(filePath);
    } catch {
      // File may already be deleted from disk
    }

    await db
      .delete(ticket_attachments)
      .where(eq(ticket_attachments.id, attachmentId));

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: ticket.organization_id,
      entity_type: 'attachment',
      entity_id: attachmentId,
      action: 'deleted',
      actor_id: session.user.id,
    });

    revalidatePath(`/clients`);
    return { success: true };
  } catch (error) {
    if (error instanceof RoleError) {
      return { success: false, error: error.message };
    }
    logger.error('Delete attachment failed', { error: String(error) });
    return {
      success: false,
      error: 'Erreur lors de la suppression de la piece jointe',
    };
  }
}
