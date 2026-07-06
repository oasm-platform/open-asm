import { test, expect } from '@playwright/test';

test.describe('Register (init-admin) Flow', () => {
  test('register page loads', async ({ page }) => {
    await page.goto('/init-admin');
    await expect(page.getByText(/register|create admin/i)).toBeVisible();
  });

  test('validation: mismatched passwords show error', async ({ page }) => {
    await page.goto('/init-admin');
    await page.fill('[name="name"]', 'Admin');
    await page.fill('[name="email"]', 'admin@test.com');
    await page.fill('[name="password"]', 'Test1234!');
    await page.fill('[name="confirmPassword"]', 'Different123!');
    await page.click('button[type="submit"]');
    await expect(page.getByText(/match/i)).toBeVisible();
  });
});
