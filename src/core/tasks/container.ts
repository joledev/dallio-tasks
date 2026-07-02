import type { TaskRepository } from './repository';
import { PrismaTaskRepository } from './prisma-repository';

// Composition root: the ESLint boundary bars src/app/** from importing *prisma-repository, so the port
// is instantiated here (the single wiring site in core/) and route handlers import this singleton.
export const taskRepository: TaskRepository = new PrismaTaskRepository();
