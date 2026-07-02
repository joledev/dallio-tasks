import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/core/shared/pagination';

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(255)), // trim/lowercase before format check
  name: z.string().trim().min(1).max(120),
});

export const USER_SORT_FIELDS = ['createdAt', 'name', 'email'] as const;

export const listUsersQuerySchema = z.object({
  sort: z.enum(USER_SORT_FIELDS).default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
