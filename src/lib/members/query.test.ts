// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
  const mod = await import('@/test/db-test');
  const schema = await import('@/lib/db/schema');
  return { db: mod.db, schema };
});

import {
  listOrgMembers,
  sparklineToArray,
  heatmapToWeekDays,
  getMemberActivity30d,
} from './query';
import { resetDb, db } from '@/test/db-test';
import {
  makeUser,
  makeOrg,
  makeGroup,
  makeTeam,
  addMember,
  addGroupManager,
  addTeamMember,
  addTeamGrant,
} from '@/test/fixtures';
import {
  invite_links,
  organization_responsibles,
  organizations as organizationsTable,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function addInviteLink(orgId: string, email: string, createdBy: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(invite_links).values({
    id,
    token: crypto.randomUUID().replace(/-/g, ''),
    organization_id: orgId,
    team_id: null,
    created_by: createdBy,
    label: email,
    is_active: true,
  });
  return id;
}

async function addResponsible(orgId: string, email: string, name: string | null): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(organization_responsibles).values({
    id,
    organization_id: orgId,
    email,
    name,
  });
  return id;
}

async function setOrgLead(orgId: string, email: string, name: string): Promise<void> {
  await db
    .update(organizationsTable)
    .set({ responsible_email: email, responsible_name: name })
    .where(eq(organizationsTable.id, orgId));
}

beforeEach(async () => {
  await resetDb();
});

describe('sparklineToArray', () => {
  it('returns a 30-entry array with zeros when series is empty', () => {
    const arr = sparklineToArray([]);
    expect(arr).toHaveLength(30);
    expect(arr.every((v) => v === 0)).toBe(true);
  });

  it('maps series dates to matching slots', () => {
    const today = new Date('2026-04-18T12:00:00Z');
    const arr = sparklineToArray(
      [
        { date: '2026-04-18', count: 5 },
        { date: '2026-04-17', count: 3 },
      ],
      today,
    );
    expect(arr).toHaveLength(30);
    // Today maps to the last slot (index 29); yesterday to 28.
    expect(arr[29]).toBe(5);
    expect(arr[28]).toBe(3);
  });
});

describe('heatmapToWeekDays', () => {
  it('sums counts per day of week', () => {
    const week = heatmapToWeekDays([
      { day_of_week: 1, hour: 9, count: 2 },
      { day_of_week: 1, hour: 10, count: 3 },
      { day_of_week: 3, hour: 14, count: 1 },
    ]);
    expect(week).toEqual([0, 5, 0, 1, 0, 0, 0]);
  });
});

