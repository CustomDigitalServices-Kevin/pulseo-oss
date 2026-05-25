# Pulseo — Schéma de base de données complet

## Vue d'ensemble

Ce document décrit le schéma de base de données complet de l'application Pulseo, une plateforme de gestion de tickets IT avec intégration Qonto. Le schéma utilise Drizzle ORM avec PostgreSQL et inclut les tables auto-générées par Better Auth ainsi que les tables métier spécifiques à Pulseo.

---

## Tables Better Auth (auto-générées par Better Auth)

Ces tables sont gérées automatiquement par Better Auth et documentées ci-dessous :

### user
```typescript
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull(),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  role: text('role').notNull().default('user'),
});
```

### session
```typescript
export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});
```

### account
```typescript
export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull(),
});

export const accountIndex = index('account_userId_idx').on(account.userId);
```

### verification
```typescript
export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt'),
  updatedAt: timestamp('updatedAt'),
});
```

### organization (Better Auth)
```typescript
export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: text('metadata'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
});
```

### member
```typescript
export const member = pgTable('member', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
});

export const memberIndex = index('member_organizationId_idx').on(member.organizationId);
```

### invitation
```typescript
export const invitation = pgTable('invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role'),
  status: text('status').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  inviterId: text('inviterId')
    .notNull()
    .references(() => user.id),
});
```

---

## Énumérations PostgreSQL

```typescript
// Statuts des contrats
export const contractStatusEnum = pgEnum('contract_status', [
  'active',
  'expired',
  'terminated',
]);

// Types de contrats
export const contractTypeEnum = pgEnum('contract_type', [
  'forfait',
  'hours',
  'days',
]);

// Priorités des tickets
export const ticketPriorityEnum = pgEnum('ticket_priority', [
  'low',
  'medium',
  'high',
  'critical',
]);

// Catégories des tickets
export const ticketCategoryEnum = pgEnum('ticket_category', [
  'bug',
  'evolution',
  'question',
  'access',
]);

// Statuts des tickets
export const ticketStatusEnum = pgEnum('ticket_status', [
  'new',
  'in_progress',
  'waiting_client',
  'resolved',
  'closed',
]);

// Validations client/dev
export const validationStatusEnum = pgEnum('validation_status', [
  'pending',
  'approved',
  'rejected',
]);

// Types de documents
export const documentTypeEnum = pgEnum('document_type', [
  'invoice',
  'quote',
  'manual',
]);

// Sources de documents
export const documentSourceEnum = pgEnum('document_source', [
  'qonto',
  'manual',
]);

// Niveaux d'audit
export const auditLevelEnum = pgEnum('audit_level', [
  'info',
  'warning',
  'error',
  'critical',
]);

// Statuts d'email
export const emailStatusEnum = pgEnum('email_status', [
  'sent',
  'failed',
  'bounced',
]);
```

---

## Tables métier Pulseo

### organizations (extension Pulseo)

Table contenant les organisations avec configuration spécifique à Pulseo et intégration Qonto.

```typescript
export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    logo_url: text('logo_url'),
    primary_color: varchar('primary_color', { length: 7 }).default('#2563EB'),
    secondary_color: varchar('secondary_color', { length: 7 }).default('#1E40AF'),
    qonto_client_email: varchar('qonto_client_email', { length: 255 }),
    qonto_access_token: text('qonto_access_token'), // Chiffré
    qonto_refresh_token: text('qonto_refresh_token'), // Chiffré
    is_active: boolean('is_active').default(true),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    uniqueIndex('organizations_slug_unique').on(table.slug),
    index('organizations_qonto_client_email_idx').on(
      table.qonto_client_email
    ),
  ]
);
```

### contracts

Table des contrats de services liés à une organisation.

```typescript
export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    type: contractTypeEnum('type').notNull(),
    status: contractStatusEnum('status').notNull(),
    start_date: date('start_date').notNull(),
    end_date: date('end_date'),
    initial_quota: decimal('initial_quota', { precision: 10, scale: 2 }),
    consumed_quota: decimal('consumed_quota', {
      precision: 10,
      scale: 2,
    }).default('0'),
    renewable: boolean('renewable').default(false),
    notes: text('notes'),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('contracts_organization_id_idx').on(table.organization_id),
    index('contracts_status_idx').on(table.status),
    index('contracts_end_date_idx').on(table.end_date),
  ]
);
```

