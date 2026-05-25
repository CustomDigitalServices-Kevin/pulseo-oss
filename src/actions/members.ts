'use server';

import { db } from '@/lib/db';
import {
  organization_members,
  users,
  invite_links,
  organizations as organizationsTable,
} from '@/lib/db/schema';
import { getSessionInfo } from '@/lib/auth/session';
import { canManageMember, canRemoveMember } from '@/lib/auth/permissions';
import { getEffectiveRole, type Role } from '@/lib/auth/effective-role';
import {
  addMemberSchema,
  removeMemberSchema,
  updateMemberRoleSchema,
  updateMemberInfoSchema,
} from '@/lib/validations/members';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'crypto';
import { logger } from '@/lib/logger';
import { sendEmail, escapeHtml } from '@/lib/email';
import { createAuditLog } from '@/lib/utils/audit';
import { z } from 'zod';
import { appConfig, getServerAppUrl, getEmailFooterBrand } from '@/config/app-config';

const RANK: Record<Role, number> = { viewer: 1, gestionnaire: 2, admin: 3 };

const ROLE_LABELS: Record<Role, string> = {
  viewer: 'Utilisateur',
  gestionnaire: 'Gestionnaire',
  admin: 'Administrateur',
};

interface AddMemberResult {
  type: 'enrolled' | 'invited';
  email: string;
  role: Role;
}

async function requireSession() {
  const session = await getSessionInfo();
  if (!session) throw new Error('Authentification requise');
  return session;
}

/**
 * Admin-driven membership grant.
 *
 * Behaviour split (cf P1-9 audit):
 *   - Existing user: enrol them directly with the requested role and send
 *     a heads-up email so the addition is never silent. Re-add of an
 *     already-member is a noop.
 *   - New user: create a per-org invite_link (token) and email them the
 *     /invite/join/<token> URL. The recipient lands on the standard
 *     consent flow and is granted membership (default role: viewer) only
 *     after they confirm via magic-link. The admin must promote to the
 *     requested role afterwards if it is not viewer — this constraint is
 *     surfaced in the email body and in the action's return shape.
 */
