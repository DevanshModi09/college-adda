import { db } from '../db/database.ts';

export interface PostRecord {
  id: string;
  authorId: string;
  body: string;
  createdAt: number;
  likes: number;
  liked: boolean;
  hasImage: boolean;
}

interface Row {
  id: string;
  author_id: string;
  body: string;
  created_at: number;
  likes: number;
  liked: number;
  has_image: number;
}

const toRecord = (r: Row): PostRecord => ({
  id: r.id,
  authorId: r.author_id,
  body: r.body,
  createdAt: r.created_at,
  likes: r.likes,
  liked: r.liked === 1,
  hasImage: r.has_image === 1,
});

// Like count and "did the viewer like it" come back with each post in one query.
const SELECT = `
  SELECT p.*,
    (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likes,
    EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked,
    EXISTS (SELECT 1 FROM post_images i WHERE i.post_id = p.id) AS has_image
  FROM posts p`;

export const postsRepo = {
  /** Newest first; `before` pages further back. */
  list(viewerId: string, opts: { before?: number; limit: number }): PostRecord[] {
    const rows = db()
      .prepare(`${SELECT} WHERE p.created_at < ? ORDER BY p.created_at DESC LIMIT ?`)
      .all(viewerId, opts.before ?? Number.MAX_SAFE_INTEGER, opts.limit) as unknown as Row[];
    return rows.map(toRecord);
  },

  find(viewerId: string, id: string): PostRecord | null {
    const row = db().prepare(`${SELECT} WHERE p.id = ?`).get(viewerId, id) as Row | undefined;
    return row ? toRecord(row) : null;
  },

  insert(p: { id: string; authorId: string; body: string; createdAt: number }): void {
    db().prepare('INSERT INTO posts (id, author_id, body, created_at) VALUES (?, ?, ?, ?)').run(p.id, p.authorId, p.body, p.createdAt);
  },

  insertImage(postId: string, mime: string, data: Uint8Array): void {
    db().prepare('INSERT INTO post_images (post_id, mime, data) VALUES (?, ?, ?)').run(postId, mime, data);
  },

  image(postId: string): { mime: string; data: Uint8Array } | null {
    const row = db().prepare('SELECT mime, data FROM post_images WHERE post_id = ?').get(postId) as { mime: string; data: Uint8Array } | undefined;
    return row ?? null;
  },

  delete(id: string): void {
    db().prepare('DELETE FROM posts WHERE id = ?').run(id);
  },

  like(postId: string, userId: string): void {
    db().prepare('INSERT OR IGNORE INTO post_likes (post_id, user_id) VALUES (?, ?)').run(postId, userId);
  },

  unlike(postId: string, userId: string): void {
    db().prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?').run(postId, userId);
  },
};
