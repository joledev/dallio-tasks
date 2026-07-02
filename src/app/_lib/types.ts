import type { TaskStatus, TaskPriority } from '@/core/tasks/schema';
import type { Task } from '@/core/tasks/task';
import type { PublicUser } from '@/core/users/user';
import type { Paginated } from '@/core/shared/pagination';

// JSON-serialized wire shapes: over HTTP a `Date` is an ISO `string`. `Serialized<T>` maps the domain
// types so the DTOs can't drift from `Task`/`PublicUser` — only the Date→string edge differs.
type Serialized<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] };

export type TaskDTO = Serialized<Task>;
export type UserDTO = Serialized<PublicUser>;

export type { TaskStatus, TaskPriority, Paginated };
