import { db } from '../db/database.ts';
import { msOrNull, ms } from '../db/convert.ts';
import type { Friendship } from '../generated/prisma/client.ts';

export interface FriendshipRow {
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
  created_at: number;
  responded_at: number | null;
}

const toRow = (f: Friendship): FriendshipRow => ({
  requester_id: f.requesterId,
  addressee_id: f.addresseeId,
  status: f.status as FriendshipRow['status'],
  created_at: ms(f.createdAt),
  responded_at: msOrNull(f.respondedAt),
});

const pair = (a: string, b: string) => ({
  OR: [
    { requesterId: a, addresseeId: b },
    { requesterId: b, addresseeId: a },
  ],
});

export const friendsRepo = {
  /** The row between two users, whichever of them sent the request. */
  async between(a: string, b: string): Promise<FriendshipRow | null> {
    const f = await db().friendship.findFirst({ where: pair(a, b) });
    return f ? toRow(f) : null;
  },

  /** Every row touching the user, most recent activity first. */
  async forUser(userId: string): Promise<FriendshipRow[]> {
    const rows = await db().friendship.findMany({ where: { OR: [{ requesterId: userId }, { addresseeId: userId }] } });
    return rows.map(toRow).sort((x, y) => (y.responded_at ?? y.created_at) - (x.responded_at ?? x.created_at));
  },

  async request(from: string, to: string): Promise<void> {
    await db().friendship.create({ data: { requesterId: from, addresseeId: to, status: 'pending', createdAt: Date.now() } });
  },

  async accept(requester: string, addressee: string): Promise<void> {
    await db().friendship.updateMany({
      where: { requesterId: requester, addresseeId: addressee },
      data: { status: 'accepted', respondedAt: Date.now() },
    });
  },

  async remove(a: string, b: string): Promise<boolean> {
    return (await db().friendship.deleteMany({ where: pair(a, b) })).count > 0;
  },
};
