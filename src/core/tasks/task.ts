import type { TaskStatus, TaskPriority } from './schema';

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  ownerId: string;
  assigneeId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// The server-set default status used by createTask. There is no status state-machine yet — any
// status→status change is allowed; add a canTransition guard only if the product later requires it.
export const DEFAULT_STATUS: TaskStatus = 'TODO';
