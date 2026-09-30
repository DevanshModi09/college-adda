import type { Role } from '@adda/shared';
import { db } from '../db/database.ts';

export interface UserRecord {
  id: string;
  username: string;
  name: string;
  branch: string;
  year: number;
  section: string;
  role: Role;
  bio: string;
  interests: string[];
  color: string;
  passwordHash: string;
  guest: boolean;
  createdAt: number;
}

interface UserRow {
  id: string;
  username: string;
  name: string;
  branch: string;
  year: number;
  section: string;
  role: Role;
  bio: string;
  interests: string;
  color: string;
  password_hash: string;
  is_guest: number;
  created_at: number;
}

const toRecord = (r: UserRow): UserRecord => ({
  id: r.id,
  username: r.username,
  name: r.name,
  branch: r.branch,
  year: r.year,
  section: r.section,
  role: r.role,
  bio: r.bio,
  interests: JSON.parse(r.interests) as string[],
  color: r.color,
  passwordHash: r.password_hash,
  guest: r.is_guest === 1,
  createdAt: r.created_at,
});

export const usersRepo = {
  findById(id: string): UserRecord | null {
    const row = db().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? toRecord(row) : null;
  },

  findByUsername(username: string): UserRecord | null {
    const row = db().prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
    return row ? toRecord(row) : null;
  },

  findManyByIds(ids: string[]): UserRecord[] {
    if (!ids.length) return [];
    const rows = db()
      .prepare(`SELECT * FROM users WHERE id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids) as unknown as UserRow[];
    return rows.map(toRecord);
  },

  search(opts: { q?: string; branch?: string; year?: number; section?: string; excludeId: string; limit: number }): UserRecord[] {
    const where = ['id != ?', 'is_guest = 0'];
    const params: (string | number)[] = [opts.excludeId];
    if (opts.q) {
      where.push("(name LIKE ? ESCAPE '\\' OR username LIKE ? ESCAPE '\\' OR bio LIKE ? ESCAPE '\\' OR interests LIKE ? ESCAPE '\\')");
      const like = `%${opts.q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
      params.push(like, like, like, like);
    }
    if (opts.branch) {
      where.push('branch = ?');
      params.push(opts.branch);
    }
    if (opts.year) {
      where.push('year = ?');
      params.push(opts.year);
    }
    if (opts.section) {
      where.push('section = ?');
      params.push(opts.section);
    }
    params.push(opts.limit);
    const rows = db()
      .prepare(`SELECT * FROM users WHERE ${where.join(' AND ')} ORDER BY name COLLATE NOCASE LIMIT ?`)
      .all(...params) as unknown as UserRow[];
    return rows.map(toRecord);
  },

  insert(u: UserRecord): void {
    db()
      .prepare(
        `INSERT INTO users (id, username, name, branch, year, section, bio, interests, color, password_hash, is_guest, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(u.id, u.username, u.name, u.branch, u.year, u.section, u.bio, JSON.stringify(u.interests), u.color, u.passwordHash, u.guest ? 1 : 0, u.createdAt);
  },

  /** Deletes guest accounts created before the cutoff (their data cascades); returns how many. */
  deleteGuestsBefore(cutoff: number): number {
    return Number(db().prepare('DELETE FROM users WHERE is_guest = 1 AND created_at < ?').run(cutoff).changes);
  },

  /** Promotes the given usernames to admin; returns how many rows changed. */
  promoteAdmins(usernames: string[]): number {
    if (!usernames.length) return 0;
    return Number(
      db()
        .prepare(`UPDATE users SET role = 'admin' WHERE role != 'admin' AND username IN (${usernames.map(() => '?').join(',')})`)
        .run(...usernames).changes
    );
  },

  updateProfile(id: string, p: Pick<UserRecord, 'name' | 'branch' | 'year' | 'section' | 'bio' | 'interests'>): void {
    db()
      .prepare('UPDATE users SET name = ?, branch = ?, year = ?, section = ?, bio = ?, interests = ? WHERE id = ?')
      .run(p.name, p.branch, p.year, p.section, p.bio, JSON.stringify(p.interests), id);
  },
};
