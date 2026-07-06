import { test, expect } from '../helpers/auth';

test.describe('Workspace', () => {
  test('workspace list page loads', async ({ adminPage: page }) => {
    await page.goto('/workspaces');
    await expect(page.getByText('Workspaces')).toBeVisible();
  });

  test('create new workspace', async ({ adminPage: page }) => {});

  test('switch workspace', async ({ adminPage: page }) => {});
});
