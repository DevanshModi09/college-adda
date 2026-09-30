import type { AssignmentStatus } from '@adda/shared';
import { db } from '../db/database.ts';
import { msOrNull } from '../db/convert.ts';
import type { Assignment } from '../generated/prisma/client.ts';

export interface AssignmentRow {
  subject: string;
  number: number;
  status: AssignmentStatus;
  due_at: number | null;
  note: string;
}

const toRow = (a: Assignment): AssignmentRow => ({
  subject: a.subject,
  number: a.number,
  status: a.status as AssignmentStatus,
  due_at: msOrNull(a.dueAt),
  note: a.note,
});

export const assignmentsRepo = {
  async forUser(userId: string): Promise<AssignmentRow[]> {
    return (await db().assignment.findMany({ where: { userId } })).map(toRow);
  },

  async find(userId: string, subject: string, number: number): Promise<AssignmentRow | null> {
    const a = await db().assignment.findUnique({ where: { userId_subject_number: { userId, subject, number } } });
    return a ? toRow(a) : null;
  },

  async upsert(userId: string, r: AssignmentRow): Promise<void> {
    const data = { status: r.status, dueAt: r.due_at, note: r.note, updatedAt: Date.now() };
    await db().assignment.upsert({
      where: { userId_subject_number: { userId, subject: r.subject, number: r.number } },
      create: { userId, subject: r.subject, number: r.number, ...data },
      update: data,
    });
  },
};
