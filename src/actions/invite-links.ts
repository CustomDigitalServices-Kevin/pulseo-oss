'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { invite_links, tickets, organization_members, users, accounts } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { randomBytes } from 'crypto';
import {
  createInviteLinkSchema,
  guestTicketSchema,
  registerFromInviteSchema,
  startInviteSignInSchema,
} from '@/lib/validations/invite-links';
import { requireAdmin } from '@/lib/auth/session';
import { sendEmail, escapeHtml } from '@/lib/email';
import { hashPassword } from '@/lib/auth/password';
import { createAuditLog } from '@/lib/utils/audit';
import { writeLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { auth } from '@/lib/auth';
import { getEmailFooterBrand } from '@/config/app-config';

async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('x-real-ip') ?? 'unknown';
}

// ─── Admin: Créer un lien invité ────────────────────────────────────────────

export async function createInviteLink(data: {
  organization_id: string;
  label?: string;
  expires_at?: string;
}) {
  const session = await requireAdmin();
  const validated = createInviteLinkSchema.parse(data);

  const org = await db.query.organizations.findFirst({
    where: (orgs, { eq: colEq }) => colEq(orgs.id, validated.organization_id),
  });

  if (!org) {
    return { success: false as const, error: 'Organisation non trouvee' };
  }

  const token = randomBytes(32).toString('hex');
  const linkId = uuid();

  await db.insert(invite_links).values({
    id: linkId,
    token,
    organization_id: validated.organization_id,
    created_by: session.user.id,
    label: validated.label || null,
    expires_at: validated.expires_at ? new Date(validated.expires_at) : null,
  });

  await createAuditLog({
    actorId: session.user.id,
    orgId: validated.organization_id,
    action: 'created',
    entityType: 'invite_link',
    entityId: linkId,
    changes: { label: validated.label, expires_at: validated.expires_at },
  });

  const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
  const inviteUrl = `${baseUrl}/invite/join/${token}`;

  revalidatePath('/admin/magic-links');
  return {
    success: true as const,
    data: { id: linkId, token, url: inviteUrl, orgName: org.name },
  };
}

// ─── Admin: Révoquer un lien invité ─────────────────────────────────────────

export async function revokeInviteLink(linkId: string) {
  const session = await requireAdmin();

  const link = await db.query.invite_links.findFirst({
    where: (l, { eq: colEq }) => colEq(l.id, linkId),
    columns: { organization_id: true },
  });

  if (!link) {
    return { success: false as const, error: 'Lien introuvable' };
  }

  // Team-scoped invite_links (organization_id NULL) are a separate flow
  // exposed by the teams admin module; the public invite-acceptance UI
  // only handles org-scoped links.
  if (!link.organization_id) {
    return { success: false as const, error: 'Lien non supporté (team-scoped)' };
  }

  await db
    .update(invite_links)
    .set({ is_active: false })
    .where(eq(invite_links.id, linkId));

  await createAuditLog({
    actorId: session.user.id,
    orgId: link.organization_id,
    action: 'revoked',
    entityType: 'invite_link',
    entityId: linkId,
  });

  revalidatePath('/admin/magic-links');
  return { success: true as const };
}

// ─── Admin: Lister les liens invités ─────────────────────────────────────────

export async function listInviteLinks() {
  await requireAdmin();

  const result = await db.query.invite_links.findMany({
    with: {
      organization: { columns: { name: true, slug: true, color_primary: true } },
    },
    orderBy: (links, { desc }) => [desc(links.created_at)],
  });

  return result;
}

// ─── Public: Valider un lien invité ──────────────────────────────────────────

export async function validateInviteLink(token: string) {
  const link = await db.query.invite_links.findFirst({
    where: (links, { eq: colEq }) => colEq(links.token, token),
    with: {
      organization: {
        columns: { id: true, name: true, slug: true, color_primary: true, logo_url: true },
      },
    },
  });

  if (!link) {
    return { valid: false as const, error: 'Lien invalide ou introuvable' };
  }

  if (!link.is_active) {
    return { valid: false as const, error: 'Ce lien a ete desactive' };
  }

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return { valid: false as const, error: 'Ce lien a expire' };
  }

  return {
    valid: true as const,
    data: {
      organization: link.organization,
    },
  };
}

