import {
  pgTable,
  pgEnum,
  text,
  varchar,
  integer,
  timestamp,
  boolean,
  decimal,
  json,
  index,
  foreignKey,
  unique,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─── Enums ───────────────────────────────────────────────────────────────────
// Comment afficher le logo client : transparent (pas de fond), light (fond
// blanc avec padding), dark (fond noir avec padding), auto (résolu via sharp
// au moment de l'upload pour les bitmaps; SVG retombe sur 'light' faute de
// pixels analysables).
export const logoBackgroundEnum = pgEnum('logo_background', [
  'auto',
  'light',
  'dark',
  'transparent',
]);

// Forme du conteneur logo : carré (1:1, défaut) ou rectangle paysage (3:1).
// Permet aux clients avec logo horizontal long (ex: bandeaux corporate) de ne
// pas être tronqués/écrasés dans un cadre carré.
export const logoShapeEnum = pgEnum('logo_shape', ['square', 'rect']);

// Taille de référence : sm (compact), md (standard, défaut), lg (grand format
// pour headers d'espace client). Chaque slot UI applique soit cette taille
// soit une taille fixe locale (ex: tiles de la grille `/clients`).
export const logoSizeEnum = pgEnum('logo_size', ['sm', 'md', 'lg']);

// ─── Organizations ────────────────────────────────────────────────────────────

export const organizations = pgTable(
  'organizations',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    description: text('description'),
    logo_url: text('logo_url'),
    logo_mime: varchar('logo_mime', { length: 50 }),
    logo_background: logoBackgroundEnum('logo_background').notNull().default('auto'),
    logo_shape: logoShapeEnum('logo_shape').notNull().default('square'),
    logo_size: logoSizeEnum('logo_size').notNull().default('md'),
    color_primary: varchar('color_primary', { length: 7 }).default('#2563EB'),
    color_secondary: varchar('color_secondary', { length: 7 }).default('#1E40AF'),
    qonto_client_email: varchar('qonto_client_email', { length: 255 }),
    // Organization-side lead contact (may not be a Pulseo user). When set,
    // this email is CC'd on every ticket notification and on invite
    // registrations so the account lead stays in the loop.
    responsible_email: varchar('responsible_email', { length: 255 }),
    responsible_name: varchar('responsible_name', { length: 255 }),
    group_id: varchar('group_id', { length: 36 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.group_id],
      foreignColumns: [organization_groups.id],
      name: 'fk_orgs_group',
    }).onDelete('set null'),
    index('idx_org_slug').on(table.slug),
    index('idx_org_created_at').on(table.created_at),
    index('idx_orgs_group').on(table.group_id),
  ]
);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    name: varchar('name', { length: 255 }),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    avatar_url: text('avatar_url'),
    // Profile extended fields (A.1) : first_name + last_name dédoublent `name`
    // pour supporter display formats localisés (prénom nom en fr, name seul
    // légacy). Tous nullable pour backward-compat sur users existants.
    first_name: varchar('first_name', { length: 120 }),
    last_name: varchar('last_name', { length: 120 }),
    job_title: varchar('job_title', { length: 120 }),
    // UI locale preference. Sync avec cookie pulseo_locale côté middleware
    // i18n. Défaut 'fr' pour les users existants via backfill migration.
    locale: varchar('locale', { length: 5 }).notNull().default('fr'),
    // Platform-level super-admin flag. Distinct from org-level `admin` role,
    // which only grants admin privileges within a single organization.
    is_superadmin: boolean('is_superadmin').notNull().default(false),
    last_context_path: text('last_context_path'),
    // Onboarding tour: timestamp when the welcome tour was completed or
    // skipped. NULL = tour not seen yet → auto-trigger on first /clients/* visit.
    // Cross-device persistence (vs localStorage) for SaaS multi-device users.
    tour_completed_at: timestamp('tour_completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_user_email').on(table.email)]
);

// ─── Better Auth: Sessions ───────────────────────────────────────────────────

export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Better Auth: Accounts ───────────────────────────────────────────────────

