import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { resetDatabase, SEED_BOARD_ID, SEED_BOARD_TOKEN } from '../prisma/seed-data';

// End-to-end coverage for the custom-statuses + mobile-UI feature.
//
// Determinism note: `resetDatabase` deletes tasks and upserts the three canonical statuses, but it does
// NOT delete custom statuses (a status in use would trip the `onDelete: Restrict` FK). A custom status
// created by one test therefore survives into the next run and would collide on its unique
// `(boardId, slug)` — a second "Staging" create returns CONFLICT. So we reset AND prune non-canonical
// statuses before each test (safe: reset already removed every task, so the pruned status has no rows).
const CANONICAL = ['todo', 'in_progress', 'done'];

async function resetAndPrune(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await resetDatabase(prisma);
    await prisma.status.deleteMany({
      where: { boardId: SEED_BOARD_ID, slug: { notIn: CANONICAL } },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.beforeEach(resetAndPrune);
test.afterAll(resetAndPrune);

async function openDemoBoard(page: Page) {
  await page.goto(`/b/${SEED_BOARD_TOKEN}`);
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByLabel('Display name').fill('E2E Statuses');
    await dialog.getByRole('button', { name: 'Join board' }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.getByRole('heading', { name: 'My Board' })).toBeVisible();
}

// The dialog's main status trigger. Its aria-label is exactly "Status"; the inline color picker's is
// "Status color", so we must match exactly to avoid a substring clash.
function statusTrigger(page: Page) {
  return page.getByRole('dialog').getByRole('combobox', { name: 'Status', exact: true });
}

// Open the create dialog and add a custom status via the inline "Add status" affordance. Does NOT
// select it (the caller decides), so this helper is reusable by the happy-path and the bug test.
async function openDialogAndAddStatus(page: Page, name: string, color = 'violet'): Promise<void> {
  await page.getByRole('button', { name: 'New task' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await statusTrigger(page).click();
  await page.getByRole('option', { name: 'Add status' }).click();
  await dialog.getByRole('textbox', { name: 'New status name' }).fill(name);
  await dialog.getByRole('combobox', { name: 'Status color' }).click();
  await page.getByRole('option', { name: color }).click();
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  // The inline add row collapses on success (create-and-select resolved).
  await dialog.getByRole('textbox', { name: 'New status name' }).waitFor({ state: 'hidden' });
}

test('custom status: inline add → selectable → task lands on a new board column and persists', async ({
  page,
}) => {
  const title = `E2E staging task ${Date.now()}`;

  await openDemoBoard(page);
  await expect(page.getByRole('row').filter({ hasText: 'Write the test matrix' })).toBeVisible();

  await openDialogAndAddStatus(page, 'Staging');
  const dialog = page.getByRole('dialog');

  // The freshly created status is now an option everywhere (it "becomes selectable").
  await statusTrigger(page).click();
  await expect(page.getByRole('option', { name: 'Staging' })).toBeVisible();

  // NOTE: create-and-select auto-selection is currently broken (see the PRODUCT BUG test below), so we
  // select "Staging" explicitly to exercise the rest of the flow deterministically.
  await page.getByRole('option', { name: 'Staging' }).click();
  await expect(statusTrigger(page)).toContainText('Staging');

  await dialog.getByPlaceholder('Task title').fill(title);
  await dialog.getByRole('button', { name: 'Create task' }).click();
  await expect(dialog).toBeHidden();

  // Board view: a "Staging" column now exists (data-driven from the status list) with the new task.
  await page.getByRole('tab', { name: 'Board' }).click();
  await expect(page).toHaveURL(/view=board/);
  const staging = page.getByRole('region', { name: /^Staging\b/ });
  await expect(staging).toHaveCount(1);
  await expect(staging.getByText(title)).toBeVisible();
  await expect(staging.locator('article')).toHaveCount(1);

  // Reload so the board re-fetches from the server — proves persistence, not an optimistic cache patch.
  await page.reload();
  await expect(page).toHaveURL(/view=board/);
  const stagingAfter = page.getByRole('region', { name: /^Staging\b/ });
  await expect(stagingAfter.getByText(title)).toBeVisible();
});

test('mobile: task list renders as cards at 390px with no horizontal page scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDemoBoard(page);

  // At <md the table is hidden and the card list (one <article> per task) is shown.
  const card = page.getByRole('article').filter({ hasText: 'Write the test matrix' });
  await expect(card).toBeVisible();

  // The page body must not scroll horizontally: the document is no wider than the viewport.
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
});

// PRODUCT BUG (confirmed against the production build, not a dev/Strict-Mode artifact):
// Using the inline "Add status" affordance inside the TASK DIALOG creates the status (POST 201) but
// does NOT select it in place — the react-hook-form `statusId` ends up empty. The same StatusField
// wired to the inline row/card select (onChange → PATCH) works, so the defect is specific to the
// dialog's RHF wiring. Because `createTaskSchema.statusId = z.uuid().optional()` rejects the empty
// string '', the subsequent "Create task" is blocked client-side with "Invalid input" and no request
// is sent — a user who adds a status and immediately submits cannot create the task.
//   Intended behaviour (spec .dev/specs/custom-statuses.md §5.5): create-and-select sets
//   form.setValue('statusId', created.id) so the new status is selected in place.
//   Implicated: src/app/_components/status-field.tsx:78-80 (onChange(created.id) does not stick in the
//   dialog) and src/core/tasks/schema.ts:11 (z.uuid().optional() rejects '' rather than treating it as
//   absent). This test asserts the intended behaviour and is expected to FAIL until the bug is fixed.
test('PRODUCT BUG: inline Add status in the task dialog auto-selects the new status (create-and-select)', async ({
  page,
}) => {
  await openDemoBoard(page);
  await expect(page.getByRole('row').filter({ hasText: 'Write the test matrix' })).toBeVisible();

  await openDialogAndAddStatus(page, 'Staging');
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Task title').fill(`E2E autoselect ${Date.now()}`);

  // Intended: the just-added status is selected in place, so the trigger shows it and Create succeeds.
  await expect(statusTrigger(page)).toContainText('Staging');
  await dialog.getByRole('button', { name: 'Create task' }).click();
  await expect(dialog).toBeHidden();
});
