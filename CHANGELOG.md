# Changelog

All notable changes to Pulseo are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Initial open-source release

- Multi-tenant client portal with tickets, contracts, documents and
  dashboards
- RBAC with three roles (`viewer`, `gestionnaire`, `admin`) plus
  platform-level super-admin
- Magic-link sign-in and invite-link flow via Better Auth
- SLA tracking with visual status badges
- Bulk ticket actions and tag system
- Real-time updates over Server-Sent Events
- Command palette (`⌘K` / `Ctrl+K`) for navigation
- Light / dark / system theme persisted via `next-themes`
- Audit logs on every mutation
- Excel export of tickets and contracts
- Email notifications via Resend
- Rate limiting on `/api/auth/*` (5/15m) and `/api/*` (100/min)
- Centralized branding through `src/config/app-config.ts` and
  `NEXT_PUBLIC_*` env vars
- GitHub Actions CI: type check, lint, tests, build
- 160+ unit tests (Vitest) covering RBAC, file validation, rate limiter,
  SLA, logger and Zod schemas
- Playwright end-to-end tests scaffold
- Production-grade deployment template: PM2 cluster config, Nginx + Let's
  Encrypt, Git push hook
