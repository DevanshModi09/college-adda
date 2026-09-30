import { db } from '../db/database.ts';

export const sessionsRepo = {
  async create(tokenHash: string, userId: string, expiresAt: number): Promise<void> {
    await db().session.create({ data: { tokenHash, userId, createdAt: Date.now(), expiresAt } });
  },

  async findUserId(tokenHash: string): Promise<string | null> {
    const s = await db().session.findFirst({ where: { tokenHash, expiresAt: { gt: Date.now() } }, select: { userId: true } });
    return s?.userId ?? null;
  },

  async delete(tokenHash: string): Promise<void> {
    await db().session.deleteMany({ where: { tokenHash } });
  },

  async deleteExpired(): Promise<void> {
    await db().session.deleteMany({ where: { expiresAt: { lte: Date.now() } } });
  },
};
