/** Attendance maths. All counts are classes; target is a percentage (e.g. 75). */

export const pct = (attended: number, held: number) => (held ? (attended / held) * 100 : null);

/** How many more classes you can miss and still be at or above target. */
export function canBunk(attended: number, held: number, target: number): number {
  // (attended) / (held + x) >= target/100  →  x <= 100·attended/target − held
  return Math.max(0, Math.floor((100 * attended) / target - held + 1e-9));
}

/** Consecutive classes you must attend to climb back to target (0 if already there). */
export function mustAttend(attended: number, held: number, target: number): number {
  if (target >= 100) return attended < held ? Infinity : 0;
  // (attended + x) / (held + x) >= t  →  x >= (t·held − attended) / (1 − t)
  const t = target / 100;
  return Math.max(0, Math.ceil((t * held - attended) / (1 - t) - 1e-9));
}

/** Where you end up if you attend every remaining class. */
export const forecastIfAllAttended = (attended: number, held: number, remaining: number) => pct(attended + remaining, held + remaining);

/** Local calendar date as YYYY-MM-DD. */
export function localDate(t = Date.now()): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDate(new Date(y!, m! - 1, d! + days).getTime());
}

export function prettyDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
}
