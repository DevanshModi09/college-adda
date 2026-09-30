import type { Notice } from '@adda/shared';
import { noticesRepo, type NoticeRecord } from '../repositories/notices.repo.ts';
import type { UserRecord } from '../repositories/users.repo.ts';
import { bus } from '../realtime/bus.ts';
import { badRequest, forbidden, newId, notFound } from '../utils/http.ts';
import type { NoticeCreate } from '../validators/schemas.ts';
import { parseSectionKey, sectionKeyOf } from './timetable.service.ts';
import { usersService } from './users.service.ts';

const canDelete = (viewer: UserRecord, n: NoticeRecord) => n.authorId === viewer.id || viewer.role === 'admin';

function present(viewer: UserRecord, records: NoticeRecord[]): Notice[] {
  const authors = usersService.publicByIds(records.map((n) => n.authorId));
  return records.map(({ authorId, ...n }) => ({
    ...n,
    author: authors.get(authorId) ?? null,
    canDelete: canDelete(viewer, { authorId, ...n }),
  }));
}

function sectionFor(viewer: UserRecord, key?: string): string {
  const sectionKey = key || sectionKeyOf(viewer);
  if (!parseSectionKey(sectionKey)) throw badRequest('Unknown section');
  return sectionKey;
}

export const noticesService = {
  /** Like timetables, any section's board is readable. Defaults to the viewer's own. */
  list: (viewer: UserRecord, sectionKey?: string) => present(viewer, noticesRepo.listBySection(sectionFor(viewer, sectionKey))),

  /** Students post to their own section; admins can post (and pin) anywhere. */
  create(viewer: UserRecord, input: NoticeCreate): Notice {
    const sectionKey = sectionFor(viewer, input.section);
    const isAdmin = viewer.role === 'admin';
    if (!isAdmin && sectionKey !== sectionKeyOf(viewer)) throw forbidden('You can only post on your own section’s board');
    if (input.pinned && !isAdmin) throw forbidden('Only admins can pin notices');

    const record: NoticeRecord = { id: newId(), sectionKey, authorId: viewer.id, body: input.body, pinned: input.pinned, createdAt: Date.now() };
    noticesRepo.insert(record);
    bus.emit('notices:changed', { sectionKey });
    return present(viewer, [record])[0]!;
  },

  setPinned(viewer: UserRecord, id: string, pinned: boolean): Notice {
    if (viewer.role !== 'admin') throw forbidden('Only admins can pin notices');
    const record = noticesRepo.find(id);
    if (!record) throw notFound('Notice');
    noticesRepo.setPinned(id, pinned);
    bus.emit('notices:changed', { sectionKey: record.sectionKey });
    return present(viewer, [{ ...record, pinned }])[0]!;
  },

  remove(viewer: UserRecord, id: string): void {
    const record = noticesRepo.find(id);
    if (!record) throw notFound('Notice');
    if (!canDelete(viewer, record)) throw forbidden('Only the author or an admin can remove this notice');
    noticesRepo.delete(id);
    bus.emit('notices:changed', { sectionKey: record.sectionKey });
  },
};
