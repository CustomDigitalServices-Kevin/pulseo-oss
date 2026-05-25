// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
  const mod = await import('@/test/db-test');
  const schema = await import('@/lib/db/schema');
  return { db: mod.db, schema };
});

import { getEffectiveRole, getRoleSources } from './effective-role';
import { resetDb } from '@/test/db-test';
import {
  makeUser, makeOrg, makeGroup, makeTeam,
  addMember, addGroupManager, addTeamMember, addTeamGrant,
} from '@/test/fixtures';

beforeEach(async () => {
  await resetDb();
});

describe('getEffectiveRole', () => {
  it('returns null when user has no access', async () => {
    const userId = await makeUser();
    const orgId = await makeOrg();
    expect(await getEffectiveRole(userId, orgId)).toBeNull();
  });

  it('returns direct membership role', async () => {
    const userId = await makeUser();
    const orgId = await makeOrg();
    await addMember(userId, orgId, 'viewer');
    expect(await getEffectiveRole(userId, orgId)).toBe('viewer');
  });

  it('inherits gestionnaire via group manager', async () => {
    const userId = await makeUser();
    const groupId = await makeGroup();
    const orgId = await makeOrg(groupId);
    await addGroupManager(userId, groupId);
    expect(await getEffectiveRole(userId, orgId)).toBe('gestionnaire');
  });

  it('inherits role via team grant', async () => {
    const userId = await makeUser();
    const orgId = await makeOrg();
    const teamId = await makeTeam(userId);
    await addTeamMember(userId, teamId);
    await addTeamGrant(teamId, orgId, 'admin', userId);
    expect(await getEffectiveRole(userId, orgId)).toBe('admin');
  });

  it('returns highest role when multiple sources', async () => {
    const userId = await makeUser();
    const orgId = await makeOrg();
    const teamId = await makeTeam(userId);
    await addMember(userId, orgId, 'viewer');
    await addTeamMember(userId, teamId);
    await addTeamGrant(teamId, orgId, 'admin', userId);
    expect(await getEffectiveRole(userId, orgId)).toBe('admin');
  });

  it('group manager beats direct viewer', async () => {
    const userId = await makeUser();
    const groupId = await makeGroup();
    const orgId = await makeOrg(groupId);
    await addMember(userId, orgId, 'viewer');
    await addGroupManager(userId, groupId);
    expect(await getEffectiveRole(userId, orgId)).toBe('gestionnaire');
  });
});

describe('getRoleSources', () => {
  it('returns empty when user has no access', async () => {
    const userId = await makeUser();
    const orgId = await makeOrg();
    expect(await getRoleSources(userId, orgId)).toEqual([]);
  });

  it('lists direct membership with role and date', async () => {
    const userId = await makeUser();
    const orgId = await makeOrg();
    await addMember(userId, orgId, 'admin');
    const sources = await getRoleSources(userId, orgId);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ kind: 'direct', role: 'admin' });
    expect(sources[0]?.since).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('lists group manager inheritance with group name', async () => {
    const userId = await makeUser();
    const groupId = await makeGroup('Acme');
    const orgId = await makeOrg(groupId);
    await addGroupManager(userId, groupId);
    const sources = await getRoleSources(userId, orgId);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      kind: 'group_manager',
      groupId,
      groupName: 'Acme',
    });
  });

  it('lists team grant with team name and role', async () => {
    const userId = await makeUser();
    const orgId = await makeOrg();
    const teamId = await makeTeam(userId, 'Beta');
    await addTeamMember(userId, teamId);
    await addTeamGrant(teamId, orgId, 'viewer', userId);
    const sources = await getRoleSources(userId, orgId);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      kind: 'team_grant',
      teamId,
      teamName: 'Beta',
      role: 'viewer',
    });
  });

  it('combines all three sources and sorts by date ascending', async () => {
    const userId = await makeUser();
    const groupId = await makeGroup('Groupe');
    const orgId = await makeOrg(groupId);
    const teamId = await makeTeam(userId, 'Team');

    await addMember(userId, orgId, 'viewer');
    await addGroupManager(userId, groupId);
    await addTeamMember(userId, teamId);
    await addTeamGrant(teamId, orgId, 'gestionnaire', userId);

    const sources = await getRoleSources(userId, orgId);
    expect(sources).toHaveLength(3);
    const kinds = sources.map((s) => s.kind);
    expect(kinds).toContain('direct');
    expect(kinds).toContain('group_manager');
    expect(kinds).toContain('team_grant');
    const dates = sources.map((s) => s.since);
    expect([...dates].sort()).toEqual(dates);
  });
});
