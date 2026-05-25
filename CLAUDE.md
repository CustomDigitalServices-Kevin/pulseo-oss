# Pulseo — multi-tenant client portal

Pulseo is a self-hosted, brandable client portal: tickets, contracts,
documents, dashboards, RBAC, magic-link sign-in, audit logs.

Stack: Next.js 16.2 App Router, React 19.2, TypeScript strict, Drizzle ORM
0.45, PostgreSQL, Better Auth 1.5, Tailwind v4 + shadcn/ui, Zod 4.

## Essential commands

- `npm run dev` — dev server (port 3000, webpack)
- `npm run build` — production build (Turbopack, standalone output)
- `npm run db:generate` — generate a Drizzle migration
- `npm run db:migrate` — apply migrations
- `npm run db:seed` — seed (Acme Corp + Demo Org)
- `npm run db:studio` — Drizzle Studio
- `npm run lint` — ESLint
- `npm run type-check` — `tsc --noEmit`
- `npm run test` — Vitest
- `npm run test:coverage` — Vitest coverage
- `npm run test:e2e` — Playwright
- `npx @better-auth/cli generate` — generate the Better Auth schema
- `npx @better-auth/cli migrate` — migrate Better Auth tables

## Git workflow

- Main branch: `main` (production)
- Integration: `develop`
- Features: `feat/<name>`, fixes: `fix/<name>`, hotfixes: `hotfix/<name>`
- Conventional Commits (`feat:`, `fix:`, `security:`, `refactor:`, `test:`,
  `docs:`)
- Never push directly to `main` — always merge from `develop`

## TypeScript rules

- `strict: true` everywhere. No `any`. No `as` without a comment.
- Server Components by default. `'use client'` only when state or
  interaction is mandatory.
- Every Server Action: Zod validation → auth check → org ownership check →
  business logic → audit log → `revalidatePath`.
- Parameterized Drizzle queries only. Never interpolated raw SQL.
- Never leak stack traces to end users.
- ESM imports, destructured.

## Anti-laziness rules

- Always implement end-to-end. No stubs, placeholders, `TODO`s or
  "we'll do it later" comments.
- "Create X" means: create the file, write all the functional code, types,
  validation, tests, and verify it compiles.
- If a file depends on something that does not exist yet, create both.
- After each file: `npx tsc --noEmit` to verify it compiles.
- After each feature: `npm run test`.

## Error-handling rules

- Always research the root cause (official docs, GitHub issues, Stack
  Overflow) before patching an error.
- Never patch by trial and error.
- Never break existing behavior to fix a bug. If the fix risks
  regressions, write a test that locks the existing behavior first.
- Document non-trivial fixes in `docs/GOTCHAS.md`: error, cause,
  solution, source.

## Branding

The user-facing strings that depend on the deployment (app name, company
name, contact email, primary color, etc.) live in
`src/config/app-config.ts`. The single source of truth is the
`NEXT_PUBLIC_*` env vars described in `env.example`. Never hardcode these
values in components, emails or legal pages.

## Architecture (details in `docs/`)

- `docs/SPEC.md` — product spec
- `docs/ARCHITECTURE.md` — stack, roles, routing
- `docs/DATABASE.md` — complete Drizzle schema, relations, indexes
- `docs/SECURITY.md` — security checklist, headers, CSRF, upload, rate
  limiting
- `docs/BETTER-AUTH-GUIDE.md` — Better Auth setup with the organization +
  magicLink plugins
- `docs/DRIZZLE-GUIDE.md` — Drizzle patterns, migrations, gotchas
- `docs/DEPLOYMENT.md` — generic Linux VPS deploy (Nginx, PM2, SSL, Git
  hooks)
- `docs/GOTCHAS.md` — known pitfalls (living document)

## Compaction

When the context is compacted, always keep:
- the list of files modified in this session
- the test commands to run
- the current task and any unresolved errors
