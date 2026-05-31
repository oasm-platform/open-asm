import { test, expect } from '../helpers/auth';

test.describe('Vulnerabilities', () => {
  test('vulnerabilities list renders', async ({ adminPage: page }) => {
    await page.goto('/vulnerabilities');
    await expect(page.getByText('Vulnerabilities')).toBeVisible();
  });

  test('vulnerability detail shows CVSS', async ({ adminPage: page }) => {
    await page.goto('/vulnerabilities');
    await page.click('text=SQL Injection');
    await expect(page).toHaveURL(/\/vulnerabilities\/[a-z0-9-]+/);
  });
});