export async function addMember(input: unknown): Promise<AddMemberResult> {
  const session = await requireSession();
  const parsed = addMemberSchema.safeParse(input);
  if (!parsed.success) throw new Error('Données invalides');

  // Anti-escalation: a non-superadmin can only invite at a role STRICTLY
  // below their own. The target has no role yet, so canManageMember is
  // not applicable; the requested role's rank is compared to the actor's
  // effective rank.
  if (!session.isSuperadmin) {
    const actorRole = await getEffectiveRole(session.userId, parsed.data.organization_id);
    if (!actorRole || RANK[parsed.data.role] >= RANK[actorRole]) {
      throw new Error('Non autorisé à inviter un membre avec ce rôle');
    }
  }

  const org = await db.query.organizations.findFirst({
    where: (o, { eq: e }) => e(o.id, parsed.data.organization_id),
    columns: { name: true, slug: true },
  });
  if (!org) throw new Error('Organisation introuvable');

  const baseUrl = getServerAppUrl();
  const actor = await db.query.users.findFirst({
    where: (u, { eq: e }) => e(u.id, session.userId),
    columns: { name: true, email: true },
  });
  const actorName = actor?.name ?? actor?.email ?? null;

  const [existingUser] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  if (existingUser) {
    const [alreadyMember] = await db
      .select({ id: organization_members.id })
      .from(organization_members)
      .where(
        and(
          eq(organization_members.organization_id, parsed.data.organization_id),
          eq(organization_members.user_id, existingUser.id),
        ),
      )
      .limit(1);

    if (!alreadyMember) {
      await db.insert(organization_members).values({
        id: crypto.randomUUID(),
        organization_id: parsed.data.organization_id,
        user_id: existingUser.id,
        role: parsed.data.role,
      });
      logger.info('[MEMBERS] added existing user', {
        org: parsed.data.organization_id,
        user: existingUser.id,
        role: parsed.data.role,
      });
    }

    const safeOrg = escapeHtml(org.name);
    const safeRole = escapeHtml(ROLE_LABELS[parsed.data.role]);
    const safeActor = actorName ? escapeHtml(actorName) : null;
    const orgLink = `${baseUrl}/clients/${encodeURIComponent(org.slug)}`;
    const result = await sendEmail({
      to: parsed.data.email,
      subject: `[${appConfig.name}] Vous avez été ajouté à ${org.name}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#0f172a;">
          <h2 style="color:#2563EB;margin:0 0 12px;">Accès accordé</h2>
          <p style="margin:0 0 12px;">${safeActor ? `<strong>${safeActor}</strong> vous` : 'Vous'} a ajouté à l'organisation <strong>${safeOrg}</strong> avec le rôle <strong>${safeRole}</strong>.</p>
          <p style="margin:0 0 16px;">
            <a href="${orgLink}" style="display:inline-block;padding:10px 18px;background:#2563EB;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">
              Accéder à ${safeOrg}
            </a>
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="color:#999;font-size:11px;">${escapeHtml(getEmailFooterBrand())}</p>
        </div>
      `,
    });
    if (!result.success) {
      logger.warn('[MEMBERS] notification email failed', {
        email: parsed.data.email,
        error: result.error,
      });
    }

    revalidatePath(`/clients/${parsed.data.organization_id}/members`);
    return { type: 'enrolled', email: parsed.data.email, role: parsed.data.role };
  }

  // New user: invite-link path. The role chosen by the admin cannot be
  // applied yet — Phase 1 of the invite flow always grants viewer. The
  // admin promotes via the members page after the user accepts. This is
  // surfaced in the email and in the return shape.
  const token = randomBytes(32).toString('hex');
  await db.insert(invite_links).values({
    id: crypto.randomUUID(),
    token,
    organization_id: parsed.data.organization_id,
    team_id: null,
    created_by: session.userId,
    label: parsed.data.email,
    is_active: true,
  });
  logger.info('[MEMBERS] invite link created', {
    org: parsed.data.organization_id,
    email: parsed.data.email,
    role: parsed.data.role,
  });

  const inviteUrl = `${baseUrl}/invite/join/${token}`;
  const safeOrg = escapeHtml(org.name);
  const safeRole = escapeHtml(ROLE_LABELS[parsed.data.role]);
  const safeActor = actorName ? escapeHtml(actorName) : null;
  const result = await sendEmail({
    to: parsed.data.email,
    subject: `[${appConfig.name}] Invitation à rejoindre ${org.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#0f172a;">
        <h2 style="color:${appConfig.primaryColor};margin:0 0 12px;">Vous êtes invité sur ${appConfig.name}</h2>
        <p style="margin:0 0 12px;">${safeActor ? `<strong>${safeActor}</strong> vous` : 'Vous'} a invité à rejoindre <strong>${safeOrg}</strong>${parsed.data.role !== 'viewer' ? ` (rôle prévu : <strong>${safeRole}</strong>)` : ''}.</p>
        <p style="margin:0 0 16px;">
          <a href="${inviteUrl}" style="display:inline-block;padding:10px 18px;background:#2563EB;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">
            Rejoindre ${safeOrg}
          </a>
        </p>
        <p style="margin:0 0 12px;color:#475569;font-size:13px;">Le lien vous demandera votre nom et votre email pour créer votre compte.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
        <p style="color:#999;font-size:11px;">${escapeHtml(getEmailFooterBrand())}</p>
      </div>
    `,
  });
  if (!result.success) {
    logger.error('[MEMBERS] invite email failed', {
      email: parsed.data.email,
      error: result.error,
    });
  }

  revalidatePath(`/clients/${parsed.data.organization_id}/members`);
  return { type: 'invited', email: parsed.data.email, role: parsed.data.role };
}