### tickets

Table principale des tickets de support.

```typescript
export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    priority: ticketPriorityEnum('priority').notNull(),
    category: ticketCategoryEnum('category').notNull(),
    status: ticketStatusEnum('status').notNull().default('new'),
    contract_id: uuid('contract_id').references(() => contracts.id, {
      onDelete: 'set null',
    }),
    created_by_user_id: uuid('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    created_by_magic_link_id: uuid('created_by_magic_link_id').references(
      () => magic_links.id,
      { onDelete: 'set null' }
    ),
    created_by_name: varchar('created_by_name', { length: 200 }),
    assigned_to_user_id: uuid('assigned_to_user_id').references(
      () => user.id,
      { onDelete: 'set null' }
    ),
    time_spent: decimal('time_spent', { precision: 10, scale: 2 }).default('0'),
    client_validation: validationStatusEnum('client_validation'),
    dev_validation: validationStatusEnum('dev_validation'),
    reminder_enabled: boolean('reminder_enabled').default(false),
    reminder_days: integer('reminder_days').default(3),
    last_reminder_at: timestamp('last_reminder_at'),
    resolved_at: timestamp('resolved_at'),
    closed_at: timestamp('closed_at'),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('tickets_organization_id_idx').on(table.organization_id),
    index('tickets_status_idx').on(table.status),
    index('tickets_priority_idx').on(table.priority),
    index('tickets_category_idx').on(table.category),
    index('tickets_contract_id_idx').on(table.contract_id),
    index('tickets_created_by_user_id_idx').on(table.created_by_user_id),
    index('tickets_created_at_desc_idx').on(table.created_at),
  ]
);
```

### ticket_comments

Table des commentaires sur les tickets.

```typescript
export const ticket_comments = pgTable(
  'ticket_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticket_id: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id').references(() => user.id, { onDelete: 'set null' }),
    magic_link_id: uuid('magic_link_id').references(() => magic_links.id, {
      onDelete: 'set null',
    }),
    author_name: varchar('author_name', { length: 200 }).notNull(),
    content: text('content').notNull(),
    is_internal: boolean('is_internal').default(false),
    created_at: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('ticket_comments_ticket_id_idx').on(table.ticket_id),
    index('ticket_comments_created_at_idx').on(table.created_at),
  ]
);
```

### ticket_attachments

Table des pièces jointes associées aux tickets et commentaires.

```typescript
export const ticket_attachments = pgTable(
  'ticket_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticket_id: uuid('ticket_id').references(() => tickets.id, {
      onDelete: 'cascade',
    }),
    comment_id: uuid('comment_id').references(() => ticket_comments.id, {
      onDelete: 'cascade',
    }),
    file_name: varchar('file_name', { length: 500 }).notNull(),
    file_path: text('file_path').notNull(),
    file_size: integer('file_size').notNull(),
    mime_type: varchar('mime_type', { length: 100 }),
    uploaded_by_user_id: uuid('uploaded_by_user_id').references(
      () => user.id,
      { onDelete: 'set null' }
    ),
    created_at: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('ticket_attachments_ticket_id_idx').on(table.ticket_id),
    index('ticket_attachments_comment_id_idx').on(table.comment_id),
  ]
);
```

### documents

Table des documents (factures, devis, manuels) importés de Qonto ou manuels.

```typescript
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: documentTypeEnum('type').notNull(),
    source: documentSourceEnum('source').notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    file_path: text('file_path'),
    qonto_id: varchar('qonto_id', { length: 255 }),
    amount: decimal('amount', { precision: 12, scale: 2 }),
    currency: varchar('currency', { length: 3 }).default('EUR'),
    status: varchar('status', { length: 50 }),
    issued_at: date('issued_at'),
    due_at: date('due_at'),
    created_at: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('documents_organization_id_idx').on(table.organization_id),
    index('documents_type_idx').on(table.type),
    index('documents_source_idx').on(table.source),
    uniqueIndex('documents_qonto_id_unique').on(table.qonto_id),
  ]
);
```

### magic_links

Table des liens magiques pour accès client sans authentification.

