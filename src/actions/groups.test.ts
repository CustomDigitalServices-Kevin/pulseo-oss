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

// Mock next/cache revalidatePath
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  createGroup,
  updateGroup,
  attachOrgToGroup,
  addGroupManager,
  removeGroupManager,
  deleteGroup,
} from './groups';
import { getSessionInfo } from '@/lib/auth/session';
import { resetDb, db } from '@/test/db-test';
import { makeUser, makeOrg, makeGroup } from '@/test/fixtures';
import {
  organization_groups,
  organizations,
  organization_group_managers,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

beforeEach(async () => {
  await resetDb();
  vi.mocked(getSessionInfo).mockReset();
});

describe('createGroup', () => {
  it('rejects non-superadmin', async () => {
    const u = await makeUser(false);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: u, isSuperadmin: false });
    await expect(createGroup({ name: 'Acme', slug: 'acme' })).rejects.toThrow(/superadmin/i);
  });

  it('rejects null session', async () => {
    vi.mocked(getSessionInfo).mockResolvedValue(null);
    await expect(createGroup({ name: 'Acme', slug: 'acme' })).rejects.toThrow();
  });

  it('creates group when superadmin', async () => {
    const su = await makeUser(true);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    const group = await createGroup({ name: 'Acme', slug: `acme-${Date.now()}` });
    expect(group.id).toBeDefined();
    expect(group.name).toBe('Acme');
    const [row] = await db
      .select()
      .from(organization_groups)
      .where(eq(organization_groups.id, group.id));
    expect(row).toBeDefined();
  });

  it('rejects invalid input (slug with spaces)', async () => {
    const su = await makeUser(true);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await expect(createGroup({ name: 'Acme', slug: 'acme invalide' })).rejects.toThrow();
  });
});

describe('updateGroup', () => {
  it('superadmin can update', async () => {
    const su = await makeUser(true);
    const gid = await makeGroup();
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await updateGroup({ id: gid, name: 'Nouveau nom' });
    const [row] = await db
      .select()
      .from(organization_groups)
      .where(eq(organization_groups.id, gid));
    expect(row.name).toBe('Nouveau nom');
  });

  it('rejects non-superadmin', async () => {
    const u = await makeUser(false);
    const gid = await makeGroup();
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: u, isSuperadmin: false });
    await expect(updateGroup({ id: gid, name: 'X' })).rejects.toThrow(/superadmin/i);
  });
});

describe('attachOrgToGroup', () => {
  it('attaches an org to a group', async () => {
    const su = await makeUser(true);
    const gid = await makeGroup();
    const oid = await makeOrg();
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await attachOrgToGroup({ organization_id: oid, group_id: gid });
    const [row] = await db.select().from(organizations).where(eq(organizations.id, oid));
    expect(row.group_id).toBe(gid);
  });

  it('detaches an org (group_id null)', async () => {
    const su = await makeUser(true);
    const gid = await makeGroup();
    const oid = await makeOrg(gid);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await attachOrgToGroup({ organization_id: oid, group_id: null });
    const [row] = await db.select().from(organizations).where(eq(organizations.id, oid));
    expect(row.group_id).toBeNull();
  });
});

describe('addGroupManager / removeGroupManager', () => {
  it('superadmin can add a group manager', async () => {
    const su = await makeUser(true);
    const target = await makeUser();
    const gid = await makeGroup();
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await addGroupManager({ group_id: gid, user_id: target });
    const [row] = await db
      .select()
      .from(organization_group_managers)
      .where(eq(organization_group_managers.user_id, target));
    expect(row).toBeDefined();
  });

  it('superadmin can remove a group manager', async () => {
    const su = await makeUser(true);
    const target = await makeUser();
    const gid = await makeGroup();
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await addGroupManager({ group_id: gid, user_id: target });
    await removeGroupManager({ group_id: gid, user_id: target });
    const rows = await db
      .select()
      .from(organization_group_managers)
      .where(eq(organization_group_managers.group_id, gid));
    expect(rows).toHaveLength(0);
  });

  it('duplicate addGroupManager rejects (UNIQUE constraint)', async () => {
    const su = await makeUser(true);
    const target = await makeUser();
    const gid = await makeGroup();
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await addGroupManager({ group_id: gid, user_id: target });
    await expect(addGroupManager({ group_id: gid, user_id: target })).rejects.toThrow();
  });
});

describe('deleteGroup', () => {
  it('throws when not superadmin', async () => {
    const u = await makeUser();
    const gid = await makeGroup();
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: u, isSuperadmin: false });
    await expect(deleteGroup({ group_id: gid })).rejects.toThrow(/superadmin/i);
  });

  it('returns deleted=false for unknown id (idempotent)', async () => {
    const su = await makeUser(true);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    const result = await deleteGroup({ group_id: crypto.randomUUID() });
    expect(result).toEqual({ deleted: false });
  });

  it('deletes the group and detaches its orgs (group_id → NULL)', async () => {
    const su = await makeUser(true);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });

    const gid = await makeGroup();
    const orgA = await makeOrg(gid);
    const orgB = await makeOrg(gid);

    const result = await deleteGroup({ group_id: gid });
    expect(result).toEqual({ deleted: true });

    const rows = await db
      .select({ id: organization_groups.id })
      .from(organization_groups)
      .where(eq(organization_groups.id, gid));
    expect(rows).toHaveLength(0);

    // Orgs detached, not deleted.
    const orgs = await db
      .select({ id: organizations.id, group_id: organizations.group_id })
      .from(organizations)
      .where(eq(organizations.id, orgA));
    expect(orgs).toHaveLength(1);
    expect(orgs[0]?.group_id).toBeNull();

    const orgs2 = await db
      .select({ id: organizations.id, group_id: organizations.group_id })
      .from(organizations)
      .where(eq(organizations.id, orgB));
    expect(orgs2[0]?.group_id).toBeNull();
  });

  it('cascades managers when group is deleted', async () => {
    const su = await makeUser(true);
    const manager = await makeUser();
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });

    const gid = await makeGroup();
    await addGroupManager({ group_id: gid, user_id: manager });

    await deleteGroup({ group_id: gid });

    const rows = await db
      .select()
      .from(organization_group_managers)
      .where(eq(organization_group_managers.group_id, gid));
    expect(rows).toHaveLength(0);
  });

  it('throws on invalid input', async () => {
    const su = await makeUser(true);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await expect(deleteGroup({ wrong_field: 'x' })).rejects.toThrow(/invalides/i);
  });
});
