import type { Deadline } from '@adda/shared';

/** Player level = 1 + one level per 5 cleared deadlines. Honest, derived from real data. */
export function levelOf(deadlines: Deadline[] | undefined): number {
  return 1 + Math.floor((deadlines?.filter((d) => d.done).length ?? 0) / 5);
}

/** This week's (Mon–Sun) deadlines: cleared vs total. */
export function weekProgress(deadlines: Deadline[] | undefined, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = start.getTime() + 7 * 864e5;
  const week = (deadlines ?? []).filter((d) => d.dueAt >= start.getTime() && d.dueAt < end);
  return { cleared: week.filter((d) => d.done).length, total: week.length };
}

/** Fraction of time left between creation and due (the boss's "HP"). */
export function timeHp(d: Deadline, now: number): number {
  const span = Math.max(1, d.dueAt - d.createdAt);
  return Math.min(1, Math.max(0, (d.dueAt - now) / span));
}
