// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Mock DB first — factory awaits the dynamic import so named exports resolve.
vi.mock('@/lib/db', async () => {
  const mod = await import('@/test/db-test');
  const schema = await import('@/lib/db/schema');
  return { db: mod.db, schema };
});
// Mock next/headers (auth.api.getSession takes it as param, but the spy bypasses it — still needs stub)
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { getSessionInfo } from './session';
import { auth } from './index';
import { db, resetDb } from '@/test/db-test';
import { users } from '@/lib/db/schema';

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
});

describe('getSessionInfo', () => {
  it('returns null when no session', async () => {
    vi.spyOn(auth.api, 'getSession').mockResolvedValue(null as never);
    expect(await getSessionInfo()).toBeNull();
  });

  it('returns { userId, isSuperadmin: false } for regular user', async () => {
    const id = crypto.randomUUID();
    await db.insert(users).values({ id, email: id + '@t.io', emailVerified: true });
    vi.spyOn(auth.api, 'getSession').mockResolvedValue({ user: { id } } as never);
    const info = await getSessionInfo();
    expect(info).toEqual({ userId: id, isSuperadmin: false });
  });

  it('returns isSuperadmin: true for superadmin user', async () => {
    const id = crypto.randomUUID();
    await db.insert(users).values({ id, email: id + '@t.io', emailVerified: true, is_superadmin: true });
    vi.spyOn(auth.api, 'getSession').mockResolvedValue({ user: { id } } as never);
    const info = await getSessionInfo();
    expect(info).toEqual({ userId: id, isSuperadmin: true });
  });
});
