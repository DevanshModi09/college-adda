import { useState, type FormEvent } from 'react';
import type { Deadline, Priority, PublicUser } from '@adda/shared';
import { useCreateDeadline, useDeadlines, useDeleteDeadline, useSections, useToggleDeadline } from '../../hooks/queries';
import { sectionKeyOf, sectionLabel } from '../../lib/constants';
import { useNow } from '../../hooks/useNow';
import { countdown, fmtDate, fmtTime, toLocalInput, tonightAt2359 } from '../../lib/time';
import { timeHp } from '../../lib/progress';
import { downloadIcs } from '../../lib/ics';
import { ApiError } from '../../lib/api';
import { toast } from '../../stores/toasts';
import { Bar, Empty, Field, Loading, PageHead } from '../../components/ui';
import './deadlines.css';

type Filter = 'upcoming' | 'overdue' | 'done' | 'all';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'upcoming', label: 'UPCOMING' },
  { id: 'overdue', label: 'OVERDUE' },
  { id: 'done', label: 'CLEARED' },
  { id: 'all', label: 'ALL' },
];
const PRIORITY_LABEL: Record<Priority, string> = { high: 'HIGH', med: 'MED', low: 'LOW' };

export function DeadlinesPage({ me }: { me: PublicUser }) {
  const now = useNow();
  const { data, isPending } = useDeadlines();
  const [filter, setFilter] = useState<Filter>('upcoming');

  const all = data ?? [];
  const buckets: Record<Filter, Deadline[]> = {
    upcoming: all.filter((d) => !d.done && d.dueAt >= now),
    overdue: all.filter((d) => !d.done && d.dueAt < now),
    done: all.filter((d) => d.done),
    all,
  };

  const exportIcs = () => {
    const items = all.filter((d) => !d.done);
    if (!items.length) return toast('NO PENDING DEADLINES TO EXPORT');
    downloadIcs(
      'jecrc-deadlines.ics',
      items.map((d) => ({ id: d.id, title: `Due: ${d.title}`, start: d.dueAt - 30 * 60e3, end: d.dueAt, description: d.subject, alarmMinutes: 60 }))
    );
  };

  return (
    <>
      <PageHead
        title="DEADLINES"
        sub="Official deadlines come from your admins. Anything you spawn yourself is private to you. Default time: 23:59, obviously."
      >
        <button type="button" className="btn btn--ghost" onClick={exportIcs}>
          EXPORT .ICS
        </button>
      </PageHead>

      <AddDeadline me={me} />

      <div className="tabs" role="group" aria-label="Filter deadlines">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="tab" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
            {buckets[f.id].length > 0 && <span className="tab__count">{buckets[f.id].length}</span>}
          </button>
        ))}
      </div>

      {isPending ? (
        <Loading />
      ) : buckets[filter].length ? (
        <ul className="deadlines">
          {buckets[filter].map((d) => (
            <DeadlineRow key={d.id} d={d} now={now} />
          ))}
        </ul>
      ) : (
        <div className="panel">
          <Empty title={filter === 'upcoming' ? 'NO BOSSES AHEAD' : 'NOTHING HERE'}>
            {filter === 'upcoming' && <p>Add one above, or go touch grass.</p>}
          </Empty>
        </div>
      )}
    </>
  );
}

