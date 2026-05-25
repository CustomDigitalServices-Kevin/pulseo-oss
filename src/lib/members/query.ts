import { sql, inArray, eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  users as usersTable,
  organizations as organizationsTable,
  organization_responsibles,
  organization_members,
  invite_links,
} from '@/lib/db/schema';
import {
  getEffectiveRole,
  getRoleSources,
  type Role,
  type RoleSourceEntry,
} from '@/lib/auth/effective-role';
import {
  canManageMember,
  canRemoveMember,
} from '@/lib/auth/permissions';
import {
  getUserSparkline30dRaw,
  getUserHeatmapRaw,
  getUserResponseMedianRaw,
} from '@/lib/stats/aggregations';
import type {
  MemberRow,
  RoleSource,
  MemberSourceKind,
} from '@/components/members/members-table';

type Rows<T> = { rows: T[] };

function rowsOf<T>(result: unknown): T[] {
  return (result as Rows<T>).rows ?? [];
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return String(v);
}

/** Fills a 30-element array (today-29 .. today) from the day-granular series. */
export function sparklineToArray(
  series: Array<{ date: string; count: number }>,
  today: Date = new Date(),
): number[] {
  const arr = new Array(30).fill(0) as number[];
  const byDate = new Map<string, number>();
  for (const point of series) byDate.set(point.date.slice(0, 10), point.count);
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - (29 - i));
    const key = d.toISOString().slice(0, 10);
    arr[i] = byDate.get(key) ?? 0;
  }
  return arr;
}

/** Reduces 7×24 heatmap to a 7-day total vector (day_of_week 0..6). */
export function heatmapToWeekDays(
  cells: Array<{ day_of_week: number; hour: number; count: number }>,
): number[] {
  const week = new Array(7).fill(0) as number[];
  for (const cell of cells) {
    if (cell.day_of_week >= 0 && cell.day_of_week <= 6) {
      week[cell.day_of_week] += cell.count;
    }
  }
  return week;
}

/**
 * Pick the primary source for row display.
 * Priority: direct > group_manager > team_grant.
 */
function primarySource(sources: RoleSourceEntry[]): RoleSourceEntry | null {
  const direct = sources.find((s) => s.kind === 'direct');
  if (direct) return direct;
  const group = sources.find((s) => s.kind === 'group_manager');
  if (group) return group;
  const team = sources.find((s) => s.kind === 'team_grant');
  return team ?? null;
}

function entryToRowSource(entry: RoleSourceEntry | null): RoleSource {
  if (!entry) return { kind: 'direct' };
  if (entry.kind === 'direct') return { kind: 'direct' };
  if (entry.kind === 'group_manager') return { kind: 'group', name: entry.groupName };
  return { kind: 'team', name: entry.teamName };
}

function earliestSince(sources: RoleSourceEntry[]): string {
  if (sources.length === 0) return new Date().toISOString();
  return sources.reduce<string>(
    (min, s) => (s.since < min ? s.since : min),
    sources[0]!.since,
  );
}

/**
 * Stats d'activité d'un user dans le contexte d'une org sur 30 jours.
 * Les compteurs de tickets/commentaires utilisent les tables source (plus fiable
 * que `user_activity_events` qui peut manquer des events pré-instrumentation).
 */
