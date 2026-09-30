import type { ClassKind, ClassSlot } from '@adda/shared';
import { db } from '../db/database.ts';
import type { TimetableSlot } from '../generated/prisma/client.ts';

export interface SectionRow {
  key: string;
  label: string;
  members: number;
  slots: number;
}

export interface CatalogSection {
  key: string;
  branch: string;
  year: number;
  code: string;
  label: string;
  term: string;
  source: string;
}

const toModel = (r: TimetableSlot): ClassSlot & { createdBy: string | null } => ({
  id: r.id,
  sectionKey: r.sectionKey,
  day: r.day,
  start: r.start,
  end: r.end,
  subject: r.subject,
  kind: r.kind as ClassKind,
  room: r.room,
  teacher: r.teacher,
  official: r.createdBy === null,
  createdBy: r.createdBy,
});

export const timetableRepo = {
  async listBySection(sectionKey: string) {
    const rows = await db().timetableSlot.findMany({ where: { sectionKey }, orderBy: [{ day: 'asc' }, { start: 'asc' }] });
    return rows.map(toModel);
  },

  async find(id: string) {
    const r = await db().timetableSlot.findUnique({ where: { id } });
    return r ? toModel(r) : null;
  },

  /** createdBy null = official (imported) slot. */
  async insert(slot: Omit<ClassSlot, 'official'>, createdBy: string | null): Promise<void> {
    await db().timetableSlot.create({ data: { ...slot, createdBy, createdAt: Date.now() } });
  },

  /** Bulk insert for the catalog import (hundreds of official slots in one statement). */
  async insertMany(slots: Omit<ClassSlot, 'official'>[]): Promise<void> {
    const now = Date.now();
    await db().timetableSlot.createMany({ data: slots.map((s) => ({ ...s, createdBy: null, createdAt: now })) });
  },

  async delete(id: string): Promise<void> {
    await db().timetableSlot.deleteMany({ where: { id } });
  },

  async allRooms(): Promise<string[]> {
    const rows = await db().timetableSlot.findMany({ where: { room: { not: '' } }, distinct: ['room'], select: { room: true }, orderBy: { room: 'asc' } });
    return rows.map((r) => r.room);
  },

  /** Rooms with a class running on `day` at `time` (HH:MM). */
  async busyRooms(day: number, time: string): Promise<string[]> {
    const rows = await db().timetableSlot.findMany({
      where: { room: { not: '' }, day, start: { lte: time }, end: { gt: time } },
      distinct: ['room'],
      select: { room: true },
    });
    return rows.map((r) => r.room);
  },

  /** The period (start/end pair) containing `time` on `day`, if any class runs then. */
  async periodAt(day: number, time: string): Promise<{ start: string; end: string } | null> {
    const agg = await db().timetableSlot.aggregate({
      where: { day, start: { lte: time }, end: { gt: time } },
      _max: { start: true },
      _min: { end: true },
    });
    return agg._max.start && agg._min.end ? { start: agg._max.start, end: agg._min.end } : null;
  },

  async deleteOfficial(sectionKey: string): Promise<void> {
    await db().timetableSlot.deleteMany({ where: { sectionKey, createdBy: null } });
  },

  async upsertSection(s: CatalogSection): Promise<void> {
    await db().section.upsert({
      where: { key: s.key },
      create: s,
      update: { label: s.label, term: s.term, source: s.source },
    });
  },

  async catalogCount(): Promise<number> {
    return db().section.count();
  },

  /** Catalog sections + any section that has members or slots, with counts. */
  async sections(): Promise<SectionRow[]> {
    const rows = await db().$queryRaw<{ key: string; label: string; members: bigint; slots: bigint }[]>`
      WITH m AS (
        SELECT branch || '|' || year || '|' || section AS key, COUNT(*) AS n FROM users WHERE branch <> '' GROUP BY 1
      ), s AS (
        SELECT section_key AS key, COUNT(*) AS n FROM timetable_slots GROUP BY section_key
      ), k AS (SELECT key FROM sections UNION SELECT key FROM m UNION SELECT key FROM s)
      SELECT k.key, COALESCE(c.label, '') AS label, COALESCE(m.n, 0) AS members, COALESCE(s.n, 0) AS slots
      FROM k LEFT JOIN sections c ON c.key = k.key LEFT JOIN m ON m.key = k.key LEFT JOIN s ON s.key = k.key`;
    return rows.map((r) => ({ key: r.key, label: r.label, members: Number(r.members), slots: Number(r.slots) }));
  },
};
