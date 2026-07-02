import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryTaskRepository } from '@/test/in-memory/task-repository';
import { InMemoryUserRepository } from '@/test/in-memory/user-repository';
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

function seedData(over: Partial<CreateTaskData> = {}): CreateTaskData {
  return {
    title: 'seed',
    description: null,
    status: 'TODO',
    priority: 'MEDIUM',
    ownerId: USER_A,
    assigneeId: null,
    ...over,
  };
}

describe('createTask — server-set fields', () => {
  let repo: InMemoryTaskRepository;
  beforeEach(() => {
    repo = new InMemoryTaskRepository();
  });

  it('sets status=TODO and owner from actingUserId, unassigned', async () => {
    const parsed = createTaskSchema.parse({ title: 'Buy milk', priority: 'HIGH' });
    const res = await createTask(repo, USER_A, parsed);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe('TODO');
    expect(res.data.ownerId).toBe(USER_A);
    expect(res.data.assigneeId).toBeNull();
    expect(res.data.priority).toBe('HIGH');
  });

  it('drops client-supplied status/ownerId/assigneeId at the schema boundary', () => {
    const parsed = createTaskSchema.parse({
      title: 'Sneaky',
      status: 'DONE', // attacker tries to force a status
      ownerId: USER_B, // attacker tries to set owner
      assigneeId: USER_B,
    } as Record<string, unknown>);
    expect('status' in parsed).toBe(false);
    expect('ownerId' in parsed).toBe(false);
    expect('assigneeId' in parsed).toBe(false);
  });

  it('server forces TODO even if a status somehow reaches the use-case input', async () => {
    // Simulate a bypassed boundary: input carries status=DONE. createTask must ignore it.
    const res = await createTask(repo, USER_A, {
      title: 'x',
      priority: 'LOW',
      status: 'DONE',
    } as unknown as ReturnType<typeof createTaskSchema.parse>);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe('TODO');
  });
});

