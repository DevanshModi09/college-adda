import type { AttendanceClass, AttendanceOverview, AttendanceStatus, ClassKind, SubjectAttendance } from '@adda/shared';
import { attendanceRepo } from '../repositories/attendance.repo.ts';
import type { UserRecord } from '../repositories/users.repo.ts';
import { transaction } from '../db/database.ts';
import { badRequest, notFound } from '../utils/http.ts';
import { timetableService } from './timetable.service.ts';

// Dates are plain 'YYYY-MM-DD' strings in the student's local calendar; the client sends
// its own "today" so the server's timezone never matters.
const DAY_MS = 864e5;
const parse = (d: string) => Date.parse(`${d}T00:00:00Z`);
const format = (t: number) => new Date(t).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(parse(d)).getUTCDay();

export const attendanceService = {
  /** The viewer's classes on `date` (from their section timetable) with any marks. */
  day(user: UserRecord, date: string): AttendanceClass[] {
    const marks = new Map(attendanceRepo.marksOn(user.id, date).map((m) => [m.slot_id, m.status]));
    return timetableService
      .list(user)
      .filter((s) => s.day === weekday(date))
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((s) => ({ slotId: s.id, subject: s.subject, kind: s.kind, start: s.start, end: s.end, room: s.room, status: marks.get(s.id) ?? null }));
  },

  mark(user: UserRecord, date: string, today: string, slotId: string, status: AttendanceStatus | null): AttendanceClass[] {
    if (date > today) throw badRequest("Can't mark a class that hasn't happened yet");
    const slot = this.day(user, date).find((c) => c.slotId === slotId);
    if (!slot) throw notFound('Class on that day');
    if (status) attendanceRepo.setMark(user.id, date, slotId, slot.subject, status);
    else attendanceRepo.clearMark(user.id, date, slotId);
    return this.day(user, date);
  },

  /** Marks every still-unmarked class that day as present. */
  markAllPresent(user: UserRecord, date: string, today: string): AttendanceClass[] {
    if (date > today) throw badRequest("Can't mark a day that hasn't happened yet");
    const classes = this.day(user, date);
    transaction(() => {
      for (const c of classes) if (!c.status) attendanceRepo.setMark(user.id, date, c.slotId, c.subject, 'present');
    });
    return this.day(user, date);
  },

  setBaseline(user: UserRecord, subject: string, attended: number, held: number): void {
    if (attended > held) throw badRequest('Attended can’t be more than held');
    attendanceRepo.setBaseline(user.id, subject, attended, held);
  },

  saveSettings(user: UserRecord, target: number, semEnd: string | null): void {
    attendanceRepo.saveSettings(user.id, target, semEnd);
  },

  /** First-run setup: ERP counts for every subject + settings, all or nothing. */
  setup(user: UserRecord, input: { target: number; semEnd: string | null; baselines: { subject: string; attended: number; held: number }[] }): void {
    const bad = input.baselines.find((b) => b.attended > b.held);
    if (bad) throw badRequest(`${bad.subject}: attended can’t be more than held`);
    transaction(() => {
      attendanceRepo.saveSettings(user.id, input.target, input.semEnd);
      for (const b of input.baselines) attendanceRepo.setBaseline(user.id, b.subject, b.attended, b.held);
      attendanceRepo.markSetupDone(user.id);
    });
  },

  overview(user: UserRecord, today: string): AttendanceOverview {
    const settings = attendanceRepo.settings(user.id);
    const slots = timetableService.list(user);
    const totals = new Map(attendanceRepo.totals(user.id).map((t) => [t.subject, t]));
    const baselines = new Map(attendanceRepo.baselines(user.id).map((b) => [b.subject, b]));

    // Weekly frequency per subject, for the forecast.
    const kinds = new Map<string, ClassKind>();
    const perWeekday = new Map<string, number[]>();
    for (const s of slots) {
      kinds.set(s.subject, s.kind);
      const days = perWeekday.get(s.subject) ?? [0, 0, 0, 0, 0, 0, 0];
      days[s.day]!++;
      perWeekday.set(s.subject, days);
    }
    const remainingFor = (subject: string) => {
      if (!settings.sem_end || settings.sem_end <= today) return settings.sem_end ? 0 : null;
      const days = perWeekday.get(subject);
      if (!days) return 0;
      let n = 0;
      for (let t = parse(today) + DAY_MS; t <= parse(settings.sem_end); t += DAY_MS) n += days[new Date(t).getUTCDay()]!;
      return n;
    };

    const names = new Set([...kinds.keys(), ...totals.keys(), ...baselines.keys()]);
    const subjects: SubjectAttendance[] = [...names]
      .map((subject) => {
        const t = totals.get(subject);
        const b = baselines.get(subject) ?? { attended: 0, held: 0 };
        const present = Number(t?.present ?? 0);
        const absent = Number(t?.absent ?? 0);
        return {
          subject,
          kind: kinds.get(subject) ?? (/\blab\b/i.test(subject) ? 'Lab' : 'Lecture'),
          attended: b.attended + present,
          held: b.held + present + absent,
          baseline: { attended: b.attended, held: b.held },
          remaining: remainingFor(subject),
        };
      })
      .sort((a, b) => Number(a.kind === 'Lab') - Number(b.kind === 'Lab') || a.subject.localeCompare(b.subject));

    // Last 14 days with classes but zero marks: nudge the student to catch up.
    const from = format(parse(today) - 13 * DAY_MS);
    const marked = attendanceRepo.markedDatesSince(user.id, from);
    const classDays = new Set(slots.map((s) => s.day));
    const unmarkedDays: string[] = [];
    for (let t = parse(today); t >= parse(from); t -= DAY_MS) {
      const d = format(t);
      if (classDays.has(new Date(t).getUTCDay()) && !marked.has(d)) unmarkedDays.push(d);
    }

    return { target: settings.target, semEnd: settings.sem_end, subjects, unmarkedDays, setupDone: settings.setup_done === 1 };
  },
};
