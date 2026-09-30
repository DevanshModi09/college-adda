import { db } from '../db/database.ts';

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

interface Row {
  id: string;
  title: string;
  description: string;
  location: string;
  category: string;
  start_at: number;
  end_at: number | null;
  created_by: string;
  created_at: number;
}

const toRecord = (r: Row): EventRecord => ({
  id: r.id,
  title: r.title,
  description: r.description,
  location: r.location,
  category: r.category,
  startAt: r.start_at,
  endAt: r.end_at,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

export const eventsRepo = {
  listUpcoming(since: number): EventRecord[] {
    const rows = db()
      .prepare('SELECT * FROM events WHERE COALESCE(end_at, start_at) >= ? ORDER BY start_at LIMIT 200')
      .all(since) as unknown as Row[];
    return rows.map(toRecord);
  },

  find(id: string): EventRecord | null {
    const row = db().prepare('SELECT * FROM events WHERE id = ?').get(id) as Row | undefined;
    return row ? toRecord(row) : null;
  },

  insert(e: EventRecord): void {
    db()
      .prepare(
        `INSERT INTO events (id, title, description, location, category, start_at, end_at, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(e.id, e.title, e.description, e.location, e.category, e.startAt, e.endAt, e.createdBy, e.createdAt);
  },

  delete(id: string): void {
    db().prepare('DELETE FROM events WHERE id = ?').run(id);
  },

  attendeeIds(eventIds: string[]): Map<string, string[]> {
    const out = new Map<string, string[]>(eventIds.map((id) => [id, []]));
    if (!eventIds.length) return out;
    const rows = db()
      .prepare(`SELECT event_id, user_id FROM event_attendees WHERE event_id IN (${eventIds.map(() => '?').join(',')})`)
      .all(...eventIds) as unknown as { event_id: string; user_id: string }[];
    for (const r of rows) out.get(r.event_id)?.push(r.user_id);
    return out;
  },

  isAttending(eventId: string, userId: string): boolean {
    return !!db().prepare('SELECT 1 FROM event_attendees WHERE event_id = ? AND user_id = ?').get(eventId, userId);
  },

  addAttendee(eventId: string, userId: string): void {
    db().prepare('INSERT OR IGNORE INTO event_attendees (event_id, user_id) VALUES (?, ?)').run(eventId, userId);
  },

  removeAttendee(eventId: string, userId: string): void {
    db().prepare('DELETE FROM event_attendees WHERE event_id = ? AND user_id = ?').run(eventId, userId);
  },
};