describe('listTasks — pagination', () => {
  let repo: InMemoryTaskRepository;
  beforeEach(async () => {
    repo = new InMemoryTaskRepository();
    // 25 tasks Task-00..Task-24, 10 of them DONE.
    for (let i = 0; i < 25; i++) {
      await repo.create(
        seedData({
          title: `Task-${String(i).padStart(2, '0')}`,
          status: i < 10 ? 'DONE' : 'TODO',
        }),
      );
    }
  });

  it('page=1 is not skipped (offset 0 returns the first row)', async () => {
    const q = listTasksQuerySchema.parse({ sort: 'title', dir: 'asc', page: '1', size: '10' });
    const res = await listTasks(repo, USER_A, q);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.items).toHaveLength(10);
    expect(res.data.items[0].title).toBe('Task-00'); // first row present, not skipped
    expect(res.data.total).toBe(25);
    expect(res.data.page).toBe(1);
  });

  it('last partial page returns the remainder', async () => {
    const q = listTasksQuerySchema.parse({ sort: 'title', dir: 'asc', page: '3', size: '10' });
    const res = await listTasks(repo, USER_A, q);
    if (!res.ok) throw new Error('expected ok');
    expect(res.data.items).toHaveLength(5);
    expect(res.data.items[0].title).toBe('Task-20');
    expect(res.data.total).toBe(25);
  });

  it('out-of-range page returns empty items but the full total', async () => {
    const q = listTasksQuerySchema.parse({ page: '99', size: '10' });
    const res = await listTasks(repo, USER_A, q);
    if (!res.ok) throw new Error('expected ok');
    expect(res.data.items).toEqual([]);
    expect(res.data.total).toBe(25); // total is NOT clamped to the page
  });

  it('total reflects the SAME filters as the page query', async () => {
    const q = listTasksQuerySchema.parse({ status: 'DONE', page: '1', size: '5' });
    const res = await listTasks(repo, USER_A, q);
    if (!res.ok) throw new Error('expected ok');
    expect(res.data.items).toHaveLength(5); // one page of the filtered set
    expect(res.data.total).toBe(10); // filtered total, not 25
    expect(res.data.items.every((t) => t.status === 'DONE')).toBe(true);
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
  let repo: InMemoryTaskRepository;
  const assignee = randomUUID();
  beforeEach(async () => {
    repo = new InMemoryTaskRepository();
    await repo.create(seedData({ title: 'Alpha', status: 'TODO', priority: 'LOW' }));
    await repo.create(seedData({ title: 'Beta', status: 'DONE', priority: 'HIGH' }));
    await repo.create(
      seedData({ title: 'Gamma', status: 'DONE', priority: 'LOW', assigneeId: assignee }),
    );
    await repo.create(seedData({ title: 'aLPha-two', status: 'IN_PROGRESS', priority: 'MEDIUM' }));
  });

  it('filters by status', async () => {
    const q = listTasksQuerySchema.parse({ status: 'DONE' });
    const res = await listTasks(repo, USER_A, q);
    if (!res.ok) throw new Error('ok');
    expect(res.data.items.map((t) => t.title).sort()).toEqual(['Beta', 'Gamma']);
  });

  it('filters by priority', async () => {
    const q = listTasksQuerySchema.parse({ priority: 'LOW' });
    const res = await listTasks(repo, USER_A, q);
    if (!res.ok) throw new Error('ok');
    expect(res.data.items.map((t) => t.title).sort()).toEqual(['Alpha', 'Gamma']);
  });

  it('filters by assigneeId', async () => {
    const q = listTasksQuerySchema.parse({ assigneeId: assignee });
    const res = await listTasks(repo, USER_A, q);
    if (!res.ok) throw new Error('ok');
    expect(res.data.items.map((t) => t.title)).toEqual(['Gamma']);
  });

  it('filters by q (title contains, case-insensitive)', async () => {
    const q = listTasksQuerySchema.parse({ q: 'alpha' });
    const res = await listTasks(repo, USER_A, q);
    if (!res.ok) throw new Error('ok');
    expect(res.data.items.map((t) => t.title).sort()).toEqual(['Alpha', 'aLPha-two']);
  });

  it('combines filters with AND', async () => {
    const q = listTasksQuerySchema.parse({ status: 'DONE', priority: 'LOW' });
    const res = await listTasks(repo, USER_A, q);
    if (!res.ok) throw new Error('ok');
    expect(res.data.items.map((t) => t.title)).toEqual(['Gamma']); // DONE AND LOW
  });
});

describe('sort allowlist (never injects, never passwordHash)', () => {
  it('rejects a non-allowlisted sort field like passwordHash', () => {
    const parsed = listTasksQuerySchema.safeParse({ sort: 'passwordHash' });
    // Never throws (structured failure), never reaches the DB as a raw identifier.
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
  let userRepo: InMemoryUserRepository;
  let taskOfA: string;

  beforeEach(async () => {
    taskRepo = new InMemoryTaskRepository();
    userRepo = new InMemoryUserRepository();
    const created = await taskRepo.create(seedData({ title: 'A-owned', ownerId: USER_A }));
    taskOfA = created.id;
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

  it('owner A can delete and update their own task', async () => {
    const upd = await updateTask(
      taskRepo,
      USER_A,
      taskOfA,
      updateTaskSchema.parse({ status: 'DONE' }),
    );
    expect(upd.ok).toBe(true);
    if (upd.ok) expect(upd.data.status).toBe('DONE');
    const del = await deleteTask(taskRepo, USER_A, taskOfA);
    expect(del.ok).toBe(true);
  });
});

describe('assignTask', () => {
  let taskRepo: InMemoryTaskRepository;
  let userRepo: InMemoryUserRepository;
  let taskOfA: string;

  beforeEach(async () => {
    taskRepo = new InMemoryTaskRepository();
    userRepo = new InMemoryUserRepository();
    taskOfA = (await taskRepo.create(seedData({ ownerId: USER_A }))).id;
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
