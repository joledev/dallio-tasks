import { ApiError } from '@/app/_lib/api';
import type { ErrorCode } from '@/core/shared/envelope';

// Maps the envelope's closed `error.code` set to user-facing copy. Because `ErrorCode` is a closed
// union, `Record<ErrorCode, string>` is exhaustive — adding a code without a message won't compile.
export const ERROR_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Please check the highlighted fields.',
  UNAUTHORIZED: 'Your session is not active. Reload the page.',
  NOT_FOUND: 'That task no longer exists — the list has been refreshed.',
  CONFLICT: 'That value conflicts with an existing record.',
  INTERNAL: 'Something went wrong. Please try again.',
};

// Any thrown value → user-facing copy: a typed ApiError maps by code, anything else is a generic 500.
export const messageFor = (error: unknown): string =>
  error instanceof ApiError ? ERROR_MESSAGE[error.code] : ERROR_MESSAGE.INTERNAL;

export type { ErrorCode };
