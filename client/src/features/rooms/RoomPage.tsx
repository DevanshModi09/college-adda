import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { FocusTimer, PublicUser, Room, RoomMember, RoomMessage } from '@adda/shared';
import { realtime } from '../../lib/realtime';
import { fmtTime } from '../../lib/time';
import { toast } from '../../stores/toasts';
import { Avatar, Empty, Loading, Panel } from '../../components/ui';
import './rooms.css';

export function RoomPage({ me }: { me: PublicUser }) {
  const { roomId = '' } = useParams();
  const [room, setRoom] = useState<Room | null>(null);
  const [missing, setMissing] = useState(false);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [timer, setTimer] = useState<{ t: FocusTimer; offset: number; by?: string } | null>(null);
  const myStatus = useRef('');

  useEffect(() => {
    setRoom(null);
    setMissing(false);
    setMessages([]);
    const off = realtime.subscribe((msg) => {
      switch (msg.type) {
        case 'room:state':
          if (msg.room.id !== roomId) return;
          setRoom(msg.room);
          setMembers(msg.members);
          setMessages(msg.messages);
          setTimer({ t: msg.timer, offset: msg.timer.serverNow - Date.now() });
          // The server forgets statuses across reconnects; restore ours.
          if (myStatus.current) realtime.send({ type: 'room:status', status: myStatus.current });
          break;
        case 'room:members':
          if (msg.roomId === roomId) setMembers(msg.members);
          break;
        case 'room:chat':
          if (msg.roomId === roomId) setMessages((m) => [...m.slice(-199), msg.message]);
          break;
        case 'room:timer':
          if (msg.roomId === roomId) setTimer({ t: msg.timer, offset: msg.timer.serverNow - Date.now(), by: msg.by });
          break;
        case 'error':
          if (msg.error === 'Desk not found') setMissing(true);
          break;
      }
    });
    realtime.joinRoom(roomId);
    return () => {
      off();
      realtime.leaveRoom();
    };
  }, [roomId]);

  if (missing) {
    return (
      <div className="panel">
        <Empty title="DESK NOT FOUND">
          <Link to="/desks">BACK TO DESKS</Link>
        </Empty>
      </div>
    );
  }
  if (!room) return <Loading label="PULLING UP A CHAIR" />;

  return (
    <>
      <header className="page-head">
        <div>
          <Link to="/desks" className="px-xs">
            ◀ ALL DESKS
          </Link>
          <h1 style={{ marginTop: 12 }}>{room.name.toUpperCase()}</h1>
          <p>
            <span className="tag">{room.lang.toUpperCase()}</span> {room.topic}
          </p>
        </div>
        <Link to="/desks" className="btn btn--ghost">
          LEAVE
        </Link>
      </header>

      <div className="room-layout">
        <Panel title={`PLAYERS · ${members.length}`}>
          <ul className="members">
            {members.map((m) => (
              <li key={m.id}>
                <Avatar user={m} size={36} />
                <div className="grow">
                  <p className="upper truncate">
                    {m.name}
                    {m.id === me.id && <span className="dim"> (YOU)</span>}
                  </p>
                  <p className="dim">
                    {m.branch} · Y{m.year} · {Math.max(1, Math.round((Date.now() - m.joinedAt) / 60e3))}M
                  </p>
                  {m.status && <p className="members__status">&gt; {m.status}</p>}
                </div>
                {m.id !== me.id && (
                  <Link to={`/chat/${m.id}`} className="icon-btn" aria-label={`Message ${m.name}`}>
                    DM
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <div className="stack room-center">
          {timer && <TimerPanel timer={timer.t} offset={timer.offset} by={timer.by === me.name ? undefined : timer.by} />}
          <StatusForm
            onSet={(s) => {
              myStatus.current = s;
              realtime.send({ type: 'room:status', status: s });
              toast(s ? 'STATUS UPDATED' : 'STATUS CLEARED');
            }}
          />
        </div>

        <ChatPanel messages={messages} meId={me.id} />
      </div>
    </>
  );
}

function TimerPanel({ timer, offset, by }: { timer: FocusTimer; offset: number; by?: string }) {
  const [, force] = useState(0);
  const rang = useRef(false);
  useEffect(() => {
    rang.current = false;
  }, [timer]);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, []);

  const left = timer.endsAt ? Math.max(0, Math.ceil((timer.endsAt - (Date.now() + offset)) / 1000)) : timer.remaining;
  const finished = !!timer.endsAt && left === 0;
  useEffect(() => {
    if (!finished || rang.current) return;
    rang.current = true;
    beep();
    toast(timer.mode === 'focus' ? 'FOCUS COMPLETE. TAKE A BREAK.' : 'BREAK OVER. BACK TO IT.', { kind: 'good' });
  }, [finished, timer.mode]);
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const running = !!timer.endsAt;

  return (
    <Panel title="SHARED TIMER" tone={running ? (timer.mode === 'focus' ? 'pink' : 'cyan') : undefined}>
      <div className="tabs timer__modes" role="group" aria-label="Timer mode">
        <button type="button" className="tab" aria-pressed={timer.mode === 'focus'} onClick={() => realtime.send({ type: 'room:timer', action: 'mode', mode: 'focus' })}>
          FOCUS 25
        </button>
        <button type="button" className="tab" aria-pressed={timer.mode === 'break'} onClick={() => realtime.send({ type: 'room:timer', action: 'mode', mode: 'break' })}>
          BREAK 5
        </button>
      </div>
      <p className={`timer__clock ${running ? (timer.mode === 'focus' ? 'c-pink' : 'c-cyan') : 'dim'}`} role="timer" aria-live="off">
        {mm}:{ss}
      </p>
      <div className="row timer__btns">
        <button type="button" className="btn" onClick={() => realtime.send({ type: 'room:timer', action: running ? 'pause' : 'start' })}>
          {running ? 'PAUSE' : 'START'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => realtime.send({ type: 'room:timer', action: 'reset' })}>
          RESET
        </button>
      </div>
      <p className="muted timer__note">{by ? `${by.toUpperCase()} CHANGED THE TIMER` : 'Everyone at this desk sees the same clock.'}</p>
    </Panel>
  );
}

function StatusForm({ onSet }: { onSet: (s: string) => void }) {
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        onSet(String(new FormData(e.currentTarget).get('status') ?? '').trim());
      }}
    >
      <label className="field">
        <span className="field__label">WHAT ARE YOU WORKING ON?</span>
        <div className="row">
          <input className="input" name="status" maxLength={80} placeholder="Graphs: Dijkstra on GFG" />
          <button className="btn btn--cyan">SET</button>
        </div>
      </label>
    </form>
  );
}

function ChatPanel({ messages, meId }: { messages: RoomMessage[]; meId: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('text') as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    realtime.send({ type: 'room:chat', text });
    input.value = '';
  };

  return (
    <Panel title="DESK CHAT" className="chat-panel">
      <div className="chat-log" ref={box} aria-live="polite">
        {messages.length ? (
          messages.map((m) => (
            <p key={m.id} className="chat-log__msg">
              <span className="dim">{fmtTime(m.createdAt)} </span>
              <span style={{ color: m.color }}>{m.userId === meId ? 'YOU' : m.name.split(' ')[0]?.toUpperCase()}</span>
              <span className="dim">: </span>
              {linkify(m.text)}
            </p>
          ))
        ) : (
          <p className="dim">No messages yet. Say hi.</p>
        )}
      </div>
      <form className="row chat-send" onSubmit={send}>
        <input className="input" name="text" maxLength={500} placeholder="Ask for help, share a link…" autoComplete="off" aria-label="Message" />
        <button className="btn">SEND</button>
      </form>
    </Panel>
  );
}

function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      part
    )
  );
}

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.18, 0.36].forEach((t, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = [660, 880, 1320][i]!;
      g.gain.setValueAtTime(0.08, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.15);
    });
  } catch {
    // audio blocked; the toast still shows
  }
}
