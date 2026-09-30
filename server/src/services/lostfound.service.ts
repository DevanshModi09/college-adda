import type { LostFoundBoard, LostFoundPin, PublicUser } from '@adda/shared';
import { env } from '../config/env.ts';
import { lostFoundRepo, type PinRecord } from '../repositories/lostfound.repo.ts';
import { usersRepo, type UserRecord } from '../repositories/users.repo.ts';
import { bus } from '../realtime/bus.ts';
import { forbidden, newId, notFound } from '../utils/http.ts';
import { toPublicUser, usersService } from './users.service.ts';

// Students don't post items themselves: they message the admin, who adds, resolves and removes them.
const KEEP_RESOLVED_MS = 7 * 864e5;

const isAdmin = (viewer: UserRecord) => viewer.role === 'admin';

async function present(viewer: UserRecord, records: PinRecord[]): Promise<LostFoundPin[]> {
  const authors = await usersService.publicByIds(records.map((p) => p.userId));
  return records.map(({ userId, ...p }) => ({ ...p, author: authors.get(userId) ?? null, canEdit: isAdmin(viewer) }));
}

/** The first configured admin: who students message about lost and found items. */
async function contact(): Promise<PublicUser | null> {
  for (const username of env.adminUsernames) {
    const u = await usersRepo.findByUsername(username);
    if (u) return toPublicUser(u);
  }
  return null;
}

async function find(id: string): Promise<PinRecord> {
  const p = await lostFoundRepo.find(id);
  if (!p) throw notFound('Item');
  return p;
}

function requireAdmin(viewer: UserRecord) {
  if (!isAdmin(viewer)) throw forbidden('Message the admin to add or update lost & found items');
}

export const lostFoundService = {
  async board(viewer: UserRecord): Promise<LostFoundBoard> {
    const [pins, admin] = await Promise.all([lostFoundRepo.list(Date.now() - KEEP_RESOLVED_MS), contact()]);
    return { pins: await present(viewer, pins), contact: admin };
  },

  async create(viewer: UserRecord, input: { kind: 'lost' | 'found'; title: string; details: string; place: string }): Promise<LostFoundPin> {
    requireAdmin(viewer);
    const pin: PinRecord = { id: newId(), userId: viewer.id, ...input, resolved: false, createdAt: Date.now() };
    await lostFoundRepo.insert(pin);
    bus.emit('lostfound:changed');
    return (await present(viewer, [pin]))[0]!;
  },

  async setResolved(viewer: UserRecord, id: string, resolved: boolean): Promise<LostFoundPin> {
    requireAdmin(viewer);
    const p = await find(id);
    await lostFoundRepo.setResolved(id, resolved);
    bus.emit('lostfound:changed');
    return (await present(viewer, [{ ...p, resolved }]))[0]!;
  },

  async remove(viewer: UserRecord, id: string): Promise<void> {
    requireAdmin(viewer);
    await find(id);
    await lostFoundRepo.delete(id);
    bus.emit('lostfound:changed');
  },
};
