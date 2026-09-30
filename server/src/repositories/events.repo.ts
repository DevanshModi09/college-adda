import { db } from '../db/database.ts';
import { ms, msOrNull } from '../db/convert.ts';
import type { Event } from '../generated/prisma/client.ts';

export interface EventRecord {
  id: string;
  title: string;
  description: string;
  location: string;
  category: string;
  startAt: number;
  endAt: number | null;
  createdBy: string;
  createdAt: number;
}

const toRecord = (e: Event): EventRecord => ({
  id: e.id,
  title: e.title,
  description: e.description,
  location: e.location,
  category: e.category,
  startAt: ms(e.startAt),
  endAt: msOrNull(e.endAt),
  createdBy: e.createdBy,
  createdAt: ms(e.createdAt),
});

export const eventsRepo = {
  /** Events still running or ahead: COALESCE(end_at, start_at) >= since. */
  async listUpcoming(since: number): Promise<EventRecord[]> {
    const rows = await db().event.findMany({
      where: { OR: [{ endAt: { gte: since } }, { endAt: null, startAt: { gte: since } }] },
      orderBy: { startAt: 'asc' },
      take: 200,
    });
    return rows.map(toRecord);
  },

  async find(id: string): Promise<EventRecord | null> {
    const e = await db().event.findUnique({ where: { id } });
    return e ? toRecord(e) : null;
  },

  async insert(e: EventRecord): Promise<void> {
    await db().event.create({ data: { ...e } });
  },

  async delete(id: string): Promise<void> {
    await db().event.deleteMany({ where: { id } });
  },

  async attendeeIds(eventIds: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>(eventIds.map((id) => [id, []]));
    if (!eventIds.length) return out;
    const rows = await db().eventAttendee.findMany({ where: { eventId: { in: eventIds } } });
    for (const r of rows) out.get(r.eventId)?.push(r.userId);
    return out;
  },

  async isAttending(eventId: string, userId: string): Promise<boolean> {
    return !!(await db().eventAttendee.findUnique({ where: { eventId_userId: { eventId, userId } } }));
  },

  async addAttendee(eventId: string, userId: string): Promise<void> {
    await db().eventAttendee.upsert({ where: { eventId_userId: { eventId, userId } }, create: { eventId, userId }, update: {} });
  },

  async removeAttendee(eventId: string, userId: string): Promise<void> {
    await db().eventAttendee.deleteMany({ where: { eventId, userId } });
  },
};
