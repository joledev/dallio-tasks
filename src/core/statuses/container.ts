import type { StatusRepository } from './repository';
import { PrismaStatusRepository } from './prisma-repository';

// Composition root: the ESLint boundary bars src/app/** from importing *prisma-repository, so the port
// is instantiated here and route handlers import this singleton alongside taskRepository.
export const statusRepository: StatusRepository = new PrismaStatusRepository();
