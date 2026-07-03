import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/core/shared/pagination';

export const PriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH']);

// Create: statusId is OPTIONAL — absent → the server resolves the owner's default status. A supplied
// id is scope-validated in the use-case, not here. assigneeId is NOT accepted (routed via assignTask).
export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  // An empty string means "no explicit status" (the create form's initial value) → treat as absent so
  // the server resolves the owner's default. A bare z.uuid() would reject '' and block the form.
  statusId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
  priority: PriorityEnum.default('MEDIUM'),
});

// Update: general fields only (no assigneeId — routed through assignTask; no ownerId).
export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    statusId: z.uuid().optional(),
    priority: PriorityEnum.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'Empty update' });

export const assignTaskSchema = z.object({
  assigneeId: z.uuid().nullable(), // null = unassign
});

// `status` still sorts, but now by the joined Status.position (not the removed enum).
export const TASK_SORT_FIELDS = ['createdAt', 'priority', 'status', 'title'] as const;

export const listTasksQuerySchema = z.object({
  statusId: z.uuid().optional(),
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
export type TaskPriority = z.infer<typeof PriorityEnum>;