```typescript
export const magic_links = pgTable(
  'magic_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    token: uuid('token').notNull().unique(),
    name: varchar('name', { length: 200 }).notNull(),
    email: varchar('email', { length: 255 }),
    is_active: boolean('is_active').default(true),
    expires_at: timestamp('expires_at').notNull(),
    max_uses: integer('max_uses'),
    use_count: integer('use_count').default(0),
    created_by_user_id: uuid('created_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at').defaultNow(),
    last_used_at: timestamp('last_used_at'),
  },
  (table) => [
    uniqueIndex('magic_links_token_unique').on(table.token),
    index('magic_links_organization_id_idx').on(table.organization_id),
    index('magic_links_is_active_idx').on(table.is_active),
  ]
);
```

### audit_logs

Table des journaux d'audit pour la conformité et la sécurité.

```typescript
export const audit_logs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').references(() => user.id, { onDelete: 'set null' }),
    organization_id: uuid('organization_id').references(
      () => organizations.id,
      { onDelete: 'set null' }
    ),
    action: varchar('action', { length: 100 }).notNull(),
    entity_type: varchar('entity_type', { length: 50 }).notNull(),
    entity_id: uuid('entity_id'),
    details: jsonb('details'),
    ip_address: varchar('ip_address', { length: 45 }),
    user_agent: text('user_agent'),
    level: auditLevelEnum('level').notNull(),
    created_at: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('audit_logs_user_id_idx').on(table.user_id),
    index('audit_logs_organization_id_idx').on(table.organization_id),
    index('audit_logs_action_idx').on(table.action),
    index('audit_logs_entity_type_idx').on(table.entity_type),
    index('audit_logs_created_at_desc_idx').on(table.created_at),
  ]
);
```

### email_logs

Table de suivi des emails envoyés par le système.

```typescript
export const email_logs = pgTable(
  'email_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    to_email: varchar('to_email', { length: 255 }).notNull(),
    template: varchar('template', { length: 100 }).notNull(),
    subject: varchar('subject', { length: 500 }).notNull(),
    status: emailStatusEnum('status').notNull(),
    resend_id: varchar('resend_id', { length: 255 }),
    error: text('error'),
    created_at: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('email_logs_to_email_idx').on(table.to_email),
    index('email_logs_template_idx').on(table.template),
    index('email_logs_created_at_desc_idx').on(table.created_at),
  ]
);
```

---

## Relations Drizzle (defineRelations)

```typescript
export const organizationsRelations = relations(organizations, ({ many }) => ({
  contracts: many(contracts),
  tickets: many(tickets),
  magic_links: many(magic_links),
  documents: many(documents),
  audit_logs: many(audit_logs),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [contracts.organization_id],
    references: [organizations.id],
  }),
  tickets: many(tickets),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tickets.organization_id],
    references: [organizations.id],
  }),
  contract: one(contracts, {
    fields: [tickets.contract_id],
    references: [contracts.id],
  }),
  created_by_user: one(user, {
    fields: [tickets.created_by_user_id],
    references: [user.id],
  }),
  created_by_magic_link: one(magic_links, {
    fields: [tickets.created_by_magic_link_id],
    references: [magic_links.id],
  }),
  assigned_to_user: one(user, {
    fields: [tickets.assigned_to_user_id],
    references: [user.id],
  }),
  comments: many(ticket_comments),
  attachments: many(ticket_attachments),
}));

export const ticket_commentsRelations = relations(
  ticket_comments,
  ({ one, many }) => ({
    ticket: one(tickets, {
      fields: [ticket_comments.ticket_id],
      references: [tickets.id],
    }),
    user: one(user, {
      fields: [ticket_comments.user_id],
      references: [user.id],
    }),
    magic_link: one(magic_links, {
      fields: [ticket_comments.magic_link_id],
      references: [magic_links.id],
    }),
    attachments: many(ticket_attachments),
  })
);

export const ticket_attachmentsRelations = relations(
  ticket_attachments,
  ({ one }) => ({
    ticket: one(tickets, {
      fields: [ticket_attachments.ticket_id],
      references: [tickets.id],
    }),
    comment: one(ticket_comments, {
      fields: [ticket_attachments.comment_id],
      references: [ticket_comments.id],
    }),
    uploaded_by_user: one(user, {
      fields: [ticket_attachments.uploaded_by_user_id],
      references: [user.id],
    }),
  })
);

export const documentsRelations = relations(documents, ({ one }) => ({
  organization: one(organizations, {
    fields: [documents.organization_id],
    references: [organizations.id],
  }),
}));

export const magic_linksRelations = relations(magic_links, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [magic_links.organization_id],
    references: [organizations.id],
  }),
  created_by_user: one(user, {
    fields: [magic_links.created_by_user_id],
    references: [user.id],
  }),
  tickets: many(tickets),
  comments: many(ticket_comments),
}));

export const audit_logsRelations = relations(audit_logs, ({ one }) => ({
  user: one(user, {
    fields: [audit_logs.user_id],
    references: [user.id],
  }),
  organization: one(organizations, {
    fields: [audit_logs.organization_id],
    references: [organizations.id],
  }),
}));
```