export const accounts = pgTable('accounts', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  accountId: varchar('account_id', { length: 255 }).notNull(),
  providerId: varchar('provider_id', { length: 255 }).notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Better Auth: Verifications ──────────────────────────────────────────────

export const verifications = pgTable('verifications', {
  id: varchar('id', { length: 36 }).primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Organization Responsibles (client-side leads, multi-recipient) ────────
// Contacts cote client qui ne sont pas forcement des utilisateurs Pulseo
// (un point de contact externe par organisation). Tous les "responsibles" d'une org
// recoivent les notifications ticket en parallele et sont prevenus des
// inscriptions/connexions via invite link. Plusieurs par org supportes.

export const organization_responsibles = pgTable(
  'organization_responsibles',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organization_id: varchar('organization_id', { length: 36 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organization_id],
      foreignColumns: [organizations.id],
      name: 'fk_org_responsibles_org',
    }).onDelete('cascade'),
    unique('unique_org_responsible_email').on(table.organization_id, table.email),
    index('idx_org_responsibles_org').on(table.organization_id),
  ]
);

// ─── Organization Members ─────────────────────────────────────────────────────

export const organization_members = pgTable(
  'organization_members',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organization_id: varchar('organization_id', { length: 36 }).notNull(),
    user_id: varchar('user_id', { length: 36 }).notNull(),
    role: varchar('role', { length: 50 }).notNull(), // 'admin', 'gestionnaire', 'viewer'
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organization_id],
      foreignColumns: [organizations.id],
      name: 'fk_members_org',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: 'fk_members_user',
    }).onDelete('cascade'),
    unique('unique_org_user').on(table.organization_id, table.user_id),
    index('idx_members_org').on(table.organization_id),
    index('idx_members_user').on(table.user_id),
  ]
);

// ─── Invite Links ────────────────────────────────────────────────────────────

export const invite_links = pgTable(
  'invite_links',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    token: varchar('token', { length: 64 }).notNull().unique(),
    organization_id: varchar('organization_id', { length: 36 }),
    team_id: varchar('team_id', { length: 36 }),
    created_by: varchar('created_by', { length: 36 }).notNull(),
    label: varchar('label', { length: 255 }),
    is_active: boolean('is_active').notNull().default(true),
    use_count: integer('use_count').notNull().default(0),
    expires_at: timestamp('expires_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organization_id],
      foreignColumns: [organizations.id],
      name: 'fk_invite_links_org',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.created_by],
      foreignColumns: [users.id],
      name: 'fk_invite_links_creator',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.team_id],
      foreignColumns: [teams.id],
      name: 'fk_invite_links_team',
    }).onDelete('cascade'),
    index('idx_invite_links_token').on(table.token),
    index('idx_invite_links_org').on(table.organization_id),
  ]
);

// ─── Tickets ──────────────────────────────────────────────────────────────────

export const tickets = pgTable(
  'tickets',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organization_id: varchar('organization_id', { length: 36 }).notNull(),
    number: integer('number').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    status: varchar('status', { length: 50 }).notNull().default('new'),
    priority: varchar('priority', { length: 50 }).notNull().default('medium'),
    category: varchar('category', { length: 100 }).notNull(),
    tags: text('tags').array().notNull().default(sql`ARRAY[]::text[]`),
    location: text('location'),
    scenario_steps: json('scenario_steps').$type<{ index: number; text: string }[]>(),
    contract_id: varchar('contract_id', { length: 36 }),
    creator_id: varchar('creator_id', { length: 36 }),
    assigned_to_id: varchar('assigned_to_id', { length: 36 }),
    guest_name: varchar('guest_name', { length: 255 }),
    guest_email: varchar('guest_email', { length: 255 }),
    invite_link_id: varchar('invite_link_id', { length: 36 }),
    time_spent_minutes: integer('time_spent_minutes').default(0),
    client_approval_status: varchar('client_approval_status', { length: 50 }),
    dev_approval_status: varchar('dev_approval_status', { length: 50 }),
    responded_at: timestamp('responded_at', { withTimezone: true }),
    resolution_due_at: timestamp('resolution_due_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    closed_at: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organization_id],
      foreignColumns: [organizations.id],
      name: 'fk_tickets_org',
    }).onDelete('cascade'),
    index('idx_tickets_org').on(table.organization_id),
    index('idx_tickets_status').on(table.status),
    index('idx_tickets_priority').on(table.priority),
    index('idx_tickets_created_at').on(table.created_at),
    unique('unique_org_ticket_number').on(table.organization_id, table.number),
    index('idx_tickets_org_status').on(table.organization_id, table.status),
  ]
);

