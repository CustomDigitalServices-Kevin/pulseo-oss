'use server';

import { sql, eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  users as usersTable,
  user_activity_events,
  invite_links,
  organization_responsibles,
  organizations as organizationsTable,
} from '@/lib/db/schema';
import { getSessionInfo } from '@/lib/auth/session';
import {
  getEffectiveRole,
  getRoleSources,
  type RoleSourceEntry,
} from '@/lib/auth/effective-role';
import { canAccessOrg, canManageMember } from '@/lib/auth/permissions';
import {
  getUserSparkline30dRaw,
  getUserHeatmapRaw,
  getUserResponseMedianRaw,
} from '@/lib/stats/aggregations';
import { getMemberActivity30d } from '@/lib/members/query';
import type {
  MemberDetail,
  PrimaryRoleSource,
  TimelineEvent,
} from '@/components/members/member-detail-drawer';
import {
  addMember,
  removeMember,
  updateMemberInfo,
  resendInvite,
  cancelInvite,
} from '@/actions/members';
import {
  updateOrgResponsible,
  updateOrgLead,
  removeOrgResponsible,
  convertExternalToInvite,
} from '@/actions/org-responsibles';
import { logger } from '@/lib/logger';

async function requireSession() {
  const session = await getSessionInfo();
  if (!session) throw new Error('Authentification requise');
  return session;
}

function primaryFromSources(sources: RoleSourceEntry[]): PrimaryRoleSource {
  const direct = sources.find((s) => s.kind === 'direct');
  if (direct) return { kind: 'direct' };
  const group = sources.find((s) => s.kind === 'group_manager');
  if (group) return { kind: 'group', name: group.groupName };
  const team = sources.find((s) => s.kind === 'team_grant');
  if (team) return { kind: 'team', name: team.teamName };
  return { kind: 'direct' };
}

const getMemberDetailSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
});

export async function getMemberDetail(
  input: unknown,
): Promise<MemberDetail | null> {
  const session = await requireSession();
  const parsed = getMemberDetailSchema.safeParse(input);
  if (!parsed.success) throw new Error('Données invalides');

  const { userId, organizationId } = parsed.data;

  if (!session.isSuperadmin) {
    const canSee = await canAccessOrg(session.userId, organizationId);
    if (!canSee) throw new Error('Accès refusé');
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      first_name: usersTable.first_name,
      last_name: usersTable.last_name,
      job_title: usersTable.job_title,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) return null;

  const [effectiveRole, roleSources, sparkline, heatmap, median, activity, timelineRows] =
    await Promise.all([
      getEffectiveRole(userId, organizationId),
      getRoleSources(userId, organizationId),
      getUserSparkline30dRaw(userId),
      getUserHeatmapRaw(userId),
      getUserResponseMedianRaw(userId, organizationId),
      getMemberActivity30d(userId, organizationId),
      db
        .select({
          id: user_activity_events.id,
          event_type: user_activity_events.event_type,
          resource_id: user_activity_events.resource_id,
          created_at: user_activity_events.created_at,
        })
        .from(user_activity_events)
        .where(
          and(
            eq(user_activity_events.user_id, userId),
            sql`(${user_activity_events.organization_id} IS NULL OR ${user_activity_events.organization_id} = ${organizationId})`,
          ),
        )
        .orderBy(desc(user_activity_events.created_at))
        .limit(10),
    ]);

  const timeline: TimelineEvent[] = timelineRows.map((r) => ({
    id: r.id,
    event_type: r.event_type,
    resource_id: r.resource_id,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      job_title: user.job_title,
    },
    effectiveRole,
    primarySource: primaryFromSources(roleSources),
    roleSources,
    kpis: {
      ticketsCreated30d: activity.tickets_created_30d,
      commentsPosted30d: activity.tickets_commented_30d,
      medianResponseMinutes: median.median_minutes,
    },
    sparkline,
    heatmap,
    timeline,
  };
}

const addMemberDirectSchema = z.object({
  organizationId: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['admin', 'gestionnaire', 'viewer']),
});

