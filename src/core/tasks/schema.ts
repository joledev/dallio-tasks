import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/core/shared/pagination';

export const StatusEnum = z.enum(['TODO', 'IN_PROGRESS', 'DONE']);
export const PriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH']);

// Create: status is NOT accepted — the server sets TODO. assigneeId is NOT accepted — assignment
// goes through the single explicit assignTask path.
export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  priority: PriorityEnum.default('MEDIUM'),
});

// Update: general fields only (no assigneeId — routed through assignTask; no ownerId).
export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    status: StatusEnum.optional(),
    priority: PriorityEnum.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'Empty update' });

export const assignTaskSchema = z.object({
  assigneeId: z.uuid().nullable(), // null = unassign
});

export const TASK_SORT_FIELDS = ['createdAt', 'priority', 'status', 'title'] as const;

export const listTasksQuerySchema = z.object({
  status: StatusEnum.optional(),
  priority: PriorityEnum.optional(),
  assigneeId: z.uuid().optional(),
  q: z.string().trim().min(1).max(200).optional(), // title contains (case-insensitive)
  sort: z.enum(TASK_SORT_FIELDS).default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type TaskStatus = z.infer<typeof StatusEnum>;
export type TaskPriority = z.infer<typeof PriorityEnum>;
