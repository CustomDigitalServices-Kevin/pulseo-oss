'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth/session';
import { writeLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { headers } from 'next/headers';

async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('x-real-ip') ?? 'unknown';
}

/**
 * Marque le tour d'onboarding comme terminé (ou skippé) pour l'utilisateur.
 * Idempotent : si déjà marqué, retourne success sans re-write. Persistance
 * cross-device : l'user ne voit pas le tour 2x sur mobile + desktop.
 *
 * Réactivation : pas de Server Action dédiée — le bouton "Aide" relance
 * driver.js côté client sans toucher la DB. Pour resetter un user côté
 * admin, c'est manuel (UPDATE users SET tour_completed_at = NULL).
 */
export async function markTourCompleted() {
  const session = await requireSession();

  const ip = await getClientIp();
  const limit = writeLimiter.check(`tour-completed:${ip}`);
  if (!limit.allowed) {
    return { success: false as const, error: 'Trop de tentatives, reessayez plus tard.' };
  }

  try {
    await db
      .update(users)
      .set({ tour_completed_at: new Date() })
      .where(eq(users.id, session.user.id));

    return { success: true as const };
  } catch (error) {
    logger.error('markTourCompleted failed', {
      userId: session.user.id,
      error: String(error),
    });
    return { success: false as const, error: 'Erreur lors de la sauvegarde' };
  }
}
