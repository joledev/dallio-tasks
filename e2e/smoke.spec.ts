import { test, expect } from '@playwright/test';
import { resetToSeed } from './reset';

test.beforeAll(resetToSeed);

test('dashboard happy path across table and board views', async ({ page }) => {
  const uniqueTitle = `E2E smoke task ${Date.now()}`;

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dallio Tasks' })).toBeVisible();
  // Table view renders the md+ table AND the mobile card list (one hidden per breakpoint), so a plain
  // getByText matches two nodes — scope to the visible table row.
  await expect(page.getByRole('row').filter({ hasText: 'Set up local Postgres' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Draft the REST API' })).toBeVisible();

  await page.getByRole('button', { name: 'New task' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('Task title').fill(uniqueTitle);
  await dialog.getByRole('button', { name: 'Create task' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: uniqueTitle })).toBeVisible();

  await page.screenshot({ path: '.dev/logs/ui-table.png', fullPage: false });

  await page.getByLabel('Filter by priority').click();
  await page.getByRole('option', { name: 'High' }).click();
  await expect(page).toHaveURL(/priority=HIGH/);
  // The new task and 'Draft the REST API' are MEDIUM, so only the HIGH seed survives the filter.
  await expect(page.getByRole('row').filter({ hasText: 'Set up local Postgres' })).toBeVisible();
  await expect(page.getByText(uniqueTitle)).toHaveCount(0);
  await expect(page.getByText('Draft the REST API')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Board' }).click();
  await expect(page).toHaveURL(/view=board/);
  await expect(page).toHaveURL(/priority=HIGH/);
  await expect(page.getByRole('heading', { name: 'To do' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible();

  await page.getByRole('tab', { name: 'Table' }).click();
  await expect(page).not.toHaveURL(/view=board/);
  await expect(page).toHaveURL(/priority=HIGH/);

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page).not.toHaveURL(/priority=HIGH/);
  await expect(page.getByRole('row').filter({ hasText: uniqueTitle })).toBeVisible();

  // Wait on the real POST /assign so we assert server persistence, not just the optimistic cache
  // patch, and don't race the browser-context close before the write lands.
  const row = page.getByRole('row').filter({ hasText: uniqueTitle });
  const assignResponse = page.waitForResponse(
    (r) => /\/assign$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST',
  );
  await row.getByLabel('Assignee').click();
  await page.getByRole('option', { name: 'Ada Lovelace' }).click();
  const resp = await assignResponse;
  expect(resp.ok()).toBeTruthy();
  await expect(row.getByLabel('Assignee')).toContainText('Ada Lovelace');
  await page.reload();
  await expect(
    page.getByRole('row').filter({ hasText: uniqueTitle }).getByLabel('Assignee'),
  ).toContainText('Ada Lovelace');

  await page.getByRole('tab', { name: 'Board' }).click();
  await expect(page).toHaveURL(/view=board/);
  await expect(page.getByRole('heading', { name: 'In progress' })).toBeVisible();
  await expect(page.getByText('Set up local Postgres')).toBeVisible();
  await page.screenshot({ path: '.dev/logs/ui-board.png', fullPage: false });
});
