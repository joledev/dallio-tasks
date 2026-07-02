import { test, expect, type Locator, type Page } from '@playwright/test';
import { SEED_TASKS } from '../prisma/seed-data';
import { resetToSeed } from './reset';

type Status = (typeof SEED_TASKS)[number]['status'];

const seedTitle = (status: Status) => SEED_TASKS.find((t) => t.status === status)!.title;
const seedCount = (status: Status) => SEED_TASKS.filter((t) => t.status === status).length;

test.beforeAll(resetToSeed);

function boardColumn(page: Page, status: Status): Locator {
  return page.locator(`section[aria-labelledby="board-column-${status}"]`);
}

// dnd-kit's PointerSensor needs real pointer movement: it arms only after the pointer travels past
// its activation distance (6px), then tracks the pointer over droppables via closestCorners. A plain
// Playwright dragTo() sends too few events, so we drive discrete mouse moves with intermediate steps:
// press on the grip, nudge past the activation threshold, glide to the target column centre, settle.
async function dragCardToColumn(page: Page, grip: Locator, targetColumn: Locator): Promise<void> {
  const from = await grip.boundingBox();
  const to = await targetColumn.boundingBox();
  if (!from || !to) throw new Error('drag source/target not visible');

  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX = to.x + to.width / 2;
  const endY = to.y + to.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Arm the sensor: exceed the 6px activation distance before heading for the target.
  await page.mouse.move(startX + 14, startY + 14, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 20 });
  // A final small nudge so the last dragOver settles on the target droppable.
  await page.mouse.move(endX + 3, endY - 3, { steps: 3 });
  await page.mouse.up();
}

const STATUSES: Status[] = ['TODO', 'IN_PROGRESS', 'DONE'];

test('both views render seeded data with correct counts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dallio Tasks' })).toBeVisible();

  for (const status of STATUSES) {
    await expect(page.getByRole('row').filter({ hasText: seedTitle(status) })).toBeVisible();
  }

  await page.getByRole('tab', { name: 'Board' }).click();
  await expect(page).toHaveURL(/view=board/);

  for (const status of STATUSES) {
    const column = boardColumn(page, status);
    await expect(column.getByText(seedTitle(status))).toBeVisible();

    // The header badge must equal the number of cards actually rendered, both derived from the seed.
    const cards = column.locator('article');
    await expect(cards).toHaveCount(seedCount(status));
    const badge = await column.locator('header span').innerText();
    expect(Number(badge)).toBe(seedCount(status));
  }
});

test('drag-and-drop moves a card across columns and the change persists', async ({ page }) => {
  const title = `E2E dnd task ${Date.now()}`;

  // A fresh task (defaults to TODO) keeps the drag self-contained and doesn't disturb the seed.
  await page.goto('/');
  await page.getByRole('button', { name: 'New task' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Task title').fill(title);
  await dialog.getByRole('button', { name: 'Create task' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(title)).toBeVisible();

  await page.getByRole('tab', { name: 'Board' }).click();
  await expect(page).toHaveURL(/view=board/);
  const todo = boardColumn(page, 'TODO');
  const inProgress = boardColumn(page, 'IN_PROGRESS');
  await expect(todo.getByText(title)).toBeVisible();
  await expect(inProgress.getByText(title)).toHaveCount(0);

  // Drag TODO -> IN_PROGRESS, waiting on the real PATCH so we assert server persistence, not optimism.
  const grip = page.getByRole('button', { name: `Drag ${title} to another column` });
  const patch = page.waitForResponse(
    (r) =>
      /\/api\/tasks\/[0-9a-f-]{36}$/.test(new URL(r.url()).pathname) &&
      r.request().method() === 'PATCH',
  );
  await dragCardToColumn(page, grip, inProgress);

  const resp = await patch;
  expect(resp.ok()).toBeTruthy();
  const payload = await resp.json();
  expect(payload).toMatchObject({ ok: true, data: { title, status: 'IN_PROGRESS' } });

  await expect(inProgress.getByText(title)).toBeVisible();
  await expect(todo.getByText(title)).toHaveCount(0);

  // Reload so the board re-fetches from the server — proves the move persisted, not just cached.
  await page.reload();
  await expect(page).toHaveURL(/view=board/);
  const inProgressAfter = boardColumn(page, 'IN_PROGRESS');
  const todoAfter = boardColumn(page, 'TODO');
  await expect(inProgressAfter.getByText(title)).toBeVisible();
  await expect(todoAfter.getByText(title)).toHaveCount(0);

  await page.screenshot({ path: '.dev/logs/ui-dnd-after.png', fullPage: false });
});
