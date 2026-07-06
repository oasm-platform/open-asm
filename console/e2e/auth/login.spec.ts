import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@test.com');
    await page.fill('[name="password"]', 'Test1234!');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
    await expect(page.getByText('Dashboard')).toBeVisible();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'wrong@test.com');
    await page.fill('[name="password"]', 'wrong');
    await page.click('button[type="submit"]');
    await expect(page.getByText(/invalid/i)).toBeVisible();
  });

  test('form validation shows errors for empty fields', async ({ page }) => {
    await page.goto('/login');
    await page.click('button[type="submit"]');
    await expect(page.getByText(/required|invalid/i)).toBeVisible();
  });

  test('protected route redirects to login', async ({ page }) => {
    await page.goto('/targets');
    await expect(page).toHaveURL(/login/);
  });
});
