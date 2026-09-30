import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { LostFoundPin, PublicUser } from '@adda/shared';
import { useCreatePin, useDeletePin, useResolvePin } from '../../hooks/queries';
import { useNow } from '../../hooks/useNow';
import { ago } from '../../lib/time';
import { Avatar, Empty } from '../../components/ui';

const KIND_LABEL = { lost: 'LOST', found: 'FOUND' } as const;

function KindTag({ kind }: { kind: LostFoundPin['kind'] }) {
  return <span className={`lf__kind lf__kind--${kind}`}>{KIND_LABEL[kind]}</span>;
}

/** The board: pin something where you're standing, and browse everything pinned around campus. */
export function LostFoundBoard({
  pins,
  place,
  here,
  onOpen,
  onGo,
}: {
  pins: LostFoundPin[];
  /** Name of the area you're standing in, stored with the pin. */
  place: string;
  /** Your position on the map, or null before the campus has loaded. */
  here: { x: number; y: number } | null;
  onOpen: (pin: LostFoundPin) => void;
  onGo: (pin: LostFoundPin) => void;
}) {
  const [kind, setKind] = useState<LostFoundPin['kind']>('lost');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const create = useCreatePin();
  const now = useNow(30_000);
  const open = pins.filter((p) => !p.resolved);
  const sorted = pins.filter((p) => p.resolved);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!here || !title.trim()) return;
    create.mutate(
      { kind, title: title.trim(), details: details.trim(), x: here.x, y: here.y, place },
      {
        onSuccess: () => {
          setTitle('');
          setDetails('');
        },
      }
    );
  };

  return (
    <div className="stack">
      <form className="stack lf__form" onSubmit={submit}>
        <div className="row">
          {(['lost', 'found'] as const).map((k) => (
            <button key={k} type="button" className="tab" aria-pressed={kind === k} onClick={() => setKind(k)}>
              I {k === 'lost' ? 'LOST' : 'FOUND'} SOMETHING
            </button>
          ))}
        </div>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder={kind === 'lost' ? 'What did you lose? e.g. Blue Milton bottle' : 'What did you find? e.g. ID card, Aarav S.'} aria-label="What is it" />
        <textarea className="textarea" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={300} rows={2} placeholder={kind === 'lost' ? 'Anything that helps: colour, stickers, when you last had it' : 'Where you left it: security desk, with you, etc.'} aria-label="Details" />
        <button className="btn" disabled={!here || !title.trim() || create.isPending}>
          PIN IT HERE · {place}
        </button>
        <p className="dim">The pin goes where you're standing. Walk to the spot first for best results.</p>
      </form>

      <p className="px-xs c-cyan">ON THE MAP ({open.length})</p>
      {open.length === 0 ? (
        <Empty title="NOTHING PINNED">Lose something? Walk to where you last had it and pin it.</Empty>
      ) : (
        <ul className="lf__list">
          {open.map((p) => (
            <PinRow key={p.id} pin={p} now={now} onOpen={onOpen} onGo={onGo} />
          ))}
        </ul>
      )}
      {sorted.length > 0 && (
        <>
          <p className="px-xs c-green">SORTED THIS WEEK ({sorted.length})</p>
          <ul className="lf__list lf__list--done">
            {sorted.map((p) => (
              <PinRow key={p.id} pin={p} now={now} onOpen={onOpen} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function PinRow({ pin, now, onOpen, onGo }: { pin: LostFoundPin; now: number; onOpen: (p: LostFoundPin) => void; onGo?: (p: LostFoundPin) => void }) {
  return (
    <li className="lf__row">
      <button type="button" className="lf__open" onClick={() => onOpen(pin)}>
        <KindTag kind={pin.kind} /> <span className="truncate">{pin.title}</span>
        <span className="dim lf__meta">
          {pin.place || 'CAMPUS'} · {ago(pin.createdAt, now)}
        </span>
      </button>
      {onGo && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onGo(pin)}>
          GO
        </button>
      )}
    </li>
  );
}

/** One pin: what, where, who, and how to get it back. */
export function PinCard({ pin, me, onGo, onDone }: { pin: LostFoundPin; me: PublicUser; onGo: () => void; onDone: () => void }) {
  const resolve = useResolvePin();
  const remove = useDeletePin();
  const now = useNow(30_000);
  const mine = pin.author?.id === me.id;
  const first = pin.author?.name.split(' ')[0]?.toUpperCase();

  return (
    <div className="stack">
      <p className="upper" style={{ fontSize: 30, lineHeight: 1 }}>
        <KindTag kind={pin.kind} /> {pin.title}
      </p>
      {pin.details && <p className="muted">{pin.details}</p>}
      <p className="dim">
        {pin.place || 'CAMPUS'} · {ago(pin.createdAt, now)}
        {pin.resolved && <span className="c-green"> · SORTED</span>}
      </p>
      {pin.author && (
        <div className="row">
          <Avatar user={pin.author} size={40} showPresence />
          <p className="grow">
            {mine ? 'YOU' : pin.author.name} {pin.kind === 'lost' ? 'lost this' : 'found this'}
          </p>
        </div>
      )}
      <div className="row">
        {!pin.resolved && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onGo}>
            TAKE ME THERE
          </button>
        )}
        {pin.author && !mine && (
          <Link to={`/chat/${pin.author.id}`} className="btn btn--sm">
            {pin.kind === 'lost' ? `I HAVE IT · MESSAGE ${first}` : `IT'S MINE · MESSAGE ${first}`}
          </Link>
        )}
      </div>
      {pin.canEdit && (
        <div className="row">
          <button type="button" className="btn btn--sm" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: pin.id, resolved: !pin.resolved }, { onSuccess: onDone })}>
            {pin.resolved ? 'REOPEN' : pin.kind === 'lost' ? 'GOT IT BACK' : 'RETURNED TO OWNER'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={remove.isPending} onClick={() => remove.mutate(pin.id, { onSuccess: onDone })}>
            DELETE PIN
          </button>
        </div>
      )}
    </div>
  );
}
