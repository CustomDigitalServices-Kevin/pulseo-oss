// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sql } from 'drizzle-orm';

vi.mock('@/lib/db', async () => {
  const mod = await import('@/test/db-test');
  const schema = await import('@/lib/db/schema');
  return { db: mod.db, schema };
});

vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
  revalidatePath: vi.fn(),
}));

import {
  getOrgStatsRaw,
  getGroupStatsRaw,
  getGlobalStatsRaw,
  getTopOrgsRaw,
  getUserSparkline30dRaw,
  getUserHeatmapRaw,
  getMedianResponseTimeRaw,
  getUserResponseMedianRaw,
  getOrgCountStatsRaw,
  getOrgsWithoutAdminCountRaw,
  getResolvedLast30dRaw,
  getPriorWindowTotalRaw,
  getCreatedLast30dByOrgInGroupRaw,
} from './aggregations';
import { db } from '@/test/db-test';
import {
  tickets,
  ticket_comments,
  user_activity_events,
  organizations,
} from '@/lib/db/schema';
import { resetDb } from '@/test/db-test';
import { makeUser, makeOrg, makeGroup, addMember } from '@/test/fixtures';

// ─── Inline test helpers ─────────────────────────────────────────────────────

interface MakeTicketOpts {
  created_at?: Date;
  responded_at?: Date | null;
  resolution_due_at?: Date | null;
  status?: string;
  priority?: string;
  creator_id?: string | null;
}

let ticketCounter = 0;

async function makeTicket(orgId: string, overrides: MakeTicketOpts = {}): Promise<string> {
  const id = crypto.randomUUID();
  ticketCounter += 1;
  await db.insert(tickets).values({
    id,
    organization_id: orgId,
    number: ticketCounter,
    title: `Ticket ${id}`,
    description: 'test',
    category: 'general',
    status: overrides.status ?? 'new',
    priority: overrides.priority ?? 'medium',
    creator_id: overrides.creator_id ?? null,
    responded_at: overrides.responded_at ?? null,
    resolution_due_at: overrides.resolution_due_at ?? null,
    // Drizzle lets us override defaultNow() by passing created_at explicitly.
    ...(overrides.created_at ? { created_at: overrides.created_at } : {}),
  });
  return id;
}

async function makeComment(
  ticketId: string,
  authorId: string,
  createdAt?: Date,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(ticket_comments).values({
    id,
    ticket_id: ticketId,
    author_id: authorId,
    content: 'test',
    ...(createdAt ? { created_at: createdAt } : {}),
  });
  return id;
}

async function makeActivity(
  userId: string,
  orgId: string | null,
  eventType: 'login' | 'ticket_created' | 'ticket_commented',
  createdAt?: Date,
): Promise<void> {
  await db.insert(user_activity_events).values({
    id: crypto.randomUUID(),
    user_id: userId,
    organization_id: orgId,
    event_type: eventType,
    ...(createdAt ? { created_at: createdAt } : {}),
  });
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 3600 * 1000);
}

beforeEach(async () => {
  await resetDb();
  ticketCounter = 0;
});

// ─── getGlobalStatsRaw ───────────────────────────────────────────────────────

