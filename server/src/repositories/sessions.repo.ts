import { db } from '../db/database.ts';

export const sessionsRepo = {
  create(tokenHash: string, userId: string, expiresAt: number): void {
    db()
      .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(tokenHash, userId, Date.now(), expiresAt);
  },

  findUserId(tokenHash: string): string | null {
    const row = db()
      .prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?')
      .get(tokenHash, Date.now()) as { user_id: string } | undefined;
    return row?.user_id ?? null;
  },

  delete(tokenHash: string): void {
    db().prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  },

  deleteExpired(): void {
    db().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  },
};
