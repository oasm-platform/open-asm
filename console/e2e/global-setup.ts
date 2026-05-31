import { chromium, type FullConfig } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-data';

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:5173';
  // For now, assume backend is pre-seeded
  // Save auth states for each user role
  for (const [role, user] of Object.entries(TEST_USERS)) {
    const browser = await chromium.launch();
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto('/login');
    await page.fill('[name="email"]', user.email);
    await page.fill('[name="password"]', user.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
    await page.context().storageState({
      path: `./e2e/.auth/${role}.json`,
    });
    await browser.close();
  }
}

export default globalSetup;