describe('getGlobalStatsRaw', () => {
  it('returns zeros on empty DB', async () => {
    const s = await getGlobalStatsRaw();
    expect(s.open_tickets).toBe(0);
    expect(s.overdue_tickets).toBe(0);
    expect(s.active_users_7d).toBe(0);
    expect(s.created_last_30d).toEqual([]);
  });

  it('counts open vs overdue vs non-open tickets correctly', async () => {
    const org = await makeOrg();
    // 3 open
    await makeTicket(org, { status: 'new' });
    await makeTicket(org, { status: 'in_progress' });
    await makeTicket(org, { status: 'waiting_client' });
    // 2 non-open (must not count as open)
    await makeTicket(org, { status: 'resolved' });
    await makeTicket(org, { status: 'closed' });
    // 1 overdue (past due, still open)
    await makeTicket(org, {
      status: 'in_progress',
      resolution_due_at: daysAgo(1),
    });
    // 1 not overdue: past due but already closed
    await makeTicket(org, {
      status: 'closed',
      resolution_due_at: daysAgo(2),
    });
    // 1 not overdue: future due
    await makeTicket(org, {
      status: 'in_progress',
      resolution_due_at: new Date(Date.now() + 24 * 3600 * 1000),
    });

    const s = await getGlobalStatsRaw();
    // open: new, in_progress, waiting_client, the overdue one, and the future-due one → 5
    expect(s.open_tickets).toBe(5);
    // overdue: only the one with past resolution_due_at and status in_progress
    expect(s.overdue_tickets).toBe(1);
  });

  it('counts distinct active users in the last 7 days', async () => {
    const org = await makeOrg();
    const u1 = await makeUser();
    const u2 = await makeUser();
    const u3 = await makeUser();
    await makeActivity(u1, org, 'login', daysAgo(1));
    await makeActivity(u1, org, 'ticket_created', daysAgo(2)); // dup user
    await makeActivity(u2, org, 'login', daysAgo(6));
    await makeActivity(u3, org, 'login', daysAgo(10)); // out of window

    const s = await getGlobalStatsRaw();
    expect(s.active_users_7d).toBe(2);
  });

  it('returns KpiSeries YYYY-MM-DD strings for last 30d', async () => {
    const org = await makeOrg();
    await makeTicket(org, { created_at: daysAgo(1) });
    await makeTicket(org, { created_at: daysAgo(1) });
    await makeTicket(org, { created_at: daysAgo(5) });
    await makeTicket(org, { created_at: daysAgo(40) }); // out of window

    const s = await getGlobalStatsRaw();
    expect(s.created_last_30d.length).toBe(2);
    for (const row of s.created_last_30d) {
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof row.count).toBe('number');
    }
    const total = s.created_last_30d.reduce((acc, r) => acc + r.count, 0);
    expect(total).toBe(3);
  });
});

// ─── getOrgStatsRaw ──────────────────────────────────────────────────────────

describe('getOrgStatsRaw', () => {
  it('returns zeros for empty org', async () => {
    const org = await makeOrg();
    const s = await getOrgStatsRaw(org);
    expect(s.open_tickets).toBe(0);
    expect(s.overdue_tickets).toBe(0);
    expect(s.total_tickets_30d).toBe(0);
    expect(s.created_last_30d).toEqual([]);
  });

  it('scopes counts to the org', async () => {
    const org1 = await makeOrg();
    const org2 = await makeOrg();
    await makeTicket(org1, { status: 'new', created_at: daysAgo(1) });
    await makeTicket(org1, { status: 'in_progress', created_at: daysAgo(2) });
    await makeTicket(org2, { status: 'new', created_at: daysAgo(1) });

    const s1 = await getOrgStatsRaw(org1);
    expect(s1.open_tickets).toBe(2);
    expect(s1.total_tickets_30d).toBe(2);
    const s2 = await getOrgStatsRaw(org2);
    expect(s2.open_tickets).toBe(1);
    expect(s2.total_tickets_30d).toBe(1);
  });

  it('total_tickets_30d excludes tickets older than 30 days', async () => {
    const org = await makeOrg();
    await makeTicket(org, { created_at: daysAgo(10) });
    await makeTicket(org, { created_at: daysAgo(40) });
    const s = await getOrgStatsRaw(org);
    expect(s.total_tickets_30d).toBe(1);
  });
});

// ─── getGroupStatsRaw ────────────────────────────────────────────────────────

describe('getGroupStatsRaw', () => {
  it('aggregates tickets across all orgs in the group', async () => {
    const group = await makeGroup();
    const orgA = await makeOrg(group);
    const orgB = await makeOrg(group);
    const orgOther = await makeOrg(); // not in group
    await makeTicket(orgA, { status: 'new' });
    await makeTicket(orgB, { status: 'in_progress' });
    await makeTicket(orgOther, { status: 'new' });

    const s = await getGroupStatsRaw(group);
    expect(s.open_tickets).toBe(2);
    expect(s.org_count).toBe(2);
  });

  it('counts active users in group orgs only', async () => {
    const group = await makeGroup();
    const orgA = await makeOrg(group);
    const orgOther = await makeOrg();
    const u1 = await makeUser();
    const u2 = await makeUser();
    await makeActivity(u1, orgA, 'login', daysAgo(1));
    await makeActivity(u2, orgOther, 'login', daysAgo(1));

    const s = await getGroupStatsRaw(group);
    expect(s.active_users_7d).toBe(1);
  });

  it('returns zeros for empty group', async () => {
    const group = await makeGroup();
    const s = await getGroupStatsRaw(group);
    expect(s.open_tickets).toBe(0);
    expect(s.org_count).toBe(0);
    expect(s.active_users_7d).toBe(0);
  });
});

