import { test, expect } from '../helpers/auth';

const title = () => `E2E issue ${Date.now()}`;

test.describe('Issues', () => {
  test('issues list renders with tabs and filters', async ({ adminPage: page }) => {
    await page.goto('/issues');
    await expect(page.getByText('Issues', { exact: true }).first()).toBeVisible();
    for (const tab of ['Mine', 'Open', 'Overdue', 'Resolved', 'All']) {
      await expect(page.getByRole('tab', { name: new RegExp(tab) })).toBeVisible();
    }
    await page.getByRole('tab', { name: /Overdue/ }).click();
    await expect(page).toHaveURL(/tab=overdue/);
    await expect(page.getByRole('combobox', { name: 'Type filter' })).toBeVisible();
  });

  test('create an issue from the dialog and land on its page', async ({
    adminPage: page,
  }) => {
    const name = title();
    await page.goto('/issues');
    await page.getByRole('button', { name: 'New issue' }).click();
    await page.getByLabel('Title').fill(name);
    await page.getByLabel('Description').fill('Created by the e2e suite');
    await page.getByRole('button', { name: 'Create issue' }).click();
    await expect(page).toHaveURL(/\/issues\/[0-9a-f-]+$/);
    await expect(page.getByText(name)).toBeVisible();
  });

  test('closing an issue asks for a resolution', async ({ adminPage: page }) => {
    const name = title();
    await page.goto('/issues');
    await page.getByRole('button', { name: 'New issue' }).click();
    await page.getByLabel('Title').fill(name);
    await page.getByRole('button', { name: 'Create issue' }).click();
    await expect(page).toHaveURL(/\/issues\/[0-9a-f-]+$/);

    await page.getByRole('button', { name: /Change status/ }).click();
    await page.getByRole('menuitem', { name: 'Closed' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: "Won't fix" }).click();
    await dialog.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByTestId('issue-properties')).toContainText('Closed');
    await expect(page.getByTestId('comment-activity').last()).toContainText(
      'Status changed from open to closed',
    );
  });

  test('comment on an issue', async ({ adminPage: page }) => {
    const name = title();
    await page.goto('/issues');
    await page.getByRole('button', { name: 'New issue' }).click();
    await page.getByLabel('Title').fill(name);
    await page.getByRole('button', { name: 'Create issue' }).click();
    await expect(page).toHaveURL(/\/issues\/[0-9a-f-]+$/);

    await page.getByRole('textbox', { name: 'Comment' }).fill('Looking into it');
    await page.getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(page.getByTestId('comment-item').last()).toContainText(
      'Looking into it',
    );
  });

  test('rules dialog lists rules or offers the default rule', async ({
    adminPage: page,
  }) => {
    await page.goto('/issues');
    await page.getByRole('button', { name: 'Rules' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Issue rules').first()).toBeVisible();

    const addDefault = dialog.getByRole('button', { name: 'Add default rule' });
    if (await addDefault.isVisible()) {
      await addDefault.click();
    }
    await expect(dialog.getByTestId('issue-rule-row').first()).toBeVisible();

    // Toggling a rule persists it.
    const toggle = dialog.getByRole('switch').first();
    const before = await toggle.getAttribute('aria-checked');
    await toggle.click();
    await expect(toggle).not.toHaveAttribute('aria-checked', before ?? '');
    await toggle.click();
  });
});
