/**
 * Feature flag du module Projets.
 *
 * CONTRAINTE CRITIQUE : ce fichier NE PEUT PAS importer autre chose que
 * process.env. Il sert de guard avant tout chargement du module ailleurs.
 * Aucune importation de schema/db/actions/etc.
 *
 * Convention : process.env.X === 'true' (opt-in strict).
 *
 * NB: en développement local, on autorise le fallback
 * `NODE_ENV !== 'production'` pour éviter qu'un dev local oublie la variable
 * `ENABLE_PROJECTS_MODULE=true` dans son `.env`. La prod reste strictement
 * opt-in via la variable explicite (sinon perte de la garde fail-safe).
 */
export function isProjectsEnabled(): boolean {
  if (process.env.ENABLE_PROJECTS_MODULE === "true") return true;
  if (process.env.NODE_ENV !== "production") return true;
  return false;
}

/**
 * P5 : preview Power Automate (flow). Indépendant d'`ENABLE_PROJECTS_MODULE` —
 * peut être activé/désactivé sans toucher le module entier. Requis `true`
 * pour que l'enqueue du job process-flow se fasse à l'upload d'un .zip flow.
 */
export function isFlowPreviewEnabled(): boolean {
  return process.env.ENABLE_FLOW_PREVIEW === "true";
}

export function isMsappPreviewEnabled(): boolean {
  return process.env.ENABLE_MSAPP_PREVIEW === "true";
}

export function isSolutionPreviewEnabled(): boolean {
  return process.env.ENABLE_SOLUTION_PREVIEW === "true";
}

export function isPbixPreviewEnabled(): boolean {
  return process.env.ENABLE_PBIX_PREVIEW === "true";
}
