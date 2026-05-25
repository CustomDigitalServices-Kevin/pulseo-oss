/**
 * API publique du module Projets.
 *
 * CONTRAINTE CLOISONNEMENT : tout consumer en dehors de `src/modules/projects/`
 * DOIT importer depuis `@/modules/projects` uniquement (pas de sous-chemin).
 * L'ESLint rule `no-restricted-imports` enforce cette boundary (voir P5.1).
 *
 * Exception : les shims `src/app/(portal)/clients/[slug]/projects/*` peuvent
 * importer `@/modules/projects/routes/*` pour le re-export Next RSC.
 */
export { ProjectsMenuItem } from "./components/menu-link";
export {
  ProjectSelectField,
  type ProjectSelectItem,
} from "./components/project-select-field";
// NB : les handlers API serveur-only (ex : `handleDocumentDownload`) ne
// DOIVENT PAS être ré-exportés depuis ce barrel. Le barrel est importé côté
// client (ProjectsMenuItem via dynamic) → webpack tirerait `pg`/`fs` dans
// le bundle browser. Les shims `src/app/api/projects/**/route.ts` doivent
// importer directement depuis `@/modules/projects/api/...`.
