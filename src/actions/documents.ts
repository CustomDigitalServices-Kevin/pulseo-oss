'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { documents, audit_logs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { uploadDocumentSchema } from '@/lib/validations/documents';
import { requireSession } from '@/lib/auth/session';
import { requireEffectiveRole, RoleError } from '@/lib/auth/require-role';
import {
  validateFileSize,
  validateMagicBytes,
  sanitizeFilename,
} from '@/lib/utils/file-validation';
import { Document } from '@/types';
import { logger } from '@/lib/logger';

const ALLOWED_DOC_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];

export async function uploadDocument(
  formData: FormData
): Promise<{ success: boolean; error?: string; data?: Document }> {
  try {
    const session = await requireSession();

    const file = formData.get('file') as File;
    if (!file) {
      return { success: false, error: 'Aucun fichier fourni' };
    }

    if (!validateFileSize(file.size)) {
      return { success: false, error: 'Fichier trop volumineux (max 10MB)' };
    }

    if (!ALLOWED_DOC_MIMES.includes(file.type)) {
      return { success: false, error: 'Type de fichier non autorise (PDF, Word, images)' };
    }

    // Magic-bytes validation — reject files whose actual content does not
    // match the claimed MIME type (e.g. a PHP shell uploaded as .pdf).
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validateMagicBytes(buffer, file.type)) {
      return { success: false, error: 'Fichier corrompu ou type invalide' };
    }

    const metadata = {
      title: formData.get('title') as string,
      type: formData.get('type') as string,
      organization_id: formData.get('organization_id') as string,
      amount: (formData.get('amount') as string) || null,
      issued_at: formData.get('issued_at') ? new Date(formData.get('issued_at') as string) : null,
    };

    const validated = uploadDocumentSchema.parse(metadata);

    // Only gestionnaires and admins can upload documents (invoices, quotes, ...).
    await requireEffectiveRole(session.user.id, validated.organization_id, 'gestionnaire');

    const storagePath = process.env.STORAGE_PATH || './storage';
    const docPath = path.join(storagePath, validated.organization_id, 'documents');

    if (!existsSync(docPath)) {
      await mkdir(docPath, { recursive: true });
    }

    const fileId = uuid();
    const filename = sanitizeFilename(file.name);
    // Extract extension only when a real dot is present; otherwise fall back
    // to 'bin' to avoid reusing the whole name as the extension.
    const dotIdx = filename.lastIndexOf('.');
    const ext = dotIdx > 0 ? filename.slice(dotIdx + 1) : 'bin';
    const safeFilename = `${fileId}.${ext}`;
    const filePath = path.join(docPath, safeFilename);

    await writeFile(filePath, buffer);

    const docId = uuid();
    const [newDoc] = await db
      .insert(documents)
      .values({
        id: docId,
        organization_id: validated.organization_id,
        title: validated.title,
        type: validated.type,
        source: 'manual',
        filename: filename,
        file_key: safeFilename,
        file_size_bytes: file.size,
        mime_type: file.type,
        amount: validated.amount,
        issued_at: validated.issued_at,
        uploaded_by_id: session.user.id,
      })
      .returning();

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: validated.organization_id,
      entity_type: 'document',
      entity_id: docId,
      action: 'uploaded',
      actor_id: session.user.id,
      changes: {
        title: validated.title,
        type: validated.type,
        filename: filename,
      },
    });

    revalidatePath(`/clients`);
    return { success: true, data: newDoc };
  } catch (error) {
    if (error instanceof RoleError) {
      return { success: false, error: error.message };
    }
    logger.error('Upload document failed', { error: String(error) });
    return {
      success: false,
      error: 'Erreur lors de l\'upload du document',
    };
  }
}

export async function deleteDocument(
  documentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSession();

    const doc = await db.query.documents.findFirst({
      where: (d, { eq }) => eq(d.id, documentId),
    });

    if (!doc) {
      return { success: false, error: 'Document non trouve' };
    }

    // Only gestionnaires and admins can delete documents.
    await requireEffectiveRole(session.user.id, doc.organization_id, 'gestionnaire');

    if (doc.file_key) {
      const storagePath = process.env.STORAGE_PATH || './storage';
      const filePath = path.join(storagePath, doc.organization_id, 'documents', doc.file_key);
      try {
        await unlink(filePath);
      } catch {
        // File may not exist
      }
    }

    await db.delete(documents).where(eq(documents.id, documentId));

    await db.insert(audit_logs).values({
      id: uuid(),
      organization_id: doc.organization_id,
      entity_type: 'document',
      entity_id: documentId,
      action: 'deleted',
      actor_id: session.user.id,
    });

    revalidatePath(`/clients`);
    return { success: true };
  } catch (error) {
    if (error instanceof RoleError) {
      return { success: false, error: error.message };
    }
    logger.error('Delete document failed', { error: String(error) });
    return {
      success: false,
      error: 'Erreur lors de la suppression du document',
    };
  }
}
