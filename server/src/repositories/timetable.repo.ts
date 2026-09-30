import type { ClassKind, ClassSlot } from '@adda/shared';
import { db } from '../db/database.ts';

interface Row {
  id: string;
  section_key: string;
  day: number;
  start: string;
  end: string;
  subject: string;
  kind: ClassKind;
  room: string;
  teacher: string;
  created_by: string | null;
}

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

const toModel = (r: Row): ClassSlot & { createdBy: string | null } => ({
  id: r.id,
  sectionKey: r.section_key,
  day: r.day,
  start: r.start,
  end: r.end,
  subject: r.subject,
  kind: r.kind,
  room: r.room,
  teacher: r.teacher,
  official: r.created_by === null,
  createdBy: r.created_by,
});

export const timetableRepo = {
  listBySection(sectionKey: string) {
    const rows = db()
      .prepare('SELECT * FROM timetable_slots WHERE section_key = ? ORDER BY day, start')
      .all(sectionKey) as unknown as Row[];
    return rows.map(toModel);
  },

  find(id: string) {
    const row = db().prepare('SELECT * FROM timetable_slots WHERE id = ?').get(id) as Row | undefined;
    return row ? toModel(row) : null;
  },

  /** createdBy null = official (imported) slot. */
  insert(slot: Omit<ClassSlot, 'official'>, createdBy: string | null): void {
    db()
      .prepare(
        `INSERT INTO timetable_slots (id, section_key, day, start, end, subject, kind, room, teacher, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(slot.id, slot.sectionKey, slot.day, slot.start, slot.end, slot.subject, slot.kind, slot.room, slot.teacher, createdBy, Date.now());
  },

  delete(id: string): void {
    db().prepare('DELETE FROM timetable_slots WHERE id = ?').run(id);
  },

  allRooms(): string[] {
    return (db().prepare("SELECT DISTINCT room FROM timetable_slots WHERE room != '' ORDER BY room").all() as { room: string }[]).map((r) => r.room);
  },

  /** Rooms with a class running on `day` at `time` (HH:MM). */
  busyRooms(day: number, time: string): string[] {
    return (
      db()
        .prepare("SELECT DISTINCT room FROM timetable_slots WHERE room != '' AND day = ? AND start <= ? AND end > ?")
        .all(day, time, time) as { room: string }[]
    ).map((r) => r.room);
  },

  /** The period (start/end pair) containing `time` on `day`, if any class runs then. */
  periodAt(day: number, time: string): { start: string; end: string } | null {
    const row = db()
      .prepare('SELECT MAX(start) AS start, MIN(end) AS end FROM timetable_slots WHERE day = ? AND start <= ? AND end > ?')
      .get(day, time, time) as { start: string | null; end: string | null };
    return row.start && row.end ? { start: row.start, end: row.end } : null;
  },

  deleteOfficial(sectionKey: string): void {
    db().prepare('DELETE FROM timetable_slots WHERE section_key = ? AND created_by IS NULL').run(sectionKey);
  },

  upsertSection(s: CatalogSection): void {
    db()
      .prepare(
        `INSERT INTO sections (key, branch, year, code, label, term, source) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET label = excluded.label, term = excluded.term, source = excluded.source`
      )
      .run(s.key, s.branch, s.year, s.code, s.label, s.term, s.source);
  },

  catalogCount(): number {
    return (db().prepare('SELECT COUNT(*) AS n FROM sections').get() as { n: number }).n;
  },

  /** Catalog sections + any section that has members or slots, with counts. */
  sections(): SectionRow[] {
    return db()
      .prepare(
        `WITH m AS (
           SELECT branch || '|' || year || '|' || section AS key, COUNT(*) AS n FROM users WHERE branch != '' GROUP BY key
         ), s AS (
           SELECT section_key AS key, COUNT(*) AS n FROM timetable_slots GROUP BY section_key
         ), k AS (SELECT key FROM sections UNION SELECT key FROM m UNION SELECT key FROM s)
         SELECT k.key, COALESCE(c.label, '') AS label, COALESCE(m.n, 0) AS members, COALESCE(s.n, 0) AS slots
         FROM k LEFT JOIN sections c ON c.key = k.key LEFT JOIN m ON m.key = k.key LEFT JOIN s ON s.key = k.key`
      )
      .all() as unknown as SectionRow[];
  },
};
