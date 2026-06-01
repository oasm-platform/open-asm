import { test, expect } from '../helpers/auth';

test.describe('Settings', () => {
  test('settings page loads', async ({ adminPage: page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Settings')).toBeVisible();
  });

  test('navigate between tabs', async ({ adminPage: page }) => {});

  test('update profile', async ({ adminPage: page }) => {});
});