/**
 * Wrapper safe-return autour de `addMember` : transforme l'exception en
 * `{ok:false, error}` utilisable par `<AddMemberModal>`.
 */
export async function addMemberDirect(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsed = addMemberDirectSchema.parse(input);
    await addMember({
      organization_id: parsed.organizationId,
      email: parsed.email,
      role: parsed.role,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    logger.warn('[MEMBERS] addMemberDirect failed', { msg });
    return { ok: false, error: msg };
  }
}

const removeMemberActionSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
});

export async function removeMemberDirect(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsed = removeMemberActionSchema.parse(input);
    await removeMember({
      organization_id: parsed.organizationId,
      user_id: parsed.userId,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    logger.warn('[MEMBERS] removeMemberDirect failed', { msg });
    return { ok: false, error: msg };
  }
}

const updateMemberRoleSchemaInternal = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(['admin', 'gestionnaire', 'viewer']),
});

export async function updateMemberRoleAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsed = updateMemberRoleSchemaInternal.parse(input);
    const { updateMemberRole } = await import('@/actions/members');
    await updateMemberRole({
      organization_id: parsed.organizationId,
      user_id: parsed.userId,
      role: parsed.role,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    return { ok: false, error: msg };
  }
}

void canManageMember;

// ─── Lot 2 — édition membres / invites / contacts externes ────────────────

const updateMemberInfoSchemaInternal = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().max(255).nullable().optional(),
  first_name: z.string().max(120).nullable().optional(),
  last_name: z.string().max(120).nullable().optional(),
  job_title: z.string().max(120).nullable().optional(),
});

export async function updateMemberInfoAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsed = updateMemberInfoSchemaInternal.parse(input);
    await updateMemberInfo({
      organization_id: parsed.organizationId,
      user_id: parsed.userId,
      name: parsed.name,
      first_name: parsed.first_name,
      last_name: parsed.last_name,
      job_title: parsed.job_title,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    return { ok: false, error: msg };
  }
}

const inviteIdInternal = z.object({
  organizationId: z.string().uuid(),
  inviteId: z.string().uuid(),
});

export async function resendInviteAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = inviteIdInternal.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides' };
  return resendInvite({
    organization_id: parsed.data.organizationId,
    invite_id: parsed.data.inviteId,
  });
}

export async function cancelInviteAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = inviteIdInternal.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides' };
  return cancelInvite({
    organization_id: parsed.data.organizationId,
    invite_id: parsed.data.inviteId,
  });
}

const updateResponsibleInternal = z.object({
  responsibleId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().max(255).nullable(),
});

export async function updateResponsibleAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = updateResponsibleInternal.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides' };
  const r = await updateOrgResponsible({
    responsible_id: parsed.data.responsibleId,
    email: parsed.data.email,
    name: parsed.data.name,
  });
  return r.success ? { ok: true } : { ok: false, error: r.error };
}

const removeResponsibleInternal = z.object({
  responsibleId: z.string().uuid(),
});

export async function removeResponsibleAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = removeResponsibleInternal.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides' };
  const r = await removeOrgResponsible(parsed.data.responsibleId);
  return r.success ? { ok: true } : { ok: false, error: r.error };
}

const updateOrgLeadInternal = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email().nullable(),
  name: z.string().max(255).nullable(),
});

export async function updateOrgLeadAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = updateOrgLeadInternal.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides' };
  const r = await updateOrgLead({
    organization_id: parsed.data.organizationId,
    email: parsed.data.email,
    name: parsed.data.name,
  });
  return r.success ? { ok: true } : { ok: false, error: r.error };
}

const convertExternalInternal = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['viewer', 'gestionnaire', 'admin']),
});

