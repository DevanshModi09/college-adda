import { Link } from 'react-router';
import type { PublicUser } from '@adda/shared';
import { useDeadlines, useEvents, useRooms, useTimetable } from '../../hooks/queries';
import { sectionKeyOf } from '../../lib/constants';
import { useNow } from '../../hooks/useNow';
import { clock, countdown, fmtShortDate, nowNext, whenLabel } from '../../lib/time';
import { timeHp, weekProgress } from '../../lib/progress';
import { useLive } from '../../stores/live';
import { Bar, Empty, Panel } from '../../components/ui';
import { FreeRoomsPanel, SquadPanel, TodayRun } from './HomeExtras';
import './home.css';

export function HomePage({ user }: { user: PublicUser }) {
  const now = useNow();
  const { data: deadlines } = useDeadlines();
  const { data: classes } = useTimetable(sectionKeyOf(user));
  const { data: events } = useEvents();
  const { data: roomsQuery } = useRooms();
  const liveRooms = useLive((s) => s.rooms) ?? roomsQuery ?? [];
  const onlineCount = useLive((s) => s.online.size);

  const pending = (deadlines ?? []).filter((d) => !d.done).sort((a, b) => a.dueAt - b.dueAt);
  const boss = pending[0];
  const wave = pending.slice(1, 3);
  const { cleared, total } = weekProgress(deadlines);
  const { current, next } = nowNext(classes ?? [], new Date(now));
  const rooms = [...liveRooms].sort((a, b) => b.members.length - a.members.length);
  const hottest = rooms.find((r) => r.members.length) ?? rooms[0];

  return (
    <div className="home">
      <div className="home__xp">
        <span className="px-sm c-cyan">QUESTS CLEARED</span>
        <div className="grow">
          <Bar value={total ? cleared / total : 0} label="Deadlines cleared this week" />
        </div>
        <span>
          {cleared} / {total} THIS WEEK · {onlineCount} ONLINE
        </span>
      </div>

      <TodayRun classes={classes ?? []} now={now} />

      <div className="grid-3">
        <Panel title="BOSS FIGHT" action={<Link to="/deadlines">ALL</Link>}>
          {boss ? (
            <>
              <p className="home__big upper truncate" title={boss.title}>{boss.title}</p>
              <p className="muted">{boss.subject ? `${boss.subject.toUpperCase()} · ` : ''}TIME HP</p>
              <Bar value={timeHp(boss, now)} color={boss.dueAt - now < 864e5 ? 'var(--pink)' : 'var(--cyan)'} label="Time left" />
              <p className={`home__clock px ${boss.dueAt < now ? 'c-pink' : boss.dueAt - now < 864e5 ? 'c-pink' : 'c-cyan'}`}>
                {boss.dueAt < now ? 'OVERDUE' : clock(boss.dueAt - now)}
              </p>
              {wave.length > 0 && (
                <>
                  <p className="muted home__sub">NEXT WAVE</p>
                  {wave.map((d) => (
                    <div className="line" key={d.id}>
                      <span className="upper">{d.title}</span>
                      <span>{countdown(d.dueAt - now)}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          ) : (
            <Empty title="NO BOSSES">
              <Link to="/deadlines">ADD A DEADLINE</Link>
            </Empty>
          )}
        </Panel>

        <Panel title={current ? 'NOW PLAYING' : 'NEXT LEVEL'} action={<Link to="/timetable">WEEK</Link>}>
          {current ? (
            <>
              <p className="home__level upper">{current.subject}</p>
              <div className="line"><span>MAP</span><span>{current.room || '???'}</span></div>
              <div className="line"><span>ENDS IN</span><span className="c-cyan">{countdown(current.endsAt - now)}</span></div>
              {next && <div className="line"><span>THEN</span><span className="upper">{next.subject}</span></div>}
            </>
          ) : next ? (
            <>
              <p className="home__level upper">{next.subject}</p>
              <div className="line"><span>MAP</span><span>{next.room || '???'}</span></div>
              <div className="line"><span>TYPE</span><span className="upper">{next.kind}</span></div>
              <div className="line"><span>SPAWN</span><span className="c-cyan">{whenLabel(next, now)}</span></div>
            </>
          ) : (
            <Empty title="NO CLASSES SAVED">
              <Link to="/timetable">SET UP TIMETABLE</Link>
            </Empty>
          )}
          <hr className="divider" />
          <h3 className="panel__title home__sub">QUESTS</h3>
          {events?.length ? (
            events.slice(0, 3).map((e) => (
              <Link className="line" to="/events" key={e.id}>
                <span className="upper">{e.title}</span>
                <span>{fmtShortDate(e.startAt)}</span>
              </Link>
            ))
          ) : (
            <p className="muted">No events yet. <Link to="/events">See events</Link></p>
          )}
        </Panel>

        <Panel title="PLAYERS ONLINE" action={<Link to="/desks">DESKS</Link>}>
          {rooms.slice(0, 5).map((r) => (
            <Link className="line" to={`/desks/${r.id}`} key={r.id}>
              <span className="upper">{r.name}</span>
              <span className={r.members.length ? 'c-cyan' : 'dim'}>{r.members.length}P</span>
            </Link>
          ))}
          {hottest && (
            <Link to={`/desks/${hottest.id}`} className="btn btn--block home__start">
              PRESS START
            </Link>
          )}
          <p className="muted home__hint">
            Hi {user.name.split(' ')[0]}. Pull up a code desk, set your status, grind together.
          </p>
        </Panel>
      </div>

      <div className="grid-2 home__row">
        <FreeRoomsPanel />
        <SquadPanel me={user} />
      </div>
    </div>
  );
}
