/**
 * Shim privé pour monter le bloc "Projets" dans la page dashboard org.
 * Préfixe `_` → ignoré par le Next router. Dossier `projects/` → matché
 * par l'exception ESLint `no-restricted-imports` (cloisonnement module).
 */
export { ProjectsOverviewBlock as default } from '@/modules/projects/routes/org-projects-overview';
