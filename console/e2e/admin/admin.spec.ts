import { test, expect } from '../helpers/auth';

test.describe('Admin', () => {
  test('admin can access user management', async ({ adminPage: page }) => {
    await page.goto('/admin/users');
    await expect(page.getByText('Users')).toBeVisible();
  });

  test('non-admin gets redirected', async ({ userPage: page }) => {
    await page.goto('/admin/users');
    await expect(page).not.toHaveURL(/admin/);
  });
});