---

## Stratégie d'indexation

| Nom de l'index | Table | Colonnes | Justification |
|---|---|---|---|
| `organizations_slug_unique` | organizations | slug | Clé unique pour accès rapide par slug |
| `organizations_qonto_client_email_idx` | organizations | qonto_client_email | Recherche rapide des organisations Qonto |
| `contracts_organization_id_idx` | contracts | organization_id | Jointure fréquente avec organizations |
| `contracts_status_idx` | contracts | status | Filtrage par statut (actif/expiré) |
| `contracts_end_date_idx` | contracts | end_date | Recherche de contrats proches de l'expiration |
| `tickets_organization_id_idx` | tickets | organization_id | Jointure principale |
| `tickets_status_idx` | tickets | status | Filtrage très fréquent (new, in_progress, etc.) |
| `tickets_priority_idx` | tickets | priority | Tri et filtrage par priorité |
| `tickets_category_idx` | tickets | category | Filtrage par catégorie |
| `tickets_contract_id_idx` | tickets | contract_id | Jointure avec contracts |
| `tickets_created_by_user_id_idx` | tickets | created_by_user_id | Recherche tickets créés par un utilisateur |
| `tickets_created_at_desc_idx` | tickets | created_at DESC | Pagination (tickets récents en premier) |
| `ticket_comments_ticket_id_idx` | ticket_comments | ticket_id | Jointure primaire pour affichage |
| `ticket_comments_created_at_idx` | ticket_comments | created_at | Tri chronologique |
| `ticket_attachments_ticket_id_idx` | ticket_attachments | ticket_id | Jointure directe |
| `ticket_attachments_comment_id_idx` | ticket_attachments | comment_id | Jointure directe |
| `documents_organization_id_idx` | documents | organization_id | Recherche par organisation |
| `documents_type_idx` | documents | type | Filtrage par type (facture/devis) |
| `documents_source_idx` | documents | source | Séparation Qonto/manuel |
| `documents_qonto_id_unique` | documents | qonto_id | Clé unique pour synchronisation |
| `magic_links_token_unique` | magic_links | token | Recherche par token d'accès |
| `magic_links_organization_id_idx` | magic_links | organization_id | Gestion par organisation |
| `magic_links_is_active_idx` | magic_links | is_active | Filtrage des liens actifs |
| `audit_logs_user_id_idx` | audit_logs | user_id | Audit par utilisateur |
| `audit_logs_organization_id_idx` | audit_logs | organization_id | Audit par organisation |
| `audit_logs_action_idx` | audit_logs | action | Filtrage par type d'action |
| `audit_logs_entity_type_idx` | audit_logs | entity_type | Audit par entité |
| `audit_logs_created_at_desc_idx` | audit_logs | created_at DESC | Chronologie inverse |
| `email_logs_to_email_idx` | email_logs | to_email | Historique par destinataire |
| `email_logs_template_idx` | email_logs | template | Analyse de template |
| `email_logs_created_at_desc_idx` | email_logs | created_at DESC | Chronologie inverse |

---

## Politiques de sécurité au niveau des lignes (RLS)

### Fonctions de sécurité PostgreSQL

```sql
-- Obtenir l'ID de l'organisation de l'utilisateur actuel
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid AS $$
  SELECT organization_id FROM member
  WHERE user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Vérifier si l'utilisateur est administrateur
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM member
    WHERE user_id = auth.uid()
    AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Vérifier si l'utilisateur est gestionnaire
CREATE OR REPLACE FUNCTION is_gestionnaire()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM member
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'gestionnaire')
  );
$$ LANGUAGE sql SECURITY DEFINER;
```

### Activation de RLS

