import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryTaskRepository } from '@/test/in-memory/task-repository';
import { InMemoryUserRepository } from '@/test/in-memory/user-repository';
import { InMemoryStatusRepository } from '@/test/in-memory/status-repository';
import { createTask, getTask, listTasks, updateTask, deleteTask, assignTask } from './use-cases';
import {
  createTaskSchema,
  updateTaskSchema,
  assignTaskSchema,
  listTasksQuerySchema,
} from './schema';
import type { CreateTaskData } from './repository';

const USER_A = '00000000-0000-4000-8000-00000000000a';
const USER_B = '00000000-0000-4000-8000-00000000000b';

// Seed the canonical 3 statuses for an owner (todo=default pos0, in_progress pos1, done pos2).
async function seedStatuses(repo: InMemoryStatusRepository, ownerId: string) {
  const todo = await repo.create({
    ownerId,
    name: 'To do',
    slug: 'todo',
    position: 0,
    color: null,
    isDefault: true,
  });
  const inProgress = await repo.create({
    ownerId,
    name: 'In progress',
    slug: 'in_progress',
    position: 1,
    color: 'blue',
    isDefault: false,
  });
  const done = await repo.create({
    ownerId,
    name: 'Done',
    slug: 'done',
    position: 2,
    color: 'green',
    isDefault: false,
  });
  return { todo: todo.id, in_progress: inProgress.id, done: done.id };
}

function makeRepos() {
  const statusRepo = new InMemoryStatusRepository();
  const taskRepo = new InMemoryTaskRepository((id) => statusRepo.refById(id));
  return { statusRepo, taskRepo };
}

describe('createTask — server-resolved status', () => {
  let statusRepo: InMemoryStatusRepository;
  let taskRepo: InMemoryTaskRepository;
  let ids: Awaited<ReturnType<typeof seedStatuses>>;
  beforeEach(async () => {
    ({ statusRepo, taskRepo } = makeRepos());
    ids = await seedStatuses(statusRepo, USER_A);
  });

  it('omitted statusId resolves the owner default; owner from actingUserId, unassigned', async () => {
    const parsed = createTaskSchema.parse({ title: 'Buy milk', priority: 'HIGH' });
    const res = await createTask(taskRepo, statusRepo, USER_A, parsed);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.statusId).toBe(ids.todo);
    expect(res.data.status.slug).toBe('todo');
    expect(res.data.status.isDefault).toBe(true);
    expect(res.data.ownerId).toBe(USER_A);
    expect(res.data.assigneeId).toBeNull();
    expect(res.data.priority).toBe('HIGH');
  });

  it('uses a supplied in-scope statusId', async () => {
    const parsed = createTaskSchema.parse({ title: 'Ship it', statusId: ids.done });
    const res = await createTask(taskRepo, statusRepo, USER_A, parsed);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.statusId).toBe(ids.done);
    expect(res.data.status.slug).toBe('done');
  });

  it('rejects a foreign/unknown statusId → VALIDATION_ERROR (IDOR scope check)', async () => {
    const foreign = new InMemoryStatusRepository();
    const bIds = await seedStatuses(foreign, USER_B); // B's status is invisible to A
    const parsed = createTaskSchema.parse({ title: 'Sneaky', statusId: bIds.done });
    const res = await createTask(taskRepo, statusRepo, USER_A, parsed);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('VALIDATION_ERROR');
  });

  it('drops client-supplied ownerId/assigneeId at the schema boundary', () => {
    const parsed = createTaskSchema.parse({
      title: 'Sneaky',
      ownerId: USER_B, // attacker tries to set owner
      assigneeId: USER_B,
    } as Record<string, unknown>);
    expect('ownerId' in parsed).toBe(false);
    expect('assigneeId' in parsed).toBe(false);
  });
});

