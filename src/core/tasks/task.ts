import type { TaskPriority } from './schema';
import type { StatusRef } from '@/core/statuses/status';

export type Task = {
  id: string;
  title: string;
  description: string | null;
  statusId: string; // FK
  status: StatusRef; // joined status for display + position sort
  priority: TaskPriority;
  boardId: string; // IDOR anchor (was ownerId; the board is the scope from L1b)
  assigneeParticipantId: string | null; // H1: assignment repointed from User → board Participant

  createdAt: Date;
  updatedAt: Date;
};
