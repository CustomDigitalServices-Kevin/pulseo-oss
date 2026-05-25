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

import { addMember, removeMember, updateMemberRole } from './members';
import { getSessionInfo } from '@/lib/auth/session';
import { resetDb, db } from '@/test/db-test';
import { makeUser, makeOrg, addMember as seedMember } from '@/test/fixtures';
import { organization_members, invite_links, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

beforeEach(async () => {
  await resetDb();
  vi.mocked(getSessionInfo).mockReset();
});

describe('addMember — anti-escalation', () => {
  it('rejects non-authenticated', async () => {
    const org = await makeOrg();
    vi.mocked(getSessionInfo).mockResolvedValue(null);
    await expect(
      addMember({ organization_id: org, email: 'x@t.io', role: 'viewer' }),
    ).rejects.toThrow(/authentif/i);
  });

  it('gestionnaire cannot add admin (strict <)', async () => {
    const g = await makeUser();
    const org = await makeOrg();
    await seedMember(g, org, 'gestionnaire');
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: g, isSuperadmin: false });
    await expect(
      addMember({ organization_id: org, email: 'newadmin@t.io', role: 'admin' }),
    ).rejects.toThrow();
  });

  it('gestionnaire cannot add another gestionnaire', async () => {
    const g = await makeUser();
    const org = await makeOrg();
    await seedMember(g, org, 'gestionnaire');
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: g, isSuperadmin: false });
    await expect(
      addMember({ organization_id: org, email: 'gest2@t.io', role: 'gestionnaire' }),
    ).rejects.toThrow();
  });

  it('gestionnaire CAN add viewer', async () => {
    const g = await makeUser();
    const org = await makeOrg();
    await seedMember(g, org, 'gestionnaire');
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: g, isSuperadmin: false });
    await addMember({
      organization_id: org,
      email: `v-${Date.now()}@t.io`,
      role: 'viewer',
    });
    // Invite link created since user did not exist
    const invites = await db
      .select()
      .from(invite_links)
      .where(eq(invite_links.organization_id, org));
    expect(invites).toHaveLength(1);
  });

  it('admin CAN add gestionnaire (existing user → direct)', async () => {
    const admin = await makeUser();
    const target = await makeUser();
    const [targetRow] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, target));
    const org = await makeOrg();
    await seedMember(admin, org, 'admin');
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: admin, isSuperadmin: false });
    await addMember({
      organization_id: org,
      email: targetRow.email,
      role: 'gestionnaire',
    });
    const [m] = await db
      .select()
      .from(organization_members)
      .where(
        and(
          eq(organization_members.organization_id, org),
          eq(organization_members.user_id, target),
        ),
      );
    expect(m.role).toBe('gestionnaire');
  });

  it('admin cannot add another admin (strict <)', async () => {
    const admin = await makeUser();
    const other = await makeUser();
    const [otherRow] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, other));
    const org = await makeOrg();
    await seedMember(admin, org, 'admin');
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: admin, isSuperadmin: false });
    await expect(
      addMember({ organization_id: org, email: otherRow.email, role: 'admin' }),
    ).rejects.toThrow();
  });

  it('viewer cannot do anything', async () => {
    const v = await makeUser();
    const org = await makeOrg();
    await seedMember(v, org, 'viewer');
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: v, isSuperadmin: false });
    await expect(
      addMember({ organization_id: org, email: 't@t.io', role: 'viewer' }),
    ).rejects.toThrow();
  });

  it('superadmin can add admin', async () => {
    const su = await makeUser(true);
    const target = await makeUser();
    const [targetRow] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, target));
    const org = await makeOrg();
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await addMember({
      organization_id: org,
      email: targetRow.email,
      role: 'admin',
    });
    const [m] = await db
      .select()
      .from(organization_members)
      .where(
        and(
          eq(organization_members.organization_id, org),
          eq(organization_members.user_id, target),
        ),
      );
    expect(m.role).toBe('admin');
  });
});

describe('removeMember — anti-escalation', () => {
  it('rejects self-removal (règle 2)', async () => {
    const a = await makeUser();
    const org = await makeOrg();
    await seedMember(a, org, 'admin');
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: a, isSuperadmin: false });
    await expect(removeMember({ organization_id: org, user_id: a })).rejects.toThrow();
  });

  it('admin can remove gestionnaire', async () => {
    const admin = await makeUser();
    const g = await makeUser();
    const org = await makeOrg();
    await seedMember(admin, org, 'admin');
    await seedMember(g, org, 'gestionnaire');
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: admin, isSuperadmin: false });
    await removeMember({ organization_id: org, user_id: g });
    const rows = await db
      .select()
      .from(organization_members)
      .where(
        and(
          eq(organization_members.organization_id, org),
          eq(organization_members.user_id, g),
        ),
      );
    expect(rows).toHaveLength(0);
  });

  it('admin cannot remove another admin (règle 1)', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const org = await makeOrg();
    await seedMember(a, org, 'admin');
    await seedMember(b, org, 'admin');
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: a, isSuperadmin: false });
    await expect(removeMember({ organization_id: org, user_id: b })).rejects.toThrow();
  });

  it('superadmin cannot remove last direct admin (règle 3)', async () => {
    const su = await makeUser(true);
    const onlyAdmin = await makeUser();
    const org = await makeOrg();
    await seedMember(onlyAdmin, org, 'admin');
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await expect(
      removeMember({ organization_id: org, user_id: onlyAdmin }),
    ).rejects.toThrow();
  });
});

describe('updateMemberRole', () => {
  it('admin can demote gestionnaire to viewer', async () => {
    const admin = await makeUser();
    const g = await makeUser();
    const org = await makeOrg();
    await seedMember(admin, org, 'admin');
    await seedMember(g, org, 'gestionnaire');
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: admin, isSuperadmin: false });
    await updateMemberRole({
      organization_id: org,
      user_id: g,
      role: 'viewer',
    });
    const [m] = await db
      .select()
      .from(organization_members)
      .where(
        and(
          eq(organization_members.organization_id, org),
          eq(organization_members.user_id, g),
        ),
      );
    expect(m.role).toBe('viewer');
  });

  it('gestionnaire cannot promote viewer to gestionnaire', async () => {
    const g = await makeUser();
    const v = await makeUser();
    const org = await makeOrg();
    await seedMember(g, org, 'gestionnaire');
    await seedMember(v, org, 'viewer');
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: g, isSuperadmin: false });
    // canManageMember would PASS (gest > viewer) but the extra rank-of-new-role
    // check must block this: RANK[gestionnaire] >= RANK[gestionnaire].
    await expect(
      updateMemberRole({
        organization_id: org,
        user_id: v,
        role: 'gestionnaire',
      }),
    ).rejects.toThrow();
  });
});
