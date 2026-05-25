import { cache } from 'react';
import { headers } from 'next/headers';
import { auth } from './index';
import { db } from '../db';

export async function getSession() {
  const headersList = await headers();
  const session = await auth.api.getSession({
    headers: headersList,
  });
  return session;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new Error('Authentification requise');
  }
  return session;
}

/**
 * Platform super-admin check. Distinct from org-level `admin` role —
 * only super-admins can access `/admin/*` platform-wide features
 * (cross-tenant organization management, magic links, invite links,
 * audit logs). Org-level admins retain admin privileges only inside
 * their own organization.
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, userId),
    columns: { is_superadmin: true },
  });
  return Boolean(user?.is_superadmin);
}

export async function requireAdmin() {
  const session = await requireSession();
  const admin = await isUserAdmin(session.user.id);
  if (!admin) {
    throw new Error('Acces administrateur requis');
  }
  return session;
}

export type SessionInfo = { userId: string; isSuperadmin: boolean };

/**
 * Resout la session Better Auth + flag `is_superadmin` en une seule passe.
 * Memoise par requete HTTP via React.cache pour eviter plusieurs round-trips
 * (layout + page + Server Action peuvent tous appeler getSessionInfo()).
 *
 * Utilise par les Server Actions Phase C+ (groups, teams, members) et par
 * les layouts des nouvelles routes /groups/[slug]/*. Les consumers existants
 * (getSession / requireSession / isUserAdmin / requireAdmin) restent en place
 * pour back-compat.
 */
export const getSessionInfo = cache(async (): Promise<SessionInfo | null> => {
  // Reutilise le helper existant pour ne pas dupliquer la logique headers/auth
  const session = await getSession();
  if (!session?.user?.id) return null;
  const admin = await isUserAdmin(session.user.id);
  return { userId: session.user.id, isSuperadmin: admin };
});
