# Pulseo — Guide Drizzle ORM

Ce guide couvre l'utilisation complète de **Drizzle ORM** dans le projet Pulseo, incluant la configuration, les patterns de requête, les migrations, les relations, et les gotchas importants.

## Table des matières

1. [Configuration](#configuration)
2. [Patterns de requête](#patterns-de-requête)
3. [Migrations](#migrations)
4. [Relations](#relations)
5. [Transactions](#transactions)
6. [Gotchas courants](#gotchas-courants)

---

## Configuration

### Installation

```bash
npm install drizzle-orm pg
npm install -D drizzle-kit
```

**Important** : Utiliser `pg` (node-postgres) et NON `postgres.js`, pour la compatibilité avec Better Auth.

### Fichier : `drizzle.config.ts`

```typescript
import { defineConfig } from "drizzle-kit";
import type { Config } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/schema",
  out: "./drizzle/migrations",
  driver: "pg",
  dbCredentials: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER || "pulseo_admin",
    password: process.env.DB_PASSWORD || "password",
    database: process.env.DB_NAME || "pulseo",
  },
  tablesFilter: ["pulseo_*"],
} satisfies Config);
```

### Fichier : `lib/db.ts`

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "pulseo_admin",
  password: process.env.DB_PASSWORD || "password",
  database: process.env.DB_NAME || "pulseo",
});

export const db = drizzle(pool, { schema });
```

### Variables d'environnement

```bash
# .env.local
DB_HOST=localhost
DB_PORT=5432
DB_USER=pulseo_admin
DB_PASSWORD=secure_password
DB_NAME=pulseo
```

---

## Patterns de requête

### SELECT basique

```typescript
import { db } from "@/lib/db";
import { tickets } from "@/lib/schema/tickets";

// Récupérer tous les tickets
const allTickets = await db.select().from(tickets);

// Avec condition
const openTickets = await db
  .select()
  .from(tickets)
  .where(eq(tickets.status, "open"));

// Sélectionner des colonnes spécifiques
const ticketTitles = await db
  .select({ id: tickets.id, title: tickets.title })
  .from(tickets);
```

### SELECT avec JOIN

```typescript
import { tickets, organizations } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

// JOIN simple
const ticketsWithOrgs = await db
  .select({
    ticketId: tickets.id,
    title: tickets.title,
    orgName: organizations.name,
  })
  .from(tickets)
  .innerJoin(
    organizations,
    eq(tickets.organizationId, organizations.id)
  );

// LEFT JOIN
const ticketsWithOrgsMaybe = await db
  .select()
  .from(tickets)
  .leftJoin(
    organizations,
    eq(tickets.organizationId, organizations.id)
  );

// Multiple JOINs
const detailedTickets = await db
  .select()
  .from(tickets)
  .innerJoin(organizations, eq(tickets.organizationId, organizations.id))
  .innerJoin(users, eq(tickets.assignedTo, users.id))
  .where(eq(tickets.status, "open"));
```

### SELECT avec conditions avancées

```typescript
import { lt, gt, ilike, inArray, or, and } from "drizzle-orm";

// Plage de dates
const recentTickets = await db
  .select()
  .from(tickets)
  .where(gt(tickets.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));

// Recherche textuelle
const searchResults = await db
  .select()
  .from(tickets)
  .where(ilike(tickets.title, "%bug%"));

// IN
const priorityTickets = await db
  .select()
  .from(tickets)
  .where(inArray(tickets.priority, ["high", "critical"]));

// OR / AND
const complexQuery = await db
  .select()
  .from(tickets)
  .where(
    or(
      eq(tickets.status, "critical"),
      and(
        eq(tickets.priority, "high"),
        lt(tickets.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
      )
    )
  );
```

### INSERT

```typescript
// Insérer un ticket
const newTicket = await db
  .insert(tickets)
  .values({
    id: crypto.randomUUID(),
    organizationId: "org-123",
    title: "Impossible de se connecter",
    description: "Les utilisateurs ne peuvent pas accéder au dashboard",
    status: "open",
    priority: "high",
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  .returning();

// Insérer plusieurs
const newTickets = await db
  .insert(tickets)
  .values([
    { title: "Bug 1", status: "open", organizationId: "org-123" },
    { title: "Bug 2", status: "open", organizationId: "org-123" },
  ])
  .returning();
```

### UPDATE

```typescript
// Mettre à jour un ticket
const updated = await db
  .update(tickets)
  .set({
    status: "in_progress",
    assignedTo: "user-456",
    updatedAt: new Date(),
  })
  .where(eq(tickets.id, "ticket-123"))
  .returning();

// Mise à jour conditionnelle
await db
  .update(tickets)
  .set({ status: "resolved", updatedAt: new Date() })
  .where(
    and(
      eq(tickets.status, "in_progress"),
      lt(tickets.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    )
  );
```

### DELETE

```typescript
// Supprimer un ticket
await db.delete(tickets).where(eq(tickets.id, "ticket-123"));

// Supprimer avec condition
await db
  .delete(tickets)
  .where(
    and(
      eq(tickets.status, "closed"),
      lt(tickets.updatedAt, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
    )
  );
```

### Agrégations

```typescript
import { count, sum, avg, max, min } from "drizzle-orm";

// Compter les tickets ouverts
const openCount = await db
  .select({ count: count() })
  .from(tickets)
  .where(eq(tickets.status, "open"));

// Grouper et compter
const ticketsByStatus = await db
  .select({
    status: tickets.status,
    count: count(),
  })
  .from(tickets)
  .groupBy(tickets.status);

// Agrégation avec HAVING
const statusGroups = await db
  .select({
    status: tickets.status,
    count: count().as("total"),
  })
  .from(tickets)
  .groupBy(tickets.status)
  .having(count().greaterThan(5));
```

---

## Migrations

### Générer une migration

```bash
npm run drizzle:generate
```

Cela crée un fichier dans `drizzle/migrations/` contenant les changements SQL.

### Appliquer les migrations

```bash
npm run drizzle:migrate
```

### Workflow complet

1. **Modifier le schéma** dans `lib/schema/*.ts`
2. **Générer** : `npm run drizzle:generate`
3. **Réviser** le fichier SQL généré
4. **Appliquer** : `npm run drizzle:migrate`

### Scripts package.json

```json
{
  "scripts": {
    "drizzle:generate": "drizzle-kit generate:pg",
    "drizzle:migrate": "drizzle-kit migrate:pg",
    "drizzle:studio": "drizzle-kit studio"
  }
}
```

### Important

**JAMAIS modifier une migration déjà appliquée**. Si une erreur est découverte :

1. Créer une nouvelle migration qui corrige l'erreur
2. Appliquer la nouvelle migration

Exemple :
```bash
# Migration 1 (erronée) : ajoute colonne incorrectement
# Migration 2 (correction) : modifie ou supprime la colonne
npm run drizzle:migrate
```

---

## Relations

### Définir les relations

```typescript
// lib/schema/organizations.ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const organizations = pgTable("organization", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const organizationRelations = relations(organizations, ({ many }) => ({
  members: many(members),
  tickets: many(tickets),
}));

// lib/schema/members.ts
export const members = pgTable("member", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  role: text("role").notNull().default("member"),
});

export const memberRelations = relations(members, ({ one }) => ({
  organization: one(organizations, {
    fields: [members.organizationId],
    references: [organizations.id],
  }),
}));

// lib/schema/tickets.ts
export const tickets = pgTable("ticket", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const ticketRelations = relations(tickets, ({ one }) => ({
  organization: one(organizations, {
    fields: [tickets.organizationId],
    references: [organizations.id],
  }),
}));
```

### Requêtes relationnelles

```typescript
import { db } from "@/lib/db";

// Avec relations (nécessite Drizzle relations)
const orgWithMembers = await db.query.organizations.findFirst({
  where: (org) => eq(org.id, "org-123"),
  with: {
    members: {
      columns: { role: true },
      with: {
        user: {
          columns: { email: true, name: true },
        },
      },
    },
    tickets: {
      columns: { id: true, title: true },
    },
  },
});

// Résultat
// {
//   id: "org-123",
//   name: "Acme Corp",
//   members: [
//     { role: "admin", user: { email: "admin@acme.com", name: "Alice" } }
//   ],
//   tickets: [
//     { id: "ticket-1", title: "Bug #1" }
//   ]
// }
```

---

## Transactions

### Utiliser les transactions

```typescript
// Transaction simple
await db.transaction(async (tx) => {
  // Créer le ticket
  const ticket = await tx
    .insert(tickets)
    .values({ title: "New Issue", organizationId: "org-123" })
    .returning();

  // Créer le commentaire initial
  await tx.insert(comments).values({
    ticketId: ticket[0].id,
    body: "Ticket créé automatiquement",
    userId: "user-123",
  });

  // Les deux opérations sont atomiques : tout ou rien
});
```

### Transaction avec gestion d'erreur

```typescript
try {
  await db.transaction(async (tx) => {
    const org = await tx
      .insert(organizations)
      .values({ name: "New Org" })
      .returning();

    await tx
      .insert(members)
      .values({
        organizationId: org[0].id,
        userId: "admin-user",
        role: "owner",
      });
  });
} catch (error) {
  console.error("Transaction failed, rollback applied:", error);
  // La transaction est complètement annulée
}
```

---

## Gotchas courants

### 1. Timestamps avec defaultNow()

**Problème** : `defaultNow()` est exécuté au moment de la migration, pas de l'insertion.

**Solution** :
```typescript
// ✅ Correct
export const tickets = pgTable("ticket", {
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Lors d'une insertion
await db.insert(tickets).values({
  title: "Issue",
  // createdAt sera automatiquement défini au moment actuel
});
```

### 2. UUID avec defaultRandom()

**Problème** : Les UUIDs doivent être générés côté serveur pour la compatibilité.

**Solution** :
```typescript
// ✅ Utiliser defaultRandom()
export const tickets = pgTable("ticket", {
  id: uuid("id").primaryKey().defaultRandom(),
});

// Ou générer manuellement
import { v4 as uuidv4 } from "uuid";
await db.insert(tickets).values({
  id: uuidv4(),
  title: "Issue",
});
```

### 3. Décimaux pour les montants

**Problème** : Utiliser `numeric` pour les montants, pas `float` ou `integer`.

**Solution** :
```typescript
import { numeric } from "drizzle-orm/pg-core";

export const invoices = pgTable("invoice", {
  amount: numeric("amount", { precision: 10, scale: 2 }), // Pour 9999999.99
});
```

### 4. Énums PostgreSQL

**Problème** : Les énums doivent être explicites et migrés.

**Solution** :
```typescript
import { pgEnum, pgTable, text } from "drizzle-orm/pg-core";

export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

export const tickets = pgTable("ticket", {
  status: ticketStatusEnum("status").notNull().default("open"),
});

// Migration créée automatiquement pour CREATE TYPE ticket_status AS ENUM(...)
```

### 5. Gestion des big integers

**Problème** : PostgreSQL utilise `bigint` par défaut, JavaScript a des limitations.

**Solution** :
```typescript
import { bigint } from "drizzle-orm/pg-core";

export const logs = pgTable("log", {
  sequenceNumber: bigint("sequence_number", { mode: "bigint" }), // Retourne BigInt
});
```

### 6. Ordre du schéma

**Problème** : Les dépendances de clés étrangères doivent être respectées.

**Solution** : Exporter les relations dans le bon ordre :
```typescript
// lib/schema/index.ts
export * from "./organizations";
export * from "./members"; // Dépend de organizations
export * from "./tickets";  // Dépend de organizations
```

### 7. Noms des tables

**Problème** : Les espaces ou caractères spéciaux dans les noms de tables.

**Solution** :
```typescript
// ✅ Correct : snake_case
export const organizationMembers = pgTable("organization_member", {
  // ...
});

// ❌ Éviter : espaces ou caractères spéciaux
export const weirdTable = pgTable("weird table", { // Problématique
  // ...
});
```

### 8. Références circulaires

**Problème** : Les relations bidirectionnelles peuvent causer des conflits d'imports.

**Solution** : Exporter les relations séparément :
```typescript
// lib/schema/index.ts
export * from "./tables";
export * from "./relations";
```

---

## Ressources

- [Drizzle ORM Docs](https://orm.drizzle.team)
- [PostgreSQL Types](https://www.postgresql.org/docs/current/datatype.html)
- [Drizzle Kit](https://orm.drizzle.team/kit-docs/overview)