describe('listTasks — pagination', () => {
  let statusRepo: InMemoryStatusRepository;
  let taskRepo: InMemoryTaskRepository;
  let ids: Awaited<ReturnType<typeof seedStatuses>>;
  beforeEach(async () => {
    ({ statusRepo, taskRepo } = makeRepos());
    ids = await seedStatuses(statusRepo, USER_A);
    // 25 tasks Task-00..Task-24, 10 of them done.
    for (let i = 0; i < 25; i++) {
      await taskRepo.create(
        taskData(i < 10 ? ids.done : ids.todo, {
          title: `Task-${String(i).padStart(2, '0')}`,
        }),
      );
    }
  });

  it('page=1 is not skipped (offset 0 returns the first row)', async () => {
    const q = listTasksQuerySchema.parse({ sort: 'title', dir: 'asc', page: '1', size: '10' });
    const res = await listTasks(taskRepo, USER_A, q);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.items).toHaveLength(10);
    expect(res.data.items[0].title).toBe('Task-00'); // first row present, not skipped
    expect(res.data.total).toBe(25);
    expect(res.data.page).toBe(1);
  });

  it('last partial page returns the remainder', async () => {
    const q = listTasksQuerySchema.parse({ sort: 'title', dir: 'asc', page: '3', size: '10' });
    const res = await listTasks(taskRepo, USER_A, q);
    if (!res.ok) throw new Error('expected ok');
    expect(res.data.items).toHaveLength(5);
    expect(res.data.items[0].title).toBe('Task-20');
    expect(res.data.total).toBe(25);
  });

  it('out-of-range page returns empty items but the full total', async () => {
    const q = listTasksQuerySchema.parse({ page: '99', size: '10' });
    const res = await listTasks(taskRepo, USER_A, q);
    if (!res.ok) throw new Error('expected ok');
    expect(res.data.items).toEqual([]);
    expect(res.data.total).toBe(25); // total is NOT clamped to the page
  });

  it('total reflects the SAME filters as the page query', async () => {
    const q = listTasksQuerySchema.parse({ statusId: ids.done, page: '1', size: '5' });
    const res = await listTasks(taskRepo, USER_A, q);
    if (!res.ok) throw new Error('expected ok');
    expect(res.data.items).toHaveLength(5); // one page of the filtered set
    expect(res.data.total).toBe(10); // filtered total, not 25
    expect(res.data.items.every((t) => t.status.slug === 'done')).toBe(true);
  });

  it('size is capped at MAX_PAGE_SIZE by Zod (request 500 rejected)', () => {
    const parsed = listTasksQuerySchema.safeParse({ size: '500' });
    expect(parsed.success).toBe(false);
  });

  it('size=100 is accepted (boundary)', () => {
    const parsed = listTasksQuerySchema.safeParse({ size: '100' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.size).toBe(100);
  });

  it('applies defaults when page/size/sort/dir are absent', () => {
    const q = listTasksQuerySchema.parse({});
    expect(q).toMatchObject({ page: 1, size: 20, sort: 'createdAt', dir: 'desc' });
  });
});

describe('listTasks — filtering', () => {
  let statusRepo: InMemoryStatusRepository;
  let taskRepo: InMemoryTaskRepository;
  let ids: Awaited<ReturnType<typeof seedStatuses>>;
  const assignee = randomUUID();
  beforeEach(async () => {
    ({ statusRepo, taskRepo } = makeRepos());
    ids = await seedStatuses(statusRepo, USER_A);
    await taskRepo.create(taskData(ids.todo, { title: 'Alpha', priority: 'LOW' }));
    await taskRepo.create(taskData(ids.done, { title: 'Beta', priority: 'HIGH' }));
    await taskRepo.create(
      taskData(ids.done, { title: 'Gamma', priority: 'LOW', assigneeId: assignee }),
    );
    await taskRepo.create(taskData(ids.in_progress, { title: 'aLPha-two', priority: 'MEDIUM' }));
  });

  it('filters by statusId', async () => {
    const q = listTasksQuerySchema.parse({ statusId: ids.done });
    const res = await listTasks(taskRepo, USER_A, q);
    if (!res.ok) throw new Error('ok');
    expect(res.data.items.map((t) => t.title).sort()).toEqual(['Beta', 'Gamma']);
  });

  it('filters by priority', async () => {
    const q = listTasksQuerySchema.parse({ priority: 'LOW' });
    const res = await listTasks(taskRepo, USER_A, q);
    if (!res.ok) throw new Error('ok');
    expect(res.data.items.map((t) => t.title).sort()).toEqual(['Alpha', 'Gamma']);
  });

  it('filters by assigneeId', async () => {
    const q = listTasksQuerySchema.parse({ assigneeId: assignee });
    const res = await listTasks(taskRepo, USER_A, q);
    if (!res.ok) throw new Error('ok');
    expect(res.data.items.map((t) => t.title)).toEqual(['Gamma']);
  });

  it('filters by q (title contains, case-insensitive)', async () => {
    const q = listTasksQuerySchema.parse({ q: 'alpha' });
    const res = await listTasks(taskRepo, USER_A, q);
    if (!res.ok) throw new Error('ok');
    expect(res.data.items.map((t) => t.title).sort()).toEqual(['Alpha', 'aLPha-two']);
  });

  it('combines filters with AND', async () => {
    const q = listTasksQuerySchema.parse({ statusId: ids.done, priority: 'LOW' });
    const res = await listTasks(taskRepo, USER_A, q);
    if (!res.ok) throw new Error('ok');
    expect(res.data.items.map((t) => t.title)).toEqual(['Gamma']); // done AND LOW
  });
});

