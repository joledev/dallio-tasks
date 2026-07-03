import { test, expect, type Locator, type Page } from '@playwright/test';
import { SEED_TASKS, SEED_STATUSES } from '../prisma/seed-data';
import { resetToSeed } from './reset';

// Statuses are data-driven now: tasks carry a `statusSlug` in the seed and board columns are keyed by
// the seeded status id. Resolve slug → id/title/count through the fixed seed constants.
type StatusSlug = (typeof SEED_TASKS)[number]['statusSlug'];

const seedTitle = (slug: StatusSlug) => SEED_TASKS.find((t) => t.statusSlug === slug)!.title;
const seedCount = (slug: StatusSlug) => SEED_TASKS.filter((t) => t.statusSlug === slug).length;
const statusName = (slug: StatusSlug) => SEED_STATUSES.find((s) => s.slug === slug)!.name;

test.beforeAll(resetToSeed);

function boardColumn(page: Page, slug: StatusSlug): Locator {
  // Resolve columns by their accessible region name (the status name), NOT by a hardcoded status id:
  // the DB rows are seeded by the migration with random UUIDs, so the SEED_STATUSES fixed ids do not
  // match what the API serves. The name is stable and data-driven.
  return page.getByRole('region', { name: new RegExp(`^${statusName(slug)}\\b`) });
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

const SLUGS: StatusSlug[] = ['todo', 'in_progress', 'done'];

test('both views render seeded data with correct counts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dallio Tasks' })).toBeVisible();

  for (const slug of SLUGS) {
    await expect(page.getByRole('row').filter({ hasText: seedTitle(slug) })).toBeVisible();
  }

  await page.getByRole('tab', { name: 'Board' }).click();
  await expect(page).toHaveURL(/view=board/);

  for (const slug of SLUGS) {
    const column = boardColumn(page, slug);
    await expect(column.getByText(seedTitle(slug))).toBeVisible();

    // The header badge must equal the number of cards actually rendered, both derived from the seed.
    const cards = column.locator('article');
    await expect(cards).toHaveCount(seedCount(slug));
    // The count badge is the trailing span inside the column header button (there is no <header>).
    const badge = await column.locator('h2 button > span').last().innerText();
    expect(Number(badge)).toBe(seedCount(slug));
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
  // Table view renders both the md+ table AND the mobile card list (one hidden per breakpoint), so the
  // title matches two nodes — scope to the visible table row to avoid a strict-mode violation.
  await expect(page.getByRole('row').filter({ hasText: title })).toBeVisible();

  await page.getByRole('tab', { name: 'Board' }).click();
  await expect(page).toHaveURL(/view=board/);
  const todo = boardColumn(page, 'todo');
  const inProgress = boardColumn(page, 'in_progress');
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
  // Status is a joined object now; assert the task landed on the in-progress column by slug. (The id
  // is a migration-generated UUID, not the SEED_STATUSES fixed id, so we assert the stable slug.)
  expect(payload).toMatchObject({
    ok: true,
    data: { title, status: { slug: 'in_progress' } },
  });

  await expect(inProgress.getByText(title)).toBeVisible();
  await expect(todo.getByText(title)).toHaveCount(0);

  // Reload so the board re-fetches from the server — proves the move persisted, not just cached.
  await page.reload();
  await expect(page).toHaveURL(/view=board/);
  const inProgressAfter = boardColumn(page, 'in_progress');
  const todoAfter = boardColumn(page, 'todo');
  await expect(inProgressAfter.getByText(title)).toBeVisible();
  await expect(todoAfter.getByText(title)).toHaveCount(0);

  await page.screenshot({ path: '.dev/logs/ui-dnd-after.png', fullPage: false });
});
