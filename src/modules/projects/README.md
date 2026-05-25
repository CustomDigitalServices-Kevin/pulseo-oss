# Module Projets

Module Pulseo permettant la gestion de projets client (CDC, devis, facture,
recette, livrables, previews Office/Power Platform, liens GitHub, annotations
transformables en tickets).

**Phase courante** : P1 + P2 + P3 LIVE prod. **P4a+b+c+d complets en local**
sur branche `feat/projects-p4a-deliverables` (8 commits, non poussé) :
- **P4a** : schema `proj_deliverables` + `proj_preview_jobs` + UNIQUE partial
  index `is_latest`, StorageAdapter interface + LocalDiskAdapter streaming,
  Zod validations, Server Actions (list/promote/softDelete/restore), API
  routes streaming upload/download + tests IDOR + fail-closed
- **P4b** : UI tab Livrables + PDF/Image viewers + route preview RSC
- **P4c** : clamav sidecar Docker + worker scan-virus + `virus_scan_status`
  default flip → `'pending'` + fail-closed `'clean'` only + backfill
  `'skipped'` → `'clean'` pour rows P2 existantes
- **P4d** : safe-unzip helper (yauzl) avec guards zip-slip + zip-bomb +
  entries limit (prep processors P5/P6/P7/P8)

**Prochaine phase** : P5 Preview Power Automate (FlowDiagramViewer React Flow).

**Spec complète** : [`docs/superpowers/specs/2026-04-19-projects-module.md`](../../../docs/superpowers/specs/2026-04-19-projects-module.md).

## Principe : cloisonnement strict

Le module est entièrement isolé sous `src/modules/projects/` et peut être
désactivé ou supprimé sans impact sur le cœur de Pulseo. Les règles :

1. Schéma PostgreSQL dédié `projects` (toutes les tables préfixées `proj_*`).
2. Feature flag `ENABLE_PROJECTS_MODULE` : off ⇒ routes 404, worker exit 0,
   aucun chunk module dans le bundle client.
3. Aucune modification du code coeur — la liaison ticket↔projet passe par
   `projects.proj_ticket_links` (FK read-only vers `public.tickets`).
4. API publique unique : `@/modules/projects` (re-export de composants et
   types autorisés à sortir du module). Les sous-chemins sont bloqués par
   ESLint `no-restricted-imports` (`eslint.config.mjs`).
5. Exception ESLint pour `@/modules/projects/feature-flag` (entrée
   server-only) et les shims `src/app/**/projects/**` (Next RSC re-export).

## Structure

```
src/modules/projects/
├── actions/            Server Actions CRUD (list/create/update/softDelete/restore)
├── components/         Composants UI (list view, form, menu-link)
├── feature-flag.ts     isProjectsEnabled() — seul import autorisé : process.env
├── feature-flag.test.ts
├── index.ts            API publique (barrel)
├── lib/
│   ├── audit.ts        writeProjectAuditLog + redactSecrets
│   ├── permissions.ts  hasProjectsAccess — 3-path (superadmin / org role / team grant)
│   └── validations/    Zod schemas (create/update/listProjects)
├── routes/             Pages RSC (org-project-list/new/detail)
├── schema/
│   ├── tables.ts       pgSchema('projects') + proj_projects + proj_audit_logs
│   ├── migrate.ts      Migrator tsx (CREATE SCHEMA IF NOT EXISTS + drizzle-orm migrate)
│   └── migrations/     SQL générés (drizzle-kit)
├── test/
│   └── db-test.ts      PGlite helper (core + module migrations) + fixtures
└── workers/
    └── index.ts        graphile-worker skeleton (exit 0 si flag off)
```

## Scripts npm

| Script | Usage |
|---|---|
| `db:generate:projects` | `drizzle-kit generate --config drizzle.projects.config.ts` — génère migration SQL module dans `src/modules/projects/schema/migrations/` |
| `db:migrate:projects` | `tsx src/modules/projects/schema/migrate.ts` — applique migrations (CREATE SCHEMA + ordre) |
| `test:projects` | `vitest run src/modules/projects` — suite tests module isolée |

## Désactivation (flag off)

```bash
export ENABLE_PROJECTS_MODULE=false
npm run build && npm run start
```

Effets :
- Routes `/clients/[slug]/projects/*` renvoient 404 (guard `isProjectsEnabled()` dans les routes RSC).
- Lien "Projets" absent de la sidebar (guard `projectsEnabled` prop server-evaluated).
- Worker `pulseo-worker` (PM2) exit 0 au démarrage (`stop_exit_codes: [0]`).
- Aucun chunk module dans `.next/static/chunks/` (vérifier avec grep).

## Suppression complète

Séquence sûre pour retirer entièrement le module sans casser Pulseo :

1. **DB** :
   ```sql
   DROP SCHEMA projects CASCADE;
   DROP SCHEMA graphile_worker CASCADE;  -- utilisé uniquement par le module
   ```
   Si clamav tourne : `docker compose -f docker-compose.clamav.yml down -v`
2. **Code module** :
   ```bash
   rm -rf src/modules/projects/
   ```
3. **Layout** : retirer l'import `isProjectsEnabled` et la prop
   `projectsEnabled` passée à `<SidebarTree>` dans `src/app/(portal)/layout.tsx`.
4. **Sidebar** : retirer la prop `projectsEnabled`, le `dynamic(() => import('@/modules/projects'))`, le calcul `currentOrgRole`, et le bloc `canSeeProjects` dans `src/components/layout/sidebar-tree.tsx`.
5. **Shims Next** :
   ```bash
   rm -rf src/app/(portal)/clients/[slug]/projects/
   ```
