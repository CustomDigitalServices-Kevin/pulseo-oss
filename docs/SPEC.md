# Pulseo — Product spec

> Self-hosted, multi-tenant client portal. Tickets, contracts, documents,
> dashboards, RBAC, magic-link sign-in, audit logs.

This document captures the product surface area. Implementation details
live in `ARCHITECTURE.md` and `DATABASE.md`.

---

## 1. Audience

- **Platform operator** — the organization deploying Pulseo (typically a
  consultancy, agency, MSP or product team) to serve its own customers.
- **Client organizations** — the tenants the operator manages. Each tenant
  is fully isolated.
- **End users** — members of a client organization, with one of three roles
  (`viewer`, `gestionnaire`, `admin`).

---

## 2. Roles

| Role | Capabilities |
|---|---|
| `viewer` | Read tickets/contracts/documents in their org; create tickets and comments |
| `gestionnaire` | Everything `viewer` can, plus update ticket status, manage contracts, upload documents |
| `admin` | Everything `gestionnaire` can, plus member management within the org |
| platform super-admin | Cross-tenant visibility, member management across orgs, audit-log access |

Hierarchy is enforced via `requireRole(orgId, userId, minRole)` in every
sensitive Server Action. Promotions are bounded — a `gestionnaire` cannot
promote another user to `admin`.

---

## 3. Core features

### Tickets
- Number per organization (`tickets.number` auto-increments per org)
- Fields: title, description, status (`new`, `in_progress`, `waiting_client`,
  `resolved`, `closed`), priority (`low`, `medium`, `high`, `critical`),
  category, tags (max 10, normalized lowercase)
- Comments with attachments (MIME + magic-bytes validation)
- SLA tracking per contract: `sla_response_hours`, `sla_resolution_hours`,
  visual status badge (`on_time` / `at_risk` / `overdue` / `met`)
- Bulk actions: multi-select + floating action bar (status update,
  priority change, close)
- Email notifications on create / update / status change / close / comment

### Contracts
- Linked to one organization
- Track quota, consumed hours, validity window, SLA windows
- Excel export

### Documents
- Per organization, uploaded by `gestionnaire`+
- Preview (PDF, images) + download
- Optional ClamAV scan via `docker-compose.clamav.yml`

### Dashboards
- KPIs: open tickets, contracts active, SLA at risk, recent activity
- Recharts client-side rendering

### Invitations
- **Magic link** — one-time link sent by email, valid 15 min
- **Invite link** — admin-generated guest URL, optionally restricted to a
  specific email, valid until revoked or used
- Magic-link sign-in remains the default user-facing flow even after the
  account is enrolled

### Audit logs
- Every mutation goes through `createAuditLog`
- Immutable append-only (no UI to delete)
- Visible to platform super-admins for cross-tenant compliance review

---

## 4. Non-functional requirements

- **Multi-tenant isolation** — every query filters by `organization_id`. No
  cross-org data leak.
- **Security** — strict CSP/HSTS headers, in-app rate limiting (auth: 5/15m,
  API: 100/min), MIME + magic-bytes validation on uploads, CSRF via Better
  Auth, no stack traces leaked to end users.
- **Performance** — Server Components by default, SSE for real-time updates
  instead of long polling, indexes on every frequently-filtered column.
- **Internationalization** — French + English UI shipped, locale persisted
  per user.
- **Theme** — light, dark, system. Persisted via `next-themes`.
- **Accessibility** — keyboard navigable, command palette under `Ctrl/⌘ K`.
- **Branding** — every tenant-facing string sourced from `app-config.ts`
  via `NEXT_PUBLIC_*` env vars.

---

## 5. Out of scope (initial release)

- White-label public marketing pages
- Self-service signup (every account is invited by an admin or
  super-admin)
- Public REST API (a JSON Web API is available only for the cron worker
  endpoints)
- SSO / SAML — only email magic link and email/password are supported
- Mobile apps — the portal is responsive but no native client

---

## 6. Definitions

- **Organization** (a.k.a. *tenant*, *client*) — a customer-facing workspace
  with its own users, tickets, contracts and documents.
- **Member** — a user enrolled in an organization with one of the three
  roles.
- **Super-admin** — a user flagged `is_superadmin = true` on the `users`
  table. Lives outside any single organization and has cross-tenant
  visibility.
- **Responsible** — an external email address (no Pulseo account)
  configured at the org level to receive certain notifications (new member
  created, etc.).
