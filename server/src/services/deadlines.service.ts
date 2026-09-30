import type { Deadline } from '@adda/shared';
import { deadlinesRepo, type DeadlineRecord } from '../repositories/deadlines.repo.ts';
import type { UserRecord } from '../repositories/users.repo.ts';
import { transaction } from '../db/database.ts';
import { bus } from '../realtime/bus.ts';
import { badRequest, forbidden, newId, notFound } from '../utils/http.ts';
import type { DeadlineCreate, DeadlineUpdate } from '../validators/schemas.ts';
import { parseSectionKey, sectionKeyOf } from './timetable.service.ts';

const canEdit = (user: UserRecord, d: DeadlineRecord) =>
  d.kind === 'personal' ? d.ownerId === user.id : user.role === 'admin';

function present(user: UserRecord, d: DeadlineRecord & { done: boolean }): Deadline {
  return {
    id: d.id,
    title: d.title,
    subject: d.subject,
    dueAt: d.dueAt,
    priority: d.priority,
    done: d.done,
    official: d.kind === 'official',
    audience: d.audience,
    canEdit: canEdit(user, d),
    createdAt: d.createdAt,
  };
}

function visible(user: UserRecord, id: string) {
  const d = deadlinesRepo.findFor(user.id, id);
  const allowed =
    d && (d.kind === 'personal' ? d.ownerId === user.id : d.audience === '' || d.audience === sectionKeyOf(user) || user.role === 'admin');
  if (!d || !allowed) throw notFound('Deadline');
  return d;
}

export const deadlinesService = {
  list: (user: UserRecord) => deadlinesRepo.visibleTo(user.id, sectionKeyOf(user)).map((d) => present(user, d)),

  /** Students create private deadlines; admins can additionally post official ones. */
  create(user: UserRecord, input: DeadlineCreate): Deadline {
    const { official, audience, ...fields } = input;
    if (official && user.role !== 'admin') throw forbidden('Only admins can post official deadlines');
    if (official && audience && !parseSectionKey(audience)) throw badRequest('Unknown section');

    const record: DeadlineRecord = {
      id: newId(),
      kind: official ? 'official' : 'personal',
      ownerId: official ? null : user.id,
      audience: official ? audience : '',
      createdBy: user.id,
      ...fields,
      createdAt: Date.now(),
    };
    deadlinesRepo.insert(record);
    if (official) bus.emit('deadlines:changed');
    return present(user, { ...record, done: false });
  },

  update(user: UserRecord, id: string, patch: DeadlineUpdate): Deadline {
    const current = visible(user, id);
    const { done, ...fields } = patch;
    const edits = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

    if (Object.keys(edits).length && !canEdit(user, current)) throw forbidden('Only admins can change official deadlines');
    const next = { ...current, ...edits, done: done ?? current.done };
    transaction(() => {
      if (Object.keys(edits).length) deadlinesRepo.updateFields(next);
      if (done !== undefined) deadlinesRepo.setDone(id, user.id, done); // per-user, even for official ones
    });
    if (Object.keys(edits).length && current.kind === 'official') bus.emit('deadlines:changed');
    return present(user, next);
  },

  remove(user: UserRecord, id: string): void {
    const current = visible(user, id);
    if (!canEdit(user, current)) throw forbidden("Official deadlines can only be removed by an admin");
    deadlinesRepo.delete(id);
    if (current.kind === 'official') bus.emit('deadlines:changed');
  },
};
