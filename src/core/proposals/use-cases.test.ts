import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryBoardRepository } from '@/test/in-memory/board-repository';
import { InMemoryParticipantRepository } from '@/test/in-memory/participant-repository';
import { InMemoryProposalRepository } from './in-memory-repository';
import { InMemoryPresenceStore } from '@/test/in-memory/presence';
import { InMemoryStatusRepository } from '@/test/in-memory/status-repository';
import { InMemoryTaskRepository } from '@/test/in-memory/task-repository';
import { InMemoryEventBus } from '@/test/in-memory/event-bus';
import { InMemoryActivityRepository } from '@/test/in-memory/activity-repository';
import type { Actor } from '@/core/shared/actor';
import type { Board } from '@/core/boards/board';
import { createTaskSchema } from '@/core/tasks/schema';
import { createTask, updateTask } from '@/core/tasks/use-cases';
import { createProposal, voteOnProposal, type ProposalDeps } from './use-cases';

const BOARD_ID = '00000000-0000-4000-8000-00000000000a';
const OWNER_ID = '00000000-0000-4000-8000-000000000001';

function board(mode: Board['mode']): Board {
  return {
    id: BOARD_ID,
    ownerId: OWNER_ID,
    name: 'Voting board',
    shareToken: 'vote-token',
    mode,
    protected: false,
    createdAt: new Date('2020-01-01T00:00:00.000Z'),
    updatedAt: new Date('2020-01-01T00:00:00.000Z'),
  };
}

async function seedStatuses(repo: InMemoryStatusRepository) {
  const todo = await repo.create({
    boardId: BOARD_ID,
    name: 'To do',
    slug: 'todo',
    position: 0,
    color: null,
    isDefault: true,
  });
  const done = await repo.create({
    boardId: BOARD_ID,
    name: 'Done',
    slug: 'done',
    position: 1,
    color: 'green',
    isDefault: false,
  });
  return { todo, done };
}

async function makeDeps(mode: Board['mode']): Promise<ProposalDeps & { actors: Actor[] }> {
  const statusRepo = new InMemoryStatusRepository();
  const taskRepo = new InMemoryTaskRepository((id) => statusRepo.refById(id));
  await seedStatuses(statusRepo);

  const participantRepo = new InMemoryParticipantRepository();
  const p1 = await participantRepo.create({
    boardId: BOARD_ID,
    displayName: 'Ana',
    color: 'blue',
    sessionTokenHash: randomUUID(),
  });
  const p2 = await participantRepo.create({
    boardId: BOARD_ID,
    displayName: 'Ben',
    color: 'green',
    sessionTokenHash: randomUUID(),
  });

  const presence = new InMemoryPresenceStore(() => Date.UTC(2020, 0, 1));
  await presence.join(BOARD_ID, p1.id);
  await presence.join(BOARD_ID, p2.id);

  return {
    proposalRepo: new InMemoryProposalRepository(),
    boardRepo: new InMemoryBoardRepository([board(mode)]),
    taskRepo,
    statusRepo,
    participantRepo,
    presence,
    publisher: new InMemoryEventBus(),
    activityRepo: new InMemoryActivityRepository(),
    actors: [
      { boardId: BOARD_ID, participantId: p1.id },
      { boardId: BOARD_ID, participantId: p2.id },
    ],
  };
}

describe('proposal voting', () => {
  beforeEach(() => {
    process.env.PROPOSAL_MIN_APPROVALS = '2';
    process.env.PROPOSAL_APPROVAL_RATIO = '0.5';
  });

  afterEach(() => {
    delete process.env.PROPOSAL_MIN_APPROVALS;
    delete process.env.PROPOSAL_APPROVAL_RATIO;
  });

  it('does not create proposals in DIRECT mode', async () => {
    const deps = await makeDeps('DIRECT');
    const res = await createProposal(deps, deps.actors[0], {
      kind: 'CREATE_TASK',
      payload: createTaskSchema.parse({ title: 'Needs approval' }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('CONFLICT');
    expect(await deps.proposalRepo.listByBoard(BOARD_ID)).toHaveLength(0);
  });

  it('upserts one changeable vote per participant', async () => {
    const deps = await makeDeps('VOTE');
    const created = await createProposal(deps, deps.actors[0], {
      kind: 'CREATE_TASK',
      payload: createTaskSchema.parse({ title: 'Draft' }),
    });
    if (!created.ok) throw new Error('expected proposal');

    const rejected = await voteOnProposal(deps, deps.actors[0], created.data.id, {
      value: 'REJECT',
    });
    if (!rejected.ok) throw new Error('expected vote');
    expect(rejected.data.votes).toHaveLength(1);
    expect(rejected.data.votes[0].value).toBe('REJECT');

    const approved = await voteOnProposal(deps, deps.actors[0], created.data.id, {
      value: 'APPROVE',
    });
    if (!approved.ok) throw new Error('expected vote change');
    expect(approved.data.votes).toHaveLength(1);
    expect(approved.data.votes[0].value).toBe('APPROVE');
  });

  it('auto-applies at threshold through task use-cases and emits proposal.applied plus task events', async () => {
    const deps = await makeDeps('VOTE');
    const task = await createTask(
      deps.taskRepo,
      deps.statusRepo,
      deps.actors[0],
      createTaskSchema.parse({ title: 'Old title' }),
    );
    if (!task.ok) throw new Error('expected task');

    const proposal = await createProposal(deps, deps.actors[0], {
      kind: 'UPDATE_TASK',
      targetTaskId: task.data.id,
      payload: { title: 'Approved title' },
    });
    if (!proposal.ok) throw new Error('expected proposal');

    await voteOnProposal(deps, deps.actors[0], proposal.data.id, { value: 'APPROVE' });
    const applied = await voteOnProposal(deps, deps.actors[1], proposal.data.id, {
      value: 'APPROVE',
    });
    if (!applied.ok) throw new Error('expected apply');

    expect(applied.data.status).toBe('APPLIED');
    await expect(deps.taskRepo.get(task.data.id, BOARD_ID)).resolves.toMatchObject({
      title: 'Approved title',
    });
    const bus = deps.publisher as InMemoryEventBus;
    expect(bus.published.some((event) => event.type === 'proposal.applied')).toBe(true);
    expect(bus.published.some((event) => event.type === 'task.updated')).toBe(true);
  });

  it('rejects stale targetVersion as conflict', async () => {
    const deps = await makeDeps('VOTE');
    const task = await createTask(
      deps.taskRepo,
      deps.statusRepo,
      deps.actors[0],
      createTaskSchema.parse({ title: 'Original' }),
    );
    if (!task.ok) throw new Error('expected task');

    const proposal = await createProposal(deps, deps.actors[0], {
      kind: 'UPDATE_TASK',
      targetTaskId: task.data.id,
      payload: { title: 'From proposal' },
    });
    if (!proposal.ok) throw new Error('expected proposal');

    await updateTask(deps.taskRepo, deps.statusRepo, deps.actors[0], task.data.id, {
      title: 'Direct edit',
    });

    await voteOnProposal(deps, deps.actors[0], proposal.data.id, { value: 'APPROVE' });
    const rejected = await voteOnProposal(deps, deps.actors[1], proposal.data.id, {
      value: 'APPROVE',
    });
    if (!rejected.ok) throw new Error('expected conflict rejection');

    expect(rejected.data.status).toBe('REJECTED');
    expect(rejected.data.meta).toEqual({ reason: 'conflict' });
    await expect(deps.taskRepo.get(task.data.id, BOARD_ID)).resolves.toMatchObject({
      title: 'Direct edit',
    });
  });
});
