/**
 * Drizzle schema du module Projets.
 *
 * CONTRAINTE : toutes les tables sont dans le schema PG `projects`.
 * JAMAIS utiliser pgTable() directement — TOUJOURS projectsSchema.table().
 *
 * FK cross-schema vers public.* autorisées en READ-ONLY.
 * Le module ne fait JAMAIS d'INSERT/UPDATE/DELETE sur public.*.
 */
import { pgSchema, text, varchar, timestamp, jsonb, integer, bigint, index, uniqueIndex, boolean, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations, users, tickets } from '@/lib/db/schema';

export const projectsSchema = pgSchema('projects');

// PG bytea custom type pour stocker les tokens chiffrés AES-GCM
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// ─── proj_projects ────────────────────────────────────────────────────────────

export const projProjects = projectsSchema.table(
  'proj_projects',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organization_id: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    description: text('description'),
    started_at: timestamp('started_at', { withTimezone: true }),
    target_date: timestamp('target_date', { withTimezone: true }),
    closed_at: timestamp('closed_at', { withTimezone: true }),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    created_by: varchar('created_by', { length: 36 })
      .notNull()
      .references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgStatusIdx: index('proj_projects_org_status_idx')
      .on(t.organization_id, t.status)
      .where(sql`${t.deleted_at} IS NULL`),
  }),
);

// ─── proj_audit_logs ──────────────────────────────────────────────────────────

export const projAuditLogs = projectsSchema.table(
  'proj_audit_logs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organization_id: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actor_id: varchar('actor_id', { length: 36 }).references(() => users.id),
    event_type: varchar('event_type', { length: 80 }).notNull(),
    entity_type: varchar('entity_type', { length: 40 }).notNull(),
    entity_id: varchar('entity_id', { length: 36 }).notNull(),
    metadata: jsonb('metadata'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgCreatedIdx: index('proj_audit_org_created_idx').on(t.organization_id, t.created_at),
    eventCreatedIdx: index('proj_audit_event_created_idx').on(t.event_type, t.created_at),
  }),
);

// ─── proj_recipe_tests (P3) ───────────────────────────────────────────────────

export const projRecipeTests = projectsSchema.table(
  'proj_recipe_tests',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    project_id: varchar('project_id', { length: 36 })
      .notNull()
      .references(() => projProjects.id, { onDelete: 'cascade' }),
    order_index: integer('order_index').notNull().default(0),
    title: text('title').notNull(),
    expected_result: text('expected_result'),
    status: varchar('status', { length: 20 }).notNull().default('a_faire'),
    assignee_id: varchar('assignee_id', { length: 36 }).references(() => users.id),
    due_date: timestamp('due_date', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    projectOrderIdx: index('proj_recipe_tests_project_order_idx').on(t.project_id, t.order_index),
  }),
);

// ─── proj_recipe_events (P3) ──────────────────────────────────────────────────

export const projRecipeEvents = projectsSchema.table(
  'proj_recipe_events',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    recipe_test_id: varchar('recipe_test_id', { length: 36 })
      .notNull()
      .references(() => projRecipeTests.id, { onDelete: 'cascade' }),
    actor_id: varchar('actor_id', { length: 36 })
      .notNull()
      .references(() => users.id),
    event_type: varchar('event_type', { length: 40 }).notNull(),
    old_value: text('old_value'),
    new_value: text('new_value'),
    note: text('note'),
    preview_annotation: jsonb('preview_annotation'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    testCreatedIdx: index('proj_recipe_events_test_created_idx').on(t.recipe_test_id, t.created_at),
  }),
);

// ─── proj_documents (P2) ──────────────────────────────────────────────────────

export const projDocuments = projectsSchema.table(
  'proj_documents',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    project_id: varchar('project_id', { length: 36 })
      .notNull()
      .references(() => projProjects.id, { onDelete: 'cascade' }),
    category: varchar('category', { length: 20 }).notNull(),
    file_path: text('file_path').notNull(),
    original_name: varchar('original_name', { length: 500 }).notNull(),
    mime_type: varchar('mime_type', { length: 120 }).notNull(),
    size_bytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    // Statut scan virus : P4c bascule vers 'pending' par défaut + clamav
    // sidecar + worker scan-virus + fail-closed dans routes download.
    virus_scan_status: varchar('virus_scan_status', { length: 20 }).notNull().default('pending'),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    uploaded_by: varchar('uploaded_by', { length: 36 })
      .notNull()
      .references(() => users.id),
    uploaded_at: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    projectUploadedIdx: index('proj_documents_project_uploaded_idx')
      .on(t.project_id, t.uploaded_at),
  }),
);

// ─── proj_deliverables (P4) ───────────────────────────────────────────────────