// ─── Ticket Comments ──────────────────────────────────────────────────────────

export const ticket_comments = pgTable(
  'ticket_comments',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    ticket_id: varchar('ticket_id', { length: 36 }).notNull(),
    author_id: varchar('author_id', { length: 36 }).notNull(),
    content: text('content').notNull(),
    is_internal: boolean('is_internal').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.ticket_id],
      foreignColumns: [tickets.id],
      name: 'fk_comments_ticket',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.author_id],
      foreignColumns: [users.id],
      name: 'fk_comments_author',
    }).onDelete('restrict'),
    index('idx_comments_ticket').on(table.ticket_id),
    index('idx_comments_created_at').on(table.created_at),
  ]
);

// ─── Ticket Attachments ───────────────────────────────────────────────────────

export const ticket_attachments = pgTable(
  'ticket_attachments',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    ticket_id: varchar('ticket_id', { length: 36 }).notNull(),
    uploaded_by_id: varchar('uploaded_by_id', { length: 36 }).notNull(),
    filename: varchar('filename', { length: 255 }).notNull(),
    file_key: varchar('file_key', { length: 255 }).notNull(),
    file_size_bytes: integer('file_size_bytes').notNull(),
    mime_type: varchar('mime_type', { length: 100 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.ticket_id],
      foreignColumns: [tickets.id],
      name: 'fk_attachments_ticket',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.uploaded_by_id],
      foreignColumns: [users.id],
      name: 'fk_attachments_user',
    }).onDelete('restrict'),
    index('idx_attachments_ticket').on(table.ticket_id),
    index('idx_attachments_created_at').on(table.created_at),
  ]
);

// ─── Contracts ────────────────────────────────────────────────────────────────

export const contracts = pgTable(
  'contracts',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organization_id: varchar('organization_id', { length: 36 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 50 }).notNull().default('active'),
    quota_hours: decimal('quota_hours', { precision: 10, scale: 2 }).notNull(),
    consumed_hours: decimal('consumed_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    rate_per_hour: decimal('rate_per_hour', { precision: 10, scale: 2 }).notNull(),
    sla_response_hours: integer('sla_response_hours'),
    sla_resolution_hours: integer('sla_resolution_hours'),
    start_date: timestamp('start_date', { withTimezone: true }).notNull(),
    end_date: timestamp('end_date', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organization_id],
      foreignColumns: [organizations.id],
      name: 'fk_contracts_org',
    }).onDelete('cascade'),
    index('idx_contracts_org').on(table.organization_id),
    index('idx_contracts_status').on(table.status),
  ]
);

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export const audit_logs = pgTable(
  'audit_logs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organization_id: varchar('organization_id', { length: 36 }).notNull(),
    entity_type: varchar('entity_type', { length: 100 }).notNull(),
    entity_id: varchar('entity_id', { length: 36 }).notNull(),
    action: varchar('action', { length: 100 }).notNull(),
    actor_id: varchar('actor_id', { length: 36 }).notNull(),
    changes: json('changes'),
    ip_address: varchar('ip_address', { length: 45 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organization_id],
      foreignColumns: [organizations.id],
      name: 'fk_audit_org',
    }).onDelete('cascade'),
    index('idx_audit_org').on(table.organization_id),
    index('idx_audit_entity').on(table.entity_type, table.entity_id),
    index('idx_audit_created_at').on(table.created_at),
  ]
);

