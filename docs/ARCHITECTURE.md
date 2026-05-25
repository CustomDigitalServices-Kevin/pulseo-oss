# Pulseo — Architecture technique

Self-hosted, multi-tenant client portal for support tickets, maintenance contracts and document sharing.

---

## 1. Stack technique

| Brique | Technologie | Version | Justification |
|--------|------------|---------|---------------|
| Framework | Next.js | 15+ | App Router, Server Actions, RSC pour optimisation perf |
| Langage | TypeScript | 5.x | `strict: true`, zéro `any`, type-safe complet |
| ORM | Drizzle ORM | latest | SQL-first, zéro codegen, bundle 7kb, migrations natives |
| BDD | PostgreSQL | 16+ | Via Docker sur VPS existant, nouvelle DB `pulseo`, RLS natif |
| Authentication | Better Auth | latest | Drizzle adapter natif, plugins `organization` + `magicLink` |
| Storage | Filesystem local | — | `/opt/pulseo-storage/{org_id}/`, servi via Nginx reverse proxy |
| UI Framework | Tailwind CSS v4 | latest | Composants accessibles, theme dynamique per-organisation |
| Composants UI | shadcn/ui | latest | Composants Headless UI, zéro dépendances non-essentielles |
| Validation | Zod | latest | Validation serveur chaque Server Action, parsing strict |
| Email | Resend + React Email | latest | Transactionnel, free tier 3000/mois, templates JSX |
| API externe | Qonto API v2 | OAuth 2.0 | Sync factures/devis, Authorization Code Flow |
| Process Manager | PM2 | latest | Cluster mode, restart automatique, monitoring |
| Reverse Proxy | Nginx | — | SSL Let's Encrypt, rate limiting, compression gzip |
| Hébergement | Any Linux VPS | Ubuntu 22.04+ / 24.04 LTS | Self-hosted, accès root recommandé |
| Git | GitHub privé + bare repo VPS | — | Hook post-receive auto-deploy via script shell |
| Markdown rendu | react-markdown | latest | Rendu description tickets (lecture seule) + sanitization |
| Testing | Vitest | latest | Tests unitaires, cohabitation avec TypeScript |
| Linting | ESLint + Prettier | latest | Code style enforcement, pre-commit hooks |

### 1.1 Justifications technologiques clés

**Next.js 15 App Router :**
- Server Components par défaut = moins de JS client
- Server Actions pour mutations sécurisées (CSRF, authentification, autorisation serveur-côté)
- Streaming RSC pour délai à l'interactivité réduit
- `revalidatePath()` pour revalidation granulaire

**Drizzle ORM :**
- SQL-first : migration et relation complètement typées sans auto-génération
- Drizzle Relations pour jointures N:1, 1:N type-safe
- Prepared statements natives = protection SQL injection
- Studio pour exploration DB interactive

**Better Auth :**
- Adapter PostgreSQL natif via Drizzle
- Plugin `organization` pour multi-tenancy (isolation `organization_id` au niveau auth)
- Plugin `magicLink` pour invités sans compte permanent
- Session cookie + CSRF token double-submit

**PostgreSQL RLS :**
- Row-Level Security au niveau DB = défense en profondeur
- Politiques RLS par rôle (Admin, Gestionnaire, Invité)
- Pas de risque fuite données via requête SQL mal construite

---

## 2. Structure du projet — `src/` complet

