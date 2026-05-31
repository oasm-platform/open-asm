import { test, expect } from '../helpers/auth';

test.describe('Session Management', () => {
  test('logout clears session and redirects', async ({ adminPage: page }) => {
    await page.goto('/');
    await page.click('[data-testid="user-menu"]');
    await page.click('text=Sign out');
    await expect(page).toHaveURL(/login/);
  });

  test('session persists across reload', async ({ adminPage: page }) => {
    await page.goto('/');
    await page.reload();
    await expect(page.getByText('Dashboard')).toBeVisible();
  });
});
