'use server';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getSessionInfo } from '@/lib/auth/session';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';

async function requireSuperadmin() {
  const session = await getSessionInfo();
  if (!session) throw new Error('Authentification requise');
  if (!session.isSuperadmin) throw new Error('Accès réservé superadmin');
  return session;
}

/**
 * Toggle the platform-level `is_superadmin` flag on a user account.
 * Superadmin-only. Refuses self-demotion to avoid locking the platform out.
 */
export async function setSuperadmin(userId: string, value: boolean): Promise<void> {
  const session = await requireSuperadmin();
  if (!value && userId === session.userId) {
    throw new Error('Impossible de se retirer soi-même le statut superadmin');
  }
  await db
    .update(users)
    .set({ is_superadmin: value, updatedAt: new Date() })
    .where(eq(users.id, userId));
  logger.info('[ADMIN_USERS] setSuperadmin', {
    actor: session.userId,
    target: userId,
    value,
  });
  revalidatePath('/admin/users');
}

/**
 * Resolve a user id from an email address. Superadmin-only.
 * Returns null when no user matches — callers decide how to handle
 * (e.g. surface a French error in a form, or create an invite link).
 */
export async function findUserByEmail(email: string): Promise<{ id: string; email: string; name: string | null } | null> {
  await requireSuperadmin();
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.email, trimmed))
    .limit(1);
  return row ?? null;
}
