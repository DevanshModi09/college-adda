import { db } from '../db/database.ts';
import { ms } from '../db/convert.ts';

export interface PostRecord {
  id: string;
  authorId: string;
  body: string;
  createdAt: number;
  likes: number;
  liked: boolean;
  /** Photo stored in the database (post_images). */
  hasImage: boolean;
  /** Photo hosted on Cloudinary. */
  imageUrl: string | null;
  imagePublicId: string | null;
}

// Like count, "did the viewer like it" and "has a stored photo" come back with each post, never the photo bytes.
const withExtras = (viewerId: string) => ({
  _count: { select: { likes: true } },
  likes: { where: { userId: viewerId }, select: { userId: true } },
  image: { select: { postId: true } },
});

type Row = {
  id: string;
  authorId: string;
  body: string;
  createdAt: bigint;
  imageUrl: string | null;
  imagePublicId: string | null;
  _count: { likes: number };
  likes: unknown[];
  image: unknown | null;
};

const toRecord = (p: Row): PostRecord => ({
  id: p.id,
  authorId: p.authorId,
  body: p.body,
  createdAt: ms(p.createdAt),
  likes: p._count.likes,
  liked: p.likes.length > 0,
  hasImage: p.image !== null,
  imageUrl: p.imageUrl,
  imagePublicId: p.imagePublicId,
});

export const postsRepo = {
  /** Newest first; `before` pages further back. */
  async list(viewerId: string, opts: { before?: number; limit: number }): Promise<PostRecord[]> {
    const rows = await db().post.findMany({
      where: opts.before ? { createdAt: { lt: opts.before } } : {},
      include: withExtras(viewerId),
      orderBy: { createdAt: 'desc' },
      take: opts.limit,
    });
    return rows.map(toRecord);
  },

  async find(viewerId: string, id: string): Promise<PostRecord | null> {
    const p = await db().post.findUnique({ where: { id }, include: withExtras(viewerId) });
    return p ? toRecord(p) : null;
  },

  async insert(p: { id: string; authorId: string; body: string; createdAt: number; imageUrl?: string; imagePublicId?: string }): Promise<void> {
    await db().post.create({
      data: { id: p.id, authorId: p.authorId, body: p.body, createdAt: p.createdAt, imageUrl: p.imageUrl ?? null, imagePublicId: p.imagePublicId ?? null },
    });
  },

  async insertImage(postId: string, mime: string, data: Uint8Array): Promise<void> {
    await db().postImage.create({ data: { postId, mime, data: new Uint8Array(data) } });
  },

  async image(postId: string): Promise<{ mime: string; data: Uint8Array } | null> {
    return db().postImage.findUnique({ where: { postId }, select: { mime: true, data: true } });
  },

  async delete(id: string): Promise<void> {
    await db().post.deleteMany({ where: { id } });
  },

  async like(postId: string, userId: string): Promise<void> {
    await db().postLike.upsert({ where: { postId_userId: { postId, userId } }, create: { postId, userId }, update: {} });
  },

  async unlike(postId: string, userId: string): Promise<void> {
    await db().postLike.deleteMany({ where: { postId, userId } });
  },
};