describe('listTasks — sort by status position', () => {
  let statusRepo: InMemoryStatusRepository;
  let taskRepo: InMemoryTaskRepository;
  let ids: Awaited<ReturnType<typeof seedStatuses>>;
  beforeEach(async () => {
    ({ statusRepo, taskRepo } = makeRepos());
    ids = await seedStatuses(statusRepo, USER_A);
    // Insert out of position order to prove ordering is by Status.position, not insertion/slug.
    await taskRepo.create(taskData(ids.done, { title: 'D' }));
    await taskRepo.create(taskData(ids.todo, { title: 'T' }));
    await taskRepo.create(taskData(ids.in_progress, { title: 'P' }));
  });

  it('sort=status asc orders by Status.position (todo<in_progress<done)', async () => {
    const q = listTasksQuerySchema.parse({ sort: 'status', dir: 'asc' });
    const res = await listTasks(taskRepo, USER_A, q);
    if (!res.ok) throw new Error('ok');
    expect(res.data.items.map((t) => t.status.slug)).toEqual(['todo', 'in_progress', 'done']);
  });

  it('sort=status desc reverses the position order', async () => {
    const q = listTasksQuerySchema.parse({ sort: 'status', dir: 'desc' });
    const res = await listTasks(taskRepo, USER_A, q);
    if (!res.ok) throw new Error('ok');
    expect(res.data.items.map((t) => t.status.slug)).toEqual(['done', 'in_progress', 'todo']);
  });
});

describe('sort allowlist (never injects, never passwordHash)', () => {
  it('rejects a non-allowlisted sort field like passwordHash', () => {
    const parsed = listTasksQuerySchema.safeParse({ sort: 'passwordHash' });
    expect(parsed.success).toBe(false);
  });

  it('rejects a SQL-injection-shaped sort value', () => {
    const parsed = listTasksQuerySchema.safeParse({ sort: 'title; DROP TABLE "Task";--' });
    expect(parsed.success).toBe(false);
  });

  it('rejects an invalid dir', () => {
    const parsed = listTasksQuerySchema.safeParse({ dir: 'sideways' });
    expect(parsed.success).toBe(false);
  });

  it('absent sort/dir fall back to the safe defaults', () => {
    const q = listTasksQuerySchema.parse({});
    expect(q.sort).toBe('createdAt');
    expect(q.dir).toBe('desc');
  });

  it('accepts each allowlisted field', () => {
    for (const f of ['createdAt', 'priority', 'status', 'title']) {
      expect(listTasksQuerySchema.safeParse({ sort: f }).success).toBe(true);
    }
  });
});

