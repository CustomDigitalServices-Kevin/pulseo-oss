'use server';

import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { auth } from '@/lib/auth';
import {
  updateProfileSchema,
  updateEmailSchema,
  setPasswordSchema,
  updateLocaleSchema,
  type UpdateProfile,
  type UpdateEmail,
  type SetPassword,
  type UpdateLocale,
} from '@/lib/validations/profile';
import { saveAvatarFromBuffer, AVATAR_MAX_BYTES } from '@/lib/avatars';

type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string };

/**
 * Met à jour les champs profil libres (first_name, last_name, job_title).
 * Le `name` legacy est reconstruit automatiquement depuis first+last si les
 * deux sont fournis pour garder la compat affichage existant.
 */
export async function updateProfile(input: UpdateProfile): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const { first_name, last_name, job_title } = parsed.data;

  // Reconstruit `name` depuis first + last si au moins un des deux est fourni
  // pour garder la cohérence avec les composants legacy qui lisent users.name
  // (sidebar, header, comments author display).
  const reconstructedName =
    first_name || last_name ? `${first_name ?? ''} ${last_name ?? ''}`.trim() || null : undefined;

  await db
    .update(schema.users)
    .set({
      first_name,
      last_name,
      job_title,
      ...(reconstructedName !== undefined ? { name: reconstructedName } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, session.user.id));

  revalidatePath('/me/profile');
  return { success: true };
}

/**
 * Déclenche le changement d'email via Better Auth `changeEmail`. Par défaut
 * un lien de vérification est envoyé à la nouvelle adresse. L'email n'est
 * mis à jour qu'après click du lien.
 */
export async function updateEmail(input: UpdateEmail): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = updateEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid email' };
  }
  if (parsed.data.newEmail === session.user.email) {
    return { success: false, error: 'Nouvelle adresse identique à l actuelle' };
  }

  try {
    await auth.api.changeEmail({
      body: { newEmail: parsed.data.newEmail },
      headers: await headers(),
    });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur changement email',
    };
  }
}

/**
 * Définit ou change le mot de passe. Si l'user n'a pas encore de password
 * (magic-link only), utilise `setPassword`. Sinon `changePassword` avec
 * currentPassword obligatoire.
 */
export async function setOrChangePassword(input: SetPassword): Promise<ActionResult> {
  await requireSession();
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid password' };
  }

  const headersList = await headers();

  try {
    if (parsed.data.currentPassword) {
      // changePassword = Better Auth standard flow. Throw si currentPassword
      // ne match pas.
      await auth.api.changePassword({
        body: {
          newPassword: parsed.data.newPassword,
          currentPassword: parsed.data.currentPassword,
        },
        headers: headersList,
      });
    } else {
      // Cas passwordless → hybrid. `setPassword` ne requiert pas de current,
      // et Better Auth refuse si un password existe déjà (sécurité).
      await auth.api.setPassword({
        body: { newPassword: parsed.data.newPassword },
        headers: headersList,
      });
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur mot de passe',
    };
  }
}

/**
 * Met à jour la locale préférée côté DB + cookie i18n `pulseo_locale` pour
 * que le prochain rendu RSC via `next-intl` utilise la nouvelle langue.
 */
export async function updateLocale(input: UpdateLocale): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = updateLocaleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Langue invalide' };
  }

  await db
    .update(schema.users)
    .set({ locale: parsed.data.locale, updatedAt: new Date() })
    .where(eq(schema.users.id, session.user.id));

  const cookieStore = await cookies();
  cookieStore.set('pulseo_locale', parsed.data.locale, {
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
    httpOnly: false, // lisible côté client pour fallback composant
  });

  revalidatePath('/', 'layout');
  return { success: true };
}

/**
 * Upload d'un avatar via FormData (server action). Vérifie la taille via
 * content-length du File avant de décoder, valide les magic bytes, resize
 * sharp 256×256 WebP, écrit hors public/.
 */
export async function uploadAvatar(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const file = formData.get('avatar');
  if (!(file instanceof File)) {
    return { success: false, error: 'Fichier manquant' };
  }
  if (file.size === 0) return { success: false, error: 'Fichier vide' };
  if (file.size > AVATAR_MAX_BYTES) {
    return { success: false, error: 'Fichier > 2 Mo' };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const result = await saveAvatarFromBuffer(session.user.id, buf);
  if (!result.ok) {
    const msg =
      result.error === 'too_large'
        ? 'Fichier > 2 Mo'
        : result.error === 'not_an_image'
          ? 'Format d image invalide'
          : 'Traitement échoué';
    return { success: false, error: msg };
  }

  // Mettre à jour `avatar_url` pointant sur la route API pour cache-bust via
  // timestamp (force les composants à recharger l'image après upload).
  const url = `/api/avatars/${encodeURIComponent(session.user.id)}?v=${Date.now()}`;
  await db
    .update(schema.users)
    .set({ avatar_url: url, updatedAt: new Date() })
    .where(eq(schema.users.id, session.user.id));

  revalidatePath('/me/profile');
  revalidatePath('/', 'layout');
  return { success: true, data: { url } };
}
