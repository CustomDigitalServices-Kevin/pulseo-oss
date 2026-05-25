'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession } from '@/lib/auth/session';
import {
  requestAccountDeletionSchema,
  type RequestAccountDeletion,
} from '@/lib/validations/rgpd';
import { notifyDpoOfDeletionRequest } from '@/lib/email/rgpd-notifications';
import { logger } from '@/lib/logger';

type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string; code?: 'duplicate' | 'invalid' | 'unauthorized' };

/**
 * Crée une demande de suppression de compte (RGPD art. 17).
 *
 * Garde-fou anti-doublons : si l'utilisateur a déjà une demande en
 * `pending` ou `processing`, on retourne `duplicate` sans créer de nouvelle
 * ligne ni renvoyer un email (évite spam DPO si user clique en boucle).
 *
 * MVP: no actual deletion, the DPO handles every request manually after
 * receiving the notification email. See `docs/SECURITY.md` for the
 * privacy threat model.
 */
export async function requestAccountDeletion(
  input: RequestAccountDeletion,
): Promise<ActionResult<{ requestId: string }>> {
  let userId: string;
  try {
    const session = await requireSession();
    userId = session.user.id;
  } catch {
    return { success: false, error: 'Authentification requise', code: 'unauthorized' };
  }

  const parsed = requestAccountDeletionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Saisie invalide',
      code: 'invalid',
    };
  }

  // Vérif doublon
  const existing = await db
    .select({ id: schema.rgpd_deletion_requests.id })
    .from(schema.rgpd_deletion_requests)
    .where(
      and(
        eq(schema.rgpd_deletion_requests.user_id, userId),
        inArray(schema.rgpd_deletion_requests.status, ['pending', 'processing']),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return {
      success: false,
      error: 'Une demande de suppression est déjà en cours de traitement.',
      code: 'duplicate',
    };
  }

  // Créer la demande
  const requestId = randomUUID();
  const now = new Date();

  await db.insert(schema.rgpd_deletion_requests).values({
    id: requestId,
    user_id: userId,
    reason: parsed.data.reason ?? null,
    status: 'pending',
    requested_at: now,
  });

  // Charger info user pour email
  const userRow = await db
    .select({
      email: schema.users.email,
      name: schema.users.name,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  const userEmail = userRow[0]?.email ?? '(email introuvable)';
  const userName = userRow[0]?.name ?? null;

  // Notification DPO best-effort (ne bloque pas)
  try {
    await notifyDpoOfDeletionRequest({
      requestId,
      userId,
      userEmail,
      userName,
      reason: parsed.data.reason ?? null,
      requestedAt: now,
    });
  } catch (err) {
    logger.warn('notifyDpoOfDeletionRequest threw, continuing', {
      requestId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  revalidatePath('/me/rgpd');
  return { success: true, data: { requestId } };
}

/**
 * Liste les demandes en cours pour l'utilisateur courant (used par /me/rgpd
 * pour bloquer le bouton et afficher le statut).
 */
export async function listMyDeletionRequests(): Promise<
  Array<{
    id: string;
    status: string;
    requested_at: Date;
    processed_at: Date | null;
  }>
> {
  let userId: string;
  try {
    const session = await requireSession();
    userId = session.user.id;
  } catch {
    return [];
  }

  const rows = await db
    .select({
      id: schema.rgpd_deletion_requests.id,
      status: schema.rgpd_deletion_requests.status,
      requested_at: schema.rgpd_deletion_requests.requested_at,
      processed_at: schema.rgpd_deletion_requests.processed_at,
    })
    .from(schema.rgpd_deletion_requests)
    .where(eq(schema.rgpd_deletion_requests.user_id, userId))
    .orderBy(schema.rgpd_deletion_requests.requested_at);

  return rows;
}
