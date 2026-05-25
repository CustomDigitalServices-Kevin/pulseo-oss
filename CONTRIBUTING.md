# Contributing to Pulseo

Thanks for considering a contribution to Pulseo! This guide walks through the
workflow, code conventions, and checks expected before opening a pull request.

---

## Code of conduct

By participating, you agree to keep discussion respectful and on-topic.
Harassment, discrimination, or personal attacks will not be tolerated.

---

## Workflow

### Branches
- **`main`** — release branch. Never push directly.
- **`develop`** — integration branch. Features land here first.
- **`feat/<name>`** — new feature
- **`fix/<name>`** — bug fix
- **`hotfix/<name>`** — urgent production fix
- **`refactor/<name>`** — refactor with no behavior change
- **`docs/<name>`** — documentation only

### Pull request lifecycle

1. Branch off `develop`: `git checkout -b feat/my-feature develop`
2. Implement the change (see [Code standards](#code-standards))
3. Run the local checks:
   ```bash
   npx tsc --noEmit
   npx eslint src/
   npx vitest run
   npm run build
   ```
4. Commit using [Conventional Commits](#conventional-commits)
5. Push and open a PR against `develop`
6. Wait for CI to pass
7. Squash & merge

---

## Conventional Commits

Format: `<type>(<scope>): <description>`

| Type | When to use |
|---|---|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `security` | Vulnerability fix or hardening |
| `refactor` | Refactor with no behavior change |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Maintenance (deps, config, ...) |
| `ci` | CI workflow changes |

**Examples:**
```
feat(tickets): add bulk status update with floating action bar
fix(auth): prevent session token leak in error response
security: add rate limiting on /api/auth/sign-in
refactor(sla): extract resolution due computation to lib/sla.ts
test(rate-limit): cover sliding window edge cases
```

**Rules:**
- Description in English, imperative mood ("add", not "adds" / "added")
- First line at most 72 chars
- Optional body explains the **why**, not the what
- No trailing period

---

## Code standards

### TypeScript (non-negotiable)
- `strict: true` everywhere
- **Zero `any`**, zero `as` unless documented with a comment
- Destructured imports, ESM only
- Exported functions: explicit return type for public APIs

### React / Next.js
- **Server Components by default**. `'use client'` only when state or
  interaction is required
- No client-side fetch when the data can be loaded on the server
- `Promise<>` for `params` and `searchParams` (Next 15+/16)

### Server Actions
Every Server Action follows this order:
1. **Zod validation** of inputs
2. **Session check** (`requireSession()`)
3. **Role check** (`requireRole(orgId, userId, minRole)`)
4. **Ownership check** (resource belongs to org)
5. **Business logic**
6. **Audit log** (`createAuditLog`)
7. **`revalidatePath`**
8. **Return** an `ActionResult<T>` (`{ success, data?, error? }`)

### Drizzle
- Parameterized queries only — **never** interpolated raw SQL
- Index every `foreignKey` and frequently filtered column
- Explicit `onDelete` on every `foreignKey`

### UI
- Tailwind v4 + premium classes in `globals.css`
- Loading states use the skeleton components in
  `src/components/common/loading-skeletons.tsx`
- Empty states use the `<EmptyState />` component
- Never leak stack traces to end users

### Branding
- Never hardcode the company name, app URL, primary color, or contact email.
  Read them from `@/config/app-config` instead. The single source of truth is
  the `NEXT_PUBLIC_*` env vars documented in `env.example`.

---

## Tests

### Required for
- Every new pure utility (helpers, validations)
- Every new Zod schema (valid + edge cases)
- Every non-trivial business rule (SLA, rate limiting, RBAC, ...)

### Recommended for
- Server actions (mock Drizzle when feasible)
- Complex React components (`@testing-library/react`)

### Location
Co-locate tests next to the file under test: `foo.ts` → `foo.test.ts`.

### Running
```bash
npm run test           # watch mode
npx vitest run         # single run
npm run test:coverage  # with coverage
```

---

## Fixing errors

Before attempting a fix:
1. **Always research the root cause** (official docs, GitHub issues, Stack
   Overflow) before changing code
2. **Never** patch by trial and error
3. **Never break existing behavior** to fix something else. If the fix risks
   regressions, write a test that locks the current behavior **first**
4. **Document** non-trivial fixes in `docs/GOTCHAS.md`: error, cause,
   solution, source

---

## PR checklist

- [ ] `npx tsc --noEmit` passes
- [ ] `npx eslint src/` passes
- [ ] `npx vitest run` passes
- [ ] `npm run build` succeeds
- [ ] Commits follow Conventional Commits
- [ ] PR description explains the **why**
- [ ] Tests added for new critical functions
- [ ] `CHANGELOG.md` updated for user-visible changes
- [ ] `docs/GOTCHAS.md` updated for non-trivial fixes
- [ ] No secret committed (`.env`, keys, tokens)

---

## Never

- Push directly to `main`
- `git push --force` on a shared branch
- Commit `--no-verify` without explicit authorization
- Commit `.env` or any secret
- Leave a `TODO` or `FIXME` without an issue link
- Export a function with no return-type annotation
- Show stack traces to end users
- Interpolate raw SQL (always go through Drizzle)
- Introduce `any` without a justifying comment
