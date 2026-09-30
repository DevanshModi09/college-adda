import { db } from '../db/database.ts';

export interface FriendshipRow {
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
  created_at: number;
  responded_at: number | null;
}

export const friendsRepo = {
  /** The row between two users, whichever of them sent the request. */
  between(a: string, b: string): FriendshipRow | null {
    return (
      (db()
        .prepare('SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)')
        .get(a, b, b, a) as FriendshipRow | undefined) ?? null
    );
  },

  /** Every row touching the user. */
  forUser(userId: string): FriendshipRow[] {
    return db()
      .prepare('SELECT * FROM friendships WHERE requester_id = ? OR addressee_id = ? ORDER BY COALESCE(responded_at, created_at) DESC')
      .all(userId, userId) as unknown as FriendshipRow[];
  },

  request(from: string, to: string): void {
    db().prepare("INSERT INTO friendships (requester_id, addressee_id, status, created_at) VALUES (?, ?, 'pending', ?)").run(from, to, Date.now());
  },

  accept(requester: string, addressee: string): void {
    db()
      .prepare("UPDATE friendships SET status = 'accepted', responded_at = ? WHERE requester_id = ? AND addressee_id = ?")
      .run(Date.now(), requester, addressee);
  },

  remove(a: string, b: string): boolean {
    const r = db()
      .prepare('DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)')
      .run(a, b, b, a);
    return r.changes > 0;
  },
};
