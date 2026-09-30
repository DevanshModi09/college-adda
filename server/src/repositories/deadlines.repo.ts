import type { Priority } from '@adda/shared';
import { db } from '../db/database.ts';
import { ms } from '../db/convert.ts';
import type { Deadline } from '../generated/prisma/client.ts';

export interface DeadlineRecord {
  id: string;
  kind: 'personal' | 'official';
  ownerId: string | null;
  audience: string; // '' = everyone, else a section key
  createdBy: string | null;
  title: string;
  subject: string;
  dueAt: number;
  priority: Priority;
  createdAt: number;
}

type WithDone = DeadlineRecord & { done: boolean };

const toRecord = (d: Deadline & { completions: unknown[] }): WithDone => ({
  id: d.id,
  kind: d.kind as DeadlineRecord['kind'],
  ownerId: d.ownerId,
  audience: d.audience,
  createdBy: d.createdBy,
  title: d.title,
  subject: d.subject,
  dueAt: ms(d.dueAt),
  priority: d.priority as Priority,
  createdAt: ms(d.createdAt),
  done: d.completions.length > 0,
});

// "Done" is per viewer: include only the viewer's completion row.
const withDone = (viewerId: string) => ({ completions: { where: { userId: viewerId }, select: { userId: true } } });

export const deadlinesRepo = {
  /** Personal deadlines of the viewer + official ones addressed to everyone or the viewer's section. */
  async visibleTo(viewerId: string, sectionKey: string): Promise<WithDone[]> {
    const rows = await db().deadline.findMany({
      where: {
        OR: [
          { kind: 'personal', ownerId: viewerId },
          { kind: 'official', audience: { in: ['', sectionKey] } },
        ],
      },
      include: withDone(viewerId),
      orderBy: { dueAt: 'asc' },
    });
    return rows.map(toRecord);
  },

  async findFor(viewerId: string, id: string): Promise<WithDone | null> {
    const d = await db().deadline.findUnique({ where: { id }, include: withDone(viewerId) });
    return d ? toRecord(d) : null;
  },

  async insert(d: DeadlineRecord): Promise<void> {
    await db().deadline.create({ data: { ...d } });
  },

  async updateFields(d: Pick<DeadlineRecord, 'id' | 'title' | 'subject' | 'dueAt' | 'priority'>): Promise<void> {
    await db().deadline.update({ where: { id: d.id }, data: { title: d.title, subject: d.subject, dueAt: d.dueAt, priority: d.priority } });
  },

  async setDone(id: string, userId: string, done: boolean): Promise<void> {
    if (done) {
      await db().deadlineCompletion.upsert({
        where: { deadlineId_userId: { deadlineId: id, userId } },
        create: { deadlineId: id, userId, doneAt: Date.now() },
        update: {},
      });
    } else {
      await db().deadlineCompletion.deleteMany({ where: { deadlineId: id, userId } });
    }
  },

  async delete(id: string): Promise<void> {
    await db().deadline.deleteMany({ where: { id } });
  },
};