```sql
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE magic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
```

### Politiques par table

#### organizations
```sql
-- Admin : voir toutes les organisations
CREATE POLICY "admin_see_all_organizations"
  ON organizations FOR SELECT
  USING (is_admin());

-- Gestionnaire/Invité : voir uniquement son organisation
CREATE POLICY "user_see_own_organization"
  ON organizations FOR SELECT
  USING (id = get_user_org_id());

-- Seuls les admins peuvent modifier les organisations
CREATE POLICY "admin_modify_organizations"
  ON organizations FOR INSERT
  USING (is_admin());

CREATE POLICY "admin_update_organizations"
  ON organizations FOR UPDATE
  USING (is_admin());

CREATE POLICY "admin_delete_organizations"
  ON organizations FOR DELETE
  USING (is_admin());
```

#### contracts
```sql
-- Admin : accès complet
CREATE POLICY "admin_see_all_contracts"
  ON contracts FOR SELECT
  USING (is_admin());

-- Gestionnaire : voir les contrats de son organisation
CREATE POLICY "gestionnaire_see_org_contracts"
  ON contracts FOR SELECT
  USING (organization_id = get_user_org_id() AND is_gestionnaire());

-- Créer/modifier seulement pour sa propre organisation (gestionnaire+)
CREATE POLICY "gestionnaire_create_contracts"
  ON contracts FOR INSERT
  WITH CHECK (organization_id = get_user_org_id() AND is_gestionnaire());

CREATE POLICY "gestionnaire_update_contracts"
  ON contracts FOR UPDATE
  USING (organization_id = get_user_org_id() AND is_gestionnaire());

CREATE POLICY "gestionnaire_delete_contracts"
  ON contracts FOR DELETE
  USING (organization_id = get_user_org_id() AND is_admin());
```

#### tickets
```sql
-- Admin : voir tous les tickets
CREATE POLICY "admin_see_all_tickets"
  ON tickets FOR SELECT
  USING (is_admin());

-- Gestionnaire : voir les tickets de son organisation
CREATE POLICY "gestionnaire_see_org_tickets"
  ON tickets FOR SELECT
  USING (organization_id = get_user_org_id() AND is_gestionnaire());

-- Invité : voir seulement ses propres tickets
CREATE POLICY "invitee_see_own_tickets"
  ON tickets FOR SELECT
  USING (
    organization_id = get_user_org_id()
    AND (created_by_user_id = auth.uid() OR created_by_magic_link_id IN (
      SELECT id FROM magic_links WHERE created_by_user_id = auth.uid()
    ))
  );

-- Gestionnaire+ peut créer des tickets
CREATE POLICY "gestionnaire_create_tickets"
  ON tickets FOR INSERT
  WITH CHECK (organization_id = get_user_org_id() AND is_gestionnaire());

-- Gestionnaire+ peut modifier les tickets de son organisation
CREATE POLICY "gestionnaire_update_tickets"
  ON tickets FOR UPDATE
  USING (organization_id = get_user_org_id() AND is_gestionnaire());

-- Seul le créateur peut modifier son ticket (dans certains cas)
CREATE POLICY "creator_update_own_ticket"
  ON tickets FOR UPDATE
  USING (created_by_user_id = auth.uid());
```

#### ticket_comments
```sql
-- Admin : voir tous les commentaires
CREATE POLICY "admin_see_all_comments"
  ON ticket_comments FOR SELECT
  USING (is_admin());

-- Gestionnaire : voir commentaires non-internes des tickets de son org
CREATE POLICY "gestionnaire_see_comments"
  ON ticket_comments FOR SELECT
  USING (
    ticket_id IN (
      SELECT id FROM tickets WHERE organization_id = get_user_org_id()
    ) AND (NOT is_internal OR user_id = auth.uid())
  );

-- Invité : voir commentaires publics uniquement
CREATE POLICY "invitee_see_public_comments"
  ON ticket_comments FOR SELECT
  USING (
    ticket_id IN (
      SELECT id FROM tickets
      WHERE organization_id = get_user_org_id()
      AND created_by_magic_link_id IN (
        SELECT id FROM magic_links WHERE created_by_user_id = auth.uid()
      )
    ) AND NOT is_internal
  );

-- Créer des commentaires sur ses tickets
CREATE POLICY "user_create_comment"
  ON ticket_comments FOR INSERT
  WITH CHECK (
    ticket_id IN (
      SELECT id FROM tickets WHERE organization_id = get_user_org_id()
    )
  );
```

