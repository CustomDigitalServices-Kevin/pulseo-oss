/**
 * 30-day backfill for `user_activity_events`.
 *
 * Run with: `npm run activity:backfill`
 *
 * Reads existing rows from `sessions`, `tickets`, and `ticket_comments` within
 * the last 30 days and inserts the corresponding activity events. Idempotent:
 * the script can be re-run safely — duplicate primary keys short-circuit via
 * `ON CONFLICT DO NOTHING` (the generated UUIDs themselves are fresh on every
 * run, so the guard is belt-and-suspenders against any future unique index on
 * the semantic tuple; it does NOT dedupe logical events across re-runs — that
 * is by design, the script is meant to be run once before the `after()`
 * logging goes live, with a DB dump as rollback).
 *
 * Column naming note: the Drizzle schema declares `sessions.userId` in JS but
 * the underlying Postgres column is `user_id` (Better Auth convention). We
 * write raw SQL here, so we reference `user_id` directly.
 *
 * PGlite supports `gen_random_uuid()` out of the box (pgcrypto ships enabled),
 * so the same SQL runs in tests and in prod.
 */
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export interface BackfillCounts {
  login: number;
  ticket_created: number;
  ticket_commented: number;
}

/**
 * Execute the three backfill inserts. Returns the number of rows inserted per
 * event type (useful for tests and for a human-readable final log line).
 *
 * This function is the unit of behaviour the tests exercise directly. The
 * script-mode entry point below wraps it with a `process.exit` so it can be
 * invoked as `tsx src/lib/activity/backfill.ts` without leaving the node
 * process hanging on the open PG pool.
 */
export async function runBackfill(): Promise<BackfillCounts> {
  // 1. login events from sessions (last 30d).
  // Sessions have no organization_id — we deliberately store NULL.
  const loginRes = await db.execute(sql`
    INSERT INTO user_activity_events (id, user_id, organization_id, event_type, created_at)
    SELECT gen_random_uuid()::text, user_id, NULL, 'login', created_at
      FROM sessions
     WHERE created_at > NOW() - INTERVAL '30 days'
    ON CONFLICT DO NOTHING
  `);

  // 2. ticket_created events from tickets (last 30d, skip guest-only tickets
  // where creator_id is NULL — those have no authoring user to attribute to).
  const ticketCreatedRes = await db.execute(sql`
    INSERT INTO user_activity_events (id, user_id, organization_id, event_type, resource_id, created_at)
    SELECT gen_random_uuid()::text, creator_id, organization_id, 'ticket_created', id, created_at
      FROM tickets
     WHERE creator_id IS NOT NULL
       AND created_at > NOW() - INTERVAL '30 days'
    ON CONFLICT DO NOTHING
  `);

  // 3. ticket_commented events: join to the parent ticket to carry the
  // organization_id (comments only store ticket_id + author_id).
  const ticketCommentedRes = await db.execute(sql`
    INSERT INTO user_activity_events (id, user_id, organization_id, event_type, resource_id, created_at)
    SELECT gen_random_uuid()::text, tc.author_id, t.organization_id, 'ticket_commented', tc.ticket_id, tc.created_at
      FROM ticket_comments tc
      JOIN tickets t ON t.id = tc.ticket_id
     WHERE tc.created_at > NOW() - INTERVAL '30 days'
    ON CONFLICT DO NOTHING
  `);

  return {
    login: rowCount(loginRes),
    ticket_created: rowCount(ticketCreatedRes),
    ticket_commented: rowCount(ticketCommentedRes),
  };
}

/**
 * Extract the affected-row count from a driver result.
 *
 * `node-postgres` returns a `QueryResult` with a numeric `rowCount`.
 * `PGlite` returns an object with `affectedRows` (plus `rows`). We read both
 * defensively so the same function works in tests and in prod without a
 * driver-specific branch upstream.
 */
function rowCount(result: unknown): number {
  if (typeof result !== 'object' || result === null) return 0;
  const r = result as { rowCount?: unknown; affectedRows?: unknown };
  if (typeof r.rowCount === 'number') return r.rowCount;
  if (typeof r.affectedRows === 'number') return r.affectedRows;
  return 0;
}

// ─── Script-mode entry point ─────────────────────────────────────────────────
// Guarded so the module can be imported in tests without triggering the
// top-level run + process.exit. When invoked via `tsx src/lib/activity/
// backfill.ts` (or the `npm run activity:backfill` script), `process.argv[1]`
// points to this file's path and the guard passes. When imported from a test,
// `process.argv[1]` points to vitest's runner, so the side-effect is skipped.
//
// We compare on `basename` rather than full path to survive extension
// differences (`.ts` vs `.js`) and symlinked paths — there is no other file
// named `backfill` in this codebase so the match is unambiguous.
function isDirectRun(): boolean {
  try {
    const entry = process.argv[1];
    if (!entry) return false;
    const base = entry.split(/[\\/]/).pop() ?? '';
    return base === 'backfill.ts' || base === 'backfill.js' || base === 'backfill';
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  console.log('[BACKFILL] starting…');
  runBackfill()
    .then((counts) => {
      console.log('[BACKFILL] done', counts);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[BACKFILL] failed', err);
      process.exit(1);
    });
}
