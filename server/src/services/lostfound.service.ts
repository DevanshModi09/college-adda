import { WORLD_SIZE, type LostFoundPin } from '@adda/shared';
import { lostFoundRepo, type PinRecord } from '../repositories/lostfound.repo.ts';
import type { UserRecord } from '../repositories/users.repo.ts';
import { bus } from '../realtime/bus.ts';
import { badRequest, forbidden, newId, notFound } from '../utils/http.ts';
import { usersService } from './users.service.ts';

const MAX_OPEN_PER_USER = 10;
const KEEP_RESOLVED_MS = 7 * 864e5;

const canEdit = (viewer: UserRecord, p: PinRecord) => p.userId === viewer.id || viewer.role === 'admin';

async function present(viewer: UserRecord, records: PinRecord[]): Promise<LostFoundPin[]> {
  const authors = await usersService.publicByIds(records.map((p) => p.userId));
  return records.map(({ userId, ...p }) => ({ ...p, author: authors.get(userId) ?? null, canEdit: canEdit(viewer, { userId, ...p }) }));
}

async function find(id: string): Promise<PinRecord> {
  const p = await lostFoundRepo.find(id);
  if (!p) throw notFound('Pin');
  return p;
}

export const lostFoundService = {
  list: async (viewer: UserRecord) => present(viewer, await lostFoundRepo.list(Date.now() - KEEP_RESOLVED_MS)),

  async create(viewer: UserRecord, input: { kind: 'lost' | 'found'; title: string; details: string; x: number; y: number; place: string }): Promise<LostFoundPin> {
    if (input.x > WORLD_SIZE.w || input.y > WORLD_SIZE.h) throw badRequest('That spot is off the map');
    if ((await lostFoundRepo.openCount(viewer.id)) >= MAX_OPEN_PER_USER) {
      throw badRequest(`You already have ${MAX_OPEN_PER_USER} open pins. Mark some as sorted first`);
    }
    const pin: PinRecord = { id: newId(), userId: viewer.id, ...input, resolved: false, createdAt: Date.now() };
    await lostFoundRepo.insert(pin);
    bus.emit('lostfound:changed');
    return (await present(viewer, [pin]))[0]!;
  },

  async setResolved(viewer: UserRecord, id: string, resolved: boolean): Promise<LostFoundPin> {
    const p = await find(id);
    if (!canEdit(viewer, p)) throw forbidden('Only whoever pinned it (or an admin) can change this');
    await lostFoundRepo.setResolved(id, resolved);
    bus.emit('lostfound:changed');
    return (await present(viewer, [{ ...p, resolved }]))[0]!;
  },

  async remove(viewer: UserRecord, id: string): Promise<void> {
    const p = await find(id);
    if (!canEdit(viewer, p)) throw forbidden('Only whoever pinned it (or an admin) can delete this');
    await lostFoundRepo.delete(id);
    bus.emit('lostfound:changed');
  },
};
