import { randomUUID } from 'node:crypto';
import type { UserRepository, UserListParams } from '@/core/users/repository';
import type { User } from '@/core/users/user';

// In-memory UserRepository built to the same port contract. Replicates sort-by-field asc/desc and
// offset/limit + total semantics; getByEmail matches exact (schema lowercases before it reaches here).
export class InMemoryUserRepository implements UserRepository {
  private rows: User[] = [];
  private seq = 0;

  async list({ sort, dir, offset, limit }: UserListParams) {
    const sorted = [...this.rows].sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      let r = 0;
      if (av instanceof Date && bv instanceof Date) r = av.getTime() - bv.getTime();
      else if (typeof av === 'string' && typeof bv === 'string') r = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === 'asc' ? r : -r;
    });
    const total = sorted.length;
    const items = sorted.slice(offset, offset + limit);
    return { items, total };
  }

  async getById(id: string) {
    return this.rows.find((u) => u.id === id) ?? null;
  }

  async getByEmail(email: string) {
    return this.rows.find((u) => u.email === email) ?? null;
  }

  async create(data: { email: string; name: string; passwordHash: string | null }) {
    const now = new Date(Date.UTC(2020, 0, 1) + this.seq++ * 1000);
    const user: User = {
      id: randomUUID(),
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(user);
    return user;
  }
}
