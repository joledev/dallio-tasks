import type { UserRepository } from './repository';
import { PrismaUserRepository } from './prisma-repository';

export const userRepository: UserRepository = new PrismaUserRepository();