```
pulseo/
├── src/
│   ├── app/
│   │   ├── (auth)/                       ← Layout group auth (layout.tsx commun)
│   │   │   ├── login/
│   │   │   │   ├── page.tsx              ← Email/password login, magic link entry
│   │   │   │   ├── layout.tsx            ← No auth guard, logo CDS centered
│   │   │   │   └── error.tsx
│   │   │   ├── invite/
│   │   │   │   └── [token]/
│   │   │   │       └── page.tsx          ← Magic link verification, guest name input
│   │   │   └── _components/
│   │   │       ├── LoginForm.tsx         ← Server Component form, zod validation
│   │   │       └── MagicLinkForm.tsx
│   │   │
│   │   ├── (portal)/                     ← Layout group app (avec sidebar, header, auth guard)
│   │   │   ├── admin/                    ← Admin-only routes
│   │   │   │   ├── layout.tsx            ← Redirect si non-admin
│   │   │   │   ├── dashboard/
│   │   │   │   │   └── page.tsx          ← Dashboard global (KPIs tous clients)
│   │   │   │   ├── clients/
│   │   │   │   │   ├── page.tsx          ← Liste organisations
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx      ← Créer organisation (form)
│   │   │   │   │   └── [slug]/
│   │   │   │   │       ├── page.tsx      ← Vue organisation (contrats, stats, users)
│   │   │   │   │       └── settings/
│   │   │   │   │           └── page.tsx  ← Branding, webhooks, Qonto OAuth
│   │   │   │   ├── magic-links/
│   │   │   │   │   └── page.tsx          ← Gestion magic links (créer, révoquer, lister)
│   │   │   │   └── _components/
│   │   │   │       ├── AdminDashboard.tsx
│   │   │   │       ├── ClientsTable.tsx
│   │   │   │       └── MagicLinkManager.tsx
│   │   │   │
│   │   │   ├── clients/                  ← Multi-client routes (avec slug)
│   │   │   │   └── [slug]/               ← Segment slug = organization_slug
│   │   │   │       ├── layout.tsx        ← RLS per slug, branding dynamique, auth guard Gestionnaire/Invité
│   │   │   │       ├── page.tsx          ← Dashboard client (vue locale org)
│   │   │   │       │
│   │   │   │       ├── tickets/
│   │   │   │       │   ├── page.tsx      ← Liste tickets RLS
│   │   │   │       │   ├── new/
│   │   │   │       │   │   └── page.tsx  ← Form création ticket (SM ou Invité)
│   │   │   │       │   └── [id]/
│   │   │   │       │       ├── page.tsx  ← Vue détail ticket + commentaires
│   │   │   │       │       └── error.tsx
│   │   │   │       │
│   │   │   │       ├── contracts/
│   │   │   │       │   ├── page.tsx      ← Liste contrats (lecture seule SM)
│   │   │   │       │   └── [id]/
│   │   │   │       │       └── page.tsx  ← Détail contrat + jauge consommation
│   │   │   │       │
│   │   │   │       └── documents/
│   │   │   │           └── page.tsx      ← Devis/factures (sync Qonto + upload)
│   │   │   │
│   │   │   ├── layout.tsx                ← Layout principal (Sidebar, Header, Footer)
│   │   │   ├── _components/
│   │   │   │   ├── Sidebar.tsx           ← Navigation menu per role
│   │   │   │   ├── Header.tsx            ← Breadcrumb, user menu, notifications
│   │   │   │   ├── BrandingProvider.tsx  ← Context CSS variables (couleurs org)
│   │   │   │   └── Footer.tsx
│   │   │   └── error.tsx
│   │   │
│   │   ├── api/                          ← API Routes
│   │   │   ├── auth/
│   │   │   │   └── [...all]/
│   │   │   │       └── route.ts          ← Better Auth handler
│   │   │   │
│   │   │   ├── attachments/
│   │   │   │   ├── upload/
│   │   │   │   │   └── route.ts          ← File upload (multipart/form-data)
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts          ← Download file (auth check + org ownership)
│   │   │   │
│   │   │   ├── qonto/
│   │   │   │   ├── callback/
│   │   │   │   │   └── route.ts          ← OAuth callback (Qonto → token storage)
│   │   │   │   └── sync/
│   │   │   │       └── route.ts          ← Manual sync trigger (cron + webhook)
│   │   │   │
│   │   │   └── cron/
│   │   │       ├── reminders/
│   │   │       │   └── route.ts          ← Auto-escalation tickets
│   │   │       └── contracts-renewal/
│   │   │           └── route.ts          ← Renouvellement contrats jours
│   │   │
│   │   ├── layout.tsx                    ← Layout racine (fonts, globals, providers)
│   │   ├── not-found.tsx                 ← 404 custom
│   │   ├── error.tsx                     ← Error boundary global
│   │   ├── globals.css                   ← Tailwind directives + CSS vars custom
│   │   └── middleware.ts                 ← Auth check + organization isolation (slugs)
│   │
│   ├── actions/                          ← Server Actions (mutations sécurisées)
│   │   ├── tickets.ts                    ← createTicket, updateTicket, deleteTicket
│   │   ├── contracts.ts                  ← createContract, updateQuota, renewContract
│   │   ├── organizations.ts              ← createOrganization, updateBranding
│   │   ├── documents.ts                  ← uploadDocument, deleteDocument
│   │   ├── magic-links.ts                ← createMagicLink, revokeMagicLink
│   │   ├── comments.ts                   ← addComment, deleteComment
│   │   └── approvals.ts                  ← approveValidation, rejectValidation
│   │
│   ├── components/
│   │   ├── ui/                           ← shadcn/ui base (Button, Input, Card, etc.)
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── form.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── alert.tsx
│   │   │   └── [autres composants]
│   │   │
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx               ← Navigation menu per role
│   │   │   ├── Header.tsx                ← Top bar avec breadcrumb
│   │   │   ├── BrandingProvider.tsx      ← CSS variables injection per-org
│   │   │   └── Footer.tsx
│   │   │
│   │   ├── tickets/
│   │   │   ├── TicketCard.tsx            ← Card ticket (liste)
│   │   │   ├── TicketStatusBadge.tsx     ← Badge status (colors per state)
│   │   │   ├── TicketTimeline.tsx        ← Timeline commentaires + statuts
│   │   │   ├── CommentThread.tsx         ← Affichage/ajout commentaires
│   │   │   ├── PriorityBadge.tsx         ← Badge priorité
│   │   │   ├── TicketForm.tsx            ← Form création/édition ticket
│   │   │   ├── AttachmentUploader.tsx    ← Upload pièces jointes
│   │   │   ├── ApprovalButton.tsx        ← Buttons approver/rejeter
│   │   │   └── TicketDetail.tsx          ← Layout détail ticket
│   │   │
│   │   ├── contracts/
│   │   │   ├── ContractCard.tsx          ← Card contrat
│   │   │   ├── QuotaGauge.tsx            ← Jauge visuelle consommation
│   │   │   ├── ContractTypeBadge.tsx     ← Badge type (forfait/heures/jours)
│   │   │   └── LinkedTickets.tsx         ← Tickets liés + temps spent
│   │   │
│   │   ├── dashboard/
│   │   │   ├── AdminDashboard.tsx        ← Vue admin (global)
│   │   │   ├── ClientDashboard.tsx       ← Vue gestionnaire (local)
│   │   │   ├── KPICard.tsx               ← Carte stat
│   │   │   └── TrendChart.tsx            ← Graphique mini
│   │   │
│   │   ├── documents/
│   │   │   ├── DocumentList.tsx          ← Devis/factures liste
│   │   │   ├── DocumentUpload.tsx        ← Upload manuel
│   │   │   ├── QontoSyncStatus.tsx       ← Status sync Qonto
│   │   │   └── DocumentDetail.tsx        ← Préview/téléchargement
│   │   │
│   │   ├── forms/
│   │   │   ├── OrganizationForm.tsx      ← Créer/éditer org
│   │   │   ├── ContractForm.tsx          ← Créer/éditer contrat
│   │   │   └── BrandingForm.tsx          ← Branding settings org
│   │   │
│   │   └── dialogs/
│   │       ├── MagicLinkDialog.tsx       ← Dialog créer magic link
│   │       ├── DeleteConfirmDialog.tsx   ← Confirmation suppression
│   │       └── ApprovalDialog.tsx        ← Dialog approbation ticket
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts                  ← Pool PG connection + client export
│   │   │   ├── schema.ts                 ← Schéma Drizzle complet (tables, columns, types)
│   │   │   ├── relations.ts              ← defineRelations (N:1, 1:N, many:many)
│   │   │   ├── migrations/               ← Dossier migrations Drizzle
│   │   │   └── seed.ts                   ← Script seed données dev
│   │   │
│   │   ├── auth/
│   │   │   ├── index.ts                  ← Better Auth server config (options)
│   │   │   ├── client.ts                 ← Better Auth client fetch
│   │   │   ├── plugins/
│   │   │   │   ├── organization.ts       ← Plugin organization (custom)
│   │   │   │   └── magicLink.ts          ← Plugin magic link (custom ou builtin)
│   │   │   └── middleware.ts             ← Validation session middleware
│   │   │
│   │   ├── email/
│   │   │   ├── send.ts                   ← Wrapper Resend pour envoi
│   │   │   ├── constants.ts              ← Config (from, replay-to, etc.)
│   │   │   └── templates/
│   │   │       ├── TicketCreatedEmail.tsx
│   │   │       ├── StatusChangedEmail.tsx
│   │   │       ├── CommentAddedEmail.tsx
│   │   │       ├── ApprovalRequestEmail.tsx
│   │   │       ├── ReminderEmail.tsx
│   │   │       └── WelcomeEmail.tsx
│   │   │
│   │   ├── qonto/
│   │   │   ├── client.ts                 ← Qonto API HTTP client (axios + retry)
│   │   │   ├── sync.ts                   ← Logique sync (fetch invoices/quotes)
│   │   │   ├── types.ts                  ← Types Qonto API responses
│   │   │   └── oauth.ts                  ← OAuth flow helpers
│   │   │
│   │   ├── storage/
│   │   │   ├── file-storage.ts           ← FS operations (upload, delete, serve)
│   │   │   └── file-validation.ts        ← MIME check, size limits, virus scan opt
│   │   │
│   │   ├── validations/
│   │   │   ├── tickets.ts                ← Zod schemas (createTicket, updateTicket, etc.)
│   │   │   ├── contracts.ts              ← Zod schemas contracts
│   │   │   ├── organizations.ts          ← Zod schemas org
│   │   │   ├── documents.ts              ← Zod schemas documents
│   │   │   └── common.ts                 ← Shared schemas (pagination, filtering)
│   │   │
│   │   ├── utils/
│   │   │   ├── audit.ts                  ← Log actions per user/org
│   │   │   ├── slug.ts                   ← Slug generation/validation
│   │   │   ├── email-helpers.ts          ← Email address validation
│   │   │   ├── date.ts                   ← Date formatting, relative time
│   │   │   └── markdown.ts               ← Markdown sanitization (DOMPurify + backend)
│   │   │
│   │   ├── types/
│   │   │   ├── index.ts                  ← Types globaux (User, Organization, etc.)
│   │   │   ├── db.ts                     ← Types extraits de Drizzle schema
│   │   │   └── api.ts                    ← Types API responses
│   │   │
│   │   ├── constants.ts                  ← Constantes globales (URLs, limites, enums)
│   │   └── errors.ts                     ← Custom error classes
│   │
│   ├── hooks/
│   │   ├── use-session.ts                ← Hook récupérer session client
│   │   ├── use-organization.ts           ← Hook récupérer org contexte
│   │   └── use-auth.ts                   ← Hook check auth
│   │
│   └── middleware.ts                     ← Auth + organization routing check
│
├── drizzle/
│   ├── migrations/                       ← Auto-généré par Drizzle
│   ├── 0001_init.sql                     ← Première migration (schema complet)
│   ├── 0002_add_rls_policies.sql         ← RLS postgresql policies
│   └── [autres migrations]
│
├── public/
│   ├── logo-pulseo.svg                   ← Logo 256x256
│   ├── favicon.ico
│   ├── apple-touch-icon.png
│   └── favicon.svg
│
├── docs/
│   ├── SPEC.md                           ← Cahier des charges business
│   ├── ARCHITECTURE.md                   ← Ce fichier
│   ├── DATABASE.md                       ← Schéma complet + relations
│   ├── SECURITY.md                       ← Checklist sécurité
│   ├── BETTER-AUTH-GUIDE.md              ← Setup Better Auth
│   ├── DRIZZLE-GUIDE.md                  ← Patterns Drizzle
│   ├── DEPLOYMENT.md                     ← Config VPS, Nginx, PM2
│   └── GOTCHAS.md                        ← Erreurs + solutions
│
├── specs/
│   ├── phase-1-foundation.md
│   ├── phase-2-tickets.md
│   ├── phase-3-contracts.md
│   └── [autres phases]
│
├── .claude/
│   ├── agents/
│   ├── commands/
│   ├── hooks/
│   └── skills/
│
├── package.json
├── tsconfig.json
├── next.config.ts
├── drizzle.config.ts
├── vitest.config.ts
├── ecosystem.config.js                  ← PM2 cluster config
├── tailwind.config.ts
├── components.json                      ← shadcn/ui config
├── .env.example
├── .env.local                            ← gitignored
├── .gitignore
├── README.md
└── CLAUDE.md
```