// ─── Organization Groups ──────────────────────────────────────────────────────

export const organization_groups = pgTable(
  'organization_groups',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    logo_url: text('logo_url'),
    metadata: json('metadata'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_org_groups_slug').on(table.slug)]
);

export const organization_group_managers = pgTable(
  'organization_group_managers',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    group_id: varchar('group_id', { length: 36 }).notNull(),
    user_id: varchar('user_id', { length: 36 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.group_id],
      foreignColumns: [organization_groups.id],
      name: 'fk_group_mgr_group',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: 'fk_group_mgr_user',
    }).onDelete('cascade'),
    unique('unique_group_user_mgr').on(table.group_id, table.user_id),
    index('idx_group_mgr_group').on(table.group_id),
    index('idx_group_mgr_user').on(table.user_id),
  ]
);

// ─── Teams (cross-org subcontractor-style access) ─────────────────────────────

export const teams = pgTable(
  'teams',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    description: text('description'),
    created_by_user_id: varchar('created_by_user_id', { length: 36 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.created_by_user_id],
      foreignColumns: [users.id],
      name: 'fk_teams_creator',
    }).onDelete('restrict'),
    index('idx_teams_slug').on(table.slug),
  ]
);

export const team_members = pgTable(
  'team_members',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    team_id: varchar('team_id', { length: 36 }).notNull(),
    user_id: varchar('user_id', { length: 36 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.team_id],
      foreignColumns: [teams.id],
      name: 'fk_team_members_team',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: 'fk_team_members_user',
    }).onDelete('cascade'),
    unique('unique_team_user').on(table.team_id, table.user_id),
    index('idx_team_members_team').on(table.team_id),
    index('idx_team_members_user').on(table.user_id),
  ]
);

export const team_organization_grants = pgTable(
  'team_organization_grants',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    team_id: varchar('team_id', { length: 36 }).notNull(),
    organization_id: varchar('organization_id', { length: 36 }).notNull(),
    role: varchar('role', { length: 50 }).notNull(), // 'viewer' | 'gestionnaire' | 'admin'
    granted_by_user_id: varchar('granted_by_user_id', { length: 36 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.team_id],
      foreignColumns: [teams.id],
      name: 'fk_grants_team',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organization_id],
      foreignColumns: [organizations.id],
      name: 'fk_grants_org',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.granted_by_user_id],
      foreignColumns: [users.id],
      name: 'fk_grants_granter',
    }).onDelete('restrict'),
    unique('unique_team_org_grant').on(table.team_id, table.organization_id),
    index('idx_grants_team').on(table.team_id),
    index('idx_grants_org').on(table.organization_id),
  ]
);

// ─── User Activity Events ─────────────────────────────────────────────────────

export const user_activity_events = pgTable(
  'user_activity_events',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    user_id: varchar('user_id', { length: 36 }).notNull(),
    organization_id: varchar('organization_id', { length: 36 }),
    event_type: varchar('event_type', { length: 50 }).notNull(),
    resource_id: varchar('resource_id', { length: 36 }),
    metadata: json('metadata'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: 'fk_activity_user',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organization_id],
      foreignColumns: [organizations.id],
      name: 'fk_activity_org',
    }).onDelete('cascade'),
    index('idx_user_activity_user_date').on(table.user_id, table.created_at),
    index('idx_user_activity_org_date').on(table.organization_id, table.created_at),
    index('idx_user_activity_type').on(table.event_type),
  ]
);

// ─── Documents ───────────────────────────────────────────────────────────────