// ─── getTopOrgsRaw ───────────────────────────────────────────────────────────

describe('getTopOrgsRaw', () => {
  it('returns all orgs for global scope, sorted by open then created_30d desc', async () => {
    const o1 = await makeOrg();
    const o2 = await makeOrg();
    const o3 = await makeOrg();
    await makeTicket(o1, { status: 'new' });
    await makeTicket(o1, { status: 'in_progress' });
    await makeTicket(o2, { status: 'new' });
    await makeTicket(o3, { status: 'closed' });

    const rows = await getTopOrgsRaw({ limit: 10, scope: { type: 'global' } });
    expect(rows.length).toBe(3);
    expect(rows[0].organization_id).toBe(o1);
    expect(rows[0].open_tickets).toBe(2);
  });

  it('respects the limit arg', async () => {
    const o1 = await makeOrg();
    const o2 = await makeOrg();
    await makeTicket(o1, { status: 'new' });
    await makeTicket(o2, { status: 'new' });

    const rows = await getTopOrgsRaw({ limit: 1, scope: { type: 'global' } });
    expect(rows.length).toBe(1);
  });

  it('restricts results to a group', async () => {
    const group = await makeGroup();
    const orgA = await makeOrg(group);
    const orgOutside = await makeOrg();
    await makeTicket(orgA, { status: 'new' });
    await makeTicket(orgOutside, { status: 'new' });

    const rows = await getTopOrgsRaw({
      limit: 10, scope: { type: 'group', id: group },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].organization_id).toBe(orgA);
  });

  it('returns at most 1 row for org scope (self)', async () => {
    const org = await makeOrg();
    await makeTicket(org, { status: 'new' });
    const rows = await getTopOrgsRaw({
      limit: 10, scope: { type: 'org', id: org },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].organization_id).toBe(org);
  });
});

// ─── getUserSparkline30dRaw ──────────────────────────────────────────────────