---

## 3. Routing complet — Toutes les routes avec contexte

### 3.1 Routes d'authentification (Layout `(auth)`)

Pas d'authentification requise. Layout centré, sans sidebar.

| Route | Méthode | Rôles | Fonction |
|-------|---------|-------|----------|
| `GET /login` | GET | Anon | Formulaire login email/password + entrée magic link |
| `POST /api/auth/[...all]` | * | All | Endpoints Better Auth (sign up, sign in, session, etc.) |
| `GET /invite/[token]` | GET | Anon | Magic link: verify token, input guest name, set session |
| `POST /invite/[token]` | POST | Anon | Submit magic link form (guest name) |

**Comportement :**
- Visiteur anon → `/login`
- Visiteur signé → redirige `/clients/{org_slug}` (sa première org)
- Admin signé → redirige `/admin/dashboard`
- Magic link expiré/révoqué → erreur + bouton retour

---

### 3.2 Routes Admin (Layout `(portal)` + Admin guard)

Accessible UNIQUEMENT si session user = admin_account_id.

| Route | Rôles | Fonction |
|-------|-------|----------|
| `GET /admin/dashboard` | Admin | Dashboard global (KPIs tous clients) |
| `GET /admin/clients` | Admin | Tableau organisations |
| `POST /admin/clients` (SA) | Admin | Créer organisation |
| `GET /admin/clients/new` | Admin | Formulaire création |
| `GET /admin/clients/[slug]` | Admin | Vue organisation détail |
| `PUT /admin/clients/[slug]` (SA) | Admin | Modifier organisation |
| `GET /admin/clients/[slug]/settings` | Admin | Branding, Qonto OAuth, webhooks |
| `POST /admin/clients/[slug]/settings` (SA) | Admin | Sauvegarder settings |
| `GET /admin/magic-links` | Admin | Gestion magic links |
| `POST /admin/magic-links` (SA) | Admin | Créer magic link |
| `DELETE /admin/magic-links/[id]` (SA) | Admin | Révoquer magic link |