function AddDeadline({ me }: { me: PublicUser }) {
  const create = useCreateDeadline();
  const isAdmin = me.role === 'admin';
  const { data: sections } = useSections();
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setError(null);
    try {
      await create.mutateAsync({
        title: String(f.get('title')),
        subject: String(f.get('subject')),
        dueAt: new Date(String(f.get('due'))).getTime(),
        priority: f.get('priority') as Priority,
        ...audienceOf(String(f.get('postTo') ?? 'me')),
      });
      if (f.get('postTo') && f.get('postTo') !== 'me') toast('OFFICIAL DEADLINE POSTED', { kind: 'good' });
      (form.elements.namedItem('title') as HTMLInputElement).value = '';
      (form.elements.namedItem('title') as HTMLInputElement).focus();
    } catch (err) {
      setError(err as ApiError);
    }
  }

  return (
    <form className="panel add-deadline" onSubmit={submit}>
      <Field label="NEW BOSS" error={error?.details.title}>
        <input className="input" name="title" required maxLength={120} placeholder="Assignment, quiz, lab file…" />
      </Field>
      <Field label="SUBJECT">
        <input className="input" name="subject" maxLength={60} placeholder="DBMS" />
      </Field>
      <Field label="DUE" error={error?.details.dueAt}>
        <input className="input" name="due" type="datetime-local" required defaultValue={toLocalInput(tonightAt2359())} />
      </Field>
      <Field label="THREAT">
        <select className="select" name="priority" defaultValue="med">
          <option value="high">HIGH</option>
          <option value="med">MED</option>
          <option value="low">LOW</option>
        </select>
      </Field>
      {isAdmin && (
        <Field label="POST TO">
          <select className="select" name="postTo" defaultValue="me">
            <option value="me">JUST ME (PRIVATE)</option>
            <option value="all">OFFICIAL · EVERYONE</option>
            <option value={`sec:${sectionKeyOf(me)}`}>OFFICIAL · MY SECTION</option>
            <optgroup label="OFFICIAL · ONE SECTION">
              {sections?.map((s) => (
                <option key={s.key} value={`sec:${s.key}`}>
                  {sectionLabel(s.key)}
                  {s.label ? ` — ${s.label}` : ''}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
      )}
      <button className="btn" disabled={create.isPending}>
        SPAWN
      </button>
    </form>
  );
}

/** 'me' -> private; 'all' -> official for everyone; 'sec:<key>' -> official for one section. */
function audienceOf(postTo: string): { official: boolean; audience: string } {
  if (postTo === 'all') return { official: true, audience: '' };
  if (postTo.startsWith('sec:')) return { official: true, audience: postTo.slice(4) };
  return { official: false, audience: '' };
}

function DeadlineRow({ d, now }: { d: Deadline; now: number }) {
  const toggle = useToggleDeadline();
  const remove = useDeleteDeadline();
  const left = d.dueAt - now;
  const state = d.done ? 'done' : left < 0 ? 'overdue' : left < 864e5 ? 'soon' : '';

  return (
    <li className={`panel deadline deadline--${state || 'normal'}`}>
      <label className="check">
        <input
          type="checkbox"
          checked={d.done}
          onChange={(e) => {
            toggle.mutate({ id: d.id, done: e.target.checked });
            if (e.target.checked) toast('BOSS DEFEATED +1 XP', { kind: 'good' });
          }}
        />
        <span className="sr-only">Mark {d.title} as done</span>
      </label>
      <div className="deadline__body">
        <p className="deadline__title upper">{d.title}</p>
        <p className="muted">
          {d.official ? (
            <span className="tag tag--official">OFFICIAL{d.audience ? ` · ${sectionLabel(d.audience)}` : ''}</span>
          ) : (
            <span className="tag">PRIVATE</span>
          )}{' '}
          {d.subject && <span className="tag">{d.subject.toUpperCase()}</span>} {fmtDate(d.dueAt)} {fmtTime(d.dueAt)} ·{' '}
          <span className={`prio prio--${d.priority}`}>{PRIORITY_LABEL[d.priority]}</span>
        </p>
      </div>
      <div className="deadline__hp">
        {!d.done && <Bar thin value={timeHp(d, now)} color={state ? 'var(--pink)' : 'var(--cyan)'} label="Time left" />}
        <p className="deadline__left">{d.done ? 'CLEARED' : countdown(left)}</p>
      </div>
      {d.canEdit ? (
        <button type="button" className="icon-btn" onClick={() => remove.mutate(d.id)} aria-label={`Delete ${d.title}`}>
          DEL
        </button>
      ) : (
        <span className="icon-btn" title="Posted by an admin" aria-hidden="true" />
      )}
    </li>
  );
}
