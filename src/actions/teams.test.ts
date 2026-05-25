// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
  const mod = await import('@/test/db-test');
  const schema = await import('@/lib/db/schema');
  return { db: mod.db, schema };
});

vi.mock('@/lib/auth/session', async (orig) => {
  const actual = (await orig()) as object;
  return {
    ...actual,
    getSessionInfo: vi.fn(),
  };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  createTeam,
  updateTeam,
  addTeamMemberAction,
  removeTeamMemberAction,
  grantTeamOrg,
  revokeTeamOrg,
  deleteTeam,
} from './teams';
import { getSessionInfo } from '@/lib/auth/session';
import { resetDb, db } from '@/test/db-test';
import { makeUser, makeOrg, makeTeam } from '@/test/fixtures';
import { getEffectiveRole } from '@/lib/auth/effective-role';
import {
  teams,
  team_members,
  team_organization_grants,
  users,
  invite_links,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

beforeEach(async () => {
  await resetDb();
  vi.mocked(getSessionInfo).mockReset();
});

describe('createTeam', () => {
  it('rejects non-superadmin', async () => {
    const u = await makeUser(false);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: u, isSuperadmin: false });
    await expect(createTeam({ name: 'Beta', slug: 'beta' })).rejects.toThrow(
      /superadmin/i,
    );
  });

  it('rejects null session', async () => {
    vi.mocked(getSessionInfo).mockResolvedValue(null);
    await expect(createTeam({ name: 'Beta', slug: 'beta' })).rejects.toThrow();
  });

  it('creates team when superadmin', async () => {
    const su = await makeUser(true);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    const team = await createTeam({ name: 'Beta', slug: `beta-${Date.now()}` });
    expect(team.id).toBeDefined();
    expect(team.created_by_user_id).toBe(su);
  });

  it('rejects invalid slug', async () => {
    const su = await makeUser(true);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await expect(createTeam({ name: 'X', slug: 'X invalide' })).rejects.toThrow();
  });
});

describe('updateTeam', () => {
  it('superadmin can update', async () => {
    const su = await makeUser(true);
    const team = await makeTeam(su);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await updateTeam({ id: team, description: 'Nouvelle description' });
    const [row] = await db.select().from(teams).where(eq(teams.id, team));
    expect(row.description).toBe('Nouvelle description');
  });

  it('rejects non-superadmin', async () => {
    const u = await makeUser(false);
    const su = await makeUser(true);
    const team = await makeTeam(su);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: u, isSuperadmin: false });
    await expect(updateTeam({ id: team, description: 'X' })).rejects.toThrow(/superadmin/i);
  });
});

describe('addTeamMemberAction', () => {
  it('adds existing user directly', async () => {
    const su = await makeUser(true);
    const target = await makeUser();
    const [targetUser] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, target));
    const team = await makeTeam(su);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await addTeamMemberAction({ team_id: team, email: targetUser.email });
    const [membership] = await db
      .select()
      .from(team_members)
      .where(eq(team_members.user_id, target));
    expect(membership).toBeDefined();
    expect(membership.team_id).toBe(team);
  });

  it('rejects unknown email instead of silently creating an invite', async () => {
    // Audit fix (P2-6 / P1-10): the previous behaviour created a
    // team-scoped invite_link for an unknown email but never sent the
    // magic-link email. The team-scoped invite-acceptance flow doesn't
    // exist either, so the row was dead code. The action now refuses
    // unknown emails and points the admin to the proper onboarding path.
    const su = await makeUser(true);
    const team = await makeTeam(su);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await expect(
      addTeamMemberAction({
        team_id: team,
        email: `newuser-${Date.now()}@external.io`,
      }),
    ).rejects.toThrow(/compte Pulseo/);
    const invites = await db
      .select()
      .from(invite_links)
      .where(eq(invite_links.team_id, team));
    expect(invites).toHaveLength(0);
  });

  it('rejects non-superadmin', async () => {
    const u = await makeUser(false);
    const su = await makeUser(true);
    const team = await makeTeam(su);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: u, isSuperadmin: false });
    await expect(
      addTeamMemberAction({ team_id: team, email: 'x@t.io' }),
    ).rejects.toThrow(/superadmin/i);
  });
});

