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
  get(id: string): PublicUser {
    const u = usersRepo.findById(id);
    if (!u) throw notFound('User');
    return toPublicUser(u);
  },

  publicByIds(ids: string[]): Map<string, PublicUser> {
    return new Map(usersRepo.findManyByIds([...new Set(ids)]).map((u) => [u.id, toPublicUser(u)]));
  },

  search(viewerId: string, q: { q?: string; branch?: string; year?: number; section?: string; online?: boolean }): PublicUser[] {
    return usersRepo
      .search({ ...q, excludeId: viewerId, limit: 200 })
      .map(toPublicUser)
      .filter((u) => !q.online || u.online)
      .sort((a, b) => Number(b.online) - Number(a.online));
  },

  updateProfile(id: string, input: ProfileInput): PublicUser {
    const u = usersRepo.findById(id);
    if (!u) throw notFound('User');
    const next = { ...u, ...input };
    usersRepo.updateProfile(id, next);
    return toPublicUser(next);
  },
};
