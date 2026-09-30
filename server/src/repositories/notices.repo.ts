import { db } from '../db/database.ts';
import { ms } from '../db/convert.ts';
import type { Notice } from '../generated/prisma/client.ts';

export interface NoticeRecord {
  id: string;
  sectionKey: string;
  authorId: string;
  body: string;
  pinned: boolean;
  createdAt: number;
}

const toRecord = (n: Notice): NoticeRecord => ({
  id: n.id,
  sectionKey: n.sectionKey,
  authorId: n.authorId,
  body: n.body,
  pinned: n.pinned,
  createdAt: ms(n.createdAt),
});

export const noticesRepo = {
  async listBySection(sectionKey: string, limit = 100): Promise<NoticeRecord[]> {
    const rows = await db().notice.findMany({ where: { sectionKey }, orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], take: limit });
    return rows.map(toRecord);
  },

  async find(id: string): Promise<NoticeRecord | null> {
    const n = await db().notice.findUnique({ where: { id } });
    return n ? toRecord(n) : null;
  },

  async insert(n: NoticeRecord): Promise<void> {
    await db().notice.create({ data: { ...n } });
  },

  async setPinned(id: string, pinned: boolean): Promise<void> {
    await db().notice.update({ where: { id }, data: { pinned } });
  },

  async delete(id: string): Promise<void> {
    await db().notice.deleteMany({ where: { id } });
  },
};
