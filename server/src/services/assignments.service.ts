import { ASSIGNMENTS_PER_SUBJECT, type Assignment, type SubjectAssignments } from '@adda/shared';
import { assignmentsRepo } from '../repositories/assignments.repo.ts';
import type { UserRecord } from '../repositories/users.repo.ts';
import { badRequest } from '../utils/http.ts';
import type { AssignmentUpdate } from '../validators/schemas.ts';
import { timetableService } from './timetable.service.ts';

/** Theory subjects from the student's section timetable (labs don't have assignments). */
function theorySubjects(user: UserRecord): string[] {
  const names = timetableService
    .list(user)
    .filter((s) => s.kind !== 'Lab' && !/\blab\b/i.test(s.subject))
    .map((s) => s.subject);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

export const assignmentsService = {
  list(user: UserRecord): SubjectAssignments[] {
    const rows = assignmentsRepo.forUser(user.id);
    const byKey = new Map(rows.map((r) => [`${r.subject}#${r.number}`, r]));
    // Keep subjects that already have progress even if the timetable changed since.
    const subjects = [...new Set([...theorySubjects(user), ...rows.map((r) => r.subject)])];
    return subjects.map((subject) => ({
      subject,
      assignments: Array.from({ length: ASSIGNMENTS_PER_SUBJECT }, (_, i): Assignment => {
        const r = byKey.get(`${subject}#${i + 1}`);
        return { number: i + 1, status: r?.status ?? 'todo', dueAt: r?.due_at ?? null, note: r?.note ?? '' };
      }),
    }));
  },

  update(user: UserRecord, input: AssignmentUpdate): Assignment {
    const known = assignmentsRepo.find(user.id, input.subject, input.number);
    if (!known && !theorySubjects(user).includes(input.subject)) throw badRequest('That subject isn’t in your timetable');
    const next = {
      subject: input.subject,
      number: input.number,
      status: input.status ?? known?.status ?? 'todo',
      due_at: input.dueAt !== undefined ? input.dueAt : (known?.due_at ?? null),
      note: input.note ?? known?.note ?? '',
    };
    assignmentsRepo.upsert(user.id, next);
    return { number: next.number, status: next.status, dueAt: next.due_at, note: next.note };
  },
};
