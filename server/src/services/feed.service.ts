import type { Post } from '@adda/shared';
import { postsRepo, type PostRecord } from '../repositories/posts.repo.ts';
import type { UserRecord } from '../repositories/users.repo.ts';
import { bus } from '../realtime/bus.ts';
import { transaction } from '../db/database.ts';
import { badRequest, forbidden, HttpError, newId, notFound } from '../utils/http.ts';
import { usersService } from './users.service.ts';
import { cloudinary } from './cloudinary.ts';
import { logger } from '../utils/logger.ts';

export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

// Only raster formats, recognised by their magic bytes (not the claimed type): no SVG, which can carry scripts.
const SIGNATURES: [string, (b: Uint8Array) => boolean][] = [
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/png', (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ['image/gif', (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46],
  ['image/webp', (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50],
];

/** Decodes a `data:image/...;base64,` URL into bytes plus the type they actually are. */
function decodeImage(dataUrl: string): { mime: string; data: Uint8Array } {
  const match = /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw badRequest('Photo must be a JPEG, PNG, WebP or GIF');
  const data = new Uint8Array(Buffer.from(match[1]!, 'base64'));
  if (data.byteLength > MAX_IMAGE_BYTES) throw badRequest('Photo is too big (max 1.5 MB)');
  const mime = SIGNATURES.find(([, test]) => test(data))?.[0];
  if (!mime) throw badRequest('Photo must be a JPEG, PNG, WebP or GIF');
  return { mime, data };
}

const canDelete = (viewer: UserRecord, p: PostRecord) => p.authorId === viewer.id || viewer.role === 'admin';

function present(viewer: UserRecord, records: PostRecord[]): Post[] {
  const authors = usersService.publicByIds(records.map((p) => p.authorId));
  return records.map((p) => ({
    id: p.id,
    body: p.body,
    image: p.imageUrl ?? (p.hasImage ? `/api/feed/${p.id}/image` : null),
    author: authors.get(p.authorId) ?? null,
    likes: p.likes,
    liked: p.liked,
    canDelete: canDelete(viewer, p),
    createdAt: p.createdAt,
  }));
}

function find(viewer: UserRecord, id: string): PostRecord {
  const p = postsRepo.find(viewer.id, id);
  if (!p) throw notFound('Post');
  return p;
}

export const feedService = {
  list: (viewer: UserRecord, opts: { before?: number; limit: number }) => present(viewer, postsRepo.list(viewer.id, opts)),

  async create(viewer: UserRecord, input: { body: string; image?: string }): Promise<Post> {
    if (!input.body && !input.image) throw badRequest('Write something or add a photo');
    const image = input.image ? decodeImage(input.image) : null; // validated before anything leaves the server
    const id = newId();

    // With Cloudinary configured the photo goes there and we keep only its URL; otherwise into SQLite.
    let hosted: { url: string; publicId: string } | null = null;
    if (image && cloudinary.enabled()) {
      try {
        hosted = await cloudinary.upload(image.data, image.mime);
      } catch (err) {
        logger.error('cloudinary upload failed', { err: String(err) });
        throw new HttpError(502, 'Photo upload failed, try again');
      }
    }
    transaction(() => {
      postsRepo.insert({ id, authorId: viewer.id, body: input.body, createdAt: Date.now(), imageUrl: hosted?.url, imagePublicId: hosted?.publicId });
      if (image && !hosted) postsRepo.insertImage(id, image.mime, image.data);
    });
    bus.emit('feed:changed');
    return present(viewer, [find(viewer, id)])[0]!;
  },

  toggleLike(viewer: UserRecord, id: string): Post {
    const p = find(viewer, id);
    if (p.liked) postsRepo.unlike(id, viewer.id);
    else postsRepo.like(id, viewer.id);
    bus.emit('feed:changed');
    return present(viewer, [find(viewer, id)])[0]!;
  },

  image(id: string) {
    const img = postsRepo.image(id);
    if (!img) throw notFound('Photo');
    return img;
  },

  remove(viewer: UserRecord, id: string): void {
    const p = find(viewer, id);
    if (!canDelete(viewer, p)) throw forbidden('Only the author or an admin can delete this post');
    postsRepo.delete(id);
    if (p.imagePublicId) void cloudinary.destroy(p.imagePublicId);
    bus.emit('feed:changed');
  },
};
