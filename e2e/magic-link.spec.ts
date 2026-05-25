import { test, expect } from '@playwright/test';

/**
 * Valide uniquement le formulaire de demande de magic link (pas la reception
 * du mail). Objectif : s'assurer que la route /login expose un input email
 * + un bouton submit et que la soumission n'erreure pas en 500.
 *
 * N'envoie PAS de vrai magic link : `EMAIL_ENABLED=false` doit être set dans
 * l'env dev local, sinon le test enverra un vrai mail Resend.
 */
test('magic link form submits without 500', async ({ page }) => {
  await page.goto('/login');

  const email = page.getByLabel(/email|courriel/i).first();
  await expect(email).toBeVisible();
  await email.fill('playwright-test@example.invalid');

  const submit = page
    .getByRole('button', { name: /connecter|envoyer|continuer|login|sign.?in/i })
    .first();
  await expect(submit).toBeVisible();

  const submitPromise = page.waitForResponse(
    (r) => r.url().includes('/api/auth/') && r.request().method() === 'POST',
    { timeout: 15_000 },
  );
  await submit.click();
  const res = await submitPromise;
  expect(res.status()).toBeLessThan(500);
});
