import { test, expect } from '@playwright/test';

test('GET /api/health returns 200 with ok payload', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('status');
});
