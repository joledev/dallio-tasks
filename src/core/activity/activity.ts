export type ActivityAction =
  'participant.joined' | 'task.created' | 'task.updated' | 'task.moved' | 'task.deleted';

export type Activity = {
  id: string;
  boardId: string;
  participantId: string | null;
  action: ActivityAction;
  taskId: string | null;
  meta: unknown;
  createdAt: Date;
};

export type ActivityDTO = Omit<Activity, 'createdAt'> & {
  createdAt: string;
};

export const toActivityDTO = (activity: Activity): ActivityDTO => ({
  ...activity,
  createdAt: activity.createdAt.toISOString(),
});
