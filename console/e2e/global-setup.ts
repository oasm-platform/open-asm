import { chromium, type FullConfig } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-data';
import fs from 'fs';

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:5173';

  // Ensure .auth directory exists
  fs.mkdirSync('./e2e/.auth', { recursive: true });

  for (const [role, user] of Object.entries(TEST_USERS)) {
    try {
      const browser = await chromium.launch();
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();

      // Navigate and wait for the page to be ready
      await page.goto('/login', { waitUntil: 'networkidle', timeout: 15000 });

      // Wait for the form to be visible
      await page.waitForSelector('input[name="email"]', { timeout: 10000 });

      await page.fill('input[name="email"]', user.email);
      await page.fill('input[name="password"]', user.password);
      await page.click('button[type="submit"]');
      await page.waitForURL('/', { timeout: 10000 });

      await page.context().storageState({
        path: `./e2e/.auth/${role}.json`,
      });
      await browser.close();
    } catch (error) {
      console.warn(`Failed to setup auth for ${role}: ${error.message}`);
      // Create empty auth state so tests can still run (they'll just not be authenticated)
      fs.writeFileSync(
        `./e2e/.auth/${role}.json`,
        JSON.stringify({ cookies: [], origins: [] }),
      );
    }
  }
}

export default globalSetup;
