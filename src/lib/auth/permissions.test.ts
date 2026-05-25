// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
  const mod = await import('@/test/db-test');
  const schema = await import('@/lib/db/schema');
  return { db: mod.db, schema };
});

import {
  canManageMember, canRemoveMember, canAccessOrg, canAccessGroup,
} from './permissions';
import { resetDb } from '@/test/db-test';
import {
  makeUser, makeOrg, makeGroup, makeTeam,
  addMember, addGroupManager, addTeamMember, addTeamGrant,
} from '@/test/fixtures';

beforeEach(async () => { await resetDb(); });

describe('permissions — canManageMember (règles 1 + 5)', () => {
  it('admin can manage gestionnaire', async () => {
    const admin = await makeUser();
    const target = await makeUser();
    const org = await makeOrg();
    await addMember(admin, org, 'admin');
    await addMember(target, org, 'gestionnaire');
    expect(await canManageMember(admin, target, org)).toBe(true);
  });

  it('admin cannot manage another admin (strict <)', async () => {
    const a1 = await makeUser();
    const a2 = await makeUser();
    const org = await makeOrg();
    await addMember(a1, org, 'admin');
    await addMember(a2, org, 'admin');
    expect(await canManageMember(a1, a2, org)).toBe(false);
  });

  it('gestionnaire can manage viewer but not gestionnaire', async () => {
    const g = await makeUser();
    const v = await makeUser();
    const g2 = await makeUser();
    const org = await makeOrg();
    await addMember(g, org, 'gestionnaire');
    await addMember(v, org, 'viewer');
    await addMember(g2, org, 'gestionnaire');
    expect(await canManageMember(g, v, org)).toBe(true);
    expect(await canManageMember(g, g2, org)).toBe(false);
  });

  it('viewer cannot manage anyone', async () => {
    const v = await makeUser();
    const v2 = await makeUser();
    const org = await makeOrg();
    await addMember(v, org, 'viewer');
    await addMember(v2, org, 'viewer');
    expect(await canManageMember(v, v2, org)).toBe(false);
  });

  it('superadmin can manage anyone (override)', async () => {
    const su = await makeUser(true);
    const a = await makeUser();
    const org = await makeOrg();
    await addMember(a, org, 'admin');
    expect(await canManageMember(su, a, org)).toBe(true);
  });
});

describe('permissions — canRemoveMember (règles 1-5)', () => {
  it('user cannot remove self (règle 2)', async () => {
    const u = await makeUser();
    const org = await makeOrg();
    await addMember(u, org, 'admin');
    expect(await canRemoveMember(u, u, org)).toBe(false);
  });

  it('superadmin cannot remove self (règle 2 applies even to superadmin)', async () => {
    const su = await makeUser(true);
    const org = await makeOrg();
    await addMember(su, org, 'admin');
    expect(await canRemoveMember(su, su, org)).toBe(false);
  });

  it('admin cannot remove another admin (règle 1 bloque avant règle 3)', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const org = await makeOrg();
    await addMember(a, org, 'admin');
    await addMember(b, org, 'admin');
    expect(await canRemoveMember(a, b, org)).toBe(false);
  });

  it('superadmin cannot remove the last direct admin (règle 3)', async () => {
    const su = await makeUser(true);
    const onlyAdmin = await makeUser();
    const org = await makeOrg();
    await addMember(onlyAdmin, org, 'admin');
    expect(await canRemoveMember(su, onlyAdmin, org)).toBe(false);
  });

  it('superadmin CAN remove an admin if others remain (règle 3 satisfied)', async () => {
    const su = await makeUser(true);
    const a = await makeUser();
    const b = await makeUser();
    const org = await makeOrg();
    await addMember(a, org, 'admin');
    await addMember(b, org, 'admin');
    expect(await canRemoveMember(su, a, org)).toBe(true);
  });

  it('grants via team do not count as direct admin (règle 4)', async () => {
    const su = await makeUser(true);
    const directAdmin = await makeUser();
    const teamAdmin = await makeUser();
    const org = await makeOrg();
    await addMember(directAdmin, org, 'admin');
    const team = await makeTeam(su);
    await addTeamMember(teamAdmin, team);
    await addTeamGrant(team, org, 'admin', su);
    // directAdmin est le seul admin DIRECT → superadmin ne peut pas le retirer
    expect(await canRemoveMember(su, directAdmin, org)).toBe(false);
  });
});

describe('permissions — canAccessOrg', () => {
  it('returns true for any valid role', async () => {
    const u = await makeUser();
    const org = await makeOrg();
    await addMember(u, org, 'viewer');
    expect(await canAccessOrg(u, org)).toBe(true);
  });

  it('returns false for user with no membership', async () => {
    const u = await makeUser();
    const org = await makeOrg();
    expect(await canAccessOrg(u, org)).toBe(false);
  });

  it('returns true for superadmin regardless of membership', async () => {
    const su = await makeUser(true);
    const org = await makeOrg();
    expect(await canAccessOrg(su, org)).toBe(true);
  });
});

describe('permissions — canAccessGroup', () => {
  it('group manager returns true', async () => {
    const u = await makeUser();
    const group = await makeGroup();
    await addGroupManager(u, group);
    expect(await canAccessGroup(u, group)).toBe(true);
  });

  it('superadmin returns true', async () => {
    const su = await makeUser(true);
    const group = await makeGroup();
    expect(await canAccessGroup(su, group)).toBe(true);
  });

  it('random user returns false', async () => {
    const u = await makeUser();
    const group = await makeGroup();
    expect(await canAccessGroup(u, group)).toBe(false);
  });
});