// ─── Public: Créer un ticket en tant qu'invité ──────────────────────────────

export async function createGuestTicket(data: {
  token: string;
  guest_name: string;
  guest_email: string;
  title: string;
  description: string;
  priority: string;
  category: string;
}) {
  try {
    // Rate limit public endpoint per IP (30 req / minute).
    const ip = await getClientIp();
    const limit = writeLimiter.check(`guest-ticket:${ip}`);
    if (!limit.allowed) {
      return { success: false as const, error: 'Trop de tentatives, veuillez reessayer plus tard.' };
    }

    const validated = guestTicketSchema.parse(data);

    const link = await db.query.invite_links.findFirst({
      where: (links, { eq: colEq }) => colEq(links.token, validated.token),
      with: {
        organization: { columns: { id: true, name: true, slug: true } },
      },
    });

    if (!link || !link.is_active) {
      return { success: false as const, error: 'Lien invalide ou desactive' };
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return { success: false as const, error: 'Ce lien a expire' };
    }

    // Team-scoped invite_links cannot raise guest tickets (no org context
    // to attach the ticket to). The teams admin flow uses these links for
    // a different purpose; reject explicitly here.
    if (!link.organization_id || !link.organization) {
      return { success: false as const, error: 'Lien non supporté (team-scoped)' };
    }
    const orgId = link.organization_id;

    const ticketId = uuid();

    const newTicket = await db.transaction(async (tx) => {
      // Advisory lock per-org : prévient les collisions sur unique_org_ticket_number
      // sous load concurrent (cf P1-5 audit). Le lock xact se libère en fin de tx.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('ticket-num-' || ${orgId}))`,
      );
      const [inserted] = await tx
        .insert(tickets)
        .values({
          id: ticketId,
          organization_id: orgId,
          number: sql`(SELECT COALESCE(MAX(${tickets.number}), 0) + 1 FROM ${tickets} WHERE ${tickets.organization_id} = ${orgId})`,
          title: validated.title,
          description: validated.description,
          priority: validated.priority,
          category: validated.category,
          status: 'new',
          guest_name: validated.guest_name,
          guest_email: validated.guest_email,
          invite_link_id: link.id,
        })
        .returning();

      await tx
        .update(invite_links)
        .set({ use_count: sql`${invite_links.use_count} + 1` })
        .where(eq(invite_links.id, link.id));

      return inserted;
    });

    // Notifier les gestionnaires (best-effort, hors transaction)
    try {
      await notifyGestionnaires(
        link.organization_id,
        'guest_ticket',
        link.organization.name,
        validated.guest_name,
        validated.guest_email,
        newTicket.number,
        validated.title,
      );
    } catch (emailError) {
      logger.error('Notify gestionnaires failed (guest_ticket)', { error: String(emailError) });
    }

    return {
      success: true as const,
      data: { ticketNumber: newTicket.number, orgName: link.organization.name },
    };
  } catch (error) {
    logger.error('Create guest ticket failed', { error: String(error) });
    return { success: false as const, error: 'Erreur lors de la creation du ticket' };
  }
}

// ─── Public: Créer un compte depuis un lien invité ──────────────────────────

