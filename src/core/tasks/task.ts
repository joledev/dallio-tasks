import type { TaskPriority } from './schema';
import type { StatusRef } from '@/core/statuses/status';

export type Task = {
  id: string;
  title: string;
  description: string | null;
  statusId: string; // FK
  status: StatusRef; // joined status for display + position sort
  priority: TaskPriority;
  ownerId: string;
  assigneeId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
