import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq, and, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { invite_links, organization_members } from '@/lib/db/schema';
import { logger } from '@/lib/logger';
import { notifyResponsiblesOfMember } from '@/lib/email/notifications';

interface Props {
  params: Promise<{ token: string }>;
}

/**
 * Server-only invite acceptance page (cf P0-2 audit fix).
 *
 * Reached AFTER the user has clicked the magic link Better Auth sent at
 * the end of /invite/join/[token]. By the time this page renders, the
 * Better Auth verify endpoint has already set a session cookie, so we can
 * trust `auth.api.getSession()` to identify the consenting user.
 *
 * Behaviour:
 *   1. Require a verified session — without one, redirect to the join
 *      form (the magic link probably expired or was never clicked).
 *   2. Validate the invite link (exists, active, not expired, has an
 *      organization_id).
 *   3. In a single transaction: insert the membership if absent and
 *      increment use_count atomically. Idempotent on re-click.
 *   4. Redirect to /clients/<slug>.
 *
 * Security guarantees compared to the old flow:
 *   - The membership is granted only to the verified session user, not
 *     to whatever email a third party submitted on the join page. This
 *     closes the cross-tenant forced-enrollment vector.
 *   - No oracle: an attacker who somehow lands on this URL without a
 *     session is bounced to the join form, regardless of the token's
 *     state.
 */
export default async function InviteAcceptPage({ params }: Props) {
  const { token } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect(`/invite/join/${encodeURIComponent(token)}`);
  }

  const link = await db.query.invite_links.findFirst({
    where: (links, { eq: e }) => e(links.token, token),
    with: {
      organization: { columns: { id: true, slug: true } },
    },
  });
  if (!link || !link.is_active) {
    redirect(`/invite/join/${encodeURIComponent(token)}`);
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    redirect(`/invite/join/${encodeURIComponent(token)}`);
  }
  if (!link.organization_id || !link.organization) {
    // Team-scoped invite links are not yet routable — reject explicitly
    // rather than silently swallowing the click.
    redirect('/');
  }

  const orgId = link.organization_id;
  const orgSlug = link.organization.slug;
  const userId = session.user.id;

  let membershipNewlyCreated = false;

  try {
    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: organization_members.id })
        .from(organization_members)
        .where(
          and(
            eq(organization_members.organization_id, orgId),
            eq(organization_members.user_id, userId),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await tx.insert(organization_members).values({
          id: uuid(),
          organization_id: orgId,
          user_id: userId,
          role: 'viewer',
        });
        membershipNewlyCreated = true;
      }

      await tx
        .update(invite_links)
        .set({ use_count: sql`${invite_links.use_count} + 1` })
        .where(eq(invite_links.id, link.id));
    });
  } catch (error) {
    logger.error('Invite accept transaction failed', {
      token,
      userId,
      orgId,
      error: String(error),
    });
    // Even on failure, we don't expose the cause to the user. Bouncing
    // them back to the join form will let them retry; logs carry the
    // diagnostic.
    redirect(`/invite/join/${encodeURIComponent(token)}`);
  }

  // Best-effort notification of org responsibles. Only fires when a real
  // grant happened (idempotent re-click does not spam). Failures are
  // logged but never block the redirect.
  if (membershipNewlyCreated) {
    try {
      await notifyResponsiblesOfMember({
        userId,
        orgId,
      });
    } catch (error) {
      logger.error('notifyResponsiblesOfMember failed', {
        userId,
        orgId,
        error: String(error),
      });
    }
  }

  redirect(`/clients/${orgSlug}`);
}
