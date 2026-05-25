import { test, expect } from '@playwright/test';

test('GET /login renders email input', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel(/email|courriel/i).first()).toBeVisible();
});

test('GET / unauthenticated redirects to /login', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBeLessThan(500);
  await page.waitForURL(/\/login/);
  expect(page.url()).toContain('/login');
});