---

### 3.3 Routes Client Multi-tenant (Layout `(portal)` + Client layout)

Accessible si session user = gestionnaire OU magic_link actif. Slug doit matcher organization.

| Route | Rôles | Fonction |
|-------|-------|----------|
| `GET /clients/[slug]` | Gest, Invité | Dashboard client local |
| `GET /clients/[slug]/tickets` | Gest, Invité | Liste tickets RLS |
| `POST /clients/[slug]/tickets` (SA) | Gest, Invité (si can_create) | Créer ticket |
| `GET /clients/[slug]/tickets/new` | Gest, Invité (si can_create) | Form créer ticket |
| `GET /clients/[slug]/tickets/[id]` | Gest, Invité | Vue détail ticket + commentaires |
| `PUT /clients/[slug]/tickets/[id]` (SA) | Gest | Modifier ticket (titre, desc, prio, catégorie) |
| `POST /clients/[slug]/tickets/[id]/comments` (SA) | Gest, Invité | Ajouter commentaire |
| `DELETE /clients/[slug]/tickets/[id]/comments/[cid]` (SA) | Gest | Supprimer commentaire propre |
| `POST /clients/[slug]/tickets/[id]/approve` (SA) | Gest | Approver/rejeter client_validation |
| `POST /clients/[slug]/tickets/[id]/attachments` (SA) | Gest | Upload pièce jointe |
| `DELETE /clients/[slug]/tickets/[id]/attachments/[aid]` (SA) | Gest | Supprimer pièce jointe propre |
| `GET /clients/[slug]/contracts` | Gest | Liste contrats + jauges |
| `GET /clients/[slug]/contracts/[id]` | Gest | Détail contrat + linked tickets |
| `GET /clients/[slug]/documents` | Gest | Devis/factures + Qonto sync status |

**RLS appliquées :**
- `WHERE organization_id = {slug.org_id}`
- Invité voit SEULEMENT tickets si `magic_link.can_create_ticket = true` ET propre ticket
- Commentaires internes masqués
- Documents masqués pour Invité

---

### 3.4 API Routes (sans layout)