describe('IDOR — A cannot read/update/delete/assign B (and vice versa)', () => {
  let taskRepo: InMemoryTaskRepository;
  let statusRepo: InMemoryStatusRepository;
  let userRepo: InMemoryUserRepository;
  let idsA: Awaited<ReturnType<typeof seedStatuses>>;
  let idsB: Awaited<ReturnType<typeof seedStatuses>>;
  let taskOfA: string;

  beforeEach(async () => {
    ({ statusRepo, taskRepo } = makeRepos());
    userRepo = new InMemoryUserRepository();
    idsA = await seedStatuses(statusRepo, USER_A);
    idsB = await seedStatuses(statusRepo, USER_B);
    taskOfA = (await taskRepo.create(taskData(idsA.todo, { title: 'A-owned', ownerId: USER_A })))
      .id;
  });

  it('getTask: owner A succeeds, non-owner B → NOT_FOUND', async () => {
    const asA = await getTask(taskRepo, USER_A, taskOfA);
    expect(asA.ok).toBe(true);
    const asB = await getTask(taskRepo, USER_B, taskOfA);
    expect(asB.ok).toBe(false);
    if (!asB.ok) expect(asB.error.code).toBe('NOT_FOUND');
  });

  it('updateTask by B → NOT_FOUND and leaves the task unchanged', async () => {
    const res = await updateTask(
      taskRepo,
      statusRepo,
      USER_B,
      taskOfA,
      updateTaskSchema.parse({ title: 'hacked' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND');
    const still = await getTask(taskRepo, USER_A, taskOfA);
    if (!still.ok) throw new Error('ok');
    expect(still.data.title).toBe('A-owned'); // untouched
  });

  it("updateTask by A to B's status → VALIDATION_ERROR (cross-owner status invisible)", async () => {
    const res = await updateTask(
      taskRepo,
      statusRepo,
      USER_A,
      taskOfA,
      updateTaskSchema.parse({ statusId: idsB.done }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('VALIDATION_ERROR');
    const still = await getTask(taskRepo, USER_A, taskOfA);
    if (!still.ok) throw new Error('ok');
    expect(still.data.status.slug).toBe('todo'); // unchanged
  });

  it('deleteTask by B → NOT_FOUND and the task survives', async () => {
    const res = await deleteTask(taskRepo, USER_B, taskOfA);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND');
    const still = await getTask(taskRepo, USER_A, taskOfA);
    expect(still.ok).toBe(true); // survives
  });

  it('assignTask by B → NOT_FOUND (owner scope wins over assignee validation)', async () => {
    const assignee = await userRepo.create({ email: 'a@x.io', name: 'A', passwordHash: null });
    const res = await assignTask(
      taskRepo,
      userRepo,
      USER_B,
      taskOfA,
      assignTaskSchema.parse({ assigneeId: assignee.id }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND');
  });

  it('owner A can update their own task status and delete it', async () => {
    const upd = await updateTask(
      taskRepo,
      statusRepo,
      USER_A,
      taskOfA,
      updateTaskSchema.parse({ statusId: idsA.done }),
    );
    expect(upd.ok).toBe(true);
    if (upd.ok) expect(upd.data.status.slug).toBe('done');
    const del = await deleteTask(taskRepo, USER_A, taskOfA);
    expect(del.ok).toBe(true);
  });
});

describe('assignTask', () => {
  let taskRepo: InMemoryTaskRepository;
  let statusRepo: InMemoryStatusRepository;
  let userRepo: InMemoryUserRepository;
  let taskOfA: string;

  beforeEach(async () => {
    ({ statusRepo, taskRepo } = makeRepos());
    userRepo = new InMemoryUserRepository();
    const ids = await seedStatuses(statusRepo, USER_A);
    taskOfA = (await taskRepo.create(taskData(ids.todo, { ownerId: USER_A }))).id;
  });

  it('assigns to an existing user (happy path)', async () => {
    const assignee = await userRepo.create({ email: 'b@x.io', name: 'B', passwordHash: null });
    const res = await assignTask(
      taskRepo,
      userRepo,
      USER_A,
      taskOfA,
      assignTaskSchema.parse({ assigneeId: assignee.id }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.assigneeId).toBe(assignee.id);
  });

  it('rejects a non-existent assignee → VALIDATION_ERROR', async () => {
    const ghost = randomUUID();
    const res = await assignTask(
      taskRepo,
      userRepo,
      USER_A,
      taskOfA,
      assignTaskSchema.parse({ assigneeId: ghost }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('VALIDATION_ERROR');
  });

  it('assigneeId=null unassigns without touching the user repo', async () => {
    const res = await assignTask(
      taskRepo,
      userRepo,
      USER_A,
      taskOfA,
      assignTaskSchema.parse({ assigneeId: null }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.assigneeId).toBeNull();
  });
});

describe('updateTask schema — empty body', () => {
  it('rejects an empty update via .refine', () => {
    const parsed = updateTaskSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });
});

function taskData(statusId: string, over: Partial<CreateTaskData> = {}): CreateTaskData {
  return {
    title: 'seed',
    description: null,
    statusId,
    priority: 'MEDIUM',
    ownerId: USER_A,
    assigneeId: null,
    ...over,
  };
}
