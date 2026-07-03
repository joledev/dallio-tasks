import type { Activity, ActivityAction } from './activity';

export type AppendActivityData = {
  boardId: string;
  participantId: string | null;
  action: ActivityAction;
  taskId: string | null;
  meta?: unknown;
};

export interface ActivityRepository {
  append(data: AppendActivityData): Promise<Activity>;
  listRecent(boardId: string, limit: number): Promise<Activity[]>;
}
