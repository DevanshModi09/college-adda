import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router';
import type { PublicUser, WorldPlayer } from '@adda/shared';
import { realtime } from '../../lib/realtime';
import { usePerson } from '../../hooks/queries';
import { Avatar, Loading, Modal } from '../../components/ui';
import { FriendButton } from '../../components/FriendButton';
import { GAME_NAMES, type GameKind } from '@adda/shared';
import { games } from '../../stores/games';
import { toast } from '../../stores/toasts';
import { buildCampus, type Zone } from './map';
import { prerenderMap } from './render';
import { CampusEngine, type Seating } from './engine';
import { ZonePanel } from './ZonePanel';
import './campus.css';

const KEYMAP: Record<string, string> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
};

interface ChatLine {
  id: number;
  name: string;
  text: string;
  self: boolean;
}

export function CampusPage({ me }: { me: PublicUser }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const chatRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<CampusEngine | null>(null);
  const map = useMemo(buildCampus, []);
  const [ready, setReady] = useState(false);
  const [zone, setZone] = useState<Zone | null>(null);
  const [seating, setSeating] = useState<Seating | null>(null);
  const [players, setPlayers] = useState<WorldPlayer[]>([]);
  const [picked, setPicked] = useState<WorldPlayer | null>(null);
  const [log, setLog] = useState<ChatLine[]>([]);
  const sitRef = useRef(() => {});

  // Boot: wait for the pixel fonts (map signs are baked into the prerender), then start the loop.
  useEffect(() => {
    let engine: CampusEngine | null = null;
    let off = () => {};
    let cancelled = false;
    let seq = 0;

    Promise.all([document.fonts.load('8px "Press Start 2P"'), document.fonts.load('8px VT323')])
      .catch(() => {})
      .then(() => {
        if (cancelled || !canvasRef.current) return;
        engine = new CampusEngine(canvasRef.current, map, prerenderMap(map), me.id, {
          onZone: setZone,
          onPlayers: setPlayers,
          onPick: setPicked,
          onSeat: setSeating,
        });
        engineRef.current = engine;
        engine.setMinimap(miniRef.current);
        off = realtime.subscribe((msg) => {
          engine?.apply(msg);
          if (msg.type === 'world:say') {
            setLog((l) => [...l.slice(-5), { id: ++seq, name: msg.name.split(' ')[0]!, text: msg.text, self: msg.userId === me.id }]);
          }
        });
        engine.start();
        realtime.joinWorld();
        setReady(true);
      });

    const onResize = () => engine?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      off();
      engine?.stop();
      engineRef.current = null;
      realtime.leaveWorld();
    };
  }, [map, me.id]);

  // Keyboard: movement unless typing; Enter jumps to chat, Esc leaves it.
  useEffect(() => {
    const typing = () => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (typing()) {
        if (e.key === 'Escape') (document.activeElement as HTMLElement).blur();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        chatRef.current?.focus();
        return;
      }
      if ((e.key === 'e' || e.key === 'E') && !e.repeat) {
        sitRef.current();
        return;
      }
      const dir = KEYMAP[e.key];
      if (!dir) return;
      e.preventDefault();
      engineRef.current?.press(dir, true);
    };
    const up = (e: KeyboardEvent) => {
      const dir = KEYMAP[e.key];
      if (dir) engineRef.current?.press(dir, false);
    };
    const blur = () => engineRef.current?.releaseAll();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const sit = () => {
    if (!engineRef.current?.toggleSit()) toast('NO FREE SEAT NEARBY. WALK INTO A CAFÉ FIRST');
  };

  sitRef.current = sit;

  const say = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = chatRef.current!;
    const text = input.value.trim();
    if (text) realtime.send({ type: 'world:say', text: text.slice(0, 140) });
    input.value = '';
    input.blur();
  };

  const pad = (dir: string) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault();
      engineRef.current?.press(dir, true);
    },
    onPointerUp: () => engineRef.current?.press(dir, false),
    onPointerLeave: () => engineRef.current?.press(dir, false),
    onPointerCancel: () => engineRef.current?.press(dir, false),
  });

  return (
    <div className="campus">
      <canvas
        ref={canvasRef}
        className="campus__canvas"
        aria-label="Campus map. Use WASD or arrow keys to walk, or click where you want to go."
        onClick={(e) => engineRef.current?.click(e.clientX, e.clientY)}
      />
      {!ready && (
        <div className="campus__boot">
          <Loading label="LOADING CAMPUS" />
        </div>
      )}

      <div className="campus__hud">
        <p className="px-xs c-yellow">{zone?.label ?? 'JECRC CAMPUS'}</p>
        <p className="muted">
          <span className="live-dot" />
          {players.length} ON CAMPUS
        </p>
      </div>

      <aside className="campus__players" aria-label="Players on campus">
        <canvas
          ref={miniRef}
          className="campus__mini"
          aria-label="Minimap. Click to walk there."
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            engineRef.current?.miniClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
          }}
        />
        <div className="campus__roster">
          <p className="px-xs c-cyan">PLAYERS</p>
          <ul>
            {players.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => p.id !== me.id && setPicked(p)} disabled={p.id === me.id}>
                  <span className="campus__swatch" style={{ background: p.color }} />
                  <span className="truncate">{p.id === me.id ? 'YOU' : p.name.toUpperCase()}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {zone && <ZonePanel zone={zone} seating={seating} players={players} me={me} onSit={sit} />}
      {seating && (
        <button type="button" className="btn btn--sm campus__stand" onClick={sit}>
          STAND UP (E)
        </button>
      )}

      <div className="campus__chat">
        {log.length > 0 && (
          <ol className="campus__log" aria-live="polite">
            {log.map((l) => (
              <li key={l.id}>
                <span className={l.self ? 'c-yellow' : 'c-cyan'}>{l.self ? 'YOU' : l.name.toUpperCase()}:</span> {l.text}
              </li>
            ))}
          </ol>
        )}
        <form className="row" onSubmit={say}>
          <input ref={chatRef} className="input" maxLength={140} placeholder="Press Enter to talk to people nearby…" aria-label="Say something nearby" autoComplete="off" />
          <button className="btn btn--sm">SAY</button>
        </form>
      </div>

      <div className="campus__pad" aria-hidden="true">
        <button type="button" className="pad pad--up" {...pad('up')}>▲</button>
        <button type="button" className="pad pad--left" {...pad('left')}>◀</button>
        <button type="button" className="pad pad--right" {...pad('right')}>▶</button>
        <button type="button" className="pad pad--down" {...pad('down')}>▼</button>
      </div>

      <p className="campus__help dim">WASD / ARROWS TO WALK · CLICK TO WALK THERE · E TO SIT · CLICK A PLAYER · ENTER TO TALK</p>

      <Modal open={!!picked} title="PLAYER" onClose={() => setPicked(null)}>
        {picked && <PlayerCard id={picked.id} onChallenge={() => setPicked(null)} />}
      </Modal>
    </div>
  );
}

function PlayerCard({ id, onChallenge }: { id: string; onChallenge: () => void }) {
  const { data: p } = usePerson(id);
  if (!p) return <Loading />;
  return (
    <div className="stack">
      <div className="row">
        <Avatar user={p} size={56} showPresence />
        <div className="grow">
          <p className="upper" style={{ fontSize: 30, lineHeight: 1 }}>{p.name}</p>
          <p className="dim">@{p.username} · {p.branch} · Y{p.year} · {p.section}</p>
        </div>
      </div>
      {p.bio && <p className="muted">{p.bio}</p>}
      {p.interests.length > 0 && <p className="c-cyan">{p.interests.join(' · ')}</p>}
      <FriendButton id={p.id} name={p.name} status={p.friend} block />
      <p className="px-xs c-yellow">CHALLENGE TO A GAME</p>
      <div className="row">
        {(['ttt', 'c4', 'rps'] as GameKind[]).map((k) => (
          <button
            key={k}
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              games.challenge(p.id, k);
              onChallenge();
            }}
          >
            {GAME_NAMES[k]}
          </button>
        ))}
      </div>
      <Link to="/people" className="px-xs">SEE ALL PLAYERS</Link>
    </div>
  );
}
