import type { DirectMessage } from '@adda/shared';
import { db } from '../db/database.ts';
import { ms, msOrNull } from '../db/convert.ts';
import type { DirectMessage as Row } from '../generated/prisma/client.ts';

const toModel = (r: Row): DirectMessage => ({
  id: r.id,
  senderId: r.senderId,
  recipientId: r.recipientId,
  text: r.text,
  createdAt: ms(r.createdAt),
  readAt: msOrNull(r.readAt),
});

export const messagesRepo = {
  async insert(m: DirectMessage): Promise<void> {
    await db().directMessage.create({ data: { ...m } });
  },

  async thread(a: string, b: string, before: number, limit: number): Promise<DirectMessage[]> {
    const rows = await db().directMessage.findMany({
      where: {
        createdAt: { lt: before },
        OR: [
          { senderId: a, recipientId: b },
          { senderId: b, recipientId: a },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.reverse().map(toModel);
  },

  // Latest message per conversation partner, plus unread count from that partner.
  async conversations(userId: string): Promise<{ partnerId: string; last: DirectMessage; unread: number }[]> {
    const rows = await db().$queryRaw<
      { id: string; sender_id: string; recipient_id: string; text: string; created_at: bigint; read_at: bigint | null; partner: string; unread: bigint }[]
    >`
      WITH mine AS (
        SELECT *, CASE WHEN sender_id = ${userId} THEN recipient_id ELSE sender_id END AS partner
        FROM direct_messages WHERE sender_id = ${userId} OR recipient_id = ${userId}
      ), ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY partner ORDER BY created_at DESC) AS rn FROM mine
      )
      SELECT r.id, r.sender_id, r.recipient_id, r.text, r.created_at, r.read_at, r.partner, (
        SELECT COUNT(*) FROM direct_messages d
        WHERE d.sender_id = r.partner AND d.recipient_id = ${userId} AND d.read_at IS NULL
      ) AS unread
      FROM ranked r WHERE rn = 1 ORDER BY r.created_at DESC`;
    return rows.map((r) => ({
      partnerId: r.partner,
      unread: Number(r.unread),
      last: {
        id: r.id,
        senderId: r.sender_id,
        recipientId: r.recipient_id,
        text: r.text,
        createdAt: ms(r.created_at),
        readAt: msOrNull(r.read_at),
      },
    }));
  },

  async markRead(recipientId: string, senderId: string): Promise<void> {
    await db().directMessage.updateMany({ where: { recipientId, senderId, readAt: null }, data: { readAt: Date.now() } });
  },
};