export async function removeMember(input: unknown) {
  const session = await requireSession();
  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) throw new Error('Données invalides');

  const ok = await canRemoveMember(
    session.userId,
    parsed.data.user_id,
    parsed.data.organization_id,
  );
  if (!ok) throw new Error('Non autorisé à retirer ce membre');

  await db.delete(organization_members).where(
    and(
      eq(organization_members.organization_id, parsed.data.organization_id),
      eq(organization_members.user_id, parsed.data.user_id),
    ),
  );
  logger.info('[MEMBERS] removed', {
    org: parsed.data.organization_id,
    user: parsed.data.user_id,
  });
  revalidatePath(`/clients/${parsed.data.organization_id}/members`);
}

export async function updateMemberRole(input: unknown) {
  const session = await requireSession();
  const parsed = updateMemberRoleSchema.safeParse(input);
  if (!parsed.success) throw new Error('Données invalides');

  // Règle 1 : canManageMember checks CURRENT roles (actor > target).
  const ok = await canManageMember(
    session.userId,
    parsed.data.user_id,
    parsed.data.organization_id,
  );
  if (!ok) throw new Error('Non autorisé à modifier ce membre');

  // Règle 1 extra (anti-escalation via role update) : un non-superadmin ne peut
  // pas promouvoir vers un rôle >= le sien. Sans ce check, un gestionnaire
  // pourrait promouvoir un viewer en gestionnaire (canManageMember passerait
  // car le viewer < gestionnaire, mais le NEW role égalerait l'acteur).
  if (!session.isSuperadmin) {
    const actorRole = await getEffectiveRole(session.userId, parsed.data.organization_id);
    if (!actorRole || RANK[parsed.data.role] >= RANK[actorRole]) {
      throw new Error('Non autorisé à attribuer ce rôle');
    }
  }

  await db
    .update(organization_members)
    .set({ role: parsed.data.role })
    .where(
      and(
        eq(organization_members.organization_id, parsed.data.organization_id),
        eq(organization_members.user_id, parsed.data.user_id),
      ),
    );
  logger.info('[MEMBERS] role updated', {
    org: parsed.data.organization_id,
    user: parsed.data.user_id,
    role: parsed.data.role,
  });
  revalidatePath(`/clients/${parsed.data.organization_id}/members`);
}

/**
 * Met à jour les infos d'identité d'un user-membre (name, first_name,
 * last_name, job_title). RBAC : superadmin ou actor capable de gérer la cible
 * dans cette org. L'email reste immuable (géré par Better Auth).
 *
 * Les champs non fournis (undefined) sont laissés intacts. Champs fournis
 * vides sont coercés à null par le schéma Zod (validations/members.ts).
 */
export async function updateMemberInfo(input: unknown): Promise<void> {
  const session = await requireSession();
  const parsed = updateMemberInfoSchema.safeParse(input);
  if (!parsed.success) throw new Error('Données invalides');

  const ok = await canManageMember(
    session.userId,
    parsed.data.user_id,
    parsed.data.organization_id,
  );
  if (!ok) throw new Error('Non autorisé à modifier ce membre');

  const update: Partial<typeof users.$inferInsert> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.first_name !== undefined) update.first_name = parsed.data.first_name;
  if (parsed.data.last_name !== undefined) update.last_name = parsed.data.last_name;
  if (parsed.data.job_title !== undefined) update.job_title = parsed.data.job_title;

  if (Object.keys(update).length === 0) return;

  update.updatedAt = new Date();
  await db.update(users).set(update).where(eq(users.id, parsed.data.user_id));

  await createAuditLog({
    actorId: session.userId,
    orgId: parsed.data.organization_id,
    action: 'member_info_updated',
    entityType: 'user',
    entityId: parsed.data.user_id,
    changes: update,
  });
  logger.info('[MEMBERS] info updated', {
    org: parsed.data.organization_id,
    user: parsed.data.user_id,
    keys: Object.keys(update),
  });
  revalidatePath(`/clients/${parsed.data.organization_id}/members`);
}

const inviteIdSchema = z.object({
  organization_id: z.string().uuid(),
  invite_id: z.string().uuid(),
});

