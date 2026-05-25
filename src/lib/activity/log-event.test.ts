// @vitest-environment node
/**
 * Tests for the activity-event logger utility.
 *
 * We capture the callback passed to `after()` instead of executing it inline:
 * firing synchronously would drop the promise returned by the DB insert, and
 * assertions would race the write. `flushAfter()` awaits each captured callback
 * in order so tests can deterministically query the resulting row.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Capture queue for after() callbacks. The `next/server` mock below pushes each
// scheduled callback here; `flushAfter()` drains + awaits them.
const pendingAfter: Array<() => Promise<void>> = [];

async function flushAfter(): Promise<void> {
  while (pendingAfter.length > 0) {
    const cb = pendingAfter.shift();
    if (cb) await cb();
  }
}

vi.mock('next/server', () => ({
  after: (fn: () => Promise<void>) => {
    pendingAfter.push(fn);
  },
}));

vi.mock('@/lib/db', async () => {
  const mod = await import('@/test/db-test');
  const schema = await import('@/lib/db/schema');
  return { db: mod.db, schema };
});

vi.mock('@/lib/feature-flags', () => ({
  isActivityLoggingEnabled: vi.fn(),
}));

import { logActivityEvent } from './log-event';
import { isActivityLoggingEnabled } from '@/lib/feature-flags';
import { db, resetDb } from '@/test/db-test';
import { makeUser, makeOrg } from '@/test/fixtures';
import { user_activity_events } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

beforeEach(async () => {
  await resetDb();
  pendingAfter.length = 0;
  vi.mocked(isActivityLoggingEnabled).mockReset();
  vi.restoreAllMocks();
});

describe('logActivityEvent', () => {
  it('is a no-op when the feature flag is OFF', async () => {
    vi.mocked(isActivityLoggingEnabled).mockReturnValue(false);
    const userId = await makeUser();

    logActivityEvent({ userId, eventType: 'login' });

    // Flag gate runs synchronously and short-circuits before after() is called.
    expect(pendingAfter).toHaveLength(0);

    const rows = await db.select().from(user_activity_events);
    expect(rows).toHaveLength(0);
  });

  it('inserts an event with all fields when the flag is ON', async () => {
    vi.mocked(isActivityLoggingEnabled).mockReturnValue(true);
    const userId = await makeUser();
    const orgId = await makeOrg();
    const resourceId = crypto.randomUUID();
    const metadata = { foo: 'bar', count: 3 };

    logActivityEvent({
      userId,
      organizationId: orgId,
      eventType: 'ticket_created',
      resourceId,
      metadata,
    });
    await flushAfter();

    const rows = await db
      .select()
      .from(user_activity_events)
      .where(eq(user_activity_events.user_id, userId));
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.user_id).toBe(userId);
    expect(row.organization_id).toBe(orgId);
    expect(row.event_type).toBe('ticket_created');
    expect(row.resource_id).toBe(resourceId);
    expect(row.metadata).toEqual(metadata);
    expect(row.created_at).toBeInstanceOf(Date);
  });

  it('defaults organizationId and metadata to null when omitted', async () => {
    vi.mocked(isActivityLoggingEnabled).mockReturnValue(true);
    const userId = await makeUser();

    logActivityEvent({ userId, eventType: 'login' });
    await flushAfter();

    const [row] = await db
      .select()
      .from(user_activity_events)
      .where(eq(user_activity_events.user_id, userId));
    expect(row).toBeDefined();
    expect(row.organization_id).toBeNull();
    expect(row.resource_id).toBeNull();
    expect(row.metadata).toBeNull();
    expect(row.event_type).toBe('login');
  });

  it('logs to the error logger and does not throw if the DB insert fails', async () => {
    vi.mocked(isActivityLoggingEnabled).mockReturnValue(true);
    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const insertSpy = vi.spyOn(db, 'insert').mockImplementationOnce(() => {
      throw new Error('simulated DB failure');
    });

    // Synchronous call must never throw — this is the contract the instrumented
    // caller relies on.
    expect(() => logActivityEvent({ userId: 'u1', eventType: 'login' })).not.toThrow();

    // Awaiting the deferred callback must also not reject.
    await expect(flushAfter()).resolves.toBeUndefined();

    expect(insertSpy).toHaveBeenCalledOnce();
    expect(loggerSpy).toHaveBeenCalledWith(
      '[ACTIVITY] failed to log event',
      expect.objectContaining({ err: expect.any(Error) })
    );
  });
});
