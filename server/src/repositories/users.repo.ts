import type { Role } from '@adda/shared';
import { db } from '../db/database.ts';
import { ms } from '../db/convert.ts';
import { Prisma, type User } from '../generated/prisma/client.ts';

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

const toRecord = (u: User): UserRecord => ({
  id: u.id,
  username: u.username,
  name: u.name,
  branch: u.branch,
  year: u.year,
  section: u.section,
  role: u.role as Role,
  bio: u.bio,
  interests: u.interests,
  color: u.color,
  passwordHash: u.passwordHash,
  guest: u.isGuest,
  createdAt: ms(u.createdAt),
});

export const usersRepo = {
  async findById(id: string): Promise<UserRecord | null> {
    const u = await db().user.findUnique({ where: { id } });
    return u ? toRecord(u) : null;
  },

  async findByUsername(username: string): Promise<UserRecord | null> {
    const u = await db().user.findUnique({ where: { username } });
    return u ? toRecord(u) : null;
  },

  async findManyByIds(ids: string[]): Promise<UserRecord[]> {
    if (!ids.length) return [];
    return (await db().user.findMany({ where: { id: { in: ids } } })).map(toRecord);
  },

  /** Name / username / bio / interest substring search, case-insensitive, sorted by name. */
  async search(opts: { q?: string; branch?: string; year?: number; section?: string; excludeId: string; limit: number }): Promise<UserRecord[]> {
    const where = [Prisma.sql`id <> ${opts.excludeId}`, Prisma.sql`NOT is_guest`];
    if (opts.q) {
      const like = `%${opts.q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
      where.push(
        Prisma.sql`(name ILIKE ${like} OR username ILIKE ${like} OR bio ILIKE ${like} OR array_to_string(interests, ' ') ILIKE ${like})`
      );
    }
    if (opts.branch) where.push(Prisma.sql`branch = ${opts.branch}`);
    if (opts.year) where.push(Prisma.sql`year = ${opts.year}`);
    if (opts.section) where.push(Prisma.sql`section = ${opts.section}`);
    const ids = await db().$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE ${Prisma.join(where, ' AND ')} ORDER BY lower(name) LIMIT ${opts.limit}`;
    const byId = new Map((await this.findManyByIds(ids.map((r) => r.id))).map((u) => [u.id, u]));
    return ids.flatMap((r) => byId.get(r.id) ?? []);
  },

  async insert(u: UserRecord): Promise<void> {
    await db().user.create({
      data: {
        id: u.id,
        username: u.username,
        name: u.name,
        branch: u.branch,
        year: u.year,
        section: u.section,
        bio: u.bio,
        interests: u.interests,
        color: u.color,
        passwordHash: u.passwordHash,
        isGuest: u.guest,
        createdAt: u.createdAt,
      },
    });
  },

  /** Deletes guest accounts created before the cutoff (their data cascades); returns how many. */
  async deleteGuestsBefore(cutoff: number): Promise<number> {
    return (await db().user.deleteMany({ where: { isGuest: true, createdAt: { lt: cutoff } } })).count;
  },

  /** Promotes the given usernames to admin; returns how many rows changed. */
  async promoteAdmins(usernames: string[]): Promise<number> {
    if (!usernames.length) return 0;
    return (await db().user.updateMany({ where: { username: { in: usernames }, role: { not: 'admin' } }, data: { role: 'admin' } })).count;
  },

  async updateProfile(id: string, p: Pick<UserRecord, 'name' | 'branch' | 'year' | 'section' | 'bio' | 'interests'>): Promise<void> {
    await db().user.update({
      where: { id },
      data: { name: p.name, branch: p.branch, year: p.year, section: p.section, bio: p.bio, interests: p.interests },
    });
  },
};
