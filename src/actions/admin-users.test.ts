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

import { setSuperadmin, findUserByEmail } from './admin-users';
import { getSessionInfo } from '@/lib/auth/session';
import { resetDb, db } from '@/test/db-test';
import { makeUser } from '@/test/fixtures';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

beforeEach(async () => {
  await resetDb();
  vi.mocked(getSessionInfo).mockReset();
});

describe('setSuperadmin', () => {
  it('rejects non-superadmin', async () => {
    const u = await makeUser(false);
    const target = await makeUser(false);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: u, isSuperadmin: false });
    await expect(setSuperadmin(target, true)).rejects.toThrow(/superadmin/i);
  });

  it('rejects null session', async () => {
    const target = await makeUser(false);
    vi.mocked(getSessionInfo).mockResolvedValue(null);
    await expect(setSuperadmin(target, true)).rejects.toThrow();
  });

  it('rejects self-demotion', async () => {
    const su = await makeUser(true);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await expect(setSuperadmin(su, false)).rejects.toThrow(/soi-même/i);
  });

  it('allows self-promotion (noop) — guard only blocks demotion', async () => {
    const su = await makeUser(true);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await expect(setSuperadmin(su, true)).resolves.toBeUndefined();
  });

  it('toggles correctly — promote', async () => {
    const su = await makeUser(true);
    const target = await makeUser(false);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await setSuperadmin(target, true);
    const [row] = await db.select().from(users).where(eq(users.id, target));
    expect(row.is_superadmin).toBe(true);
  });

  it('toggles correctly — demote another user', async () => {
    const su = await makeUser(true);
    const target = await makeUser(true);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    await setSuperadmin(target, false);
    const [row] = await db.select().from(users).where(eq(users.id, target));
    expect(row.is_superadmin).toBe(false);
  });
});

describe('findUserByEmail', () => {
  it('rejects non-superadmin', async () => {
    const u = await makeUser(false);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: u, isSuperadmin: false });
    await expect(findUserByEmail('x@test.io')).rejects.toThrow(/superadmin/i);
  });

  it('returns null for unknown email', async () => {
    const su = await makeUser(true);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    const result = await findUserByEmail('unknown@test.io');
    expect(result).toBeNull();
  });

  it('returns user when email matches (case-insensitive)', async () => {
    const su = await makeUser(true);
    vi.mocked(getSessionInfo).mockResolvedValue({ userId: su, isSuperadmin: true });
    // Fetch the seeded user's email (makeUser uses `${id}@test.io`)
    const [seeded] = await db.select().from(users).where(eq(users.id, su));
    const result = await findUserByEmail(seeded.email.toUpperCase());
    expect(result).not.toBeNull();
    expect(result?.id).toBe(su);
  });
});
