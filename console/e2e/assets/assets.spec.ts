import { test, expect } from '../helpers/auth';

test.describe('Assets', () => {
  test('assets list renders', async ({ adminPage: page }) => {
    await page.goto('/assets');
    await expect(page.getByText('Assets')).toBeVisible();
  });

  test('asset detail shows services', async ({ adminPage: page }) => {
    await page.goto('/assets');
    await page.click('text=example.com');
    await expect(page).toHaveURL(/\/assets\/[a-z0-9-]+/);
  });
});
