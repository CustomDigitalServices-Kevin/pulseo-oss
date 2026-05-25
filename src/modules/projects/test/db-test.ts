/**
 * PGlite test DB pour le module Projets.
 *
 * Applique les migrations core PUIS les migrations du module pour que
 * les FK cross-schema soient satisfaites (public.organizations, public.users).
 *
 * Usage dans tests du module :
 *   // @vitest-environment node
 *   import { vi } from 'vitest';
 *   vi.mock('@/lib/db', () => import('@/modules/projects/test/db-test'));
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import * as coreSchemaNs from '@/lib/db/schema';
import * as projectsSchemaNs from '@/modules/projects/schema/tables';

const client = new PGlite();
export const db = drizzle(client, { schema: { ...coreSchemaNs, ...projectsSchemaNs } });
export * as coreSchema from '@/lib/db/schema';
export * as projectsSchema from '@/modules/projects/schema/tables';
// Mirror le shape de @/lib/db (index.ts) qui exporte { db, schema } — certains
// consumers core importent schema depuis @/lib/db directement.
export * as schema from '@/lib/db/schema';

// 1. Migrations CORE
const coreMigrations = path.resolve(process.cwd(), 'src/lib/db/migrations');
await migrate(db, { migrationsFolder: coreMigrations });

// 2. Migrations MODULE
const moduleMigrations = path.resolve(process.cwd(), 'src/modules/projects/schema/migrations');
await migrate(db, {
  migrationsFolder: moduleMigrations,
  migrationsTable: 'projects_drizzle_migrations',
  migrationsSchema: 'projects',
});

/**
 * Truncate des tables module + core (ordre FK-safe).
 */
export async function resetDb(): Promise<void> {
  await client.query(`
    TRUNCATE
      projects.proj_audit_logs,
      projects.proj_projects,
      public.team_organization_grants,
      public.team_members,
      public.teams,
      public.organization_group_managers,
      public.organization_groups,
      public.invite_links,
      public.ticket_attachments,
      public.ticket_comments,
      public.tickets,
      public.organization_members,
      public.organization_responsibles,
      public.audit_logs,
      public.contracts,
      public.organizations,
      public.sessions,
      public.accounts,
      public.verifications,
      public.users
    RESTART IDENTITY CASCADE;
  `);
}
