import type { AttendanceStatus } from '@adda/shared';
import { db } from '../db/database.ts';

export interface MarkRow {
  date: string;
  slot_id: string;
  subject: string;
  status: AttendanceStatus;
}

export const attendanceRepo = {
  async marksOn(userId: string, date: string): Promise<MarkRow[]> {
    const rows = await db().attendanceMark.findMany({ where: { userId, date }, select: { date: true, slotId: true, subject: true, status: true } });
    return rows.map((r) => ({ date: r.date, slot_id: r.slotId, subject: r.subject, status: r.status as AttendanceStatus }));
  },

  /** Marks since `fromDate` (inclusive), for finding unmarked days. */
  async markedDatesSince(userId: string, fromDate: string): Promise<Set<string>> {
    const rows = await db().attendanceMark.findMany({ where: { userId, date: { gte: fromDate } }, distinct: ['date'], select: { date: true } });
    return new Set(rows.map((r) => r.date));
  },

  /** present / absent counts per subject (cancelled excluded). */
  async totals(userId: string): Promise<{ subject: string; present: number; absent: number }[]> {
    const rows = await db().attendanceMark.groupBy({
      by: ['subject', 'status'],
      where: { userId, status: { in: ['present', 'absent'] } },
      _count: { _all: true },
    });
    const out = new Map<string, { subject: string; present: number; absent: number }>();
    for (const r of rows) {
      const t = out.get(r.subject) ?? { subject: r.subject, present: 0, absent: 0 };
      if (r.status === 'present') t.present = r._count._all;
      else t.absent = r._count._all;
      out.set(r.subject, t);
    }
    return [...out.values()];
  },

  async setMark(userId: string, date: string, slotId: string, subject: string, status: AttendanceStatus): Promise<void> {
    const data = { subject, status, markedAt: Date.now() };
    await db().attendanceMark.upsert({
      where: { userId_date_slotId: { userId, date, slotId } },
      create: { userId, date, slotId, ...data },
      update: data,
    });
  },

  async clearMark(userId: string, date: string, slotId: string): Promise<void> {
    await db().attendanceMark.deleteMany({ where: { userId, date, slotId } });
  },

  async baselines(userId: string): Promise<{ subject: string; attended: number; held: number }[]> {
    return db().attendanceBaseline.findMany({ where: { userId }, select: { subject: true, attended: true, held: true } });
  },

  async setBaseline(userId: string, subject: string, attended: number, held: number): Promise<void> {
    await db().attendanceBaseline.upsert({
      where: { userId_subject: { userId, subject } },
      create: { userId, subject, attended, held },
      update: { attended, held },
    });
  },

  async settings(userId: string): Promise<{ target: number; sem_end: string | null; setup_done: number }> {
    const s = await db().attendanceSettings.findUnique({ where: { userId } });
    return s ? { target: s.target, sem_end: s.semEnd, setup_done: s.setupDone ? 1 : 0 } : { target: 75, sem_end: null, setup_done: 0 };
  },

  async markSetupDone(userId: string): Promise<void> {
    await db().attendanceSettings.upsert({ where: { userId }, create: { userId, setupDone: true }, update: { setupDone: true } });
  },

  async saveSettings(userId: string, target: number, semEnd: string | null): Promise<void> {
    await db().attendanceSettings.upsert({ where: { userId }, create: { userId, target, semEnd }, update: { target, semEnd } });
  },
};
