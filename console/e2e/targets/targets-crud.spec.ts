import { test, expect } from '../helpers/auth';

test.describe('Targets CRUD', () => {
  test('targets list page loads', async ({ adminPage: page }) => {
    await page.goto('/targets');
    await expect(page.getByText('Targets')).toBeVisible();
  });

  test('create single target', async ({ adminPage: page }) => {
    await page.goto('/targets');
    await page.click('[data-testid="add-target-btn"]');
    await page.fill('[name="value"]', 'e2e-test.com');
    await page.click('button[type="submit"]');
    await expect(page.getByText('e2e-test.com')).toBeVisible();
  });

  test('view target detail', async ({ adminPage: page }) => {
    await page.goto('/targets');
    await page.click('text=test-domain.com');
    await expect(page).toHaveURL(/\/targets\/[a-z0-9-]+/);
  });

  test('delete target', async ({ adminPage: page }) => {
    await page.goto('/targets');
    await page.click('[data-testid="delete-target-btn"]');
    await page.click('text=Confirm');
    await expect(page.getByText('test-domain.com')).not.toBeVisible();
  });
});