export async function getMemberActivity30d(
  userId: string,
  orgId: string,
): Promise<{
  tickets_created_30d: number;
  tickets_commented_30d: number;
  last_activity_at: string | null;
}> {
  const [createdRes, commentedRes, lastActRes] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(*)::int AS n
        FROM tickets
       WHERE organization_id = ${orgId}
         AND creator_id = ${userId}
         AND created_at > NOW() - INTERVAL '30 days'
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS n
        FROM ticket_comments tc
        JOIN tickets t ON t.id = tc.ticket_id
       WHERE t.organization_id = ${orgId}
         AND tc.author_id = ${userId}
         AND tc.created_at > NOW() - INTERVAL '30 days'
    `),
    db.execute(sql`
      SELECT MAX(created_at) AS last_at
        FROM user_activity_events
       WHERE user_id = ${userId}
         AND (organization_id = ${orgId} OR organization_id IS NULL)
    `),
  ]);

  const createdRow = rowsOf<{ n: number }>(createdRes)[0];
  const commentedRow = rowsOf<{ n: number }>(commentedRes)[0];
  const lastActRow = rowsOf<{ last_at: unknown }>(lastActRes)[0];

  return {
    tickets_created_30d: createdRow?.n ?? 0,
    tickets_commented_30d: commentedRow?.n ?? 0,
    last_activity_at: lastActRow?.last_at ? toIso(lastActRow.last_at) : null,
  };
}

function computeStatus(
  lastActivityAt: string | null,
  today: Date = new Date(),
): { status: 'active' | 'inactive'; inactive_days: number | null } {
  if (!lastActivityAt) return { status: 'inactive', inactive_days: null };
  const lastMs = new Date(lastActivityAt).getTime();
  if (Number.isNaN(lastMs)) return { status: 'inactive', inactive_days: null };
  const diffDays = Math.floor((today.getTime() - lastMs) / (1000 * 60 * 60 * 24));
  if (diffDays <= 30) return { status: 'active', inactive_days: null };
  return { status: 'inactive', inactive_days: diffDays };
}

export interface ListOrgMembersActor {
  userId: string;
  isSuperadmin: boolean;
}

/**
 * Construit une MemberRow pour un user actif (membership direct ou héritage).
 * Inclut tout l'enrichissement stats. Réutilisé tel quel par le code historique.
 */
async function buildActiveMemberRow(
  uid: string,
  info: { id: string; email: string; name: string | null },
  orgId: string,
  actor: ListOrgMembersActor,
  today: Date,
): Promise<MemberRow> {
  const [role, sources, sparkline, heatmap, median, activity, canEdit, canRem] =
    await Promise.all([
      getEffectiveRole(uid, orgId),
      getRoleSources(uid, orgId),
      getUserSparkline30dRaw(uid),
      getUserHeatmapRaw(uid),
      getUserResponseMedianRaw(uid, orgId),
      getMemberActivity30d(uid, orgId),
      canManageMember(actor.userId, uid, orgId),
      canRemoveMember(actor.userId, uid, orgId),
    ]);

  const primary = primarySource(sources);
  const rowSource = entryToRowSource(primary);
  const status = computeStatus(activity.last_activity_at, today);
  const hasDirect = sources.some((s) => s.kind === 'direct');

  return {
    id: uid,
    source_kind: 'member' satisfies MemberSourceKind,
    email: info.email,
    name: info.name,
    date_added: primary?.since ?? earliestSince(sources),
    effective_role: (role ?? 'viewer') as Role,
    role_source: rowSource,
    status: status.status,
    inactive_days: status.inactive_days,
    last_activity_at: activity.last_activity_at,
    tickets_created_30d: activity.tickets_created_30d,
    tickets_commented_30d: activity.tickets_commented_30d,
    sparkline_30d: sparklineToArray(sparkline, today),
    heatmap_7d: heatmapToWeekDays(heatmap),
    median_response_minutes: median.median_minutes,
    can_edit_role: canEdit && hasDirect,
    can_remove: canRem && hasDirect,
  };
}

/**
 * Charge les invites en attente (invite_link actifs sans org_member matching).
 * Un invite est en "attente" tant que l'email n'a pas créé de compte ET cliqué
 * sur le magic-link. On filtre sur le label (= email saisi par l'admin) pour
 * éviter d'afficher les invites génériques sans email cible.
 */
async function loadInviteRows(orgId: string, today: Date): Promise<MemberRow[]> {
  const invites = await db
    .select({
      id: invite_links.id,
      label: invite_links.label,
      created_at: invite_links.created_at,
    })
    .from(invite_links)
    .where(
      and(
        eq(invite_links.organization_id, orgId),
        eq(invite_links.is_active, true),
      ),
    );

  if (invites.length === 0) return [];

  // Exclure les invites dont l'email correspond déjà à un user qui est member
  // de l'org (cas où l'invite a été utilisée mais pas désactivée).
  const emailsLower = invites
    .map((r) => (r.label ?? '').toLowerCase())
    .filter((e) => e.length > 0 && e.includes('@'));

  let alreadyMembers = new Set<string>();
  if (emailsLower.length > 0) {
    const matches = await db
      .select({ email: usersTable.email, userId: usersTable.id })
      .from(usersTable)
      .innerJoin(
        organization_members,
        and(
          eq(organization_members.user_id, usersTable.id),
          eq(organization_members.organization_id, orgId),
        ),
      )
      .where(inArray(sql`LOWER(${usersTable.email})`, emailsLower));
    alreadyMembers = new Set(matches.map((m) => m.email.toLowerCase()));
  }

  return invites
    .filter((inv) => {
      const email = (inv.label ?? '').toLowerCase();
      return email.length > 0 && email.includes('@') && !alreadyMembers.has(email);
    })
    .map<MemberRow>((inv) => ({
      id: `invite:${inv.id}`,
      source_kind: 'invite',
      email: inv.label ?? '',
      name: null,
      date_added: toIso(inv.created_at),
      effective_role: 'viewer',
      role_source: { kind: 'direct' },
      status: 'invited',
      inactive_days: null,
      last_activity_at: null,
      tickets_created_30d: 0,
      tickets_commented_30d: 0,
      sparkline_30d: sparklineToArray([], today),
      heatmap_7d: heatmapToWeekDays([]),
      median_response_minutes: null,
      can_edit_role: false,
      can_remove: true,
    }));
}

/**
 * Charge les contacts externes (organization_responsibles + responsible_email
 * legacy). Filtre les emails déjà présents en tant que membres pour éviter le
 * doublon visuel quand un user lambda est aussi listé comme responsable.
 */
async function loadExternalContactRows(
  orgId: string,
  today: Date,
  excludeEmailsLower: Set<string>,
): Promise<MemberRow[]> {
  const [responsibles, [orgRow]] = await Promise.all([
    db
      .select({
        id: organization_responsibles.id,
        email: organization_responsibles.email,
        name: organization_responsibles.name,
        created_at: organization_responsibles.created_at,
      })
      .from(organization_responsibles)
      .where(eq(organization_responsibles.organization_id, orgId)),
    db
      .select({
        email: organizationsTable.responsible_email,
        name: organizationsTable.responsible_name,
        created_at: organizationsTable.created_at,
      })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1),
  ]);

  const rows: MemberRow[] = [];

  for (const r of responsibles) {
    const emailLower = r.email.toLowerCase();
    if (excludeEmailsLower.has(emailLower)) continue;
    excludeEmailsLower.add(emailLower);
    rows.push({
      id: `responsible:${r.id}`,
      source_kind: 'responsible',
      email: r.email,
      name: r.name,
      date_added: toIso(r.created_at),
      effective_role: 'viewer',
      role_source: { kind: 'direct' },
      status: 'external_contact',
      inactive_days: null,
      last_activity_at: null,
      tickets_created_30d: 0,
      tickets_commented_30d: 0,
      sparkline_30d: sparklineToArray([], today),
      heatmap_7d: heatmapToWeekDays([]),
      median_response_minutes: null,
      can_edit_role: false,
      can_remove: true,
    });
  }

  if (orgRow?.email) {
    const emailLower = orgRow.email.toLowerCase();
    if (!excludeEmailsLower.has(emailLower)) {
      excludeEmailsLower.add(emailLower);
      rows.push({
        id: `org_lead:${orgId}`,
        source_kind: 'org_lead',
        email: orgRow.email,
        name: orgRow.name,
        date_added: toIso(orgRow.created_at),
        effective_role: 'viewer',
        role_source: { kind: 'direct' },
        status: 'external_contact',
        inactive_days: null,
        last_activity_at: null,
        tickets_created_30d: 0,
        tickets_commented_30d: 0,
        sparkline_30d: sparklineToArray([], today),
        heatmap_7d: heatmapToWeekDays([]),
        median_response_minutes: null,
        can_edit_role: false,
        can_remove: true,
      });
    }
  }

  return rows;
}

/**
 * Énumère les membres d'une org en fusionnant 4 sources :
 *   - membership direct + group manager + team grant (= MemberRow active)
 *   - invite_links actifs (= MemberRow status="invited")
 *   - organization_responsibles (= MemberRow status="external_contact" kind="responsible")
 *   - organizations.responsible_email legacy (= MemberRow status="external_contact" kind="org_lead")
 *
 * Tri appliqué : actifs d'abord (par activité décroissante), puis invités (par
 * date d'invitation), puis externes (par date d'ajout). Pagination/filtrage
 * côté applicatif vu l'hétérogénéité des sources.
 */
export async function listOrgMembers(
  orgId: string,
  actor: ListOrgMembersActor,
  today: Date = new Date(),
): Promise<MemberRow[]> {
  const userIdsRes = await db.execute(sql`
    SELECT user_id FROM (
      SELECT user_id FROM organization_members WHERE organization_id = ${orgId}
      UNION
      SELECT gm.user_id
        FROM organization_group_managers gm
        JOIN organizations o ON o.group_id = gm.group_id
       WHERE o.id = ${orgId}
      UNION
      SELECT tm.user_id
        FROM team_members tm
        JOIN team_organization_grants tog ON tog.team_id = tm.team_id
       WHERE tog.organization_id = ${orgId}
    ) s
  `);
  const userIds = rowsOf<{ user_id: string }>(userIdsRes).map((r) => r.user_id);

  let activeRows: MemberRow[] = [];
  const memberEmailsLower = new Set<string>();
  if (userIds.length > 0) {
    const userInfoList = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, userIds));
    const userInfo = new Map(userInfoList.map((u) => [u.id, u]));
    for (const u of userInfoList) memberEmailsLower.add(u.email.toLowerCase());

    const built = await Promise.all(
      userIds.map(async (uid): Promise<MemberRow | null> => {
        const info = userInfo.get(uid);
        if (!info) return null;
        return buildActiveMemberRow(uid, info, orgId, actor, today);
      }),
    );
    activeRows = built.filter((r): r is MemberRow => r !== null);
  }

  const excludeEmailsLower = new Set(memberEmailsLower);
  const [inviteRows, externalRows] = await Promise.all([
    loadInviteRows(orgId, today),
    loadExternalContactRows(orgId, today, excludeEmailsLower),
  ]);

  const filteredInviteRows = inviteRows.filter(
    (r) => !memberEmailsLower.has(r.email.toLowerCase()),
  );

  return [...activeRows, ...filteredInviteRows, ...externalRows];
}