export async function registerFromInvite(data: {
  token: string;
  name: string;
  email: string;
  password: string;
}) {
  try {
    // Rate limit public endpoint per IP (30 req / minute).
    const ip = await getClientIp();
    const limit = writeLimiter.check(`register-invite:${ip}`);
    if (!limit.allowed) {
      return { success: false as const, error: 'Trop de tentatives, veuillez reessayer plus tard.' };
    }

    const validated = registerFromInviteSchema.parse(data);

    const link = await db.query.invite_links.findFirst({
      where: (links, { eq: colEq }) => colEq(links.token, validated.token),
      with: {
        organization: { columns: { id: true, name: true, slug: true } },
      },
    });

    if (!link || !link.is_active) {
      return { success: false as const, error: 'Lien invalide ou desactive' };
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return { success: false as const, error: 'Ce lien a expire' };
    }

    // Team-scoped invite_links are not eligible for the legacy
    // password-based register flow — they require the team admin path.
    if (!link.organization_id || !link.organization) {
      return { success: false as const, error: 'Lien non supporté (team-scoped)' };
    }
    const orgId = link.organization_id;

    // Pre-check for better UX message. The unique constraint on users.email
    // is the authoritative race-condition guard inside the transaction below.
    const existingUser = await db.query.users.findFirst({
      where: (u, { eq: colEq }) => colEq(u.email, validated.email),
    });

    if (existingUser) {
      return {
        success: false as const,
        error: 'Un compte existe deja avec cet email. Connectez-vous plutot.',
      };
    }

    const userId = uuid();
    const hashedPassword = await hashPassword(validated.password);

    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        email: validated.email,
        name: validated.name,
        emailVerified: false,
      });

      await tx.insert(accounts).values({
        id: uuid(),
        userId: userId,
        accountId: userId,
        providerId: 'credential',
        password: hashedPassword,
      });

      await tx.insert(organization_members).values({
        id: uuid(),
        organization_id: orgId,
        user_id: userId,
        role: 'viewer',
      });

      await tx
        .update(invite_links)
        .set({ use_count: sql`${invite_links.use_count} + 1` })
        .where(eq(invite_links.id, link.id));
    });

    // Notifier les gestionnaires (best-effort, hors transaction)
    try {
      await notifyGestionnaires(
        orgId,
        'account_created',
        link.organization.name,
        validated.name,
        validated.email,
      );
    } catch (emailError) {
      logger.error('Notify gestionnaires failed (account_created)', { error: String(emailError) });
    }

    return {
      success: true as const,
      data: { userId, orgSlug: link.organization.slug },
    };
  } catch (error) {
    // Detect unique-violation from race condition on email.
    const msg = String(error);
    if (msg.includes('users_email_unique') || msg.includes('duplicate key')) {
      return { success: false as const, error: 'Un compte existe deja avec cet email.' };
    }
    logger.error('Register from invite failed', { error: msg });
    return { success: false as const, error: 'Erreur lors de la creation du compte' };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function notifyGestionnaires(
  orgId: string,
  type: 'guest_ticket' | 'account_created',
  orgName: string,
  personName: string,
  personEmail: string,
  ticketNumber?: number,
  ticketTitle?: string,
) {
  const gestionnaires = await db.query.organization_members.findMany({
    where: (m, { and, eq: colEq, or }) =>
      and(
        colEq(m.organization_id, orgId),
        or(colEq(m.role, 'gestionnaire'), colEq(m.role, 'admin'))
      ),
    with: {
      user: { columns: { email: true, name: true } },
    },
  });

  const safeName = escapeHtml(personName);
  const safeEmail = escapeHtml(personEmail);
  const safeOrg = escapeHtml(orgName);

  for (const member of gestionnaires) {
    if (!member.user?.email) continue;

    if (type === 'guest_ticket') {
      const safeTitle = escapeHtml(ticketTitle || '');
      await sendEmail({
        to: member.user.email,
        subject: `Nouveau ticket invite #${ticketNumber} - ${orgName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #2563EB;">Nouveau ticket d'un invite</h2>
            <p><strong>${safeName}</strong> (${safeEmail}) a soumis un ticket via un lien d'invitation.</p>
            <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0 0 8px;"><strong>Ticket #${ticketNumber}</strong></p>
              <p style="margin: 0; color: #475569;">${safeTitle}</p>
            </div>
            <p style="color: #64748b; font-size: 13px;">Organisation : ${safeOrg}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 11px;">${escapeHtml(getEmailFooterBrand())}</p>
          </div>
        `,
      });
    } else {
      await sendEmail({
        to: member.user.email,
        subject: `Nouveau compte utilisateur - ${orgName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #2563EB;">Nouveau compte cree</h2>
            <p><strong>${safeName}</strong> (${safeEmail}) a cree un compte via un lien d'invitation.</p>
            <p>Ce compte a ete ajoute comme <strong>Utilisateur</strong> de l'organisation <strong>${safeOrg}</strong>.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 11px;">${escapeHtml(getEmailFooterBrand())}</p>
          </div>
        `,
      });
    }
  }
}

// ─── Public: Magic-link invite flow (single-step) ───────────────────────────

/**
 * Single-step invite flow — privacy & consent fixes (cf P0-2 / P0-3 audit).
 *
 * Behaviour:
 *   1. The form submits email only. Identity (name) is collected later in
 *      /me/profile after the user is authenticated.
 *   2. We DO NOT look up the email server-side to decide a different reply.
 *      The response is uniform regardless of whether an account exists,
 *      preventing the previous user-enumeration oracle.
 *   3. We DO NOT enrol the user into organization_members here. Membership
 *      is granted only AFTER the user clicks the magic link in their inbox
 *      (passes through Better Auth verify) and lands on
 *      /invite/accept/[token], where a verified session is required.
 *   4. Better Auth magicLink plugin auto-creates the account on first
 *      verification (`disableSignUp` defaults to false). No `name` is
 *      passed: the column is nullable on `users` (schema.ts:84) and the
 *      user fills it in /me/profile post-login.
 *   5. Errors raised by Better Auth (e.g. malformed email) are swallowed
 *      and we still return success to keep the response uniform. Zod
 *      catches obvious format issues but they are reported as a generic
 *      success too.
 */
export async function startInviteMagicSignIn(data: {
  token: string;
  email: string;
}) {
  const ip = await getClientIp();
  const limit = writeLimiter.check(`invite-signin:${ip}`);
  if (!limit.allowed) {
    return { success: false as const, error: 'Trop de tentatives, reessayez plus tard.' };
  }

  // Token is public — caller can be told whether the link itself is valid.
  let link;
  try {
    link = await db.query.invite_links.findFirst({
      where: (links, { eq: colEq }) => colEq(links.token, data.token),
      with: {
        organization: { columns: { id: true, name: true, slug: true } },
      },
    });
  } catch (error) {
    logger.error('Invite link lookup failed', { error: String(error) });
    return { success: false as const, error: "Erreur lors de l'envoi du lien" };
  }
  if (!link || !link.is_active) {
    return { success: false as const, error: 'Lien invalide ou desactive' };
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return { success: false as const, error: 'Ce lien a expire' };
  }
  if (!link.organization_id || !link.organization) {
    return { success: false as const, error: 'Lien non supporté (team-scoped)' };
  }
  const org = link.organization;

  // Validate the form payload. On schema failure we still return a
  // success-looking shape so the existence/validity of the email is not
  // disclosed. Errors of structure (missing token) were already handled.
  const parsed = startInviteSignInSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: true as const,
      data: { orgName: org.name, orgSlug: org.slug },
    };
  }
  const validated = parsed.data;

  // Fire the magic link via Better Auth. Any failure (rate limit, format
  // rejected by Resend, transient SDK error) is swallowed to keep the
  // response shape uniform; the kill-switch / config issues are surfaced
  // through the EmailError logged inside sendMagicLinkEmail.
  //
  // `name: email` est passé en fallback : Better Auth insère `name || ""`
  // sur les nouveaux comptes (cf source magic-link plugin v1.x). Sans
  // fallback, plusieurs UI (member-detail-drawer, sidebar header) font
  // `user.name ?? user.email`, le `??` ne se déclenche PAS sur "" et
  // affiche du vide. L'utilisateur peut écraser cette valeur dans
  // /me/profile (champs first_name + last_name + name dérivé).
  const callbackURL = `/invite/accept/${validated.token}`;
  try {
    await auth.api.signInMagicLink({
      body: { email: validated.email, name: validated.email, callbackURL },
      headers: await headers(),
    });
  } catch (error) {
    logger.warn('Magic-link send failed (invite flow)', { error: String(error) });
  }

  return {
    success: true as const,
    data: { orgName: org.name, orgSlug: org.slug },
  };
}