export async function convertExternalToInviteAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = convertExternalInternal.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides' };
  const r = await convertExternalToInvite({
    organization_id: parsed.data.organizationId,
    email: parsed.data.email,
    role: parsed.data.role,
  });
  return r.success ? { ok: true } : { ok: false, error: r.error };
}

// ─── Détail row non-member (invite / responsible / org_lead) ───────────────

export type NonMemberRowDetail =
  | {
      kind: 'invite';
      inviteId: string;
      email: string;
      created_at: string;
      created_by_name: string | null;
      created_by_email: string | null;
    }
  | {
      kind: 'responsible';
      responsibleId: string;
      email: string;
      name: string | null;
      created_at: string;
    }
  | {
      kind: 'org_lead';
      organizationId: string;
      email: string;
      name: string | null;
    };

const rowIdSchema = z.object({
  rowId: z.string().min(1),
  organizationId: z.string().uuid(),
});

/**
 * Charge les infos d'une ligne non-member (invite/responsible/org_lead). Le
 * row id porte le préfixe (invite:/responsible:/org_lead:) qui détermine la
 * source. Renvoie null si la ligne n'existe plus ou si l'acteur n'a pas accès.
 */
export async function getNonMemberRowDetail(
  input: unknown,
): Promise<NonMemberRowDetail | null> {
  const session = await requireSession();
  const parsed = rowIdSchema.safeParse(input);
  if (!parsed.success) throw new Error('Données invalides');

  const { rowId, organizationId } = parsed.data;
  if (!session.isSuperadmin) {
    const ok = await canAccessOrg(session.userId, organizationId);
    if (!ok) throw new Error('Accès refusé');
  }

  if (rowId.startsWith('invite:')) {
    const inviteId = rowId.slice('invite:'.length);
    if (!z.string().uuid().safeParse(inviteId).success) return null;
    const [invite] = await db
      .select({
        id: invite_links.id,
        label: invite_links.label,
        created_at: invite_links.created_at,
        created_by: invite_links.created_by,
      })
      .from(invite_links)
      .where(
        and(
          eq(invite_links.id, inviteId),
          eq(invite_links.organization_id, organizationId),
          eq(invite_links.is_active, true),
        ),
      )
      .limit(1);
    if (!invite || !invite.label) return null;

    const [creator] = await db
      .select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, invite.created_by))
      .limit(1);

    return {
      kind: 'invite',
      inviteId: invite.id,
      email: invite.label,
      created_at:
        invite.created_at instanceof Date
          ? invite.created_at.toISOString()
          : String(invite.created_at),
      created_by_name: creator?.name ?? null,
      created_by_email: creator?.email ?? null,
    };
  }

  if (rowId.startsWith('responsible:')) {
    const responsibleId = rowId.slice('responsible:'.length);
    if (!z.string().uuid().safeParse(responsibleId).success) return null;
    const [r] = await db
      .select({
        id: organization_responsibles.id,
        email: organization_responsibles.email,
        name: organization_responsibles.name,
        created_at: organization_responsibles.created_at,
      })
      .from(organization_responsibles)
      .where(
        and(
          eq(organization_responsibles.id, responsibleId),
          eq(organization_responsibles.organization_id, organizationId),
        ),
      )
      .limit(1);
    if (!r) return null;
    return {
      kind: 'responsible',
      responsibleId: r.id,
      email: r.email,
      name: r.name,
      created_at:
        r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    };
  }

  if (rowId.startsWith('org_lead:')) {
    const orgId = rowId.slice('org_lead:'.length);
    if (orgId !== organizationId) return null;
    const [o] = await db
      .select({
        email: organizationsTable.responsible_email,
        name: organizationsTable.responsible_name,
      })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, organizationId))
      .limit(1);
    if (!o?.email) return null;
    return {
      kind: 'org_lead',
      organizationId,
      email: o.email,
      name: o.name,
    };
  }

  return null;
}