/**
 * Réenvoie le mail d'invitation pour un invite_link existant. La regénération
 * du token serait sécuritairement neutre (use_count reste à 0 sur les invites
 * non utilisés) mais on conserve le même token pour permettre à l'utilisateur
 * d'utiliser un mail précédemment reçu.
 */
export async function resendInvite(input: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireSession();
    const parsed = inviteIdSchema.parse(input);

    if (!session.isSuperadmin) {
      const role = await getEffectiveRole(session.userId, parsed.organization_id);
      if (!role || RANK[role] < RANK.gestionnaire) {
        return { ok: false, error: 'Non autorisé' };
      }
    }

    const [invite] = await db
      .select({
        token: invite_links.token,
        label: invite_links.label,
        is_active: invite_links.is_active,
      })
      .from(invite_links)
      .where(
        and(
          eq(invite_links.id, parsed.invite_id),
          eq(invite_links.organization_id, parsed.organization_id),
        ),
      )
      .limit(1);
    if (!invite) return { ok: false, error: 'Invitation introuvable' };
    if (!invite.is_active) return { ok: false, error: 'Invitation inactive' };
    if (!invite.label || !invite.label.includes('@')) {
      return { ok: false, error: 'Email cible manquant sur cette invitation' };
    }

    const [org] = await db
      .select({ name: organizationsTable.name, slug: organizationsTable.slug })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, parsed.organization_id))
      .limit(1);
    if (!org) return { ok: false, error: 'Organisation introuvable' };

    const baseUrl = getServerAppUrl();
    const inviteUrl = `${baseUrl}/invite/join/${invite.token}`;
    const safeOrg = escapeHtml(org.name);

    const result = await sendEmail({
      to: invite.label,
      subject: `[${appConfig.name}] Rappel : invitation à rejoindre ${org.name}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#0f172a;">
          <h2 style="color:#2563EB;margin:0 0 12px;">Rappel d'invitation</h2>
          <p style="margin:0 0 12px;">Vous avez été invité à rejoindre <strong>${safeOrg}</strong> sur ${appConfig.name}. Cliquez ci-dessous pour accepter.</p>
          <p style="margin:0 0 16px;">
            <a href="${inviteUrl}" style="display:inline-block;padding:10px 18px;background:#2563EB;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">
              Rejoindre ${safeOrg}
            </a>
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="color:#999;font-size:11px;">${escapeHtml(getEmailFooterBrand())}</p>
        </div>
      `,
    });
    if (!result.success) {
      logger.warn('[MEMBERS] resend invite email failed', { error: result.error });
      return { ok: false, error: 'Erreur envoi mail' };
    }

    await createAuditLog({
      actorId: session.userId,
      orgId: parsed.organization_id,
      action: 'invite_resent',
      entityType: 'invite_link',
      entityId: parsed.invite_id,
    });

    revalidatePath(`/clients/${parsed.organization_id}/members`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    logger.warn('[MEMBERS] resendInvite failed', { msg });
    return { ok: false, error: msg };
  }
}

/**
 * Annule une invitation : passe is_active à false. Le row est conservé pour
 * audit. Le token reste inutilisable côté /invite/join (vérification is_active).
 */
export async function cancelInvite(input: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireSession();
    const parsed = inviteIdSchema.parse(input);

    if (!session.isSuperadmin) {
      const role = await getEffectiveRole(session.userId, parsed.organization_id);
      if (!role || RANK[role] < RANK.gestionnaire) {
        return { ok: false, error: 'Non autorisé' };
      }
    }

    await db
      .update(invite_links)
      .set({ is_active: false })
      .where(
        and(
          eq(invite_links.id, parsed.invite_id),
          eq(invite_links.organization_id, parsed.organization_id),
        ),
      );

    await createAuditLog({
      actorId: session.userId,
      orgId: parsed.organization_id,
      action: 'invite_cancelled',
      entityType: 'invite_link',
      entityId: parsed.invite_id,
    });

    revalidatePath(`/clients/${parsed.organization_id}/members`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    logger.warn('[MEMBERS] cancelInvite failed', { msg });
    return { ok: false, error: msg };
  }
}
