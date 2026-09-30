export interface IcsItem {
  id: string;
  title: string;
  start: number;
  end?: number | null;
  location?: string;
  description?: string;
  alarmMinutes?: number;
}

const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');

export function downloadIcs(filename: string, items: IcsItem[]) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//College Adda//EN', 'CALSCALE:GREGORIAN'];
  for (const it of items) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${it.id}@college-adda`,
      `DTSTAMP:${stamp(Date.now())}`,
      `DTSTART:${stamp(it.start)}`,
      `DTEND:${stamp(it.end ?? it.start + 3600e3)}`,
      `SUMMARY:${esc(it.title)}`
    );
    if (it.location) lines.push(`LOCATION:${esc(it.location)}`);
    if (it.description) lines.push(`DESCRIPTION:${esc(it.description)}`);
    if (it.alarmMinutes) {
      lines.push('BEGIN:VALARM', `TRIGGER:-PT${it.alarmMinutes}M`, 'ACTION:DISPLAY', `DESCRIPTION:${esc(it.title)}`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');

  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
