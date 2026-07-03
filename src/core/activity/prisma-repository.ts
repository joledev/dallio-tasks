import { Prisma } from '@prisma/client';
import { prisma } from '@/core/shared/prisma';
import type { Activity } from './activity';
import type { ActivityRepository, AppendActivityData } from './repository';

function toActivity(row: {
  id: string;
  boardId: string;
  participantId: string | null;
  action: string;
  taskId: string | null;
  meta: Prisma.JsonValue | null;
  createdAt: Date;
}): Activity {
  return {
    id: row.id,
    boardId: row.boardId,
    participantId: row.participantId,
    action: row.action as Activity['action'],
    taskId: row.taskId,
    meta: row.meta,
    createdAt: row.createdAt,
  };
}

export class PrismaActivityRepository implements ActivityRepository {
  async append(data: AppendActivityData): Promise<Activity> {
    return toActivity(
      await prisma.activity.create({
        data: {
          boardId: data.boardId,
          participantId: data.participantId,
          action: data.action,
          taskId: data.taskId,
          meta: data.meta === undefined ? Prisma.JsonNull : (data.meta as Prisma.InputJsonValue),
        },
      }),
    );
  }

  async listRecent(boardId: string, limit: number): Promise<Activity[]> {
    const rows = await prisma.activity.findMany();
    return rows
      .map(toActivity)
      .filter((row) => row.boardId === boardId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-limit);
  }
}