#### ticket_attachments
```sql
-- Admin : voir tous les fichiers
CREATE POLICY "admin_see_all_attachments"
  ON ticket_attachments FOR SELECT
  USING (is_admin());

-- Accès basé sur le ticket parent
CREATE POLICY "user_see_attachments"
  ON ticket_attachments FOR SELECT
  USING (
    ticket_id IN (
      SELECT id FROM tickets WHERE organization_id = get_user_org_id()
    )
  );

-- Créer des fichiers sur ses tickets/commentaires
CREATE POLICY "user_upload_attachments"
  ON ticket_attachments FOR INSERT
  WITH CHECK (
    ticket_id IS NULL OR ticket_id IN (
      SELECT id FROM tickets WHERE organization_id = get_user_org_id()
    )
  );
```

#### documents
```sql
-- Admin : voir tous les documents
CREATE POLICY "admin_see_all_documents"
  ON documents FOR SELECT
  USING (is_admin());

-- Gestionnaire : voir documents de son organisation
CREATE POLICY "gestionnaire_see_org_documents"
  ON documents FOR SELECT
  USING (organization_id = get_user_org_id() AND is_gestionnaire());

-- Gestionnaire+ peut ajouter des documents
CREATE POLICY "gestionnaire_create_documents"
  ON documents FOR INSERT
  WITH CHECK (organization_id = get_user_org_id() AND is_gestionnaire());

CREATE POLICY "gestionnaire_update_documents"
  ON documents FOR UPDATE
  USING (organization_id = get_user_org_id() AND is_gestionnaire());
```

#### magic_links
```sql
-- Admin : voir tous les liens
CREATE POLICY "admin_see_all_magic_links"
  ON magic_links FOR SELECT
  USING (is_admin());

-- Gestionnaire : voir les liens de son organisation
CREATE POLICY "gestionnaire_see_org_magic_links"
  ON magic_links FOR SELECT
  USING (organization_id = get_user_org_id() AND is_gestionnaire());

-- Créer des liens pour son organisation
CREATE POLICY "gestionnaire_create_magic_links"
  ON magic_links FOR INSERT
  WITH CHECK (organization_id = get_user_org_id() AND is_gestionnaire());

CREATE POLICY "gestionnaire_update_magic_links"
  ON magic_links FOR UPDATE
  USING (organization_id = get_user_org_id() AND is_gestionnaire());
```

#### audit_logs
```sql
-- Admin : voir tous les logs
CREATE POLICY "admin_see_all_audit_logs"
  ON audit_logs FOR SELECT
  USING (is_admin());

-- Gestionnaire : voir logs de son organisation
CREATE POLICY "gestionnaire_see_org_audit_logs"
  ON audit_logs FOR SELECT
  USING (organization_id = get_user_org_id() AND is_gestionnaire());

-- Seule l'insertion est autorisée (logs immuables)
CREATE POLICY "system_insert_audit_logs"
  ON audit_logs FOR INSERT
  WITH CHECK (true);
```

#### email_logs
```sql
-- Admin : voir tous les logs d'email
CREATE POLICY "admin_see_all_email_logs"
  ON email_logs FOR SELECT
  USING (is_admin());

-- Seule l'insertion est autorisée (logs immuables)
CREATE POLICY "system_insert_email_logs"
  ON email_logs FOR INSERT
  WITH CHECK (true);
```

---

## Notes sur la sécurité et l'intégration

- **Chiffrement Qonto** : Les tokens `qonto_access_token` et `qonto_refresh_token` doivent être chiffrés au niveau application avant stockage.
- **Timestamps** : Tous les `created_at` et `updated_at` utilisent `defaultNow()` pour garantir l'intégrité.
- **Cascade** : Les suppressions en cascade sont configurées pour maintenir la cohérence référentielle.
- **UUIDs** : Toutes les clés primaires utilisent `uuid().defaultRandom()` pour la sécurité.
- **RLS** : Les politiques supposent un contexte d'authentification avec `auth.uid()` fourni par un système comme Supabase.

---

**Version du schéma** : 1.0
**Date de création** : 2026-03-27
**Dernière modification** : 2026-03-27
