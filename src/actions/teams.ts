'use server';

import { db } from '@/lib/db';
import {
  teams,
  team_members,
  team_organization_grants,
  users,
} from '@/lib/db/schema';
import { getSessionInfo } from '@/lib/auth/session';
import {
  createTeamSchema,
  updateTeamSchema,
  addTeamMemberSchema,
  removeTeamMemberSchema,
  grantTeamOrgSchema,
  revokeTeamOrgSchema,
} from '@/lib/validations/teams';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';

async function requireSuperadmin() {
  const session = await getSessionInfo();
  if (!session) throw new Error('Authentification requise');
  if (!session.isSuperadmin) throw new Error('Accès réservé superadmin');
  return session;
}

export async function createTeam(input: unknown) {
  const session = await requireSuperadmin();
  const parsed = createTeamSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      'Données invalides : ' + parsed.error.issues.map((i) => i.message).join(', '),
    );
  }
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(teams)
    .values({
      id,
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description ?? null,
      created_by_user_id: session.userId,
    })
    .returning();
  logger.info('[TEAMS] created', { id: row.id, slug: row.slug });
  revalidatePath('/admin/teams');
  return row;
}

export async function updateTeam(input: unknown) {
  await requireSuperadmin();
  const parsed = updateTeamSchema.safeParse(input);
  if (!parsed.success) throw new Error('Données invalides');
  const { id, ...patch } = parsed.data;
  if (Object.keys(patch).length === 0) return;
  await db
    .update(teams)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(teams.id, id));
  logger.info('[TEAMS] updated', { id });
  revalidatePath('/admin/teams');
  revalidatePath(`/admin/teams/${id}`);
}

export async function addTeamMemberAction(input: unknown) {
  await requireSuperadmin();
  const parsed = addTeamMemberSchema.safeParse(input);
  if (!parsed.success) throw new Error('Données invalides');

  // Teams are an internal CDS construct (sub-traitants Pulseo) — adding a
  // brand-new email here would require an email-driven onboarding flow
  // we do not yet ship. Until that flow exists, the action only accepts
  // an email that already corresponds to a Pulseo account. The admin can
  // pre-create the account via the standard invite-link onboarding.
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  if (!existingUser) {
    throw new Error(
      "Cet email n'a pas encore de compte Pulseo. Demandez-lui de s'inscrire via un lien d'invitation, puis ajoutez-le à l'équipe.",
    );
  }

  await db.insert(team_members).values({
    id: crypto.randomUUID(),
    team_id: parsed.data.team_id,
    user_id: existingUser.id,
  });
  logger.info('[TEAMS] member added (existing user)', {
    team: parsed.data.team_id,
    user: existingUser.id,
  });
  revalidatePath(`/admin/teams/${parsed.data.team_id}`);
}

export async function removeTeamMemberAction(input: unknown) {
  await requireSuperadmin();
  const parsed = removeTeamMemberSchema.safeParse(input);
  if (!parsed.success) throw new Error('Données invalides');
  await db
    .delete(team_members)
    .where(
      and(
        eq(team_members.team_id, parsed.data.team_id),
        eq(team_members.user_id, parsed.data.user_id),
      ),
    );
  logger.info('[TEAMS] member removed', {
    team: parsed.data.team_id,
    user: parsed.data.user_id,
  });
  revalidatePath(`/admin/teams/${parsed.data.team_id}`);
}

export async function grantTeamOrg(input: unknown) {
  const session = await requireSuperadmin();
  const parsed = grantTeamOrgSchema.safeParse(input);
  if (!parsed.success) throw new Error('Données invalides');
  if (parsed.data.role === 'admin') {
    logger.warn('[TEAMS] admin role granted via team', {
      team: parsed.data.team_id,
      org: parsed.data.organization_id,
    });
  }
  await db.insert(team_organization_grants).values({
    id: crypto.randomUUID(),
    team_id: parsed.data.team_id,
    organization_id: parsed.data.organization_id,
    role: parsed.data.role,
    granted_by_user_id: session.userId,
  });
  logger.info('[TEAMS] org grant created', {
    team: parsed.data.team_id,
    org: parsed.data.organization_id,
    role: parsed.data.role,
  });
  revalidatePath(`/admin/teams/${parsed.data.team_id}`);
  revalidatePath(`/clients/${parsed.data.organization_id}`);
}

export async function revokeTeamOrg(input: unknown) {
  await requireSuperadmin();
  const parsed = revokeTeamOrgSchema.safeParse(input);
  if (!parsed.success) throw new Error('Données invalides');
  await db
    .delete(team_organization_grants)
    .where(
      and(
        eq(team_organization_grants.team_id, parsed.data.team_id),
        eq(team_organization_grants.organization_id, parsed.data.organization_id),
      ),
    );
  logger.info('[TEAMS] org grant revoked', {
    team: parsed.data.team_id,
    org: parsed.data.organization_id,
  });
  revalidatePath(`/admin/teams/${parsed.data.team_id}`);
  revalidatePath(`/clients/${parsed.data.organization_id}`);
}

/**
 * Supprime une équipe. Cascade :
 *  - `team_members` CASCADE (les users perdent leur appartenance, pas les users eux-mêmes)
 *  - `team_organization_grants` CASCADE (grants sur orgs perdus → users de l'équipe perdent l'accès hérité)
 *  - `invite_links.team_id` CASCADE (invite team-scoped révoqués)
 * Superadmin uniquement. Idempotent.
 */
export async function deleteTeam(input: unknown) {
  await requireSuperadmin();
  const schema = z.object({ team_id: z.string().min(1) });
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error('Données invalides');

  const [existing] = await db
    .select({ id: teams.id, slug: teams.slug, name: teams.name })
    .from(teams)
    .where(eq(teams.id, parsed.data.team_id))
    .limit(1);
  if (!existing) {
    return { deleted: false };
  }

  const [{ membersCount }] = await db
    .select({ membersCount: sql<number>`COUNT(*)::int` })
    .from(team_members)
    .where(eq(team_members.team_id, parsed.data.team_id));

  const [{ grantsCount }] = await db
    .select({ grantsCount: sql<number>`COUNT(*)::int` })
    .from(team_organization_grants)
    .where(eq(team_organization_grants.team_id, parsed.data.team_id));

  await db.delete(teams).where(eq(teams.id, parsed.data.team_id));

  logger.info('[TEAMS] deleted', {
    id: existing.id,
    slug: existing.slug,
    name: existing.name,
    members_lost: membersCount,
    grants_revoked: grantsCount,
  });
  revalidatePath('/admin/teams');
  return { deleted: true };
}
