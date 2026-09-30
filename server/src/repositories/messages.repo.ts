import type { DirectMessage } from '@adda/shared';
import { db } from '../db/database.ts';

interface Row {
  id: string;
  sender_id: string;
  recipient_id: string;
  text: string;
  created_at: number;
  read_at: number | null;
}

const toModel = (r: Row): DirectMessage => ({
  id: r.id,
  senderId: r.sender_id,
  recipientId: r.recipient_id,
  text: r.text,
  createdAt: r.created_at,
  readAt: r.read_at,
});

export const messagesRepo = {
  insert(m: DirectMessage): void {
    db()
      .prepare('INSERT INTO direct_messages (id, sender_id, recipient_id, text, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(m.id, m.senderId, m.recipientId, m.text, m.createdAt, m.readAt);
  },

  thread(a: string, b: string, before: number, limit: number): DirectMessage[] {
    const rows = db()
      .prepare(
        `SELECT * FROM direct_messages
         WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)) AND created_at < ?
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(a, b, b, a, before, limit) as unknown as Row[];
    return rows.reverse().map(toModel);
  },

  // Latest message per conversation partner, plus unread count from that partner.
  conversations(userId: string): { partnerId: string; last: DirectMessage; unread: number }[] {
    const rows = db()
      .prepare(
        `WITH mine AS (
           SELECT *, CASE WHEN sender_id = :me THEN recipient_id ELSE sender_id END AS partner
           FROM direct_messages WHERE sender_id = :me OR recipient_id = :me
         ), ranked AS (
           SELECT *, ROW_NUMBER() OVER (PARTITION BY partner ORDER BY created_at DESC) AS rn FROM mine
         )
         SELECT r.*, (
           SELECT COUNT(*) FROM direct_messages d
           WHERE d.sender_id = r.partner AND d.recipient_id = :me AND d.read_at IS NULL
         ) AS unread
         FROM ranked r WHERE rn = 1 ORDER BY created_at DESC`
      )
      .all({ me: userId }) as unknown as (Row & { partner: string; unread: number })[];
    return rows.map((r) => ({ partnerId: r.partner, last: toModel(r), unread: r.unread }));
  },

  markRead(recipientId: string, senderId: string): void {
    db()
      .prepare('UPDATE direct_messages SET read_at = ? WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL')
      .run(Date.now(), recipientId, senderId);
  },
};
