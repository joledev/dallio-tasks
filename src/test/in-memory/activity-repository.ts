import type { Activity } from '@/core/activity/activity';
import type { ActivityRepository, AppendActivityData } from '@/core/activity/repository';

export class InMemoryActivityRepository implements ActivityRepository {
  readonly rows: Activity[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async append(data: AppendActivityData): Promise<Activity> {
    const row: Activity = {
      id: `activity-${this.rows.length + 1}`,
      boardId: data.boardId,
      participantId: data.participantId,
      action: data.action,
      taskId: data.taskId,
      meta: data.meta ?? null,
      createdAt: this.now(),
    };
    this.rows.push(row);
    return row;
  }

  async listRecent(boardId: string, limit: number): Promise<Activity[]> {
    return this.rows.filter((row) => row.boardId === boardId).slice(-limit);
  }
}
