import type { ErrorCode, Result } from '@/core/shared/envelope';
import { MAX_PAGE_SIZE } from '@/core/shared/pagination';
import type { CreateTaskInput, UpdateTaskInput, AssignTaskInput } from '@/core/tasks/schema';
import type { CreateStatusInput } from '@/core/statuses/schema';
import type { TaskDTO, UserDTO, StatusDTO, Paginated } from './types';
import type { TaskListFilters } from './query-keys';

// The single typed error the whole UI reasons about. It carries the envelope's closed `code` so
// call sites (toasts, form-field mapping) can branch on it without re-parsing HTTP.
export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// One place that unwraps the `{ok,data}` / `{ok,error}` envelope. Everything else in the app calls
// the typed wrappers below and never touches `fetch` or the `error.code` shape directly.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    // Network failure never reaches the envelope — normalize to INTERNAL so callers have one shape.
    throw new ApiError('INTERNAL', 'Network error');
  }

  let body: Result<T> | null;
  try {
    body = (await res.json()) as Result<T>;
  } catch {
    throw new ApiError('INTERNAL', 'Network error');
  }

  if (!body || typeof body !== 'object' || !('ok' in body)) {
    throw new ApiError('INTERNAL', 'Malformed response');
  }
  if (!body.ok) {
    throw new ApiError(body.error.code, body.error.message, body.error.details);
  }
  return body.data;
}

// Build a query string from the filters, omitting empty/undefined params so server defaults apply.
function toQueryString(filters: TaskListFilters): string {
  const params = new URLSearchParams();
  const put = (key: string, value: string | number | undefined) => {
    if (value === undefined || value === '') return;
    params.set(key, String(value));
  };
  put('statusId', filters.statusId);
  put('priority', filters.priority);
  put('assigneeParticipantId', filters.assigneeParticipantId);
  put('q', filters.q);
  put('sort', filters.sort);
  put('dir', filters.dir);
  put('page', filters.page);
  put('size', filters.size);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  listTasks: (filters: TaskListFilters) =>
    request<Paginated<TaskDTO>>(`/api/tasks${toQueryString(filters)}`),

  createTask: (body: CreateTaskInput) =>
    request<TaskDTO>('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),

  updateTask: (id: string, body: UpdateTaskInput) =>
    request<TaskDTO>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteTask: (id: string) => request<null>(`/api/tasks/${id}`, { method: 'DELETE' }),

  assignTask: (id: string, body: AssignTaskInput) =>
    request<TaskDTO>(`/api/tasks/${id}/assign`, { method: 'POST', body: JSON.stringify(body) }),

  // The board / picker want the whole registry, not a page — request the max page size. A workspace
  // with more than MAX_PAGE_SIZE users would need real pagination here.
  listUsers: async (): Promise<UserDTO[]> => {
    const { items } = await request<Paginated<UserDTO>>(`/api/users?size=${MAX_PAGE_SIZE}`);
    return items;
  },

  // Statuses are the board columns + every status option. A user has a handful, so the list is
  // unpaginated (mirrors the server's `GET /api/statuses`).
  statuses: {
    list: () => request<StatusDTO[]>('/api/statuses'),
    create: (body: CreateStatusInput) =>
      request<StatusDTO>('/api/statuses', { method: 'POST', body: JSON.stringify(body) }),
  },
};
