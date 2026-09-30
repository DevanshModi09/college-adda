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
  seedDefaults(): void {
    if (roomsRepo.count()) return;
    for (const r of SEED_ROOMS) roomsRepo.insert({ id: newId(), ...r, createdBy: null, createdAt: Date.now() });
  },

  get(id: string): Room {
    const room = roomsRepo.find(id);
    if (!room) throw notFound('Desk');
    return room;
  },

  members(roomId: string): RoomMember[] {
    const seats = presence.seats(roomId);
    const users = usersService.publicByIds(seats.map((s) => s.userId));
    return seats.flatMap((s) => {
      const u = users.get(s.userId);
      return u ? [{ ...u, status: s.status, joinedAt: s.joinedAt }] : [];
    });
  },

  listWithMembers(): RoomWithMembers[] {
    return roomsRepo.list().map((r) => ({ ...r, members: this.members(r.id) }));
  },

  create(userId: string, input: RoomCreate): Room {
    const room: Room = { id: newId(), ...input, createdBy: userId, createdAt: Date.now() };
    roomsRepo.insert(room);
    bus.emit('rooms:changed');
    return room;
  },

  remove(userId: string, id: string): void {
    const room = this.get(id);
    if (room.createdBy !== userId) throw forbidden('Only the creator can delete this desk');
    if (!presence.isEmpty(id)) throw badRequest('Someone is still sitting at this desk');
    roomsRepo.delete(id);
    bus.emit('rooms:changed');
  },

  history: (roomId: string) => roomsRepo.recentMessages(roomId, HISTORY),

  postMessage(roomId: string, userId: string, text: string): RoomMessage {
    const user = usersService.get(userId);
    const message: RoomMessage = { id: newId(), roomId, userId, name: user.name, color: user.color, text, createdAt: Date.now() };
    roomsRepo.insertMessage(message);
    return message;
  },
};
