'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { createMagicLinkSchema } from '@/lib/validations/magic-links';
import { requireAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { organization_members } from '@/lib/db/schema';
import { createAuditLog } from '@/lib/utils/audit';
import { logger } from '@/lib/logger';

/**
 * Admin tool — re-send a magic-link sign-in to an EXISTING member of the
 * target organization.
 *
 * Onboarding new users (no account yet) goes through the dedicated
 * invite-link flow on the same admin page. Pre-flight checks here:
 *   1. The email must match an existing Pulseo user.
 *   2. That user must already be a direct member of the org (group/team
 *      grants are out of scope: this admin tool is for password-less login
 *      to a known membership, not for cross-tenant elevation).
 *
 * The actual link is generated and sent by Better Auth's magicLink plugin
 * via the `sendMagicLink` hook configured in src/lib/auth/index.ts (which
 * delegates to sendMagicLinkEmail). On configuration failure the audit log
 * is NOT written and the action returns an error.
 */
export async function createMagicLink(data: {
  email: string;
  organization_id: string;
}) {
  const session = await requireAdmin();
  const validated = createMagicLinkSchema.parse(data);

  const org = await db.query.organizations.findFirst({
    where: (orgs, { eq: e }) => e(orgs.id, validated.organization_id),
    columns: { id: true, name: true, slug: true },
  });

  if (!org) {
    return { success: false as const, error: 'Organisation non trouvée' };
  }

  const targetUser = await db.query.users.findFirst({
    where: (u, { eq: e }) => e(u.email, validated.email),
    columns: { id: true },
  });
  if (!targetUser) {
    return {
      success: false as const,
      error: 'Aucun compte trouvé pour cet email. Utilisez un lien d\'invitation pour onboarder un nouvel utilisateur.',
    };
  }

  const membership = await db
    .select({ id: organization_members.id })
    .from(organization_members)
    .where(
      and(
        eq(organization_members.organization_id, org.id),
        eq(organization_members.user_id, targetUser.id),
      ),
    )
    .limit(1);
  if (membership.length === 0) {
    return {
      success: false as const,
      error: "Cet utilisateur n'est pas membre de l'organisation cible.",
    };
  }

  const callbackURL = `/clients/${org.slug}`;
  try {
    await auth.api.signInMagicLink({
      body: { email: validated.email, callbackURL },
      headers: await headers(),
    });
  } catch (emailError) {
    logger.error('Failed to send magic link', {
      email: validated.email,
      orgSlug: org.slug,
      error: String(emailError),
    });
    return { success: false as const, error: "Erreur lors de l'envoi du magic link" };
  }

  await createAuditLog({
    actorId: session.user.id,
    orgId: validated.organization_id,
    action: 'sent',
    entityType: 'magic_link',
    entityId: validated.email,
    changes: { email: validated.email, orgSlug: org.slug },
  });

  revalidatePath('/admin/magic-links');
  return {
    success: true as const,
    data: { email: validated.email, orgSlug: org.slug },
  };
}
