<div align="center">

# Pulseo

**A self-hosted, multi-tenant client portal for consultancies, agencies and MSPs.**

Built with Next.js 16, Drizzle ORM, PostgreSQL and Better Auth.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-160%2B-success)](#testing)

[Features](#features) -
[Quickstart](#quickstart) -
[Branding](#branding) -
[Deployment](#deployment) -
[FAQ](#faq)

</div>

---

## What is Pulseo?

Pulseo is a **production-ready client portal** that you self-host and rebrand
in minutes. It gives your customers a single, polished workspace where they
can:

- open and follow support **tickets** (with SLA tracking, tags, attachments)
- read their **contracts** (quotas, hours consumed, validity)
- download **documents** (quotes, invoices, reports)
- see real-time **dashboards** of their activity

And it gives **you**, the operator, the admin surface to manage every
client organization, every member, every role, with full audit trails.

It is **multi-tenant from day one**: one database, dozens of customer
organizations, strict isolation enforced by an RBAC layer on every query.

### Who it's for

| You are | You probably want |
|---|---|
| A consulting firm / agency / MSP | A branded portal for your retainer clients |
| A SaaS shipping B2B with white-label needs | A starting point you can fork and theme |
| A solo developer with two or three corporate customers | A "real" portal that replaces email back-and-forth |
| A learner of Next.js 16 / Drizzle / Better Auth | A complete, opinionated reference codebase |

### What it isn't

- It is **not** a CRM. There's no sales pipeline, no contact database.
- It is **not** a public marketing site. There is no landing page builder.
- It is **not** a self-signup product. Every account is invited by an
  admin or super-admin.
- It is **not** a heavy ITSM tool. The ticketing system is intentionally
  lean (statuses, priorities, SLA, comments, attachments) without
  enterprise process modeling.

---

## Features

### For your customers

| Feature | Detail |
|---|---|
| Tickets | Create, comment, attach (MIME + magic-bytes validated), follow status changes by email |
| Contracts | View remaining quota, validity dates, SLA windows |
| Documents | Preview PDFs and images inline, download anything, optional ClamAV antivirus scan |
| Dashboard | KPIs (open tickets, contracts active, recent activity) updated in real time via SSE |
| Magic links | Sign in by clicking a one-time link sent by email (no password to remember) |
| Tags | Custom labels on tickets for cross-cutting workflows |
| Command palette | `Ctrl/Cmd + K` to navigate anywhere instantly |
| Theme | Light, dark, system, persisted per user |
| FR + EN UI | French primary, English available, locale persisted per user |

### For platform operators (you)

| Feature | Detail |
|---|---|
| Multi-tenant | Manage every client organization from one admin surface |
| RBAC | Three roles per org (`viewer` < `gestionnaire` < `admin`) plus platform `super-admin` for cross-tenant visibility |
| Bulk actions | Multi-select + floating action bar to update many tickets at once |
| SLA tracking | Resolution windows per contract, visual badges (on time / at risk / overdue / met) |
| Audit log | Every mutation is recorded, immutable, cross-tenant searchable |
| Invite links | Send a single URL that an unauthenticated visitor can use to either open a ticket or create their account |
| Magic-link invites | Invite a known email; they receive a 15-minute one-time link |
| Excel export | Tickets and contracts exported as `.xlsx` |
| Daily digest | Cron-triggered email summarizing every open ticket per organization |
| Feedback widget | Built-in user feedback (bug / improvement) routed to super-admins |
| Real-time | Server-Sent Events keep open tabs in sync without polling |
| Rate limiting | Sliding-window in-app limits on `/api/auth/*` and `/api/*` |
| Health check | `/api/health` endpoint for uptime monitoring |

### Security baked in

- Strict CSP, HSTS, X-Frame-Options, X-Content-Type-Options headers
- CSRF protection via Better Auth
- `httpOnly` + `secure` session cookies
- MIME + magic-bytes validation on every upload (defeats double-extension
  tricks)
- Path-traversal protection on file downloads
- Org-ownership check on every resource (no cross-tenant data leak)
- Optional ClamAV antivirus on uploads (via `docker-compose.clamav.yml`)
- Audit log on every mutation (append-only, no UI to delete)
- See [`docs/SECURITY.md`](./docs/SECURITY.md) for the full threat model
  and checklist.

---

## Stack

| Layer | Tech | Version |
|---|---|---|
| Framework | [Next.js](https://nextjs.org) | 16.2 (App Router, Turbopack build, standalone output) |
| Runtime | React | 19.2 |
| Language | TypeScript | 5.x (strict mode) |
| ORM | [Drizzle](https://orm.drizzle.team) | 0.45 |
| Database | PostgreSQL | 15+ |
| Auth | [Better Auth](https://better-auth.com) | 1.5 (organization + magicLink plugins) |
| UI | Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com), Radix, lucide-react, recharts | latest |
| Forms | react-hook-form + [Zod 4](https://zod.dev) | latest |
| Email | [Resend](https://resend.com) + React Email | 6.x |
| Excel export | exceljs | 4.x |
| Tests | [Vitest](https://vitest.dev) 4 + [Playwright](https://playwright.dev) 1 | latest |
| Process manager | PM2 (optional, for VPS) | latest |
| Reverse proxy | Nginx + Let's Encrypt SSL (optional) | latest |
| i18n | [next-intl](https://next-intl.dev) | 4.x |
| Antivirus | ClamAV (optional, via Docker) | latest |

---

## Quickstart

### 1. Prerequisites

You need:

- **Node.js 20+** (`node --version`)
- **PostgreSQL 15+** (local install or Docker)
- A **Resend** account if you want outgoing emails (optional in dev)

### 2. Clone and install

```bash
git clone <repo-url> pulseo
cd pulseo
npm install
```

### 3. Start PostgreSQL

If you don't have a local Postgres, spin up one with Docker:

```bash
docker run --name pulseo-pg \
  -e POSTGRES_USER=pulseo \
  -e POSTGRES_PASSWORD=pulseo \
  -e POSTGRES_DB=pulseo \
  -p 5432:5432 \
  -d postgres:16
```

### 4. Configure environment

```bash
cp .env.example .env
```

Fill in at minimum:

```env
DATABASE_URL=postgresql://pulseo:pulseo@localhost:5432/pulseo
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The rest of `.env.example` is documented inline and ships with safe defaults.
See [Branding](#branding) for the variables you'll want to customize before
going live.

### 5. Run the migrations

```bash
npm run db:migrate
```

This applies every SQL file under `src/lib/db/migrations/` then under
`src/modules/projects/schema/migrations/`. The script is idempotent, you
can re-run it safely.

### 6. Start the dev server

```bash
npm run dev
# http://localhost:3000
```

### 7. Create the first admin

Pulseo never auto-creates accounts. Sign up the first user via the Better
Auth API (the dev server must be running):

```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"YourLongPassword123!","name":"Admin"}'
```

### 8. Seed demo data

```bash
npm run db:seed
```

This promotes your account to **super-admin** and creates two demo
organizations (`Acme Corp` + `Demo Org`) so you can immediately see the
multi-tenant flows in action.

### 9. Sign in

Visit `http://localhost:3000/login`, enter your credentials, and you're in.

---

## Branding

**The most important file when you fork Pulseo: `src/config/app-config.ts`.**

Every tenant-facing string (app name, company name, contact email, primary
color, etc.) is read from there. The file itself reads from `NEXT_PUBLIC_*`
environment variables. **To rebrand, you only edit `.env`, never the code.**

### Minimum variables to override in production

```env
NEXT_PUBLIC_APP_NAME=Acme Portal
NEXT_PUBLIC_APP_URL=https://portal.acme.com
NEXT_PUBLIC_COMPANY_NAME=Acme Corp
NEXT_PUBLIC_COMPANY_SHORT=Acme
NEXT_PUBLIC_COMPANY_DESCRIPTION=The Acme client workspace.
NEXT_PUBLIC_CONTACT_EMAIL=support@acme.com
NEXT_PUBLIC_DPO_EMAIL=privacy@acme.com
NEXT_PUBLIC_PRIMARY_COLOR=#FF5722
NEXT_PUBLIC_SECONDARY_COLOR=#D84315
```

Full reference and additional optional variables are in [`.env.example`](./.env.example).

### What you still need to customize manually

The branding config covers strings and colors. You'll also want to:

- Replace `public/logo-*.svg` and `public/favicon.ico` with your own assets.
- Tailor the legal pages under `src/app/(legal)/` (mentions légales,
  politique de confidentialité). The shipped templates are
  RGPD/LCEN-shaped placeholders, not legal advice for your jurisdiction.
- Adapt the email templates under `src/lib/email/` if you want a
  different tone or layout (the structure already pulls all branding
  from `appConfig`).

---

## Commands cheatsheet

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (webpack, port 3000) |
| `npm run build` | Production build (Turbopack, standalone output) |
| `npm run start` | Start the production server |
| `npm run lint` | ESLint on `src/` (Next 16 removed `next lint`) |
| `npm run type-check` | `tsc --noEmit` |
| `npm run test` | Vitest (watch mode) |
| `npm run test:coverage` | Vitest with coverage |
| `npm run test:e2e` | Playwright end-to-end |
| `npm run db:generate` | Generate a Drizzle migration |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Drizzle Studio (visual DB explorer) |
| `npm run db:seed` | Seed demo data |

---

## Architecture overview

```
src/
├── app/                       # Next.js App Router
│   ├── (auth)/                # /login, /invite/*
│   ├── (portal)/              # Authenticated app (clients, admin, me)
│   ├── (legal)/               # Legal templates (mentions, privacy)
│   ├── api/                   # auth, files, export, sse, cron, health
│   ├── layout.tsx             # Root layout, theme, metadata
│   ├── opengraph-image.tsx    # Generated OG image
│   └── globals.css            # Tailwind v4 + premium classes
├── actions/                   # Server Actions
├── components/                # UI components (shadcn primitives + domain)
├── config/
│   └── app-config.ts          # Branding source of truth (read this)
├── lib/
│   ├── auth/                  # Better Auth + RBAC + roles
│   ├── db/                    # Drizzle schema, migrations, client
│   ├── email/                 # Templates and Resend sender
│   ├── validations/           # Zod schemas
│   ├── utils/                 # audit, file-validation
│   ├── logger.ts              # Structured logger
│   ├── rate-limit.ts          # Sliding-window limiter
│   └── sla.ts                 # SLA computation
├── modules/
│   └── projects/              # Self-contained projects feature
├── proxy.ts                   # Edge middleware (auth gate + rate limit)
└── types/                     # Shared TypeScript types
```

### Key patterns

- **Server Components by default.** `'use client'` only when state or
  interaction is mandatory.
- **Server Actions follow a strict order** for every sensitive operation:
  Zod validation → session check → role check → ownership check →
  business logic → audit log → `revalidatePath`.
- **Parameterized Drizzle queries everywhere.** No raw SQL interpolation.
- **RBAC** via `requireRole(orgId, userId, minRole)` in every sensitive
  Server Action.
- **Audit logs** on every mutation through the `createAuditLog` helper.

The full architecture (data model, request flows, RLS strategy, deploy
topology) lives in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

---

## Testing

```bash
npm run test              # Vitest watch mode
npx vitest run            # single run (CI)
npm run test:coverage     # with coverage
npm run test:e2e          # Playwright
```

160+ unit tests already cover:

- RBAC hierarchy (`src/lib/auth/roles.ts`)
- File validation (`src/lib/utils/file-validation.ts`)
- Rate limiter (`src/lib/rate-limit.ts`)
- SLA computation (`src/lib/sla.ts`)
- Logger (`src/lib/logger.ts`)
- Every Zod schema (`src/lib/validations/*.ts`)

GitHub Actions runs `tsc --noEmit`, `eslint`, `vitest run`, and the
production build on every PR (see `.github/workflows/ci.yml`).

---

## Deployment

Pulseo deploys cleanly on:

### Generic Linux VPS (Nginx + PM2)

The repo ships everything you need:

- `next.config.ts` with `output: 'standalone'`
- `ecosystem.config.js` for PM2 cluster mode (1 instance to avoid email
  duplication)
- `docker-compose.clamav.yml` for optional antivirus
- `.github/workflows/ci.yml` for CI

Full step-by-step in [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md):
provisioning, Nginx config, Let's Encrypt SSL, Git push hook for
auto-deploy, daily-digest cron, UFW firewall, fail2ban.

### Vercel

Out-of-the-box. Drop the env vars in the dashboard, link a managed
Postgres (Neon, Supabase, Vercel Postgres), deploy.

### Container hosts (Railway, Fly, Render)

Build the standalone output and run `node .next/standalone/server.js`.
Bring your own managed Postgres.

### Docker

```dockerfile
# Sketch (adapt to your registry / base image)
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## Documentation map

| File | What's inside |
|---|---|
| [`README.md`](./README.md) | This file |
| [`AGENTS.md`](./AGENTS.md) | LLM-oriented briefing (rules, file map, gotchas) |
| [`CLAUDE.md`](./CLAUDE.md) | Quick rules for Claude / Anthropic-based agents |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Workflow, conventions, PR checklist |
| [`CHANGELOG.md`](./CHANGELOG.md) | Version history (Keep a Changelog format) |
| [`LICENSE`](./LICENSE) | MIT |
| [`docs/SPEC.md`](./docs/SPEC.md) | Product specification |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Detailed architecture |
| [`docs/DATABASE.md`](./docs/DATABASE.md) | Database schema |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | Security checklist and threat model |
| [`docs/BETTER-AUTH-GUIDE.md`](./docs/BETTER-AUTH-GUIDE.md) | Auth setup |
| [`docs/DRIZZLE-GUIDE.md`](./docs/DRIZZLE-GUIDE.md) | Drizzle patterns |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | VPS deployment walkthrough |
| [`docs/GOTCHAS.md`](./docs/GOTCHAS.md) | Known pitfalls and fixes (living document) |
| [`docs/ROLE-RESOLUTION.md`](./docs/ROLE-RESOLUTION.md) | How effective role is computed |

---

## FAQ

### Why self-hosted instead of SaaS?

Because client data (tickets, contracts, documents, attachments) often
falls under contractual or regulatory locality requirements (RGPD,
HDS, sector-specific). Self-hosting lets you keep everything on
infrastructure you control, in the region you choose.

### Can I use SQLite or MySQL?

Not out of the box. Pulseo relies on PostgreSQL-specific features:
advisory locks (`pg_advisory_xact_lock`) for race-free ticket numbering,
`jsonb` columns, partial indexes. Porting to another database would be a
significant effort.

### Does it work without Resend?

Yes, in development. If `RESEND_API_KEY` is unset, outgoing emails are
logged to stdout. The magic-link sign-in flow still works because the
link is printed to the console.

In production, Resend (or any SMTP-compatible alternative wired through
the same `sendEmail` helper) is required for magic links, ticket
notifications, and the daily digest.

### Is there a public REST or GraphQL API?

No. Pulseo exposes Server Actions for the web app and a small set of
internal API routes (auth, file I/O, SSE, cron, health). A public REST
or GraphQL surface is intentionally out of scope for the initial
release.

### How do I add a custom feature?

Pulseo encourages you to fork. The `src/modules/projects/` directory is
the reference for **how to add a self-contained module**: separate
Drizzle config, separate migrations, its own Server Actions, its own
components, exposed to the core app via a single `server.ts` barrel.
Mirror that pattern for your own module.

### How do I rebrand without forking?

You don't need to fork to rebrand. Edit your `.env`, replace the assets
under `public/`, restart the app. The legal pages and email templates
will all reflect the new branding because they read from `app-config.ts`.

### How do I get help?

- Open a [GitHub issue](../../issues) for bugs or feature requests.
- Read [`AGENTS.md`](./AGENTS.md) if you're an LLM agent working on the
  codebase.
- Read [`docs/GOTCHAS.md`](./docs/GOTCHAS.md) for known pitfalls.

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). TL;DR:

- Conventional Commits
- Branches off `develop` (`feat/*`, `fix/*`, `hotfix/*`)
- PR against `develop`, never `main`
- `tsc --noEmit` + `eslint` + `vitest run` + `npm run build` must all
  pass locally before pushing

---

## License

[MIT](./LICENSE). Use it, fork it, ship it. Attribution appreciated but
not required.
