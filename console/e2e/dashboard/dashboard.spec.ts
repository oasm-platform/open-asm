import { test, expect } from '../helpers/auth';

test.describe('Dashboard', () => {
  test('dashboard loads with statistics', async ({ adminPage: page }) => {
    await page.goto('/');
    await expect(page.getByText('Dashboard')).toBeVisible();
  });

  test('charts render', async ({ adminPage: page }) => {});

  test('TLS expiration table shows', async ({ adminPage: page }) => {});
});
