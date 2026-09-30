import { Link } from 'react-router';
import { useDeadlines, useEvents, useFreeRooms, useFriends, useRooms } from '../../hooks/queries';
import { useNow } from '../../hooks/useNow';
import { countdown, fmtShortDate, fmtTime } from '../../lib/time';
import { realtime } from '../../lib/realtime';
import { useLive } from '../../stores/live';
import { GAME_NAMES, type GameKind, type PublicUser, type WorldPlayer } from '@adda/shared';
import { games } from '../../stores/games';
import type { Seating } from './engine';
import type { Zone, ZoneId } from './map';

// Café menus. Ordering just says it out loud to whoever is sitting nearby.
const MENUS: Partial<Record<ZoneId, { blurb: string; items: [string, number, string][] }>> = {
  chai: {
    blurb: 'Grab a stool. Stop on one to sit.',
    items: [
      ['Cutting chai', 10, '☕'],
      ['Bun maska', 25, '🍞'],
      ['Samosa', 15, '🥟'],
      ['Cold coffee', 40, '🧋'],
    ],
  },
  foodcourt: {
    blurb: 'Three stalls, zero empty tables at 1 PM.',
    items: [
      ['Chole bhature', 70, '🍛'],
      ['Veg thali', 90, '🍱'],
      ['Paneer roll', 60, '🌯'],
      ['Masala dosa', 65, '🥞'],
    ],
  },
  maggi: {
    blurb: 'Open till late. Exam-night fuel.',
    items: [
      ['Masala maggi', 40, '🍜'],
      ['Cheese maggi', 55, '🧀'],
      ['Egg maggi', 50, '🍳'],
      ['Nimbu pani', 20, '🍋'],
    ],
  },
  lawn: {
    blurb: 'Umbrella tables and bean bags. The juice cart is up top.',
    items: [
      ['Mango shake', 50, '🥭'],
      ['Sugarcane juice', 30, '🥤'],
    ],
  },
};

const HANGOUTS: Partial<Record<ZoneId, { blurb: string; lines: [string, string][] }>> = {
  garden: {
    blurb: 'Bonfire and bean bags. Best spot after 6.',
    lines: [
      ['START A JAM', 'who has a guitar? let’s jam 🎸'],
      ['ANTAKSHARI', 'antakshari round, starting with “M” 🎤'],
      ['JUST VIBES', 'chilling by the fire 🔥 come sit'],
    ],
  },
};

const sayNearby = (text: string) => realtime.send({ type: 'world:say', text });

/** What each building does when you walk into it: a live window into the real feature. */
interface Props {
  zone: Zone;
  seating: Seating | null;
  players: WorldPlayer[];
  me: PublicUser;
  onSit: () => void;
}

export function ZonePanel({ zone, seating, players, me, onSit }: Props) {
  return (
    <section className="panel panel--cyan campus__zone" aria-live="polite">
      <h2 className="panel__title">{zone.label}</h2>
      {zone.id === 'vib' || zone.id === 'nyb' ? (
        <BuildingRooms building={zone.id.toUpperCase()} />
      ) : zone.id === 'codelab' ? (
        <CodeLab />
      ) : zone.id === 'library' ? (
        <Library />
      ) : zone.id === 'events' ? (
        <EventGround />
      ) : zone.id === 'canteen' ? (
        <Canteen />
      ) : MENUS[zone.id] ? (
        <Cafe menu={MENUS[zone.id]!} seating={seating} onSit={onSit} />
      ) : zone.id === 'gamezone' ? (
        <GameZone players={players.filter((p) => p.id !== me.id)} />
      ) : HANGOUTS[zone.id] ? (
        <Hangout spot={HANGOUTS[zone.id]!} />
      ) : zone.id === 'plaza' ? (
        <p className="muted">Hang out here. Anything you say reaches players within about 7 tiles.</p>
      ) : (
        <p className="muted">Welcome to campus. Walk into a building to use it: VIB/NYB show free rooms, the Code Lab has live code desks, the Library has your deadlines. Hungry? Food Street is east, past the Code Lab.</p>
      )}
    </section>
  );
}

function BuildingRooms({ building }: { building: string }) {
  const now = useNow(30_000);
  const { data } = useFreeRooms(now);
  if (!data) return <p className="muted">SCANNING…</p>;
  const free = data.free.filter((r) => r.startsWith(building));
  return (
    <>
      <p className="muted">
        {data.period ? `FREE IN ${data.period.start}–${data.period.end}` : 'NO CLASSES RUNNING'} · {free.length} ROOMS
      </p>
      <div className="free__rooms campus__rooms">
        {free.slice(0, 14).map((r) => (
          <span key={r} className="free__room">{r.replace(`${building} `, '')}</span>
        ))}
      </div>
      <Link to="/timetable" className="px-xs">OPEN TIMETABLE ▶</Link>
    </>
  );
}

function CodeLab() {
  const { data } = useRooms();
  const rooms = [...(useLive((s) => s.rooms) ?? data ?? [])].sort((a, b) => b.members.length - a.members.length);
  return (
    <>
      {rooms.slice(0, 4).map((r) => (
        <Link key={r.id} to={`/desks/${r.id}`} className="line">
          <span className="upper">{r.name}</span>
          <span className={r.members.length ? 'c-green' : 'dim'}>{r.members.length}P ▶</span>
        </Link>
      ))}
    </>
  );
}

