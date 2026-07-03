import type { TaskPriority } from '@/core/tasks/schema';
import type { Task } from '@/core/tasks/task';
import type { PublicUser } from '@/core/users/user';
import type { GuestParticipant } from '@/core/participants/participant';
import type { ActivityDTO as CoreActivityDTO } from '@/core/activity/activity';
import type { Status, StatusRef } from '@/core/statuses/status';
import type { StatusColor } from '@/core/statuses/schema';
import type { Paginated } from '@/core/shared/pagination';
import type { OwnerBoardView } from '@/core/boards/board';
import type { ProposalDTO as CoreProposalDTO } from '@/core/proposals/proposal';

// JSON-serialized wire shapes: over HTTP a `Date` is an ISO `string`. `Serialized<T>` maps the domain
// types so the DTOs can't drift from `Task`/`PublicUser`/`Status` — only the Date→string edge differs.
// `Task.status` is a nested `StatusRef` (no Date fields) so it passes through unchanged.
type Serialized<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] };

export type TaskDTO = Serialized<Task>;
export type BoardDTO = Serialized<OwnerBoardView>;
export type UserDTO = Serialized<PublicUser>;
export type StatusDTO = Serialized<Status>;
export type ActivityDTO = CoreActivityDTO;
export type ProposalDTO = CoreProposalDTO;
export type BoardModeDTO = { mode: 'DIRECT' | 'VOTE' };
// The guest participant projection over the wire (no Date fields → the shape is unchanged): the ONLY
// participant shape the client ever sees. No `boardId`, no `sessionTokenHash` (UI-H4).
export type GuestParticipantDTO = Serialized<GuestParticipant>;

export type PresenceSnapshotDTO = {
  participants: GuestParticipantDTO[];
  onlineCount: number;
};

export type { TaskPriority, Paginated, StatusRef, StatusColor };
