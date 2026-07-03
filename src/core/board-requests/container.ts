import type { BoardRequestRepository } from './repository';
import { PrismaBoardRequestRepository } from './prisma-repository';

// Composition root: the ESLint boundary bars src/app/** from importing *prisma-repository, so the port
// is instantiated here and route handlers import this singleton.
export const boardRequestRepository: BoardRequestRepository = new PrismaBoardRequestRepository();
