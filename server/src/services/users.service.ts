import type { PublicUser } from '@adda/shared';
import { usersRepo, type UserRecord } from '../repositories/users.repo.ts';
import { presence } from '../realtime/presence.ts';
import { notFound } from '../utils/http.ts';
import type { ProfileInput } from '../validators/schemas.ts';

export function toPublicUser(u: UserRecord): PublicUser {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    branch: u.branch,
    year: u.year,
    section: u.section,
    role: u.role,
    bio: u.bio,
    interests: u.interests,
    color: u.color,
    online: presence.isOnline(u.id),
    guest: u.guest,
  };
}

export const usersService = {
  async get(id: string): Promise<PublicUser> {
    const u = await usersRepo.findById(id);
    if (!u) throw notFound('User');
    return toPublicUser(u);
  },

  async publicByIds(ids: string[]): Promise<Map<string, PublicUser>> {
    return new Map((await usersRepo.findManyByIds([...new Set(ids)])).map((u) => [u.id, toPublicUser(u)]));
  },

  async search(viewerId: string, q: { q?: string; branch?: string; year?: number; section?: string; online?: boolean }): Promise<PublicUser[]> {
    return (await usersRepo.search({ ...q, excludeId: viewerId, limit: 200 }))
      .map(toPublicUser)
      .filter((u) => !q.online || u.online)
      .sort((a, b) => Number(b.online) - Number(a.online));
  },

  async updateProfile(id: string, input: ProfileInput): Promise<PublicUser> {
    const u = await usersRepo.findById(id);
    if (!u) throw notFound('User');
    const next = { ...u, ...input };
    await usersRepo.updateProfile(id, next);
    return toPublicUser(next);
  },
};