describe('getUserSparkline30dRaw', () => {
  it('returns empty array when user has no events', async () => {
    const u = await makeUser();
    const series = await getUserSparkline30dRaw(u);
    expect(series).toEqual([]);
  });

  it('counts only ticket_created + ticket_commented events in last 30d', async () => {
    const u = await makeUser();
    const org = await makeOrg();
    await makeActivity(u, org, 'ticket_created', daysAgo(1));
    await makeActivity(u, org, 'ticket_commented', daysAgo(1));
    await makeActivity(u, org, 'login', daysAgo(1)); // excluded
    await makeActivity(u, org, 'ticket_created', daysAgo(40)); // out of window

    const series = await getUserSparkline30dRaw(u);
    const total = series.reduce((s, r) => s + r.count, 0);
    expect(total).toBe(2);
    for (const row of series) {
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('scopes to the given user', async () => {
    const u1 = await makeUser();
    const u2 = await makeUser();
    const org = await makeOrg();
    await makeActivity(u1, org, 'ticket_created', daysAgo(1));
    await makeActivity(u2, org, 'ticket_created', daysAgo(1));

    const s1 = await getUserSparkline30dRaw(u1);
    const total = s1.reduce((s, r) => s + r.count, 0);
    expect(total).toBe(1);
  });
});

// ─── getUserHeatmapRaw ───────────────────────────────────────────────────────

describe('getUserHeatmapRaw', () => {
  it('returns empty array when user has no events', async () => {
    const u = await makeUser();
    const cells = await getUserHeatmapRaw(u);
    expect(cells).toEqual([]);
  });

  it('groups by (day_of_week, hour) and counts', async () => {
    const u = await makeUser();
    const org = await makeOrg();
    // Choose fixed dates so DOW is deterministic.
    // Sunday 2025-01-05 at 14:00 UTC — dow=0 hour=14
    const sunday1400 = new Date('2025-01-05T14:00:00Z');
    const sunday1401 = new Date('2025-01-05T14:01:00Z');
    // Monday 2025-01-06 at 09:00 UTC — dow=1 hour=9
    const monday0900 = new Date('2025-01-06T09:00:00Z');

    await makeActivity(u, org, 'ticket_created', sunday1400);
    await makeActivity(u, org, 'ticket_commented', sunday1401);
    await makeActivity(u, org, 'login', monday0900);

    const cells = await getUserHeatmapRaw(u);
    // Expect a cell (0,14)=2 and (1,9)=1 (login is included — heatmap is all events)
    const byKey = new Map<string, number>();
    for (const c of cells) byKey.set(`${c.day_of_week}-${c.hour}`, c.count);
    expect(byKey.get('0-14')).toBe(2);
    expect(byKey.get('1-9')).toBe(1);

    // Verify types / ranges
    for (const c of cells) {
      expect(c.day_of_week).toBeGreaterThanOrEqual(0);
      expect(c.day_of_week).toBeLessThanOrEqual(6);
      expect(c.hour).toBeGreaterThanOrEqual(0);
      expect(c.hour).toBeLessThanOrEqual(23);
    }
  });
});

// ─── getMedianResponseTimeRaw ────────────────────────────────────────────────

describe('getMedianResponseTimeRaw', () => {
  it('returns null when no tickets have responded_at', async () => {
    const org = await makeOrg();
    await makeTicket(org);
    const r = await getMedianResponseTimeRaw({ scope: { type: 'global' } });
    expect(r.median_minutes).toBeNull();
  });

  it('returns the middle value for odd counts', async () => {
    const org = await makeOrg();
    const base = new Date('2025-01-01T00:00:00Z');
    // durations: 10 min, 20 min, 30 min → median 20
    await makeTicket(org, {
      created_at: base,
      responded_at: new Date(base.getTime() + 10 * 60_000),
    });
    await makeTicket(org, {
      created_at: base,
      responded_at: new Date(base.getTime() + 20 * 60_000),
    });
    await makeTicket(org, {
      created_at: base,
      responded_at: new Date(base.getTime() + 30 * 60_000),
    });
    const r = await getMedianResponseTimeRaw({ scope: { type: 'global' } });
    expect(r.median_minutes).not.toBeNull();
    expect(Math.round(r.median_minutes!)).toBe(20);
  });

  it('returns the average of two middles for even counts (percentile_cont behaviour)', async () => {
    const org = await makeOrg();
    const base = new Date('2025-01-01T00:00:00Z');
    // durations: 10, 20, 30, 40 → median = (20+30)/2 = 25
    for (const m of [10, 20, 30, 40]) {
      await makeTicket(org, {
        created_at: base,
        responded_at: new Date(base.getTime() + m * 60_000),
      });
    }
    const r = await getMedianResponseTimeRaw({ scope: { type: 'global' } });
    expect(r.median_minutes).not.toBeNull();
    expect(Math.round(r.median_minutes!)).toBe(25);
  });

  it('filters by org scope', async () => {
    const org1 = await makeOrg();
    const org2 = await makeOrg();
    const base = new Date('2025-01-01T00:00:00Z');
    await makeTicket(org1, {
      created_at: base,
      responded_at: new Date(base.getTime() + 10 * 60_000),
    });
    await makeTicket(org2, {
      created_at: base,
      responded_at: new Date(base.getTime() + 1000 * 60_000),
    });
    const r = await getMedianResponseTimeRaw({ scope: { type: 'org', id: org1 } });
    expect(Math.round(r.median_minutes!)).toBe(10);
  });

  it('filters by group scope', async () => {
    const group = await makeGroup();
    const orgA = await makeOrg(group);
    const orgOther = await makeOrg();
    const base = new Date('2025-01-01T00:00:00Z');
    await makeTicket(orgA, {
      created_at: base,
      responded_at: new Date(base.getTime() + 10 * 60_000),
    });
    await makeTicket(orgOther, {
      created_at: base,
      responded_at: new Date(base.getTime() + 1000 * 60_000),
    });
    const r = await getMedianResponseTimeRaw({ scope: { type: 'group', id: group } });
    expect(Math.round(r.median_minutes!)).toBe(10);
  });

  it('filters by userId (creator_id)', async () => {
    const org = await makeOrg();
    const u1 = await makeUser();
    const u2 = await makeUser();
    const base = new Date('2025-01-01T00:00:00Z');
    await makeTicket(org, {
      creator_id: u1, created_at: base,
      responded_at: new Date(base.getTime() + 10 * 60_000),
    });
    await makeTicket(org, {
      creator_id: u2, created_at: base,
      responded_at: new Date(base.getTime() + 1000 * 60_000),
    });
    const r = await getMedianResponseTimeRaw({ scope: { type: 'global' }, userId: u1 });
    expect(Math.round(r.median_minutes!)).toBe(10);
  });

  it('falls back to JS median when percentile_cont is unsupported', async () => {
    // Seed with an even number of tickets so we can verify the JS path
    // computes (mid-1 + mid) / 2 correctly.
    const org = await makeOrg();
    const base = new Date('2025-01-01T00:00:00Z');
    for (const m of [10, 20, 30, 40]) {
      await makeTicket(org, {
        created_at: base,
        responded_at: new Date(base.getTime() + m * 60_000),
      });
    }

    // Force the FIRST call (the percentile_cont query) to reject with a
    // whitelisted "unsupported function" error. The SECOND call (JS fallback
    // SELECT) must go through to the real PGlite DB.
    // mockImplementationOnce wants PgRaw<...>; the module only awaits the
    // return value, so a plain rejected Promise suffices at runtime. Cast
    // through unknown to satisfy the stricter PgRaw signature.
    const spy = vi.spyOn(db, 'execute').mockImplementationOnce(
      (() =>
        Promise.reject(
          new Error('function percentile_cont does not exist'),
        )) as unknown as typeof db.execute,
    );

    try {
      const r = await getMedianResponseTimeRaw({ scope: { type: 'global' } });
      expect(Math.round(r.median_minutes!)).toBe(25); // (20+30)/2
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('re-throws non-whitelisted errors instead of falling back silently', async () => {
    const org = await makeOrg();
    const base = new Date('2025-01-01T00:00:00Z');
    await makeTicket(org, {
      created_at: base,
      responded_at: new Date(base.getTime() + 10 * 60_000),
    });

    const spy = vi.spyOn(db, 'execute').mockImplementationOnce(
      (() => Promise.reject(new Error('connection refused'))) as unknown as typeof db.execute,
    );

    try {
      await expect(
        getMedianResponseTimeRaw({ scope: { type: 'global' } }),
      ).rejects.toThrow('connection refused');
    } finally {
      spy.mockRestore();
    }
  });
});

// ─── getOrgCountStatsRaw ─────────────────────────────────────────────────────

async function makeOrgAt(createdAt: Date): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(organizations).values({
    id,
    name: `Org ${id}`,
    slug: id,
    group_id: null,
    created_at: createdAt,
  });
  return id;
}

describe('getOrgCountStatsRaw', () => {
  it('returns zeros on empty DB', async () => {
    const s = await getOrgCountStatsRaw();
    expect(s.total).toBe(0);
    expect(s.new_this_month).toBe(0);
  });

  it('counts total + new_this_month correctly', async () => {
    const now = new Date();
    // Use day-15 of each month to avoid month-start edge cases.
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 12, 0, 0));
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 12, 0, 0));
    const twoMonthsAgo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 15, 12, 0, 0),
    );

    // If we happen to run on/very close to a month boundary, skip (guard).
    if (now.getUTCDate() < 2) return;

    await makeOrgAt(thisMonth);
    await makeOrgAt(thisMonth);
    await makeOrgAt(lastMonth);
    await makeOrgAt(twoMonthsAgo);

    const s = await getOrgCountStatsRaw();
    expect(s.total).toBe(4);
    expect(s.new_this_month).toBe(2);
  });
});

