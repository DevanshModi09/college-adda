import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { LostFoundPin, PublicUser } from '@adda/shared';
import { useCreatePin, useDeletePin, useLostFound, useResolvePin } from '../../hooks/queries';
import { useNow } from '../../hooks/useNow';
import { ago } from '../../lib/time';
import { ApiError } from '../../lib/api';
import { toast } from '../../stores/toasts';
import { Empty, Field, Loading, Modal, PageHead } from '../../components/ui';
import './lostfound.css';

type Filter = '' | LostFoundPin['kind'];

export function LostFoundPage({ me }: { me: PublicUser }) {
  const { data, isPending } = useLostFound();
  const [filter, setFilter] = useState<Filter>('');
  const [adding, setAdding] = useState(false);
  const now = useNow(60_000);
  const isAdmin = me.role === 'admin';
  const contact = data?.contact ?? null;
  const pins = (data?.pins ?? []).filter((p) => !filter || p.kind === filter);
  const open = pins.filter((p) => !p.resolved);
  const sorted = pins.filter((p) => p.resolved);

  return (
    <>
      <PageHead title="LOST & FOUND" sub="Lost your bottle in the library? Found someone's ID card at the canteen? It all ends up here.">
        {isAdmin && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            + ADD ITEM
          </button>
        )}
      </PageHead>

      {!isAdmin && (
        <div className="panel panel--cyan lf__report">
          <div className="grow">
            <p className="px-xs c-yellow">LOST OR FOUND SOMETHING?</p>
            <p className="muted">Message the admin with what it is and where. They'll put it up here, and handle the handover when someone claims it.</p>
          </div>
          {contact && (
            <Link to={`/chat/${contact.id}`} className="btn">
              MESSAGE ADMIN
            </Link>
          )}
        </div>
      )}

      <div className="tabs" role="group" aria-label="Filter items">
        {(
          [
            ['', 'ALL'],
            ['lost', 'LOST'],
            ['found', 'FOUND'],
          ] as const
        ).map(([value, label]) => (
          <button key={label} type="button" className="tab" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>

      {isPending ? (
        <Loading />
      ) : open.length ? (
        <div className="lf__grid">
          {open.map((p) => (
            <ItemCard key={p.id} pin={p} me={me} contact={contact} now={now} />
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty title="NOTHING HERE">{isAdmin ? 'When someone messages you about a lost or found item, add it here.' : 'No lost or found items right now. Fingers crossed it stays that way.'}</Empty>
        </div>
      )}

      {sorted.length > 0 && (
        <>
          <h2 className="px-sm lf__sorted">BACK WITH THEIR OWNERS</h2>
          <div className="lf__grid">
            {sorted.map((p) => (
              <ItemCard key={p.id} pin={p} me={me} contact={contact} now={now} />
            ))}
          </div>
        </>
      )}

      <Modal open={adding && isAdmin} title="ADD LOST / FOUND ITEM" onClose={() => setAdding(false)}>
        <AddForm onDone={() => setAdding(false)} />
      </Modal>
    </>
  );
}

function ItemCard({ pin, me, contact, now }: { pin: LostFoundPin; me: PublicUser; contact: PublicUser | null; now: number }) {
  const resolve = useResolvePin();
  const remove = useDeletePin();
  const claim = pin.kind === 'found' ? "THAT'S MINE" : 'I FOUND IT';

  return (
    <article className={`panel lf__item ${pin.resolved ? 'lf__item--done' : ''}`}>
      <p>
        <span className={`lf__kind lf__kind--${pin.kind}`}>{pin.kind === 'lost' ? 'LOST' : 'FOUND'}</span>
        {pin.resolved && <span className="c-green"> ✓ SORTED</span>}
      </p>
      <h3 className="lf__title upper">{pin.title}</h3>
      <p className="muted">
        {pin.place || 'Somewhere on campus'} · {ago(pin.createdAt, now)}
      </p>
      {pin.details && <p className="lf__details">{pin.details}</p>}
      <div className="row lf__foot">
        {!pin.resolved && contact && contact.id !== me.id && (
          <Link to={`/chat/${contact.id}`} className="btn btn--sm">
            {claim} · MESSAGE ADMIN
          </Link>
        )}
        {pin.canEdit && (
          <>
            <button type="button" className="btn btn--ghost btn--sm" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: pin.id, resolved: !pin.resolved })}>
              {pin.resolved ? 'REOPEN' : 'MARK SORTED'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={remove.isPending} onClick={() => remove.mutate(pin.id)}>
              DELETE
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const create = useCreatePin();
  const [kind, setKind] = useState<LostFoundPin['kind']>('found');
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.currentTarget)) as Record<string, string>;
    setError(null);
    try {
      await create.mutateAsync({ kind, title: f.title!, place: f.place ?? '', details: f.details ?? '' });
      toast('ITEM ADDED', { kind: 'good' });
      onDone();
    } catch (err) {
      setError(err as ApiError);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <div className="row" role="group" aria-label="Lost or found">
        {(['found', 'lost'] as const).map((k) => (
          <button key={k} type="button" className="tab" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === 'found' ? 'SOMEONE FOUND IT' : 'SOMEONE LOST IT'}
          </button>
        ))}
      </div>
      <Field label="WHAT IS IT" error={error?.details.title}>
        <input className="input" name="title" required maxLength={60} placeholder="Blue Milton bottle / ID card: Aarav S." />
      </Field>
      <Field label="WHERE">
        <input className="input" name="place" maxLength={60} placeholder="Library, 2nd floor" />
      </Field>
      <Field label="DETAILS">
        <textarea className="textarea" name="details" rows={3} maxLength={300} placeholder="Colour, stickers, where to collect it from…" />
      </Field>
      {error && !Object.keys(error.details).length && <p className="form-error">{error.message}</p>}
      <button className="btn" disabled={create.isPending}>
        ADD TO BOARD
      </button>
    </form>
  );
}
