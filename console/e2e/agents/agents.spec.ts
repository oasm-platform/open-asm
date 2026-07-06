import { test, expect } from '../helpers/auth';

test.describe('AI Agents', () => {
  test('agents landing page renders', async ({ adminPage: page }) => {
    await page.goto('/agents');
    await expect(page.getByText('Agents')).toBeVisible();
  });

  test('create new agent', async ({ adminPage: page }) => {
    await page.goto('/agents/create');
    await page.fill('[name="name"]', 'E2E Test Agent');
    await page.fill('[name="description"]', 'Created by E2E test');
    await page.click('button[type="submit"]');
    await expect(page.getByText('E2E Test Agent')).toBeVisible();
  });

  test('view agent detail', async ({ adminPage: page }) => {});
  test('start conversation', async ({ adminPage: page }) => {});
  test('view conversations list', async ({ adminPage: page }) => {});
});
