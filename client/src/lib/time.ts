import type { ClassSlot } from '@adda/shared';

export const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
export const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** "5H 12M", "2D 14H", "04:59" under an hour, "OVERDUE 3H" when negative. */
export function countdown(ms: number): string {
  const late = ms < 0;
  let s = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const txt = d ? `${d}D ${h}H` : h ? `${h}H ${pad(m)}M` : `${pad(m)}:${pad(s)}`;
  return late ? `OVERDUE ${txt}` : txt;
}

/** Clock-style HH:MM:SS for big displays (caps at 99h). */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.min(99, Math.floor(s / 3600)))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
export const fmtShortDate = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};
/** "5M AGO", "2H AGO", then the date after a week. */
export function ago(t: number, now: number): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'JUST NOW';
  if (s < 3600) return `${Math.floor(s / 60)}M AGO`;
  if (s < 86400) return `${Math.floor(s / 3600)}H AGO`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}D AGO`;
  return fmtShortDate(t);
}

export const fmtTime = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const dayKey = (t: number) => new Date(t).toDateString();

export const minutesOf = (hm: string) => {
  const [h = 0, m = 0] = hm.split(':').map(Number);
  return h * 60 + m;
};

/** Value for <input type="datetime-local">. */
export function toLocalInput(t: number): string {
  const d = new Date(t);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function tonightAt2359(): number {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  return d.getTime();
}

export interface NowNext {
  current: (ClassSlot & { endsAt: number }) | null;
  next: (ClassSlot & { at: number; inDays: number }) | null;
}

/** Class happening now and the next one, looking ahead up to one week. */
export function nowNext(classes: ClassSlot[], now = new Date()): NowNext {
  const today = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const sorted = [...classes].sort((a, b) => a.start.localeCompare(b.start));
  const at = (daysAhead: number, hm: string) => {
    const d = new Date(now);
    d.setDate(d.getDate() + daysAhead);
    const [h = 0, m = 0] = hm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };

  const cur = sorted.find((c) => c.day === today && minutesOf(c.start) <= mins && mins < minutesOf(c.end));
  let next: NowNext['next'] = null;
  // i === 7 covers "same weekday next week" once today's classes are over.
  for (let i = 0; i <= 7 && !next; i++) {
    const day = (today + i) % 7;
    const hit = sorted.find((c) => c.day === day && (i > 0 || minutesOf(c.start) > mins));
    if (hit) next = { ...hit, at: at(i, hit.start), inDays: i };
  }
  return { current: cur ? { ...cur, endsAt: at(0, cur.end) } : null, next };
}

export function whenLabel(next: NonNullable<NowNext['next']>, now: number): string {
  if (next.inDays === 0) return `IN ${countdown(next.at - now)}`;
  if (next.inDays === 1) return `TOMORROW ${next.start}`;
  if (next.inDays === 7) return `NEXT ${DAYS[next.day]} ${next.start}`;
  return `${DAYS[next.day]} ${next.start}`;
}