describe('listOrgMembers', () => {
  it('returns empty array when org has no members', async () => {
    const actorId = await makeUser(true);
    const orgId = await makeOrg();
    const rows = await listOrgMembers(orgId, { userId: actorId, isSuperadmin: true });
    expect(rows).toEqual([]);
  });

  it('returns a direct member with primary source = direct', async () => {
    const actorId = await makeUser(true);
    const userId = await makeUser(false, 'alice@example.com', 'Alice');
    const orgId = await makeOrg();
    await addMember(userId, orgId, 'gestionnaire');

    const rows = await listOrgMembers(orgId, { userId: actorId, isSuperadmin: true });
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.email).toBe('alice@example.com');
    expect(row.name).toBe('Alice');
    expect(row.effective_role).toBe('gestionnaire');
    expect(row.role_source).toEqual({ kind: 'direct' });
    expect(row.sparkline_30d).toHaveLength(30);
    expect(row.can_edit_role).toBe(true); // actor is superadmin + target is direct
    expect(row.can_remove).toBe(true);
  });

  it('marks role_source as group when user is group manager without direct', async () => {
    const actorId = await makeUser(true);
    const userId = await makeUser();
    const groupId = await makeGroup('Acme');
    const orgId = await makeOrg(groupId);
    await addGroupManager(userId, groupId);

    const rows = await listOrgMembers(orgId, { userId: actorId, isSuperadmin: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role_source).toEqual({ kind: 'group', name: 'Acme' });
    expect(rows[0]?.effective_role).toBe('gestionnaire');
  });

  it('marks role_source as team when user has only team grant', async () => {
    const actorId = await makeUser(true);
    const userId = await makeUser();
    const orgId = await makeOrg();
    const teamId = await makeTeam(actorId, 'Beta');
    await addTeamMember(userId, teamId);
    await addTeamGrant(teamId, orgId, 'viewer', actorId);

    const rows = await listOrgMembers(orgId, { userId: actorId, isSuperadmin: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role_source).toEqual({ kind: 'team', name: 'Beta' });
    expect(rows[0]?.effective_role).toBe('viewer');
  });

  it('prefers direct source when user has multiple sources', async () => {
    const actorId = await makeUser(true);
    const userId = await makeUser();
    const groupId = await makeGroup('Groupe');
    const orgId = await makeOrg(groupId);
    const teamId = await makeTeam(actorId, 'Team');

    await addMember(userId, orgId, 'viewer');
    await addGroupManager(userId, groupId);
    await addTeamMember(userId, teamId);
    await addTeamGrant(teamId, orgId, 'admin', actorId);

    const rows = await listOrgMembers(orgId, { userId: actorId, isSuperadmin: true });
    expect(rows).toHaveLength(1);
    // Direct wins for primary source display; effective_role reflects highest (admin via team).
    expect(rows[0]?.role_source).toEqual({ kind: 'direct' });
    expect(rows[0]?.effective_role).toBe('admin');
  });

  it('disables can_edit_role / can_remove when member is only inherited (no direct)', async () => {
    const actorId = await makeUser(true);
    const userId = await makeUser();
    const groupId = await makeGroup('Groupe');
    const orgId = await makeOrg(groupId);
    await addGroupManager(userId, groupId);

    const rows = await listOrgMembers(orgId, { userId: actorId, isSuperadmin: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.can_edit_role).toBe(false);
    expect(rows[0]?.can_remove).toBe(false);
  });

  it('includes pending invite_links as invited rows with source_kind=invite', async () => {
    const actorId = await makeUser(true);
    const orgId = await makeOrg();
    const inviteId = await addInviteLink(orgId, 'pending@gaxieu.fr', actorId);

    const rows = await listOrgMembers(orgId, { userId: actorId, isSuperadmin: true });
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.id).toBe(`invite:${inviteId}`);
    expect(row.source_kind).toBe('invite');
    expect(row.email).toBe('pending@gaxieu.fr');
    expect(row.name).toBeNull();
    expect(row.status).toBe('invited');
    expect(row.can_edit_role).toBe(false);
    expect(row.can_remove).toBe(true);
    expect(row.tickets_created_30d).toBe(0);
    expect(row.sparkline_30d.every((v) => v === 0)).toBe(true);
  });

  it('hides invite when its email matches an active member', async () => {
    const actorId = await makeUser(true);
    const userId = await makeUser(false, 'already@x.fr', 'Déjà');
    const orgId = await makeOrg();
    await addMember(userId, orgId, 'gestionnaire');
    await addInviteLink(orgId, 'already@x.fr', actorId);

    const rows = await listOrgMembers(orgId, { userId: actorId, isSuperadmin: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source_kind).toBe('member');
  });

  it('includes organization_responsibles as external_contact rows', async () => {
    const actorId = await makeUser(true);
    const orgId = await makeOrg();
    const respId = await addResponsible(orgId, 'faroux@gaxieu.fr', 'Faroux');

    const rows = await listOrgMembers(orgId, { userId: actorId, isSuperadmin: true });
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.id).toBe(`responsible:${respId}`);
    expect(row.source_kind).toBe('responsible');
    expect(row.email).toBe('faroux@gaxieu.fr');
    expect(row.name).toBe('Faroux');
    expect(row.status).toBe('external_contact');
    expect(row.can_edit_role).toBe(false);
    expect(row.can_remove).toBe(true);
  });

  it('includes legacy organizations.responsible_email as org_lead row', async () => {
    const actorId = await makeUser(true);
    const orgId = await makeOrg();
    await setOrgLead(orgId, 'lead@gaxieu.fr', 'Lead Legacy');

    const rows = await listOrgMembers(orgId, { userId: actorId, isSuperadmin: true });
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.id).toBe(`org_lead:${orgId}`);
    expect(row.source_kind).toBe('org_lead');
    expect(row.email).toBe('lead@gaxieu.fr');
    expect(row.name).toBe('Lead Legacy');
    expect(row.status).toBe('external_contact');
  });

  it('deduplicates org_lead when its email is also in organization_responsibles', async () => {
    const actorId = await makeUser(true);
    const orgId = await makeOrg();
    await addResponsible(orgId, 'duplicate@gaxieu.fr', 'Multi');
    await setOrgLead(orgId, 'duplicate@gaxieu.fr', 'Multi');

    const rows = await listOrgMembers(orgId, { userId: actorId, isSuperadmin: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source_kind).toBe('responsible');
  });

  it('fuses 4 sources together (Gaxieu scenario: member + invite + responsible + org_lead)', async () => {
    const actorId = await makeUser(true);
    const memberId = await makeUser(false, 'admin@gaxieu.fr', 'Admin');
    const orgId = await makeOrg();
    await addMember(memberId, orgId, 'admin');
    await addInviteLink(orgId, 'nicolas@gaxieu.fr', actorId);
    await addResponsible(orgId, 'faroux@gaxieu.fr', 'Faroux');
    await setOrgLead(orgId, 'lead@gaxieu.fr', 'Lead');

    const rows = await listOrgMembers(orgId, { userId: actorId, isSuperadmin: true });
    expect(rows).toHaveLength(4);
    const kinds = rows.map((r) => r.source_kind).sort();
    expect(kinds).toEqual(['invite', 'member', 'org_lead', 'responsible']);
    const emails = rows.map((r) => r.email).sort();
    expect(emails).toEqual([
      'admin@gaxieu.fr',
      'faroux@gaxieu.fr',
      'lead@gaxieu.fr',
      'nicolas@gaxieu.fr',
    ]);
  });

  it('returns multiple members and includes all unique users across sources', async () => {
    const actorId = await makeUser(true);
    const user1 = await makeUser(false, 'u1@x.fr', 'Un');
    const user2 = await makeUser(false, 'u2@x.fr', 'Deux');
    const user3 = await makeUser(false, 'u3@x.fr', 'Trois');
    const groupId = await makeGroup('G');
    const orgId = await makeOrg(groupId);
    const teamId = await makeTeam(actorId, 'T');

    await addMember(user1, orgId, 'admin');
    await addGroupManager(user2, groupId);
    await addTeamMember(user3, teamId);
    await addTeamGrant(teamId, orgId, 'viewer', actorId);

    const rows = await listOrgMembers(orgId, { userId: actorId, isSuperadmin: true });
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual([user1, user2, user3].sort());
  });
});

describe('getMemberActivity30d', () => {
  it('returns zeros when user has no tickets or comments', async () => {
    const userId = await makeUser();
    const orgId = await makeOrg();
    const activity = await getMemberActivity30d(userId, orgId);
    expect(activity.tickets_created_30d).toBe(0);
    expect(activity.tickets_commented_30d).toBe(0);
    expect(activity.last_activity_at).toBeNull();
  });
});