describe('removeTeamMemberAction', () => {
  it('removes a team member', async () => {
    const su = await makeUser(true);
    const member = await makeUser();
    const team = await makeTeam(su);
    await db.insert(team_members).values({
      id: crypto.randomUUID(),
      team_id: team,
      user_id: member,
    });
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await removeTeamMemberAction({ team_id: team, user_id: member });
    const rows = await db.select().from(team_members).where(eq(team_members.team_id, team));
    expect(rows).toHaveLength(0);
  });
});

describe('grantTeamOrg', () => {
  it('grants role and team member inherits', async () => {
    const su = await makeUser(true);
    const member = await makeUser();
    const org = await makeOrg();
    const team = await makeTeam(su);
    await db.insert(team_members).values({
      id: crypto.randomUUID(),
      team_id: team,
      user_id: member,
    });
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await grantTeamOrg({ team_id: team, organization_id: org, role: 'gestionnaire' });
    expect(await getEffectiveRole(member, org)).toBe('gestionnaire');
  });

  it('grants admin role with warning log', async () => {
    const su = await makeUser(true);
    const member = await makeUser();
    const org = await makeOrg();
    const team = await makeTeam(su);
    await db.insert(team_members).values({
      id: crypto.randomUUID(),
      team_id: team,
      user_id: member,
    });
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await grantTeamOrg({ team_id: team, organization_id: org, role: 'admin' });
    expect(await getEffectiveRole(member, org)).toBe('admin');
  });

  it('rejects non-superadmin', async () => {
    const u = await makeUser(false);
    const su = await makeUser(true);
    const org = await makeOrg();
    const team = await makeTeam(su);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: u, isSuperadmin: false });
    await expect(
      grantTeamOrg({ team_id: team, organization_id: org, role: 'viewer' }),
    ).rejects.toThrow(/superadmin/i);
  });
});

describe('revokeTeamOrg', () => {
  it('removes the grant', async () => {
    const su = await makeUser(true);
    const member = await makeUser();
    const org = await makeOrg();
    const team = await makeTeam(su);
    await db.insert(team_members).values({
      id: crypto.randomUUID(),
      team_id: team,
      user_id: member,
    });
    await db.insert(team_organization_grants).values({
      id: crypto.randomUUID(),
      team_id: team,
      organization_id: org,
      role: 'viewer',
      granted_by_user_id: su,
    });
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await revokeTeamOrg({ team_id: team, organization_id: org });
    const rows = await db
      .select()
      .from(team_organization_grants)
      .where(eq(team_organization_grants.team_id, team));
    expect(rows).toHaveLength(0);
    expect(await getEffectiveRole(member, org)).toBeNull();
  });
});

describe('deleteTeam', () => {
  it('throws when not superadmin', async () => {
    const u = await makeUser();
    const team = await makeTeam(u);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: u, isSuperadmin: false });
    await expect(deleteTeam({ team_id: team })).rejects.toThrow(/superadmin/i);
  });

  it('returns deleted=false for unknown id (idempotent)', async () => {
    const su = await makeUser(true);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    const result = await deleteTeam({ team_id: crypto.randomUUID() });
    expect(result).toEqual({ deleted: false });
  });

  it('deletes team + cascades members + grants + revokes inherited access', async () => {
    const su = await makeUser(true);
    const memberEmail = `member-${crypto.randomUUID()}@test.io`;
    const member = await makeUser(false, memberEmail);
    const org = await makeOrg();
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });

    const team = await makeTeam(su);
    await addTeamMemberAction({ team_id: team, email: memberEmail });
    await grantTeamOrg({ team_id: team, organization_id: org, role: 'gestionnaire' });

    // sanity: access before delete
    expect(await getEffectiveRole(member, org)).toBe('gestionnaire');

    const result = await deleteTeam({ team_id: team });
    expect(result).toEqual({ deleted: true });

    const teamRows = await db
      .select()
      .from(teams)
      .where(eq(teams.id, team));
    expect(teamRows).toHaveLength(0);

    const memberRows = await db
      .select()
      .from(team_members)
      .where(eq(team_members.team_id, team));
    expect(memberRows).toHaveLength(0);

    const grantRows = await db
      .select()
      .from(team_organization_grants)
      .where(eq(team_organization_grants.team_id, team));
    expect(grantRows).toHaveLength(0);

    // access revoked via team grant cascade
    expect(await getEffectiveRole(member, org)).toBeNull();
  });

  it('throws on invalid input', async () => {
    const su = await makeUser(true);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await expect(deleteTeam({ wrong_field: 'x' })).rejects.toThrow(/invalides/i);
  });
});

void users;
void invite_links;
