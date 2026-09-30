import type { Room, RoomMessage } from '@adda/shared';
import { db } from '../db/database.ts';
import { ms } from '../db/convert.ts';
import type { Room as RoomRow } from '../generated/prisma/client.ts';

const toRoom = (r: RoomRow): Room => ({
  id: r.id,
  name: r.name,
  topic: r.topic,
  lang: r.lang,
  createdBy: r.createdBy,
  createdAt: ms(r.createdAt),
});

export const roomsRepo = {
  async list(): Promise<Room[]> {
    return (await db().room.findMany({ orderBy: { createdAt: 'asc' } })).map(toRoom);
  },

  async find(id: string): Promise<Room | null> {
    const r = await db().room.findUnique({ where: { id } });
    return r ? toRoom(r) : null;
  },

  async count(): Promise<number> {
    return db().room.count();
  },

  async insert(r: Room): Promise<void> {
    await db().room.create({ data: { ...r } });
  },

  async delete(id: string): Promise<void> {
    await db().room.deleteMany({ where: { id } });
  },

  async recentMessages(roomId: string, limit: number): Promise<RoomMessage[]> {
    const rows = await db().roomMessage.findMany({
      where: { roomId },
      include: { user: { select: { name: true, color: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.reverse().map((m) => ({
      id: m.id,
      roomId: m.roomId,
      userId: m.userId,
      name: m.user.name,
      color: m.user.color,
      text: m.text,
      createdAt: ms(m.createdAt),
    }));
  },

  async insertMessage(m: Omit<RoomMessage, 'name' | 'color'>): Promise<void> {
    // Listed field by field: callers pass a full RoomMessage, whose name/color aren't columns.
    const { id, roomId, userId, text, createdAt } = m;
    await db().roomMessage.create({ data: { id, roomId, userId, text, createdAt } });
  },
};
