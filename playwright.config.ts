import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E fondation (task H1 — 2026-04-23).
 *
 * Scope minimal : smoke + api-health + magic-link submit. Ne valide pas
 * encore de parcours complet authentifié (nécessite seed data + verif mail).
 *
 * Lancement local : `npm run test:e2e` (dev server auto via webServer).
 * CI : non configuré (à activer quand parcours auth vérifiés).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
