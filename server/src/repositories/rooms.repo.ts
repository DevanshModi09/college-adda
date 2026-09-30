import type { Room, RoomMessage } from '@adda/shared';
import { db } from '../db/database.ts';

interface RoomRow {
  id: string;
  name: string;
  topic: string;
  lang: string;
  created_by: string | null;
  created_at: number;
}

interface MessageRow {
  id: string;
  room_id: string;
  user_id: string;
  name: string;
  color: string;
  text: string;
  created_at: number;
}

const toRoom = (r: RoomRow): Room => ({
  id: r.id,
  name: r.name,
  topic: r.topic,
  lang: r.lang,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

const toMessage = (r: MessageRow): RoomMessage => ({
  id: r.id,
  roomId: r.room_id,
  userId: r.user_id,
  name: r.name,
  color: r.color,
  text: r.text,
  createdAt: r.created_at,
});

export const roomsRepo = {
  list(): Room[] {
    return (db().prepare('SELECT * FROM rooms ORDER BY created_at').all() as unknown as RoomRow[]).map(toRoom);
  },

  find(id: string): Room | null {
    const row = db().prepare('SELECT * FROM rooms WHERE id = ?').get(id) as RoomRow | undefined;
    return row ? toRoom(row) : null;
  },

  count(): number {
    return (db().prepare('SELECT COUNT(*) AS n FROM rooms').get() as { n: number }).n;
  },

  insert(r: Room): void {
    db()
      .prepare('INSERT INTO rooms (id, name, topic, lang, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(r.id, r.name, r.topic, r.lang, r.createdBy, r.createdAt);
  },

  delete(id: string): void {
    db().prepare('DELETE FROM rooms WHERE id = ?').run(id);
  },

  recentMessages(roomId: string, limit: number): RoomMessage[] {
    const rows = db()
      .prepare(
        `SELECT m.*, u.name, u.color FROM room_messages m JOIN users u ON u.id = m.user_id
         WHERE m.room_id = ? ORDER BY m.created_at DESC LIMIT ?`
      )
      .all(roomId, limit) as unknown as MessageRow[];
    return rows.reverse().map(toMessage);
  },

  insertMessage(m: Omit<RoomMessage, 'name' | 'color'>): void {
    db()
      .prepare('INSERT INTO room_messages (id, room_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(m.id, m.roomId, m.userId, m.text, m.createdAt);
  },
};
