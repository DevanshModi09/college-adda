import type { Room, RoomMember, RoomMessage, RoomWithMembers } from '@adda/shared';
import { roomsRepo } from '../repositories/rooms.repo.ts';
import { presence } from '../realtime/presence.ts';
import { bus } from '../realtime/bus.ts';
import { badRequest, forbidden, newId, notFound } from '../utils/http.ts';
import type { RoomCreate } from '../validators/schemas.ts';
import { usersService } from './users.service.ts';

const HISTORY = 100;

const SEED_ROOMS: Pick<Room, 'name' | 'topic' | 'lang'>[] = [
  { name: 'DSA Grind', topic: 'Daily LeetCode / GFG practice. Bring a problem, leave with a pattern.', lang: 'C++' },
  { name: 'Web Dev Lab', topic: 'HTML, CSS, JS, React — build stuff together.', lang: 'JavaScript' },
  { name: '11:59 PM Crew', topic: 'Assignment due tonight? You are not alone.', lang: 'Any' },
  { name: 'Minor Project Sprint', topic: 'Heads-down time for minor / major project teams.', lang: 'Any' },
];

export const roomsService = {
  async seedDefaults(): Promise<void> {
    if (await roomsRepo.count()) return;
    for (const r of SEED_ROOMS) await roomsRepo.insert({ id: newId(), ...r, createdBy: null, createdAt: Date.now() });
  },

  async get(id: string): Promise<Room> {
    const room = await roomsRepo.find(id);
    if (!room) throw notFound('Desk');
    return room;
  },

  async members(roomId: string): Promise<RoomMember[]> {
    const seats = presence.seats(roomId);
    const users = await usersService.publicByIds(seats.map((s) => s.userId));
    return seats.flatMap((s) => {
      const u = users.get(s.userId);
      return u ? [{ ...u, status: s.status, joinedAt: s.joinedAt }] : [];
    });
  },

  async listWithMembers(): Promise<RoomWithMembers[]> {
    const rooms = await roomsRepo.list();
    return Promise.all(rooms.map(async (r) => ({ ...r, members: await this.members(r.id) })));
  },

  async create(userId: string, input: RoomCreate): Promise<Room> {
    const room: Room = { id: newId(), ...input, createdBy: userId, createdAt: Date.now() };
    await roomsRepo.insert(room);
    bus.emit('rooms:changed');
    return room;
  },

  async remove(userId: string, id: string): Promise<void> {
    const room = await this.get(id);
    if (room.createdBy !== userId) throw forbidden('Only the creator can delete this desk');
    if (!presence.isEmpty(id)) throw badRequest('Someone is still sitting at this desk');
    await roomsRepo.delete(id);
    bus.emit('rooms:changed');
  },

  history: (roomId: string) => roomsRepo.recentMessages(roomId, HISTORY),

  async postMessage(roomId: string, userId: string, text: string): Promise<RoomMessage> {
    const user = await usersService.get(userId);
    const message: RoomMessage = { id: newId(), roomId, userId, name: user.name, color: user.color, text, createdAt: Date.now() };
    await roomsRepo.insertMessage(message);
    return message;
  },
};