export const projDeliverables = projectsSchema.table(
  'proj_deliverables',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    project_id: varchar('project_id', { length: 36 })
      .notNull()
      .references(() => projProjects.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 20 }).notNull(), // 'file' | 'github_repo'
    version: varchar('version', { length: 40 }).notNull(),
    is_latest: boolean('is_latest').notNull().default(false),
    // file fields (null si kind='github_repo')
    file_path: text('file_path'),
    original_name: varchar('original_name', { length: 500 }),
    mime_type: varchar('mime_type', { length: 120 }),
    size_bytes: bigint('size_bytes', { mode: 'number' }),
    // github fields (null si kind='file')
    github_url: text('github_url'),
    github_branch: varchar('github_branch', { length: 200 }),
    // Statut scan virus — P4c bascule 'pending' par défaut. Worker scan-virus
    // passe à 'clean' ou 'infected'. Route download = accept uniquement 'clean'.
    virus_scan_status: varchar('virus_scan_status', { length: 20 }).notNull().default('pending'),
    preview_status: varchar('preview_status', { length: 20 }),
    preview_manifest_path: text('preview_manifest_path'),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    uploaded_by: varchar('uploaded_by', { length: 36 })
      .notNull()
      .references(() => users.id),
    uploaded_at: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    projectUploadedIdx: index('proj_deliverables_project_uploaded_idx')
      .on(t.project_id, t.uploaded_at)
      .where(sql`${t.deleted_at} IS NULL`),
    // UNIQUE partial : max 1 is_latest=true par project_id pour kind='file'
    // (spec §"proj_deliverables" ligne 179). Les github_repo peuvent coexister
    // sans latest (versioning futur P9).
    latestFilePartialIdx: uniqueIndex('proj_deliverables_latest_file_idx')
      .on(t.project_id)
      .where(sql`${t.is_latest} = true AND ${t.kind} = 'file' AND ${t.deleted_at} IS NULL`),
  }),
);

// ─── proj_preview_jobs (P4) ───────────────────────────────────────────────────

export const projPreviewJobs = projectsSchema.table(
  'proj_preview_jobs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    deliverable_id: varchar('deliverable_id', { length: 36 })
      .notNull()
      .references(() => projDeliverables.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    last_error: text('last_error'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pendingIdx: index('proj_preview_jobs_pending_idx')
      .on(t.status, t.created_at)
      .where(sql`${t.status} = 'pending'`),
  }),
);

export type ProjProject = typeof projProjects.$inferSelect;
export type NewProjProject = typeof projProjects.$inferInsert;
export type ProjAuditLog = typeof projAuditLogs.$inferSelect;
export type NewProjAuditLog = typeof projAuditLogs.$inferInsert;
export type ProjRecipeTest = typeof projRecipeTests.$inferSelect;
export type NewProjRecipeTest = typeof projRecipeTests.$inferInsert;
export type ProjRecipeEvent = typeof projRecipeEvents.$inferSelect;
export type NewProjRecipeEvent = typeof projRecipeEvents.$inferInsert;
export type ProjDocument = typeof projDocuments.$inferSelect;
export type NewProjDocument = typeof projDocuments.$inferInsert;
export type ProjDeliverable = typeof projDeliverables.$inferSelect;
export type NewProjDeliverable = typeof projDeliverables.$inferInsert;
export type ProjPreviewJob = typeof projPreviewJobs.$inferSelect;
export type NewProjPreviewJob = typeof projPreviewJobs.$inferInsert;

// ─── proj_scan_jobs (P4c virus scan tracking) ─────────────────────────────────

export const projScanJobs = projectsSchema.table(
  'proj_scan_jobs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    entity_type: varchar('entity_type', { length: 20 }).notNull(), // 'document' | 'deliverable'
    entity_id: varchar('entity_id', { length: 36 }).notNull(),
    file_path: text('file_path').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    last_error: text('last_error'),
    signature: varchar('signature', { length: 200 }),
    scanned_at: timestamp('scanned_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pendingIdx: index('proj_scan_jobs_pending_idx')
      .on(t.status, t.created_at)
      .where(sql`${t.status} = 'pending'`),
    entityIdx: index('proj_scan_jobs_entity_idx').on(t.entity_type, t.entity_id),
  }),
);

export type ProjScanJob = typeof projScanJobs.$inferSelect;
export type NewProjScanJob = typeof projScanJobs.$inferInsert;

// ─── proj_ticket_links (P10 annotation → ticket) ──────────────────────────────

export const projTicketLinks = projectsSchema.table(
  'proj_ticket_links',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    ticket_id: varchar('ticket_id', { length: 36 })
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    project_id: varchar('project_id', { length: 36 })
      .notNull()
      .references(() => projProjects.id, { onDelete: 'cascade' }),
    deliverable_id: varchar('deliverable_id', { length: 36 }).references(
      () => projDeliverables.id,
      { onDelete: 'set null' },
    ),
    preview_annotation: jsonb('preview_annotation'),
    created_by: varchar('created_by', { length: 36 })
      .notNull()
      .references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueTicketProject: uniqueIndex('proj_ticket_links_unique_ticket_project')
      .on(t.ticket_id, t.project_id),
    projectIdx: index('proj_ticket_links_project_idx').on(t.project_id, t.created_at),
    deliverableIdx: index('proj_ticket_links_deliverable_idx').on(t.deliverable_id),
  }),
);

export type ProjTicketLink = typeof projTicketLinks.$inferSelect;
export type NewProjTicketLink = typeof projTicketLinks.$inferInsert;

// ─── proj_github_tokens (P9) ──────────────────────────────────────────────────

export const projGithubTokens = projectsSchema.table(
  'proj_github_tokens',
  {
    organization_id: varchar('organization_id', { length: 36 })
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    encrypted_token: bytea('encrypted_token').notNull(),
    key_version: integer('key_version').notNull().default(1),
    created_by: varchar('created_by', { length: 36 })
      .notNull()
      .references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
);

export type ProjGithubToken = typeof projGithubTokens.$inferSelect;
export type NewProjGithubToken = typeof projGithubTokens.$inferInsert;
