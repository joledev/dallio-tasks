import type { ParticipantRepository } from './repository';
import { PrismaParticipantRepository } from './prisma-repository';

// Composition root: the ESLint boundary bars src/app/** from importing *prisma-repository, so the port
// is instantiated here and the session seam / route handlers import this singleton.
export const participantRepository: ParticipantRepository = new PrismaParticipantRepository();