| Route | Méthode | Auth | Fonction |
|-------|---------|------|----------|
| `POST /api/attachments/upload` | POST | Oui | Upload fichier (multipart/form-data) |
| `GET /api/attachments/[id]` | GET | Oui | Download fichier (auth + org check) |
| `DELETE /api/attachments/[id]` | DELETE | Oui | Supprimer fichier |
| `POST /api/qonto/callback` | POST | OAuth | Callback OAuth Qonto (token exchange) |
| `POST /api/qonto/sync` | POST | Oui | Trigger sync manual factures/devis |
| `GET /api/cron/reminders` | GET | Secret | Escalade auto tickets (cron job) |
| `GET /api/cron/contracts-renewal` | GET | Secret | Renouvellement contrats jours (cron) |

---

## 4. Flux d'authentification

### 4.1 Email/Password flow (Gestionnaire)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Visiteur accède /login                                   │
│    → Page form (email + password)                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Submit form → POST /api/auth/sign-in                     │
│    (Better Auth route)                                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Better Auth:                                             │
│    • Valide email exists (users table)                      │
│    • Hash password vs stored hash                           │
│    • Create session token + httpOnly cookie                 │
│    • Return {session, user}                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Client receives session cookie                           │
│    (browser auto-store httpOnly + Secure + SameSite)        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Browser redirects /clients/{first_org_slug}              │
│    (Server Component layout check via middleware)           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Middleware intercept request                             │
│    • Read session cookie                                    │
│    • Fetch profile + organizations                          │
│    • Match slug vs profile.organization_id                  │
│    • Allow access OU redirect                               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Server Component (portal layout) render                  │
│    • `await getSession()` → {user, profile, org}            │
│    • RLS queries: WHERE organization_id = org_id            │
│    • Pass props → Client Components                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Client Component (e.g. TicketForm.tsx)                   │
│    • User click "Create Ticket"                             │
│    • Client calls Server Action `createTicket(formData)`    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. Server Action (actions/tickets.ts)                       │
│    • Read session cookie → get user.id + org_id             │
│    • Zod.parse(formData) ← validation                       │
│    • Check auth: user must exist                            │
│    • Check org ownership: org_id must match profile          │
│    • DB insert: tickets table                               │
│    • revalidatePath(`/clients/${slug}/tickets`)             │
│    • Return success | error                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 10. Revalidate + redirect/reload page                       │
│     Client sees new ticket in list                          │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Magic Link flow (Invité)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Admin crée magic link                                    │
│    POST /admin/magic-links                                  │
│    → {organization_id, can_create_ticket, expiration_date}  │
│    → Générer token unique (random 32 bytes hex)             │
│    → Insert magic_links table                               │
│    → Return URL: /invite/{token}                            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Admin share URL avec client                              │
│    Ex: https://your-domain.tld/invite/abc123def456                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Client clique link                                       │
│    GET /invite/{token}                                      │
│    → Page: "Bienvenue! Quel est votre prénom?"              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Client submit form                                       │
│    POST /invite/{token}                                     │
│    Payload: {guest_name: "Jean"}                            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Backend (Server Action):                                 │
│    • Verify token exists + not expired                      │
│    • Check not disabled                                     │
│    • Create magic_link_session (httpOnly cookie)            │
│    • Return magic_link_id + guest_name                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Browser set cookie + redirect                            │
│    /clients/{organization_slug}                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Middleware check:                                        │
│    • Read magic_link_session cookie                         │
│    • Lookup magic_links table                               │
│    • Match slug vs magic_link.organization_id               │
│    • Allow access                                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Server Component fetch tickets (RLS)                     │
│    WHERE organization_id = {magic_link.org_id}              │
│    AND created_by = NULL AND magic_link_id = {link_id}      │
│    (invité ne voit QUE son propre ticket OU lecture seule)   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. Client click "Create Ticket"                             │
│    (si magic_link.can_create_ticket = true)                 │
│    Form submit → Server Action                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 10. Server Action:                                          │
│     • Check session: magic_link_id exists                   │
│     • Check quota: max_tickets not exceeded                 │
│     • Insert ticket:                                        │
│       created_by = NULL                                     │
│       magic_link_id = {link_id}                             │
│       guest_name = "Jean"                                   │
│     • revalidatePath                                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 11. Invité voit son ticket (read-only)                     │
│     Peut ajouter commentaires, voir réponses Admin          │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 PostgreSQL RLS (Row-Level Security)

**Politique Admin :**
```sql
-- Admin voit tous les tickets/commentaires/documents
CREATE POLICY admin_access_all ON tickets
  USING (auth.uid() = (SELECT id FROM users WHERE email = 'admin@example.com'))
```

**Politique Gestionnaire :**
```sql
-- Gestionnaire voit tickets de son org uniquement
CREATE POLICY gestionnaire_see_own_org ON tickets
  USING (organization_id = (SELECT organization_id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- Gestionnaire ne voit pas commentaires internes
CREATE POLICY gestionnaire_skip_internal_comments ON ticket_comments
  USING (is_internal = false OR auth.uid() = created_by);
```

**Politique Invité (magic_link_session) :**
```sql
-- Invité ne voit QUE tickets créés par lui via ce magic link
CREATE POLICY guest_see_own_ticket ON tickets
  USING (
    magic_link_id = (SELECT id FROM magic_links WHERE session_id = auth.sid())
    AND created_by IS NULL
  );
```

