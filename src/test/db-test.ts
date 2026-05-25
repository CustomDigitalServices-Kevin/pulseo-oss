/**
 * In-memory PGlite test DB with migrations applied.
 *
 * Usage in test files:
 *   import { vi } from 'vitest';
 *   vi.mock('@/lib/db', () => import('@/test/db-test'));
 *
 * Between tests, call resetDb() to truncate all user tables (call
 * `beforeEach(resetDb)` from each test file that uses this helper).
 *
 * NOTE: test files that import this module MUST run in a node environment
 * (PGlite uses fs/workers that jsdom does not provide). Add the directive
 *   // @vitest-environment node
 * at the top of any test file that loads this helper.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import * as schema from '@/lib/db/schema';

const client = new PGlite();
export const db = drizzle(client, { schema });
export { schema };

// Apply all migrations on module load (executed once per test file).
// Uses the official drizzle migrator which reads meta/_journal.json and
// handles empty / single-statement migrations correctly.
const migrationsFolder = path.resolve(process.cwd(), 'src/lib/db/migrations');
await migrate(db, { migrationsFolder });

/**
 * Truncate every user-populated table in FK-dependent order.
 * Call from a `beforeEach(resetDb)` in every test file that uses this helper.
 */
export async function resetDb(): Promise<void> {
  await client.query(`
    TRUNCATE
      team_organization_grants,
      team_members,
      teams,
      organization_group_managers,
      organization_groups,
      user_activity_events,
      invite_links,
      ticket_attachments,
      ticket_comments,
      tickets,
      organization_members,
      organization_responsibles,
      audit_logs,
      documents,
      contracts,
      organizations,
      sessions,
      accounts,
      verifications,
      users
    RESTART IDENTITY CASCADE;
  `);
}
