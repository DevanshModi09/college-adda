import type { AttendanceStatus } from '@adda/shared';
import { db } from '../db/database.ts';

export interface MarkRow {
  date: string;
  slot_id: string;
  subject: string;
  status: AttendanceStatus;
}

export const attendanceRepo = {
  marksOn(userId: string, date: string): MarkRow[] {
    return db().prepare('SELECT date, slot_id, subject, status FROM attendance_marks WHERE user_id = ? AND date = ?').all(userId, date) as unknown as MarkRow[];
  },

  /** Marks since `fromDate` (inclusive), for finding unmarked days. */
  markedDatesSince(userId: string, fromDate: string): Set<string> {
    const rows = db().prepare('SELECT DISTINCT date FROM attendance_marks WHERE user_id = ? AND date >= ?').all(userId, fromDate) as { date: string }[];
    return new Set(rows.map((r) => r.date));
  },

  /** present / absent counts per subject (cancelled excluded). */
  totals(userId: string): { subject: string; present: number; absent: number }[] {
    return db()
      .prepare(
        `SELECT subject,
                SUM(status = 'present') AS present,
                SUM(status = 'absent')  AS absent
         FROM attendance_marks WHERE user_id = ? GROUP BY subject`
      )
      .all(userId) as unknown as { subject: string; present: number; absent: number }[];
  },

  setMark(userId: string, date: string, slotId: string, subject: string, status: AttendanceStatus): void {
    db()
      .prepare(
        `INSERT INTO attendance_marks (user_id, date, slot_id, subject, status, marked_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, date, slot_id) DO UPDATE SET status = excluded.status, subject = excluded.subject, marked_at = excluded.marked_at`
      )
      .run(userId, date, slotId, subject, status, Date.now());
  },

  clearMark(userId: string, date: string, slotId: string): void {
    db().prepare('DELETE FROM attendance_marks WHERE user_id = ? AND date = ? AND slot_id = ?').run(userId, date, slotId);
  },

  baselines(userId: string): { subject: string; attended: number; held: number }[] {
    return db().prepare('SELECT subject, attended, held FROM attendance_baselines WHERE user_id = ?').all(userId) as unknown as {
      subject: string;
      attended: number;
      held: number;
    }[];
  },

  setBaseline(userId: string, subject: string, attended: number, held: number): void {
    db()
      .prepare(
        `INSERT INTO attendance_baselines (user_id, subject, attended, held) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, subject) DO UPDATE SET attended = excluded.attended, held = excluded.held`
      )
      .run(userId, subject, attended, held);
  },

  settings(userId: string): { target: number; sem_end: string | null; setup_done: number } {
    return (
      (db().prepare('SELECT target, sem_end, setup_done FROM attendance_settings WHERE user_id = ?').get(userId) as
        | { target: number; sem_end: string | null; setup_done: number }
        | undefined) ?? { target: 75, sem_end: null, setup_done: 0 }
    );
  },

  markSetupDone(userId: string): void {
    db()
      .prepare(
        `INSERT INTO attendance_settings (user_id, target, sem_end, setup_done) VALUES (?, 75, NULL, 1)
         ON CONFLICT(user_id) DO UPDATE SET setup_done = 1`
      )
      .run(userId);
  },

  saveSettings(userId: string, target: number, semEnd: string | null): void {
    db()
      .prepare(
        `INSERT INTO attendance_settings (user_id, target, sem_end) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET target = excluded.target, sem_end = excluded.sem_end`
      )
      .run(userId, target, semEnd);
  },
};