---

## 5. Flux de données — Patterns clés

### 5.1 Server Component → Database → Client Component

**Scénario : Afficher liste tickets avec statuts**

#### Phase 1 : Server Component (e.g., `/clients/[slug]/tickets/page.tsx`)

```typescript
// Ceci s'exécute côté serveur, avant envoi HTML
export default async function TicketsPage({ params }: PageProps) {
  // 1. Récupérer session + org_id
  const session = await getSession();
  if (!session) return notFound();

  const orgId = session.organization.id;

  // 2. Drizzle query (RLS appliquée via WHERE clause)
  const tickets = await db
    .select()
    .from(ticketsTable)
    .where(
      and(
        eq(ticketsTable.organizationId, orgId),
        eq(ticketsTable.isDeleted, false)
      )
    )
    .orderBy(desc(ticketsTable.createdAt));

  // 3. Pass typed props → Client Component
  return <TicketsList tickets={tickets} />;
}
```

#### Phase 2 : Client Component (e.g., `components/tickets/TicketsList.tsx`)

```typescript
'use client'; // Directive: ceci s'exécute côté client

export function TicketsList({ tickets }: { tickets: Ticket[] }) {
  const [sortBy, setSortBy] = useState<'date' | 'priority'>('date');

  const sorted = useMemo(() => {
    return tickets.sort((a, b) => {
      if (sortBy === 'date') return b.createdAt - a.createdAt;
      // priority: critical > high > medium > low
      return priorityValue(b.priority) - priorityValue(a.priority);
    });
  }, [tickets, sortBy]);

  return (
    <div>
      <SortDropdown value={sortBy} onChange={setSortBy} />
      <div className="grid gap-4">
        {sorted.map(ticket => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </div>
    </div>
  );
}
```

**Avantage :** Données préchargées serveur = pas de requête client supplémentaire, SSR hydration rapide.

---

### 5.2 Server Action — Pattern complet (create ticket)

**Fichier : `/src/actions/tickets.ts`**

```typescript
'use server';

// 1. Import validations + DB + auth
import { z } from 'zod';
import { db } from '@/lib/db';
import { ticketsTable, profilesTable } from '@/lib/db/schema';
import { getSession } from '@/lib/auth';
import { createTicketSchema } from '@/lib/validations/tickets';

// 2. Server Action function
export async function createTicket(formData: FormData | unknown) {
  try {
    // Step A : Vérifier authentification
    const session = await getSession();
    if (!session?.user?.id) {
      return { error: 'Vous devez être connecté' };
    }

    // Step B : Parse + valide formData avec Zod
    const parsed = createTicketSchema.parse({
      title: formData.get?.('title') || formData.title,
      description: formData.get?.('description') || formData.description,
      priority: formData.get?.('priority') || formData.priority,
      category: formData.get?.('category') || formData.category,
      contractId: formData.get?.('contractId') || formData.contractId,
    });

    // Step C : Vérifier ownership organisation
    const profile = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.userId, session.user.id))
      .limit(1);

    if (!profile || !profile[0]?.organizationId) {
      return { error: 'Vous n\'avez pas d\'organisation' };
    }

    const orgId = profile[0].organizationId;

    // Step D : Vérifier contract ownership (si fourni)
    if (parsed.contractId) {
      const contract = await db
        .select()
        .from(contractsTable)
        .where(
          and(
            eq(contractsTable.id, parsed.contractId),
            eq(contractsTable.organizationId, orgId)
          )
        )
        .limit(1);

      if (!contract) {
        return { error: 'Contrat non trouvé ou accès non autorisé' };
      }
    }

    // Step E : Business logic — insert DB
    const ticketId = generateUUID();
    const now = new Date();

    await db.insert(ticketsTable).values({
      id: ticketId,
      organizationId: orgId,
      createdBy: session.user.id,
      title: parsed.title,
      description: parsed.description,
      priority: parsed.priority,
      category: parsed.category,
      status: 'new',
      contractId: parsed.contractId || null,
      createdAt: now,
      updatedAt: now,
    });

    // Step F : Send email notification
    await sendEmail({
      to: 'admin@example.com',
      subject: `[Pulseo] Nouveau ticket #${ticketId}`,
      template: 'TicketCreatedEmail',
      props: { ticket: parsed, organization: orgId },
    });

    // Step G : Revalidate cache
    revalidatePath(`/clients/${profile[0].organization.slug}/tickets`);

    // Step H : Return success + new ticket ID
    return {
      success: true,
      ticketId,
      redirectTo: `/clients/${profile[0].organization.slug}/tickets/${ticketId}`,
    };

  } catch (error) {
    // Error handling
    if (error instanceof z.ZodError) {
      return { error: 'Données invalides', fieldErrors: error.flatten().fieldErrors };
    }

    console.error('createTicket error:', error);
    return { error: 'Erreur serveur' };
  }
}
```

**Pattern résumé :**

```
Input formData
    ↓
1️⃣  getSession() — auth guard
    ↓
2️⃣  Zod.parse() — validation
    ↓
3️⃣  Query profile → org_id — org ownership check
    ↓
4️⃣  Query contract (si fourni) → org_id check — resource ownership check
    ↓
