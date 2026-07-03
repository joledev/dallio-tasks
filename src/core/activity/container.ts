import type { ActivityRepository } from './repository';
import { PrismaActivityRepository } from './prisma-repository';

export const activityRepository: ActivityRepository = new PrismaActivityRepository();
