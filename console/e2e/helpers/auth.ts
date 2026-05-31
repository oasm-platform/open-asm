import { test as base, type Page } from '@playwright/test';

export const test = base.extend<{ adminPage: Page }>({
  adminPage: async ({ page, browser }, use) => {
    const ctx = await browser.newContext();
    const loginPage = await ctx.newPage();
    await loginPage.goto('/login');
    await loginPage.fill('[name="email"]', 'admin@test.com');
    await loginPage.fill('[name="password"]', 'Test1234!');
    await loginPage.click('button[type="submit"]');
    await loginPage.waitForURL('/');
    await loginPage.close();
    await use(page);
    await ctx.close();
  },
});

export { expect } from '@playwright/test';