5️⃣  INSERT database
    ↓
6️⃣  Send email notification
    ↓
7️⃣  revalidatePath() — rebuild affected routes
    ↓
8️⃣  Return {success, redirectTo} — client re-render
```

---

### 5.3 Client Component Form → Server Action

**Composant : `/src/components/tickets/TicketForm.tsx`**

```typescript
'use client';

import { useActionState } from 'react';
import { createTicket } from '@/actions/tickets';

export function TicketForm() {
  const [state, formAction, isPending] = useActionState(
    createTicket,
    { success: false }
  );

  if (state.success) {
    return <redirect href={state.redirectTo} />;
  }

  return (
    <form action={formAction} className="space-y-4">
      <Input
        name="title"
        placeholder="Titre du ticket"
        required
      />

      <Textarea
        name="description"
        placeholder="Description (Markdown)"
        required
      />

      <Select name="priority" defaultValue="medium">
        <Option value="low">Basse</Option>
        <Option value="medium">Normal</Option>
        <Option value="high">Haute</Option>
        <Option value="critical">Critique</Option>
      </Select>

      <Select name="contractId">
        {/* Options from props */}
      </Select>

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Envoi...' : 'Créer ticket'}
      </Button>

      {state.error && (
        <Alert type="error">{state.error}</Alert>
      )}
    </form>
  );
}
```

**Flux :**

```
1. User remplissage form
   ↓
2. Submit form → action={createTicket}
   ↓
3. Browser encode FormData + send POST
   ↓
4. Server Action execute (fichier actions/tickets.ts)
   ↓
5. Revalidate + return state
   ↓
6. Browser update state, re-render component
   ↓
7. Redirect vers /tickets/{id}
```

---

### 5.4 Flux complet : Créer commentaire + Email + Revalidate

**Scénario :**

Gestionnaire ajoute commentaire sur ticket → Admin reçoit email notification → Ticket page rafraîchis.

**Fichier : `/src/actions/comments.ts`**

```typescript
'use server';

