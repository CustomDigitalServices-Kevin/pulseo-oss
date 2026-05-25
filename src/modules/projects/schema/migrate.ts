/**
 * Migration runner du module Projets.
 * Usage : `npm run db:migrate:projects`
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  await migrate(db, {
    migrationsFolder: './src/modules/projects/schema/migrations',
    migrationsTable: 'projects_drizzle_migrations',
    migrationsSchema: 'projects',
  });

  console.log('[projects] migrations applied');
  await pool.end();
}

main().catch((err) => {
  console.error('[projects] migration failed:', err);
  process.exit(1);
});
