import { Link } from 'react-router';
import type { ClassSlot, PublicUser } from '@adda/shared';
import { useAttendance, useFreeRooms, usePeople } from '../../hooks/queries';
import { localDate } from '../../lib/attendance';
import { useNow } from '../../hooks/useNow';
import { countdown, minutesOf } from '../../lib/time';
import { useLive } from '../../stores/live';
import { Avatar, Bar, Empty, Panel } from '../../components/ui';

/** Today's classes for the viewer's section as a left-to-right run, with a live position marker. */
export function TodayRun({ classes, now }: { classes: ClassSlot[]; now: number }) {
  const { data: att } = useAttendance(localDate(now));
  const d = new Date(now);
  const mins = d.getHours() * 60 + d.getMinutes();
  const today = classes.filter((c) => c.day === d.getDay()).sort((a, b) => a.start.localeCompare(b.start));

  if (!today.length) {
    return (
      <Panel title="TODAY'S RUN" className="today">
        <p className="today__free">NO CLASSES TODAY. FREE DAY. GO BUILD SOMETHING.</p>
      </Panel>
    );
  }

  const first = minutesOf(today[0]!.start);
  const last = minutesOf(today[today.length - 1]!.end);
  const progress = (mins - first) / Math.max(1, last - first);
  const done = mins >= last;
  const left = today.filter((c) => minutesOf(c.end) > mins).length;
  const needsMarking = done && !!att?.unmarkedDays.includes(localDate(now));

  return (
    <Panel
      title="TODAY'S RUN"
      className="today"
      action={<span className="muted">{done ? 'ALL CLEAR' : `${left} LEFT · ENDS ${today[today.length - 1]!.end}`}</span>}
    >
      <ol className="today__track">
        {today.map((c) => {
          const s = minutesOf(c.start);
          const e = minutesOf(c.end);
          const state = mins >= e ? 'past' : mins >= s ? 'now' : 'next';
          return (
            <li key={c.id} className={`today__slot today__slot--${state} today__slot--${c.kind.toLowerCase()}`} style={{ flexGrow: e - s }}>
              <span className="today__time">{c.start}</span>
              <span className="today__subject upper">{c.subject}</span>
              <span className="today__room">
                {c.room || '—'}
                {state === 'now' && <span className="c-pink"> · {countdown(new Date(now).setHours(0, e, 0, 0) - now)}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <Bar thin value={done ? 1 : Math.max(0, progress)} color="var(--yellow)" label="Progress through today's classes" />
      {needsMarking && (
        <Link to="/attendance" className="btn btn--pink btn--block today__mark">
          MARK TODAY&apos;S ATTENDANCE ({today.length} CLASSES)
        </Link>
      )}
    </Panel>
  );
}

/** Rooms with no class this period, across every section's timetable. */
export function FreeRoomsPanel() {
  const now = useNow(30_000);
  const { data } = useFreeRooms(now);
  if (!data) return <Panel title="FREE ROOMS NOW"><p className="muted">SCANNING…</p></Panel>;

  const byBuilding = new Map<string, string[]>();
  for (const r of data.free) {
    const [b = '?', n = r] = r.split(' ');
    byBuilding.set(b, [...(byBuilding.get(b) ?? []), n]);
  }

  return (
    <Panel
      title="FREE ROOMS NOW"
      action={<span className="c-green">{data.free.length}/{data.total}</span>}
    >
      <p className="muted free__sub">
        {data.period ? `PERIOD ${data.period.start}–${data.period.end} · NO CLASS IN THESE` : 'NO CLASSES RUNNING · EVERY ROOM IS FREE'}
      </p>
      {data.period ? (
        [...byBuilding].map(([building, rooms]) => (
          <div key={building} className="free__building">
            <span className="px-xs c-yellow">{building}</span>
            <div className="free__rooms">
              {rooms.map((n) => (
                <span key={n} className="free__room">{n}</span>
              ))}
            </div>
          </div>
        ))
      ) : (
        <p className="free__closed">GRAB ANY ROOM. OR JOIN A CODE ROOM ONLINE.</p>
      )}
    </Panel>
  );
}

/** Section-mates, online first. */
export function SquadPanel({ me }: { me: PublicUser }) {
  const { data } = usePeople({ branch: me.branch, year: String(me.year), section: me.section });
  const online = useLive((s) => s.online);
  const squad = (data ?? []).map((u) => ({ ...u, online: online.has(u.id) })).sort((a, b) => Number(b.online) - Number(a.online));
  const onlineCount = squad.filter((u) => u.online).length;

  return (
    <Panel title={`SQUAD · SEC ${me.section}`} action={<span className={onlineCount ? 'c-green' : 'dim'}>{onlineCount} ONLINE</span>}>
      {squad.length ? (
        <ul className="squad">
          {squad.slice(0, 6).map((u) => (
            <li key={u.id}>
              <Avatar user={u} size={32} showPresence />
              <span className="grow upper truncate">{u.name}</span>
              <Link to={`/chat/${u.id}`} className="px-xs" aria-label={`Message ${u.name}`}>
                DM
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="SOLO RUN">
          Nobody from {me.branch} Y{me.year} · {me.section} yet. <Link to="/people">Invite your class</Link>
        </Empty>
      )}
      {squad.length > 6 && (
        <Link to="/people" className="squad__more">
          +{squad.length - 6} MORE
        </Link>
      )}
    </Panel>
  );
}
