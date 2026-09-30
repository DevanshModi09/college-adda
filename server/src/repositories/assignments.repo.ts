import type { AssignmentStatus } from '@adda/shared';
import { db } from '../db/database.ts';

export interface AssignmentRow {
  subject: string;
  number: number;
  status: AssignmentStatus;
  due_at: number | null;
  note: string;
}

export const assignmentsRepo = {
  forUser(userId: string): AssignmentRow[] {
    return db()
      .prepare('SELECT subject, number, status, due_at, note FROM assignments WHERE user_id = ?')
      .all(userId) as unknown as AssignmentRow[];
  },

  find(userId: string, subject: string, number: number): AssignmentRow | null {
    return (
      (db()
        .prepare('SELECT subject, number, status, due_at, note FROM assignments WHERE user_id = ? AND subject = ? AND number = ?')
        .get(userId, subject, number) as AssignmentRow | undefined) ?? null
    );
  },

  upsert(userId: string, r: AssignmentRow): void {
    db()
      .prepare(
        `INSERT INTO assignments (user_id, subject, number, status, due_at, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, subject, number) DO UPDATE SET
           status = excluded.status, due_at = excluded.due_at, note = excluded.note, updated_at = excluded.updated_at`
      )
      .run(userId, r.subject, r.number, r.status, r.due_at, r.note, Date.now());
  },
};
