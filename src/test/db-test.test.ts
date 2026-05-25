// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { db, resetDb } from './db-test';
import { users, organizations, organization_groups } from '@/lib/db/schema';
import { sql, eq } from 'drizzle-orm';

// IDs must fit `varchar(36)` — use bare UUIDs (exactly 36 chars), no prefix.
const newId = (): string => crypto.randomUUID();

beforeEach(async () => {
  await resetDb();
});

describe('test DB smoke', () => {
  it('users table exists and empty after reset', async () => {
    const rows = await db.select().from(users);
    expect(rows).toEqual([]);
  });

  it('CHECK constraint blocks invite_links with both scopes NULL', async () => {
    const userId = newId();
    await db
      .insert(users)
      .values({ id: userId, email: userId + '@t.io', emailVerified: true });

    // Both organization_id and team_id NULL violates chk_invite_scope_xor.
    // Drizzle re-wraps PG errors as generic "Failed query: ..." messages, so
    // inspect the `cause` chain for the real Postgres message.
    const inviteId = newId();
    const token = 'tok-' + Math.floor(Math.random() * 1e9).toString();
    let caught: unknown = null;
    try {
      await db.execute(sql`
        INSERT INTO invite_links (id, token, organization_id, team_id, created_by, is_active, use_count)
        VALUES (${inviteId}, ${token}, NULL, NULL, ${userId}, true, 0)
      `);
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeNull();

    // Collect messages from the error + its `cause` chain.
    const messages: string[] = [];
    let cursor: unknown = caught;
    while (cursor && typeof cursor === 'object' && messages.length < 10) {
      const e = cursor as { message?: unknown; cause?: unknown };
      if (typeof e.message === 'string') messages.push(e.message);
      cursor = e.cause;
    }
    const joined = messages.join(' | ');
    expect(joined).toMatch(/chk_invite_scope_xor|check constraint/i);
  });

  it('FK cascade: deleting user cascades to organization_members', async () => {
    const userId = newId();
    const orgId = newId();
    await db
      .insert(users)
      .values({ id: userId, email: userId + '@t.io', emailVerified: true });
    await db.insert(organizations).values({ id: orgId, name: 'O', slug: orgId });

    const memberId = newId();
    await db.execute(sql`
      INSERT INTO organization_members (id, organization_id, user_id, role)
      VALUES (${memberId}, ${orgId}, ${userId}, 'viewer')
    `);

    await db.delete(users).where(eq(users.id, userId));

    const rows = await db.execute(
      sql`SELECT count(*)::int AS n FROM organization_members WHERE user_id = ${userId}`,
    );
    expect((rows.rows[0] as { n: number }).n).toBe(0);
  });

  it('organization_groups slug is unique', async () => {
    await db
      .insert(organization_groups)
      .values({ id: newId(), name: 'A', slug: 'dup' });
    await expect(
      db
        .insert(organization_groups)
        .values({ id: newId(), name: 'B', slug: 'dup' }),
    ).rejects.toThrow();
  });
});
