import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/modules/projects/schema/tables.ts',
  out: './src/modules/projects/schema/migrations',
  dialect: 'postgresql',
  migrations: {
    table: 'projects_drizzle_migrations',
    schema: 'projects',
  },
  schemaFilter: ['projects'],  // REQUIRED — without this drizzle-kit diffs against 'public'
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
  verbose: true,
  strict: true,
});