export async function addComment(
  ticketId: string,
  text: string,
  isInternal: boolean = false
) {
  // 1. Auth + org check
  const session = await getSession();
  if (!session) return { error: 'Auth required' };

  // 2. Check ticket ownership + org
  const ticket = await db
    .select()
    .from(ticketsTable)
    .where(
      and(
        eq(ticketsTable.id, ticketId),
        eq(ticketsTable.organizationId, session.organization.id)
      )
    )
    .limit(1);

  if (!ticket) return { error: 'Ticket not found' };

  // 3. Check permission: if isInternal, only admin
  if (isInternal && session.user.role !== 'admin') {
    return { error: 'Only admins can add internal comments' };
  }

  // 4. Validate text (Markdown)
  const validated = createCommentSchema.parse({ text });

  // 5. Insert comment
  const commentId = generateUUID();
  await db.insert(ticket_commentsTable).values({
    id: commentId,
    ticketId,
    createdBy: session.user.id,
    text: validated.text,
    isInternal,
    createdAt: new Date(),
  });

  // 6. Update ticket.updated_at
  await db
    .update(ticketsTable)
    .set({ updatedAt: new Date() })
    .where(eq(ticketsTable.id, ticketId));

  // 7. Send email to ticket creator + other commenters (except self + internal)
  if (!isInternal) {
    const otherCommenters = await db
      .select({ createdBy: ticket_commentsTable.createdBy })
      .from(ticket_commentsTable)
      .where(
        and(
          eq(ticket_commentsTable.ticketId, ticketId),
          ne(ticket_commentsTable.createdBy, session.user.id)
        )
      )
      .distinct();

    const recipients = [
      ticket[0].createdBy,
      ...otherCommenters.map(c => c.createdBy),
    ].filter(Boolean);

    await sendBulkEmail(
      [...new Set(recipients)], // dedupe
      {
        subject: `[Pulseo] Nouveau commentaire ticket #${ticketId}`,
        template: 'CommentAddedEmail',
        props: { ticket: ticket[0], comment: validated.text },
      }
    );
  }

  // 8. Revalidate ticket page
  revalidatePath(`/clients/[slug]/tickets/${ticketId}`, 'page');

  return { success: true, commentId };
}
```

---

### 5.5 Modification contrat → Quota décompte + Revalidate jauge

**Scénario :**

Admin change `time_spent` ticket 2.5h → 3.5h → Contrat lié passe 17.5h de solde à 16.5h → Dashboard client jauge rafraîchis.

**Fichier : `/src/actions/tickets.ts`**

```typescript
export async function updateTicketTimeSpent(
  ticketId: string,
  newTimeSpent: number
) {
  // 1. Auth: admin only
  const session = await getSession();
  if (session?.user?.role !== 'admin') {
    return { error: 'Admin only' };
  }

  // 2. Fetch ticket + contract
  const ticket = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.id, ticketId))
    .leftJoin(
      contractsTable,
      eq(ticketsTable.contractId, contractsTable.id)
    )
    .limit(1);

  if (!ticket) return { error: 'Ticket not found' };

  // 3. Calculate delta
  const oldTimeSpent = ticket[0].time_spent || 0;
  const delta = newTimeSpent - oldTimeSpent;

  // 4. Update ticket
  await db
    .update(ticketsTable)
    .set({ timeSpent: newTimeSpent, updatedAt: new Date() })
    .where(eq(ticketsTable.id, ticketId));

  // 5. If contract linked, update contract quota
  if (ticket[0].contractId && ticket[1]) {
    const contract = ticket[1];

    // Fetch current quota
    const quota = await db
      .select()
      .from(contract_quotasTable)
      .where(eq(contract_quotasTable.contractId, contract.id))
      .limit(1);

    if (quota) {
      const newConsumed = Math.max(
        0,
        quota[0].consumedQuota + delta
      );

      // Update quota
      await db
        .update(contract_quotasTable)
        .set({
          consumedQuota: newConsumed,
        })
        .where(eq(contract_quotasTable.contractId, contract.id));

      // Update contract status if needed
      const newStatus = newConsumed >= quota[0].initialQuota
        ? 'terminated'
        : contract.end_date < new Date()
          ? 'expired'
          : 'active';

      await db
        .update(contractsTable)
        .set({ status: newStatus })
        .where(eq(contractsTable.id, contract.id));
    }
  }

  // 6. Revalidate ticket detail + contracts page
  revalidatePath(`/clients/[slug]/tickets/${ticketId}`);
  revalidatePath(`/clients/[slug]/contracts`);

  return { success: true };
}
```

---

## 6. Sécurité — Couches défense

| Couche | Mécanisme | Où |
|--------|-----------|-----|
| **Authentification** | Better Auth session cookie (httpOnly, Secure, SameSite) | Middleware + Server Actions |
| **CSRF** | Double-submit token (Better Auth) | Form submit |
| **Autorisation** | Session check + org ownership check | Chaque Server Action |
| **SQL Injection** | Prepared statements Drizzle | Toutes requêtes DB |
| **RLS PostgreSQL** | Politiques par rôle + org_id | Level DB |
| **File Upload** | MIME magic bytes + size limits + whitelist ext | Endpoint `/api/attachments/upload` |
| **XSS** | Markdown sanitization (DOMPurify client + backend) | Description + commentaires |
| **Rate Limiting** | Nginx + PM2 middleware | Reverse proxy level |
| **Email validation** | Zod pattern + backend SMTP check | Signup |
| **Secrets** | `.env.local` gitignored + process.env | Variables d'env |

---

## 7. Déploiement — Résumé

**VPS :** any Linux host (Ubuntu 22.04+ tested), at least 2 GB RAM, public IPv4

**Architecture Production :**

```
┌─────────────────┐
│  GitHub (main)  │  ← Push → bare repo VPS
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  VPS /home/pulseo/repo.git (bare repo)  │
│  ├─ hooks/post-receive                  │ ← Script auto-deploy
│  └─ (git-push déclenche script)          │
└────────┬────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│  /home/pulseo/app (working dir)  │
│  ├─ package.json (dependencies)  │
│  ├─ .env.local (secrets)         │
│  ├─ drizzle/ (migrations)        │
│  └─ .next (build output)         │
└────────┬─────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  PM2 (cluster mode)         │
│  ├─ app (4 instances Node)  │
│  ├─ cron-job                │
│  └─ restart auto            │
└────────┬────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│  Nginx (reverse proxy)           │
│  ├─ SSL Let's Encrypt            │
│  ├─ Upstream :3000 (PM2)         │
│  ├─ /opt/pulseo-storage (static) │
│  └─ Rate limiting                │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│  PostgreSQL (Docker)             │
│  ├─ Database pulseo              │
│  ├─ RLS enabled                  │
│  └─ Backup automated             │
└──────────────────────────────────┘
```

---

## 8. Conventions de code

### 8.1 TypeScript strict

```typescript
// ✅ CORRECT
const userId: string = session?.user?.id ?? null;
if (!userId) throw new Error('Auth required');

// ❌ INCORRECT
const userId = session.user.id; // any
const userId: any = session?.user?.id;
```

### 8.2 Drizzle queries paramétrées

```typescript
// ✅ CORRECT
await db
  .select()
  .from(ticketsTable)
  .where(eq(ticketsTable.organizationId, orgId));

// ❌ INCORRECT
await db.execute(`SELECT * FROM tickets WHERE organization_id = '${orgId}'`);
```

### 8.3 Server Actions validées

```typescript
// ✅ CORRECT
export async function updateTicket(id: string, data: FormData) {
  const validated = updateTicketSchema.parse(Object.fromEntries(data));
  // ...
}

// ❌ INCORRECT
export async function updateTicket(data: any) {
  // Use data directly without validation
}
```

### 8.4 Components par défaut Server, `'use client'` si nécessaire

```typescript
// ✅ CORRECT (Server Component)
export async function TicketDetail({ ticketId }: Props) {
  const ticket = await db.query(ticketId);
  return <div>{ticket.title}</div>;
}

// ✅ CORRECT (Client Component quand état)
'use client';
export function TicketForm() {
  const [isOpen, setIsOpen] = useState(false);
  return <button onClick={() => setIsOpen(!isOpen)}>Toggle</button>;
}

// ❌ INCORRECT
export function TicketDetail({ ticketId }: Props) {
  const [data, setData] = useState(null);
  useEffect(() => { /* fetch */ }, []);
}
```

---

**Fin du document ARCHITECTURE.md**