function Library() {
  const now = useNow(30_000);
  const { data } = useDeadlines();
  const pending = (data ?? []).filter((d) => !d.done && d.dueAt > now).slice(0, 3);
  return pending.length ? (
    <>
      <p className="muted">QUIET ZONE. YOUR NEXT BOSSES:</p>
      {pending.map((d) => (
        <Link key={d.id} to="/deadlines" className="line">
          <span className="upper">{d.title}</span>
          <span className="c-pink">{countdown(d.dueAt - now)}</span>
        </Link>
      ))}
    </>
  ) : (
    <p className="muted">Nothing due. Rare. Enjoy the silence.</p>
  );
}

function EventGround() {
  const { data } = useEvents();
  return data?.length ? (
    <>
      {data.slice(0, 3).map((e) => (
        <Link key={e.id} to="/events" className="line">
          <span className="upper">{e.title}</span>
          <span>{fmtShortDate(e.startAt)} {fmtTime(e.startAt)}</span>
        </Link>
      ))}
    </>
  ) : (
    <p className="muted">No events yet. <Link to="/events">See events</Link></p>
  );
}

function Canteen() {
  const { data } = useFriends();
  const online = useLive((s) => s.online);
  const friends = (data?.friends ?? []).filter((f) => online.has(f.id));
  return friends.length ? (
    <>
      <p className="muted">FRIENDS ONLINE. GRAB CHAI?</p>
      {friends.slice(0, 4).map((f) => (
        <Link key={f.id} to={`/chat/${f.id}`} className="line">
          <span className="upper">{f.name}</span>
          <span className="c-cyan">DM ▶</span>
        </Link>
      ))}
    </>
  ) : (
    <p className="muted">No friends online right now. <Link to="/people">Find people</Link></p>
  );
}

function Cafe({ menu, seating, onSit }: { menu: NonNullable<(typeof MENUS)[ZoneId]>; seating: Seating | null; onSit: () => void }) {
  const order = (item: string, emoji: string) => {
    sayNearby(`one ${item.toLowerCase()} please ${emoji}`);
    if (seating) realtime.send({ type: 'world:serve', tableId: seating.table.id, item: emoji });
  };
  return (
    <>
      {seating ? (
        <div className="campus__table">
          <p className="c-green">
            TABLE FOR {seating.table.size} · {seating.mates.length + 1}/{seating.table.size} SEATED
          </p>
          <p className="muted">
            {seating.mates.length ? `WITH ${seating.mates.map((m) => m.name.split(' ')[0]!.toUpperCase()).join(', ')}` : 'Just you. Call your friends over!'}
          </p>
          <button type="button" className="campus__order line" onClick={() => sayNearby('cheers! 🥂')}>
            <span className="upper">🥂 Cheers</span>
            <span className="c-cyan">SAY ▶</span>
          </button>
        </div>
      ) : (
        <>
          <p className="muted">{menu.blurb}</p>
          <button type="button" className="btn btn--sm btn--block campus__sit" onClick={onSit}>
            🪑 SIT AT A TABLE (E)
          </button>
        </>
      )}
      <p className="px-xs c-cyan campus__menu-head">{seating ? 'ORDER TO YOUR TABLE' : 'MENU · SIT DOWN AND THE WAITER BRINGS IT'}</p>
      {menu.items.map(([item, price, emoji]) => (
        <button key={item} type="button" className="line campus__order" onClick={() => order(item, emoji)}>
          <span className="upper">
            {emoji} {item}
          </span>
          <span className="c-yellow">₹{price} ORDER ▶</span>
        </button>
      ))}
    </>
  );
}

const GAME_KINDS: GameKind[] = ['ttt', 'c4', 'rps'];

function GameZone({ players }: { players: WorldPlayer[] }) {
  return (
    <>
      <p className="muted">Challenge anyone on campus. They get a popup to accept, then you play live.</p>
      {players.length ? (
        players.slice(0, 6).map((p) => (
          <div key={p.id} className="campus__challenger">
            <span className="upper truncate" style={{ color: p.color }}>
              {p.name}
            </span>
            <span className="row">
              {GAME_KINDS.map((k) => (
                <button key={k} type="button" className="chip" onClick={() => games.challenge(p.id, k)} title={`Challenge to ${GAME_NAMES[k]}`}>
                  {k === 'ttt' ? 'XOXO' : k === 'c4' ? 'C4' : 'RPS'}
                </button>
              ))}
            </span>
          </div>
        ))
      ) : (
        <p className="c-yellow">Nobody else is on campus right now. Open a second window as a guest to try it!</p>
      )}
    </>
  );
}

function Hangout({ spot }: { spot: NonNullable<(typeof HANGOUTS)[ZoneId]> }) {
  return (
    <>
      <p className="muted">{spot.blurb}</p>
      {spot.lines.map(([label, text]) => (
        <button key={label} type="button" className="line campus__order" onClick={() => sayNearby(text)}>
          <span className="upper">{label}</span>
          <span className="c-cyan">SAY ▶</span>
        </button>
      ))}
    </>
  );
}
