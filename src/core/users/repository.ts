import type { User } from './user';
import type { USER_SORT_FIELDS } from './schema';

export type UserSortField = (typeof USER_SORT_FIELDS)[number];

export type UserListParams = {
  sort: UserSortField;
  dir: 'asc' | 'desc';
  offset: number;
  limit: number;
};

export interface UserRepository {
  list(params: UserListParams): Promise<{ items: User[]; total: number }>;
  getById(id: string): Promise<User | null>;
  getByEmail(email: string): Promise<User | null>; // for CONFLICT + the auth bonus
  create(data: { email: string; name: string; passwordHash: string | null }): Promise<User>;
}
