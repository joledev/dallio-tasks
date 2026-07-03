import { z } from 'zod';
import {
  assignTaskSchema,
  createTaskSchema,
  moveTaskSchema,
  updateTaskSchema,
} from '@/core/tasks/schema';

export const ProposalKindEnum = z.enum([
  'CREATE_TASK',
  'UPDATE_TASK',
  'MOVE_TASK',
  'DELETE_TASK',
  'ASSIGN_TASK',
]);

export const VoteValueEnum = z.enum(['APPROVE', 'REJECT']);

export const createProposalSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('CREATE_TASK'),
      payload: createTaskSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('UPDATE_TASK'),
      targetTaskId: z.uuid(),
      payload: updateTaskSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('MOVE_TASK'),
      targetTaskId: z.uuid(),
      payload: moveTaskSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('DELETE_TASK'),
      targetTaskId: z.uuid(),
      payload: z.object({}).strict().default({}),
    })
    .strict(),
  z
    .object({
      kind: z.literal('ASSIGN_TASK'),
      targetTaskId: z.uuid(),
      payload: assignTaskSchema,
    })
    .strict(),
]);

export const voteSchema = z
  .object({
    value: VoteValueEnum,
  })
  .strict();

export const boardModeSchema = z
  .object({
    mode: z.enum(['DIRECT', 'VOTE']),
  })
  .strict();

export type CreateProposalInput = z.infer<typeof createProposalSchema>;
export type VoteInput = z.infer<typeof voteSchema>;
export type BoardModeInput = z.infer<typeof boardModeSchema>;