export const documents = pgTable(
  'documents',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organization_id: varchar('organization_id', { length: 36 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(), // 'invoice', 'quote', 'report', 'other'
    source: varchar('source', { length: 50 }).notNull().default('manual'), // 'manual', 'qonto'
    filename: varchar('filename', { length: 255 }),
    file_key: varchar('file_key', { length: 255 }),
    file_size_bytes: integer('file_size_bytes'),
    mime_type: varchar('mime_type', { length: 100 }),
    amount: decimal('amount', { precision: 10, scale: 2 }),
    currency: varchar('currency', { length: 3 }).default('EUR'),
    status: varchar('status', { length: 50 }).default('active'),
    qonto_id: varchar('qonto_id', { length: 255 }),
    qonto_pdf_url: text('qonto_pdf_url'),
    issued_at: timestamp('issued_at', { withTimezone: true }),
    uploaded_by_id: varchar('uploaded_by_id', { length: 36 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organization_id],
      foreignColumns: [organizations.id],
      name: 'fk_documents_org',
    }).onDelete('cascade'),
    index('idx_documents_org').on(table.organization_id),
    index('idx_documents_type').on(table.type),
    index('idx_documents_created_at').on(table.created_at),
  ]
);

// ─── User Feedback (propositions d'amélioration + remontées de bugs) ────────

/**
 * Table user_feedback : permet aux utilisateurs de soumettre des demandes
 * d'évolution (feature) ou des remontées de bugs directement au superadmin.
 * Scope strictement plateforme. `organization_id` optionnel si le feedback
 * est contextuel à une org spécifique (ex: bug sur /clients/acme-corp).
 *
 * `status` : new → reviewed → accepted | rejected (enum strictement).
 * `admin_notes` : réponse libre du superadmin, visible côté user quand le
 * feedback est repassé à `reviewed` ou au-delà.
 */
export const user_feedback = pgTable(
  'user_feedback',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    user_id: varchar('user_id', { length: 36 }).notNull(),
    organization_id: varchar('organization_id', { length: 36 }),
    type: varchar('type', { length: 20 }).notNull(), // 'feature' | 'bug'
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('new'),
    admin_notes: text('admin_notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: 'fk_user_feedback_user',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organization_id],
      foreignColumns: [organizations.id],
      name: 'fk_user_feedback_org',
    }).onDelete('set null'),
    index('idx_user_feedback_user').on(table.user_id),
    index('idx_user_feedback_status').on(table.status),
    index('idx_user_feedback_created_at').on(table.created_at),
  ]
);

/**
 * RGPD — Demandes de suppression de compte (art. 17 droit à l'effacement).
 *
 * MVP : la demande est notifiée par email au DPO/contact vie privée qui
 * traite manuellement (anonymisation user + tickets/comments selon politique
 * de conservation). Pas de suppression auto pour préserver les obligations
 * légales (comptable, sécurité art. 32) et éviter les regrets.
 *
 * Status workflow : pending → processing → (completed | rejected).
 */
export const rgpd_deletion_requests = pgTable(
  'rgpd_deletion_requests',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    user_id: varchar('user_id', { length: 36 }).notNull(),
    reason: text('reason'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    requested_at: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    processed_at: timestamp('processed_at', { withTimezone: true }),
    processed_by: varchar('processed_by', { length: 36 }),
    processing_notes: text('processing_notes'),
  },
  (table) => [
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: 'fk_rgpd_deletion_user',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.processed_by],
      foreignColumns: [users.id],
      name: 'fk_rgpd_deletion_processed_by',
    }).onDelete('set null'),
    index('idx_rgpd_deletion_status').on(table.status, table.requested_at),
    index('idx_rgpd_deletion_user').on(table.user_id),
  ]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  members: many(organization_members),
  tickets: many(tickets),
  contracts: many(contracts),
  documents: many(documents),
  auditLogs: many(audit_logs),
  inviteLinks: many(invite_links),
  responsibles: many(organization_responsibles),
  group: one(organization_groups, {
    fields: [organizations.group_id],
    references: [organization_groups.id],
  }),
  teamGrants: many(team_organization_grants),
  activityEvents: many(user_activity_events),
}));