// ─── getOrgsWithoutAdminCountRaw ─────────────────────────────────────────────

describe('getOrgsWithoutAdminCountRaw', () => {
  it('returns 0 when every org has an admin member', async () => {
    const user = await makeUser();
    const org1 = await makeOrg();
    const org2 = await makeOrg();
    await addMember(user, org1, 'admin');
    await addMember(user, org2, 'admin');

    const n = await getOrgsWithoutAdminCountRaw();
    expect(n).toBe(0);
  });

  it('counts orgs that have NO admin (even if they have other roles)', async () => {
    const user = await makeUser();
    const orgNoMembers = await makeOrg();
    const orgViewerOnly = await makeOrg();
    const orgGestOnly = await makeOrg();
    const orgWithAdmin = await makeOrg();

    await addMember(user, orgViewerOnly, 'viewer');
    await addMember(user, orgGestOnly, 'gestionnaire');
    await addMember(user, orgWithAdmin, 'admin');

    const n = await getOrgsWithoutAdminCountRaw();
    // orgNoMembers + orgViewerOnly + orgGestOnly (3 orgs missing admin)
    expect(n).toBe(3);
    // orgWithAdmin should not be counted.
    void orgNoMembers;
  });
});

// ─── getResolvedLast30dRaw ───────────────────────────────────────────────────

