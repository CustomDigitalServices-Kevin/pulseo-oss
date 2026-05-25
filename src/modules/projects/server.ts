/**
 * API SERVER-ONLY du module Projets.
 *
 * Pendant `index.ts` (client-safe barrel : composants client + types). Ce
 * fichier expose les Server Actions du module pour des consumers core qui
 * ont besoin de charger des données projets côté RSC (ex. page server
 * `/clients/[slug]/tickets/new` pour pré-charger la liste des projets à
 * afficher dans le sélecteur du form ticket).
 *
 * CONTRAINTES :
 *  - JAMAIS importer ce fichier depuis un Client Component. Toutes les
 *    fonctions exposées sont `'use server'` ou des helpers serveur.
 *  - L'ESLint rule `no-restricted-imports` autorise ce barrel comme exception
 *    explicite (cf. `eslint.config.mjs`).
 *  - Le module reste cloisonné : ces actions effectuent leurs propres guards
 *    (`isProjectsEnabled`, `hasProjectsAccess`, IDOR, etc.) et ne modifient
 *    JAMAIS de tables core.
 *
 * UX overhaul: ce barrel a été ajouté pour permettre à la page server
 * `/clients/[slug]/tickets/new` de charger la liste des projets de l'org
 * (3e point d'entrée core).
 */
export {
  listProjects,
  listProjectsWithCounts,
  updateProjectStatus,
  type ProjectWithCount,
} from "./actions/projects";
export { linkExistingTicketToProject } from "./actions/ticket-links";
