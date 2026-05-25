import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // ── Module Projets — boundary isolation ──────────────────────────────
  // Interdit tout import interne au module (`@/modules/projects/**`)
  // depuis l'extérieur du module. Consumer doivent importer UNIQUEMENT
  // depuis `@/modules/projects` (barrel). Exceptions :
  //   - le module lui-même (`src/modules/projects/**`)
  //   - les shims Next RSC `src/app/(portal)/clients/[slug]/projects/**`
  //     qui font `export { default } from '@/modules/projects/routes/...'`
  //   - `@/modules/projects/feature-flag` (server-only, pas de bundle client ;
  //     utilisé par `(portal)/layout.tsx` pour éviter le barrel qui
  //     bundlerait ProjectsMenuItem côté client)
  {
    files: ["src/**/*.{ts,tsx}"],
    // NB: minimatch interprets `[slug]` comme character class et `(portal)`
    // comme extglob. On utilise donc un pattern neutre qui matche tous les
    // page.tsx sous un segment `projects/` dans l'arbo app/ — seuls les
    // shims qualifient actuellement.
    ignores: ["src/modules/projects/**", "src/app/**/projects/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/modules/projects/*",
                "!@/modules/projects/feature-flag",
                "!@/modules/projects/server",
              ],
              message:
                "Import only from `@/modules/projects` (public API, client-safe), `@/modules/projects/feature-flag` (server-only, no module load), or `@/modules/projects/server` (server-only API surface for actions). Sub-paths break the cloisonnement boundary.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
