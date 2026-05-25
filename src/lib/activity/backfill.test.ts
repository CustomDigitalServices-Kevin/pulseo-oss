// @vitest-environment node
/**
 * Tests for the 30-day activity-event backfill script.
 *
 * We mock `@/lib/db` to the PGlite test DB (migrations applied), seed a
 * mixed set of sessions / tickets / ticket_comments spanning the 30-day
 * window and some older rows, then invoke `runBackfill()` and assert the
 * resulting rows in `user_activity_events`.
 *
 * The script module's top-level `isDirectRun()` guard prevents the script
 * entry from firing when imported here (vitest's argv[1] is not
 * `backfill.ts`).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
  const mod = await import('@/test/db-test');
  const schema = await import('@/lib/db/schema');
  return { db: mod.db, schema };
});

import { runBackfill } from './backfill';
import { db, resetDb } from '@/test/db-test';
import {
  sessions,
  tickets,
  ticket_comments,
  user_activity_events,
} from '@/lib/db/schema';
import { makeUser, makeOrg } from '@/test/fixtures';
import { eq, and } from 'drizzle-orm';

// Helpers ─ keep tests readable. IDs are UUIDs (varchar(36)).

const newId = (): string => crypto.randomUUID();

interface SeedSessionOpts {
  userId: string;
  createdAt: Date;
}

async function seedSession({ userId, createdAt }: SeedSessionOpts): Promise<string> {
  const id = newId();
  await db.insert(sessions).values({
    id,
    userId,
    token: `tok-${id}`,
    expiresAt: new Date(createdAt.getTime() + 7 * 24 * 3600 * 1000),
    createdAt,
    updatedAt: createdAt,
  });
  return id;
}

interface SeedTicketOpts {
  orgId: string;
  creatorId: string | null;
  createdAt: Date;
}

let ticketCounter = 0;

async function seedTicket({ orgId, creatorId, createdAt }: SeedTicketOpts): Promise<string> {
  const id = newId();
  ticketCounter += 1;
  await db.insert(tickets).values({
    id,
    organization_id: orgId,
    number: ticketCounter,
    title: `T ${id}`,
    description: 'x',
    category: 'bug',
    creator_id: creatorId,
    created_at: createdAt,
    updated_at: createdAt,
  });
  return id;
}

interface SeedCommentOpts {
  ticketId: string;
  authorId: string;
  createdAt: Date;
}

async function seedComment({ ticketId, authorId, createdAt }: SeedCommentOpts): Promise<string> {
  const id = newId();
  await db.insert(ticket_comments).values({
    id,
    ticket_id: ticketId,
    author_id: authorId,
    content: 'hello',
    created_at: createdAt,
    updated_at: createdAt,
  });
  return id;
}

// Dates: `recent` is well inside the 30-day window, `old` is well outside.
// We deliberately pick 5d / 45d rather than boundary values so test flakiness
// from clock drift or NOW() evaluation micro-timing is impossible.
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000);

beforeEach(async () => {
  await resetDb();
  ticketCounter = 0;
});

describe('runBackfill', () => {
  it('inserts one login event per session in the 30-day window, skipping older ones', async () => {
    const userA = await makeUser();
    const userB = await makeUser();

    await seedSession({ userId: userA, createdAt: daysAgo(1) });
    await seedSession({ userId: userA, createdAt: daysAgo(5) });
    await seedSession({ userId: userB, createdAt: daysAgo(10) });
    // Older than 30d — must be excluded.
    await seedSession({ userId: userA, createdAt: daysAgo(45) });

    const counts = await runBackfill();

    expect(counts.login).toBe(3);
    const rows = await db
      .select()
      .from(user_activity_events)
      .where(eq(user_activity_events.event_type, 'login'));
    expect(rows).toHaveLength(3);
    // Sessions have no org context — must be NULL.
    for (const r of rows) {
      expect(r.organization_id).toBeNull();
      expect(r.resource_id).toBeNull();
      expect(r.user_id === userA || r.user_id === userB).toBe(true);
    }
  });

  it('inserts ticket_created events and skips guest (creator_id NULL) and old rows', async () => {
    const orgId = await makeOrg();
    const userA = await makeUser();

    const ticketRecent = await seedTicket({ orgId, creatorId: userA, createdAt: daysAgo(2) });
    await seedTicket({ orgId, creatorId: userA, createdAt: daysAgo(20) });
    // Guest ticket — no creator, must be skipped.
    await seedTicket({ orgId, creatorId: null, createdAt: daysAgo(3) });
    // Older than 30d — must be skipped.
    await seedTicket({ orgId, creatorId: userA, createdAt: daysAgo(45) });

    const counts = await runBackfill();

    expect(counts.ticket_created).toBe(2);
    const rows = await db
      .select()
      .from(user_activity_events)
      .where(eq(user_activity_events.event_type, 'ticket_created'));
    expect(rows).toHaveLength(2);
    // resource_id carries the ticket id; org is propagated from the ticket.
    const resourceIds = rows.map((r) => r.resource_id).sort();
    expect(resourceIds).toContain(ticketRecent);
    for (const r of rows) {
      expect(r.organization_id).toBe(orgId);
      expect(r.user_id).toBe(userA);
    }
  });

  it('inserts ticket_commented events with org from the parent ticket and skips old ones', async () => {
    const orgId = await makeOrg();
    const userA = await makeUser();
    const userB = await makeUser();

    // Parent ticket is old (45d) — that is fine, we filter on comment.created_at.
    const ticketId = await seedTicket({ orgId, creatorId: userA, createdAt: daysAgo(45) });

    await seedComment({ ticketId, authorId: userA, createdAt: daysAgo(1) });
    await seedComment({ ticketId, authorId: userB, createdAt: daysAgo(15) });
    // Old comment — must be skipped.
    await seedComment({ ticketId, authorId: userA, createdAt: daysAgo(40) });

    const counts = await runBackfill();

    expect(counts.ticket_commented).toBe(2);
    const rows = await db
      .select()
      .from(user_activity_events)
      .where(eq(user_activity_events.event_type, 'ticket_commented'));
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.organization_id).toBe(orgId);
      expect(r.resource_id).toBe(ticketId);
    }
    // Ticket_created must NOT have fired for the 45d-old parent ticket.
    const createdRows = await db
      .select()
      .from(user_activity_events)
      .where(eq(user_activity_events.event_type, 'ticket_created'));
    expect(createdRows).toHaveLength(0);
  });

  it('combines all three event types in a single run with the right counts', async () => {
    const orgId = await makeOrg();
    const userA = await makeUser();

    await seedSession({ userId: userA, createdAt: daysAgo(1) });
    await seedSession({ userId: userA, createdAt: daysAgo(40) });

    const ticketId = await seedTicket({ orgId, creatorId: userA, createdAt: daysAgo(5) });
    await seedComment({ ticketId, authorId: userA, createdAt: daysAgo(2) });
    await seedComment({ ticketId, authorId: userA, createdAt: daysAgo(3) });

    const counts = await runBackfill();

    expect(counts).toEqual({ login: 1, ticket_created: 1, ticket_commented: 2 });

    const total = await db.select().from(user_activity_events);
    expect(total).toHaveLength(4);
  });

  it('is idempotent at the event-level — re-running duplicates events by design, but does not crash', async () => {
    // Rationale: the script generates fresh UUIDs per row and there is no
    // natural unique key on the semantic tuple yet, so a second run will
    // re-insert. We verify behaviour rather than asserting no duplicates —
    // protecting this is the operator's responsibility (pg_dump + one-shot).
    const orgId = await makeOrg();
    const userA = await makeUser();
    await seedSession({ userId: userA, createdAt: daysAgo(1) });
    await seedTicket({ orgId, creatorId: userA, createdAt: daysAgo(1) });

    const first = await runBackfill();
    const second = await runBackfill();

    expect(first.login).toBe(1);
    expect(first.ticket_created).toBe(1);
    expect(second.login).toBe(1);
    expect(second.ticket_created).toBe(1);

    const loginRows = await db
      .select()
      .from(user_activity_events)
      .where(
        and(
          eq(user_activity_events.event_type, 'login'),
          eq(user_activity_events.user_id, userA),
        ),
      );
    expect(loginRows).toHaveLength(2);
  });

  it('does nothing when source tables are empty', async () => {
    const counts = await runBackfill();
    expect(counts).toEqual({ login: 0, ticket_created: 0, ticket_commented: 0 });

    const rows = await db.select().from(user_activity_events);
    expect(rows).toHaveLength(0);
  });

  it('sets created_at on the inserted event to the source row created_at', async () => {
    const userA = await makeUser();
    const source = daysAgo(7);
    await seedSession({ userId: userA, createdAt: source });

    await runBackfill();

    const [row] = await db
      .select()
      .from(user_activity_events)
      .where(eq(user_activity_events.user_id, userA));
    expect(row).toBeDefined();
    // Exact equality can flake on timezone round-trips; assert within 1s.
    const drift = Math.abs(row.created_at.getTime() - source.getTime());
    expect(drift).toBeLessThan(1000);
  });

  it('does not count tickets created today but more than 30 days old as "recent"', async () => {
    // Guard against an off-by-one on the INTERVAL boundary. 29d-old = in, 31d = out.
    const orgId = await makeOrg();
    const userA = await makeUser();
    await seedTicket({ orgId, creatorId: userA, createdAt: daysAgo(29) });
    await seedTicket({ orgId, creatorId: userA, createdAt: daysAgo(31) });

    const counts = await runBackfill();
    expect(counts.ticket_created).toBe(1);
  });
});