6. **Worker PM2** : retirer l'app `pulseo-worker` de `ecosystem.config.js`.
7. **ESLint** : retirer le block `no-restricted-imports` ciblant `@/modules/projects/**` dans `eslint.config.mjs`.
8. **Dépendances** (si non utilisées ailleurs) :
   ```bash
   npm uninstall graphile-worker @electric-sql/pglite uuid
   ```
9. **Scripts npm** : retirer `db:generate:projects`, `db:migrate:projects`, `test:projects` de `package.json`.
10. **Config** : retirer `drizzle.projects.config.ts`.

Le cœur de Pulseo (auth, tickets, documents, contrats, dashboards, groups+teams) continue de fonctionner sans aucune modification.

## Sécurité / RBAC

### `hasProjectsAccess(userId, orgId)`

3 paths OR (SELECT EXISTS) :
- `users.is_superadmin = true` (plateforme)
- `organization_members.role IN ('admin', 'gestionnaire')` pour `(userId, orgId)`
- `team_members` ∩ `team_organization_grants` pour l'org (grant existant, **quel que soit le role du grant** — un viewer dans une équipe avec grant conserve l'accès module ; le gating fin se fait au niveau des Server Actions qui filtrent ensuite sur le role métier si nécessaire)

Les `viewer` n'ont pas accès au module. La sidebar masque le lien (gate UI),
les routes renvoient 404 (gate serveur), les Server Actions rejettent la
mutation (gate action).

### Pattern IDOR

Tout accès à un projet vérifie deux choses :

```ts
// 1. Accès au projet
const project = await loadProjectForWrite(projectId);
if (!project) return notFound();

// 2. Session a l'accès à l'org du projet
const allowed = await hasProjectsAccess(session.userId, project.organization_id);
if (!allowed) return notFound();

// 3. Si un orgId vient de la route, vérifier cohérence
if (routeOrgId && project.organization_id !== routeOrgId) return notFound();
```

Implémenté dans `actions/projects.ts` via `requireAccess` + `loadProjectForWrite`.

### Audit log

`writeProjectAuditLog(event, userId, targetId, payload)` insère dans
`projects.proj_audit_logs`. Le payload traverse `redactSecrets` (deep walk)
qui nullifie les clés sensibles : `token`, `password`, `api_key`, `secret`,
`encrypted_token`. Utilisé sur toutes les mutations CRUD.

## Tests

- `feature-flag.test.ts` : 11 tests (on/off, falsy values, env mutation)
- `lib/permissions.test.ts` : 8 tests (3 paths + IDOR cross-org)
- `lib/audit.test.ts` : 4 tests (write + redactSecrets deep walk)
- `lib/validations/*.test.ts` : 18 tests (edge cases schema Zod)
- `actions/projects.test.ts` : 12 tests (list / create / update / softDelete / restore)

Total : **162 tests** (P1 49 + P2 19 + P3 + P4a 62 + P4c clamav 6 + P4d safe-unzip 20). Run : `npm run test:projects`.

## Déploiement P4c (clamav sidecar)

**Ordre obligatoire** — si la migration est appliquée avant que clamav + worker
soient up, toutes les nouvelles uploads insèrent `virus_scan_status='pending'`
mais aucun worker ne pick up → downloads 403 fail-closed jusqu'à ce que le
worker rattrape.

```bash
# 1. Démarre clamav sur le VPS (attendre healthcheck ~60s pour freshclam initial)
docker compose -f docker-compose.clamav.yml up -d
docker compose -f docker-compose.clamav.yml logs -f clamav  # attendre "OK"

# 2. .env.production : ajouter CLAMAV_HOST/PORT/TIMEOUT (cf .env.production.example)

# 3. Restart worker pour qu'il prenne les nouvelles vars et enregistre scan-virus handler
pm2 restart pulseo-worker --update-env

# 4. Vérifier le ping clamd dans les logs worker :
pm2 logs pulseo-worker | grep "clamd ping OK"

# 5. Apply migration (backfille 'skipped' → 'clean' pour rows P2 existantes)
cd /opt/pulseo && npm run db:migrate:projects

# 6. Restart app
pm2 restart pulseo --update-env

# 7. Test EICAR (optionnel mais recommandé) :
# Upload https://secure.eicar.org/eicar.com (ou /eicar.com.txt)
# Vérifier : row virus_scan_status='infected' après quelques secondes + fichier en /opt/pulseo-storage/quarantine/
```

**Désactivation runtime** : `pm2 stop pulseo-worker` — les nouvelles rows
`proj_scan_jobs` s'accumulent en `pending`, aucun download ne fonctionne sur
nouveaux uploads, mais le reste de l'app tourne normalement.

## Prochaines phases

- **P2** — ~~Documents~~ LIVE
- **P3** — ~~Recette~~ LIVE
- **P4a+b+c+d** — ~~Livrables fichier~~ COMPLETS en local
- **P5** — Preview Power Automate : React Flow diagram (safe-unzip déjà prêt)
- **P6** — Preview MSAPP : wireframe SVG
- **P7** — Preview PBIX : wireframe SVG
- **P8** — Preview Solutions/Packages : tree + drill-down
- **P9** — GitHub repos : lien + ZIP download
- **P10** — Annotation → ticket/recette : mode annotation + liens