describe('getResolvedLast30dRaw', () => {
  it('returns empty array when no closed tickets', async () => {
    const org = await makeOrg();
    await makeTicket(org, { status: 'new' });
    const s = await getResolvedLast30dRaw();
    expect(s).toEqual([]);
  });

  it('counts tickets by closed_at date within 30d window (sparse series)', async () => {
    const org = await makeOrg();
    const now = new Date();
    const day1 = new Date(now.getTime() - 1 * 24 * 3600 * 1000);
    const day5 = new Date(now.getTime() - 5 * 24 * 3600 * 1000);
    const day40 = new Date(now.getTime() - 40 * 24 * 3600 * 1000);

    // Create tickets first, then manually update closed_at
    // (schema doesn't let us pass closed_at via insert overrides here).
    const t1 = await makeTicket(org, { status: 'closed' });
    const t2 = await makeTicket(org, { status: 'closed' });
    const t3 = await makeTicket(org, { status: 'resolved' });
    const t4 = await makeTicket(org, { status: 'closed' });
    const tOpen = await makeTicket(org, { status: 'new' });

    await db.execute(sql`UPDATE tickets SET closed_at = ${day1} WHERE id = ${t1}`);
    await db.execute(sql`UPDATE tickets SET closed_at = ${day1} WHERE id = ${t2}`);
    await db.execute(sql`UPDATE tickets SET closed_at = ${day5} WHERE id = ${t3}`);
    await db.execute(sql`UPDATE tickets SET closed_at = ${day40} WHERE id = ${t4}`);
    // tOpen: no closed_at → never counted.
    void tOpen;

    const s = await getResolvedLast30dRaw();
    // 2 days with data within the 30d window (day1 and day5). day40 excluded.
    expect(s.length).toBe(2);
    const total = s.reduce((acc, r) => acc + r.count, 0);
    expect(total).toBe(3);
    for (const row of s) {
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

// ─── getCreatedLast30dByOrgInGroupRaw ────────────────────────────────────────

describe('getCreatedLast30dByOrgInGroupRaw', () => {
  it('returns empty array for a group with no orgs', async () => {
    const group = await makeGroup();
    const rows = await getCreatedLast30dByOrgInGroupRaw(group);
    expect(rows).toEqual([]);
  });

  it('includes orgs in the group with zero tickets as empty-data rows', async () => {
    const group = await makeGroup();
    const orgA = await makeOrg(group);
    const orgB = await makeOrg(group);
    const rows = await getCreatedLast30dByOrgInGroupRaw(group);
    expect(rows.length).toBe(2);
    const ids = rows.map((r) => r.organization_id).sort();
    expect(ids).toEqual([orgA, orgB].sort());
    for (const r of rows) {
      expect(r.data).toEqual([]);
    }
  });

  it('returns exactly the orgs in the group (excludes outside orgs)', async () => {
    const group = await makeGroup();
    const orgA = await makeOrg(group);
    const orgB = await makeOrg(group);
    const orgC = await makeOrg(group);
    const orgOutside = await makeOrg(); // not in group — must be excluded
    await makeTicket(orgA, { created_at: daysAgo(1) });
    await makeTicket(orgB, { created_at: daysAgo(2) });
    await makeTicket(orgOutside, { created_at: daysAgo(3) });

    const rows = await getCreatedLast30dByOrgInGroupRaw(group);
    expect(rows.length).toBe(3);
    const ids = new Set(rows.map((r) => r.organization_id));
    expect(ids.has(orgA)).toBe(true);
    expect(ids.has(orgB)).toBe(true);
    expect(ids.has(orgC)).toBe(true);
    expect(ids.has(orgOutside)).toBe(false);
  });

  it('buckets tickets by date per org and excludes out-of-window tickets', async () => {
    const group = await makeGroup();
    const orgA = await makeOrg(group);
    const orgB = await makeOrg(group);
    // Org A: 2 tickets same day + 1 another day in window, 1 out of window
    await makeTicket(orgA, { created_at: daysAgo(1) });
    await makeTicket(orgA, { created_at: daysAgo(1) });
    await makeTicket(orgA, { created_at: daysAgo(5) });
    await makeTicket(orgA, { created_at: daysAgo(40) }); // out of window
    // Org B: 1 ticket in window
    await makeTicket(orgB, { created_at: daysAgo(2) });

    const rows = await getCreatedLast30dByOrgInGroupRaw(group);
    expect(rows.length).toBe(2);

    const a = rows.find((r) => r.organization_id === orgA);
    const b = rows.find((r) => r.organization_id === orgB);
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    const aTotal = a!.data.reduce((acc, r) => acc + r.count, 0);
    const bTotal = b!.data.reduce((acc, r) => acc + r.count, 0);
    expect(aTotal).toBe(3); // 2+1, the daysAgo(40) is excluded
    expect(bTotal).toBe(1);

    // All rows have YYYY-MM-DD date shape.
    for (const r of [...a!.data, ...b!.data]) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof r.count).toBe('number');
    }
  });
});

// ─── getPriorWindowTotalRaw ──────────────────────────────────────────────────

describe('getPriorWindowTotalRaw', () => {
  it('returns 0 on empty DB', async () => {
    const r = await getPriorWindowTotalRaw();
    expect(r.prior_30d_total).toBe(0);
  });

  it('counts only tickets created between J-60 and J-30', async () => {
    const org = await makeOrg();
    await makeTicket(org, { created_at: daysAgo(10) }); // in current window
    await makeTicket(org, { created_at: daysAgo(45) }); // in prior window
    await makeTicket(org, { created_at: daysAgo(50) }); // in prior window
    await makeTicket(org, { created_at: daysAgo(90) }); // out of prior window

    const r = await getPriorWindowTotalRaw();
    expect(r.prior_30d_total).toBe(2);
  });
});

// ─── getUserResponseMedianRaw (spec G3) ──────────────────────────────────────

describe('getUserResponseMedianRaw', () => {
  it('returns null when user has not commented on any ticket they did not create', async () => {
    const user = await makeUser();
    const r = await getUserResponseMedianRaw(user);
    expect(r.median_minutes).toBeNull();
  });

  it('ignores tickets created by the same user', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    const t = await makeTicket(org, {
      creator_id: user,
      created_at: daysAgo(2),
    });
    await makeComment(t, user, daysAgo(1));
    const r = await getUserResponseMedianRaw(user);
    expect(r.median_minutes).toBeNull();
  });

  it('computes median minutes from first user comment on tickets created by others', async () => {
    const responder = await makeUser();
    const creator = await makeUser();
    const org = await makeOrg();

    const created = new Date('2026-04-10T10:00:00Z');
    const commentA = new Date('2026-04-10T10:30:00Z'); // 30 min
    const commentB = new Date('2026-04-10T11:00:00Z'); // 60 min
    const commentC = new Date('2026-04-10T13:00:00Z'); // 180 min

    const tA = await makeTicket(org, { creator_id: creator, created_at: created });
    await makeComment(tA, responder, commentA);

    const tB = await makeTicket(org, { creator_id: creator, created_at: created });
    await makeComment(tB, responder, commentB);

    const tC = await makeTicket(org, { creator_id: creator, created_at: created });
    await makeComment(tC, responder, commentC);

    const r = await getUserResponseMedianRaw(responder);
    expect(r.median_minutes).toBeCloseTo(60, 0);
  });

  it('includes guest tickets (creator_id IS NULL)', async () => {
    const responder = await makeUser();
    const org = await makeOrg();
    const t = await makeTicket(org, {
      creator_id: null,
      created_at: new Date('2026-04-10T10:00:00Z'),
    });
    await makeComment(t, responder, new Date('2026-04-10T11:00:00Z'));
    const r = await getUserResponseMedianRaw(responder);
    expect(r.median_minutes).toBeCloseTo(60, 0);
  });

  it('filters by orgId when provided', async () => {
    const responder = await makeUser();
    const creator = await makeUser();
    const orgA = await makeOrg();
    const orgB = await makeOrg();

    const tA = await makeTicket(orgA, {
      creator_id: creator,
      created_at: new Date('2026-04-10T10:00:00Z'),
    });
    await makeComment(tA, responder, new Date('2026-04-10T10:30:00Z')); // 30 min

    const tB = await makeTicket(orgB, {
      creator_id: creator,
      created_at: new Date('2026-04-10T10:00:00Z'),
    });
    await makeComment(tB, responder, new Date('2026-04-10T15:00:00Z')); // 300 min

    const rA = await getUserResponseMedianRaw(responder, orgA);
    const rB = await getUserResponseMedianRaw(responder, orgB);
    expect(rA.median_minutes).toBeCloseTo(30, 0);
    expect(rB.median_minutes).toBeCloseTo(300, 0);
  });
});
