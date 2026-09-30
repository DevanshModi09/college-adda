import { useState, type FormEvent } from 'react';
import type { CampusEvent, PublicUser } from '@adda/shared';
import { useCreateEvent, useDeleteEvent, useEvents, useRsvp } from '../../hooks/queries';
import { useNow } from '../../hooks/useNow';
import { EVENT_CATEGORIES } from '../../lib/constants';
import { dayKey, fmtDate, fmtTime, toLocalInput } from '../../lib/time';
import { downloadIcs } from '../../lib/ics';
import { ApiError } from '../../lib/api';
import { toast } from '../../stores/toasts';
import { AvatarStack, Empty, Field, Loading, Modal, PageHead } from '../../components/ui';
import './events.css';

export function EventsPage({ me }: { me: PublicUser }) {
  const { data, isPending } = useEvents();
  const [category, setCategory] = useState('');
  const [hosting, setHosting] = useState(false);
  const now = useNow(60_000);
  const list = (data ?? []).filter((e) => !category || e.category === category);
  const isAdmin = me.role === 'admin';

  return (
    <>
      <PageHead title="EVENTS" sub="Side quests: study groups, hackathon team-ups, club meets. Posted by admins, RSVP to join.">
        {isAdmin && (
          <button type="button" className="btn" onClick={() => setHosting(true)}>
            + HOST EVENT
          </button>
        )}
      </PageHead>

      <div className="tabs" role="group" aria-label="Filter by category">
        <button type="button" className="tab" aria-pressed={!category} onClick={() => setCategory('')}>
          ALL
        </button>
        {EVENT_CATEGORIES.map((c) => (
          <button key={c} type="button" className="tab" aria-pressed={category === c} onClick={() => setCategory(c)}>
            {c.toUpperCase()}
          </button>
        ))}
      </div>

      {isPending ? (
        <Loading />
      ) : list.length ? (
        <div className="events">
          {list.map((e, i) => (
            <div key={e.id}>
              {(i === 0 || dayKey(list[i - 1]!.startAt) !== dayKey(e.startAt)) && <h2 className="events__day px-sm">{fmtDate(e.startAt)}</h2>}
              <EventCard e={e} me={me} now={now} />
            </div>
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty title="NO QUESTS YET">{isAdmin ? 'Host one. Even “DBMS revision in the library at 5” counts.' : 'Admins haven’t posted any events yet. Check back soon.'}</Empty>
        </div>
      )}

      <Modal open={hosting && isAdmin} title="HOST AN EVENT" onClose={() => setHosting(false)}>
        <HostForm onDone={() => setHosting(false)} />
      </Modal>
    </>
  );
}

function EventCard({ e, me, now }: { e: CampusEvent; me: PublicUser; now: number }) {
  const rsvp = useRsvp();
  const remove = useDeleteEvent();
  const live = e.startAt <= now && now <= (e.endAt ?? e.startAt + 3600e3);
  const d = new Date(e.startAt);

  return (
    <article className={`panel event ${e.going ? 'panel--cyan' : ''}`}>
      <div className="event__date" aria-hidden="true">
        <span className="px">{String(d.getDate()).padStart(2, '0')}</span>
        <span>{d.toLocaleString('en-IN', { month: 'short' }).toUpperCase()}</span>
      </div>
      <div className="grow">
        <p>
          <span className="tag">{e.category.toUpperCase()}</span>
          {live && <span className="c-green"> ● HAPPENING NOW</span>}
        </p>
        <h3 className="event__title upper">{e.title}</h3>
        <p className="muted">
          {fmtTime(e.startAt)}
          {e.endAt && `–${fmtTime(e.endAt)}`}
          {e.location && ` · ${e.location}`} · HOST {e.host?.name.toUpperCase() ?? '???'}
        </p>
        {e.description && <p className="event__desc">{e.description}</p>}
        <div className="spread event__foot">
          <span className="row">
            <AvatarStack users={e.attendees} />
            <span className="muted">{e.attendees.length} GOING</span>
          </span>
          <span className="row">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => downloadIcs(`${e.title.replace(/\W+/g, '-').toLowerCase()}.ics`, [{ id: e.id, title: e.title, start: e.startAt, end: e.endAt, location: e.location, description: e.description, alarmMinutes: 60 }])}
            >
              .ICS
            </button>
            {(e.host?.id === me.id || me.role === 'admin') && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove.mutate(e.id)}>
                DELETE
              </button>
            )}
            <button type="button" className={`btn btn--sm ${e.going ? 'btn--cyan' : ''}`} onClick={() => rsvp.mutate(e.id)} aria-pressed={e.going}>
              {e.going ? "I'M IN ✓" : 'JOIN QUEST'}
            </button>
          </span>
        </div>
      </div>
    </article>
  );
}

function HostForm({ onDone }: { onDone: () => void }) {
  const create = useCreateEvent();
  const [error, setError] = useState<ApiError | null>(null);
  const start = new Date(Date.now() + 864e5);
  start.setHours(17, 0, 0, 0);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.currentTarget)) as Record<string, string>;
    setError(null);
    try {
      await create.mutateAsync({
        title: f.title!,
        category: f.category!,
        location: f.location ?? '',
        description: f.description ?? '',
        startAt: new Date(f.start!).getTime(),
        endAt: f.end ? new Date(f.end).getTime() : null,
      });
      toast('EVENT PUBLISHED', { kind: 'good' });
      onDone();
    } catch (err) {
      setError(err as ApiError);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <Field label="TITLE" error={error?.details.title}>
        <input className="input" name="title" required maxLength={100} placeholder="SIH team formation" />
      </Field>
      <div className="form-grid form-grid--2">
        <Field label="CATEGORY">
          <select className="select" name="category">
            {EVENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="WHERE">
          <input className="input" name="location" maxLength={100} placeholder="Central library / Meet link" />
        </Field>
      </div>
      <div className="form-grid form-grid--2">
        <Field label="STARTS">
          <input className="input" name="start" type="datetime-local" required defaultValue={toLocalInput(start.getTime())} />
        </Field>
        <Field label="ENDS (OPTIONAL)" error={error?.details.endAt}>
          <input className="input" name="end" type="datetime-local" defaultValue={toLocalInput(start.getTime() + 2 * 3600e3)} />
        </Field>
      </div>
      <Field label="DETAILS">
        <textarea className="textarea" name="description" rows={3} maxLength={1000} placeholder="What to bring, who should come, group link…" />
      </Field>
      {error && !Object.keys(error.details).length && <p className="form-error">{error.message}</p>}
      <button className="btn" disabled={create.isPending}>
        PUBLISH
      </button>
    </form>
  );
}