export const organizationResponsiblesRelations = relations(organization_responsibles, ({ one }) => ({
  organization: one(organizations, {
    fields: [organization_responsibles.organization_id],
    references: [organizations.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(organization_members),
  createdTickets: many(tickets, { relationName: 'creator' }),
  assignedTickets: many(tickets, { relationName: 'assigned' }),
  comments: many(ticket_comments),
  attachments: many(ticket_attachments),
  groupManagerships: many(organization_group_managers),
  teamMemberships: many(team_members),
  activityEvents: many(user_activity_events),
  feedbackSubmissions: many(user_feedback),
}));

export const organizationMembersRelations = relations(organization_members, ({ one }) => ({
  organization: one(organizations, {
    fields: [organization_members.organization_id],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organization_members.user_id],
    references: [users.id],
  }),
}));

export const inviteLinksRelations = relations(invite_links, ({ one }) => ({
  organization: one(organizations, {
    fields: [invite_links.organization_id],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [invite_links.created_by],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [invite_links.team_id],
    references: [teams.id],
  }),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tickets.organization_id],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [tickets.creator_id],
    references: [users.id],
    relationName: 'creator',
  }),
  assignee: one(users, {
    fields: [tickets.assigned_to_id],
    references: [users.id],
    relationName: 'assigned',
  }),
  contract: one(contracts, {
    fields: [tickets.contract_id],
    references: [contracts.id],
  }),
  inviteLink: one(invite_links, {
    fields: [tickets.invite_link_id],
    references: [invite_links.id],
  }),
  comments: many(ticket_comments),
  attachments: many(ticket_attachments),
}));

export const ticketCommentsRelations = relations(ticket_comments, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticket_comments.ticket_id],
    references: [tickets.id],
  }),
  author: one(users, {
    fields: [ticket_comments.author_id],
    references: [users.id],
  }),
}));

export const ticketAttachmentsRelations = relations(ticket_attachments, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticket_attachments.ticket_id],
    references: [tickets.id],
  }),
  uploadedBy: one(users, {
    fields: [ticket_attachments.uploaded_by_id],
    references: [users.id],
  }),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [contracts.organization_id],
    references: [organizations.id],
  }),
  tickets: many(tickets),
}));

export const auditLogsRelations = relations(audit_logs, ({ one }) => ({
  organization: one(organizations, {
    fields: [audit_logs.organization_id],
    references: [organizations.id],
  }),
  actor: one(users, {
    fields: [audit_logs.actor_id],
    references: [users.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  organization: one(organizations, {
    fields: [documents.organization_id],
    references: [organizations.id],
  }),
}));

export const organizationGroupsRelations = relations(organization_groups, ({ many }) => ({
  organizations: many(organizations),
  managers: many(organization_group_managers),
}));

export const organizationGroupManagersRelations = relations(organization_group_managers, ({ one }) => ({
  group: one(organization_groups, {
    fields: [organization_group_managers.group_id],
    references: [organization_groups.id],
  }),
  user: one(users, {
    fields: [organization_group_managers.user_id],
    references: [users.id],
  }),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  members: many(team_members),
  grants: many(team_organization_grants),
  createdBy: one(users, {
    fields: [teams.created_by_user_id],
    references: [users.id],
  }),
}));

export const teamMembersRelations = relations(team_members, ({ one }) => ({
  team: one(teams, {
    fields: [team_members.team_id],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [team_members.user_id],
    references: [users.id],
  }),
}));

export const teamOrganizationGrantsRelations = relations(team_organization_grants, ({ one }) => ({
  team: one(teams, {
    fields: [team_organization_grants.team_id],
    references: [teams.id],
  }),
  organization: one(organizations, {
    fields: [team_organization_grants.organization_id],
    references: [organizations.id],
  }),
  granter: one(users, {
    fields: [team_organization_grants.granted_by_user_id],
    references: [users.id],
  }),
}));

export const userActivityEventsRelations = relations(user_activity_events, ({ one }) => ({
  user: one(users, {
    fields: [user_activity_events.user_id],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [user_activity_events.organization_id],
    references: [organizations.id],
  }),
}));

export const userFeedbackRelations = relations(user_feedback, ({ one }) => ({
  user: one(users, {
    fields: [user_feedback.user_id],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [user_feedback.organization_id],
    references: [organizations.id],
  }),
}));
