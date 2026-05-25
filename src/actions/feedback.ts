'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { requireSession, isUserAdmin } from '@/lib/auth/session';
import {
  createFeedbackSchema,
  updateFeedbackStatusSchema,
  type CreateFeedback,
  type UpdateFeedbackStatus,
  type FeedbackStatus,
  type FeedbackType,
} from '@/lib/validations/feedback';
import { notifySuperadminsOfFeedback } from '@/lib/email/feedback';

type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string };

/**
 * Soumission d'un feedback par un user authentifié. organization_id est
 * optionnel : le caller peut le pré-remplir via contexte (page org → inject
 * le slug courant). Si absent, feedback scope plateforme.
 *
 * Notifie les superadmins par email best-effort (ne bloque pas la soumission
 * si Resend KO — le feedback reste visible dans /admin/feedback).
 */
export async function createFeedback(input: CreateFeedback): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  const parsed = createFeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  const id = randomUUID();
  const now = new Date();

  await db.insert(schema.user_feedback).values({
    id,
    user_id: session.user.id,
    organization_id: parsed.data.organization_id ?? null,
    type: parsed.data.type,
    title: parsed.data.title,
    description: parsed.data.description,
    status: 'new',
    created_at: now,
    updated_at: now,
  });

  // Fetch user + optional org name pour email enrichi
  const [userRow, orgRow] = await Promise.all([
    db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, session.user.id),
      columns: { name: true, email: true },
    }),
    parsed.data.organization_id
      ? db.query.organizations.findFirst({
          where: (o, { eq }) => eq(o.id, parsed.data.organization_id as string),
          columns: { name: true },
        })
      : Promise.resolve(null),
  ]);

  await notifySuperadminsOfFeedback({
    feedbackId: id,
    type: parsed.data.type,
    title: parsed.data.title,
    description: parsed.data.description,
    userName: userRow?.name ?? null,
    userEmail: userRow?.email ?? session.user.email,
    organizationName: orgRow?.name ?? null,
  }).catch((e) => {
    // Best-effort logging, pas de throw
    console.warn('[feedback] superadmin notification failed', e);
  });

  revalidatePath('/admin/feedback');
  return { success: true, data: { id } };
}

/**
 * Mise à jour status + notes admin par un superadmin uniquement. Le status
 * et les notes sont visibles côté user dans un futur composant (ou via
 * email de réponse, itération future).
 */
export async function updateFeedbackStatus(
  input: UpdateFeedbackStatus,
): Promise<ActionResult> {
  const session = await requireSession();
  const isAdmin = await isUserAdmin(session.user.id);
  if (!isAdmin) {
    return { success: false, error: 'Reserve aux superadmins' };
  }
  const parsed = updateFeedbackStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  await db
    .update(schema.user_feedback)
    .set({
      status: parsed.data.status,
      admin_notes: parsed.data.admin_notes ?? null,
      updated_at: new Date(),
    })
    .where(eq(schema.user_feedback.id, parsed.data.id));

  revalidatePath('/admin/feedback');
  return { success: true };
}

export interface FeedbackListRow {
  id: string;
  type: FeedbackType;
  title: string;
  description: string;
  status: FeedbackStatus;
  admin_notes: string | null;
  created_at: Date;
  updated_at: Date;
  user: { name: string | null; email: string } | null;
  organization: { name: string; slug: string } | null;
}

/**
 * Liste des feedbacks pour la console admin. Ordonnée DESC created_at.
 * Filtrable optionnellement par status via un param caller-driven.
 */
export async function listFeedback(filters?: {
  status?: FeedbackStatus;
  type?: FeedbackType;
}): Promise<FeedbackListRow[]> {
  const session = await requireSession();
  const isAdmin = await isUserAdmin(session.user.id);
  if (!isAdmin) {
    throw new Error('Reserve aux superadmins');
  }

  const rows = await db.query.user_feedback.findMany({
    orderBy: [desc(schema.user_feedback.created_at)],
    with: {
      user: { columns: { name: true, email: true } },
      organization: { columns: { name: true, slug: true } },
    },
  });

  return rows
    .filter((r) => {
      if (filters?.status && r.status !== filters.status) return false;
      if (filters?.type && r.type !== filters.type) return false;
      return true;
    })
    .map((r) => ({
      id: r.id,
      type: r.type as FeedbackType,
      title: r.title,
      description: r.description,
      status: r.status as FeedbackStatus,
      admin_notes: r.admin_notes,
      created_at: r.created_at,
      updated_at: r.updated_at,
      user: r.user ?? null,
      organization: r.organization ?? null,
    }));
}
