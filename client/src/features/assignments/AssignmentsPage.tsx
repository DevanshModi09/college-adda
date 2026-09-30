import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { Assignment, AssignmentStatus, SubjectAssignments } from '@adda/shared';
import { useAssignments, useUpdateAssignment } from '../../hooks/queries';
import { useNow } from '../../hooks/useNow';
import { countdown, fmtShortDate, toLocalInput } from '../../lib/time';
import { toast } from '../../stores/toasts';
import { Bar, Empty, Loading, Modal, PageHead, Panel } from '../../components/ui';
import './assignments.css';

const NEXT: Record<AssignmentStatus, AssignmentStatus> = { todo: 'doing', doing: 'submitted', submitted: 'todo' };
const LABEL: Record<AssignmentStatus, string> = { todo: 'TODO', doing: 'IN PROGRESS', submitted: 'SUBMITTED' };

type Filter = 'all' | 'pending' | 'due';

export function AssignmentsPage() {
  const now = useNow(60_000);
  const { data, isPending } = useAssignments();
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<string | null>(null);

  const subjects = data ?? [];
  const all = subjects.flatMap((s) => s.assignments);
  const submitted = all.filter((a) => a.status === 'submitted').length;
  const doing = all.filter((a) => a.status === 'doing').length;
  const dueSoon = subjects
    .flatMap((s) => s.assignments.filter((a) => a.status !== 'submitted' && a.dueAt).map((a) => ({ ...a, subject: s.subject })))
    .sort((a, b) => a.dueAt! - b.dueAt!);

  const shown = subjects.filter((s) =>
    filter === 'pending' ? s.assignments.some((a) => a.status !== 'submitted') : filter === 'due' ? s.assignments.some((a) => a.status !== 'submitted' && a.dueAt) : true
  );

  return (
    <>
      <PageHead title="ASSIGNMENTS" sub="5 per theory subject. Tap an assignment to move it along: TODO → IN PROGRESS → SUBMITTED." />

      <div className="asg-top">
        <Panel title="QUEST LOG" tone={submitted === all.length && all.length ? 'cyan' : undefined}>
          <p className="asg-big">
            <span className="c-green">{submitted}</span>
            <span className="dim">/{all.length}</span>
          </p>
          <Bar value={all.length ? submitted / all.length : 0} color="var(--green)" label="Assignments submitted" />
          <p className="muted asg-sub">
            SUBMITTED · {doing} IN PROGRESS · {all.length - submitted - doing} TODO
          </p>
        </Panel>
        <Panel title="DUE NEXT">
          {dueSoon.length ? (
            dueSoon.slice(0, 4).map((a) => (
              <div key={`${a.subject}${a.number}`} className="line">
                <span className="upper">
                  {a.subject} · A{a.number}
                </span>
                <span className={a.dueAt! < now ? 'c-pink' : a.dueAt! - now < 2 * 864e5 ? 'c-yellow' : ''}>{countdown(a.dueAt! - now)}</span>
              </div>
            ))
          ) : (
            <p className="muted">No due dates set. Open a subject’s DATES to add them.</p>
          )}
        </Panel>
      </div>

      <div className="tabs" role="group" aria-label="Filter subjects">
        {(['all', 'pending', 'due'] as Filter[]).map((f) => (
          <button key={f} type="button" className="tab" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'ALL SUBJECTS' : f === 'pending' ? 'NOT DONE' : 'HAS DUE DATES'}
          </button>
        ))}
      </div>

      {isPending ? (
        <Loading />
      ) : shown.length ? (
        <div className="asg-grid">
          {shown.map((s) => (
            <SubjectCard key={s.subject} s={s} now={now} onEdit={() => setEditing(s.subject)} />
          ))}
        </div>
      ) : subjects.length ? (
        <div className="panel">
          <Empty title="ALL CLEAR">Nothing matches this filter.</Empty>
        </div>
      ) : (
        <div className="panel">
          <Empty title="NO SUBJECTS">
            Your section has no timetable yet. <Link to="/profile">Check your section</Link>
          </Empty>
        </div>
      )}

      <Modal open={!!editing} title={`DATES & NOTES · ${editing?.toUpperCase() ?? ''}`} onClose={() => setEditing(null)}>
        {editing && <EditSubject subject={subjects.find((s) => s.subject === editing)!} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function SubjectCard({ s, now, onEdit }: { s: SubjectAssignments; now: number; onEdit: () => void }) {
  const update = useUpdateAssignment();
  const done = s.assignments.filter((a) => a.status === 'submitted').length;
  const cycle = (a: Assignment) => {
    const status = NEXT[a.status];
    update.mutate({ subject: s.subject, number: a.number, status });
    if (status === 'submitted') toast(`A${a.number} SUBMITTED +1 XP`, { kind: 'good' });
    if (status === 'submitted' && done + 1 === s.assignments.length) toast(`${s.subject.toUpperCase()}: ALL ${s.assignments.length} DONE!`, { kind: 'good' });
  };

  return (
    <article className={`panel asg-card ${done === s.assignments.length ? 'panel--cyan' : ''}`}>
      <div className="spread">
        <h2 className="asg-card__name upper">{s.subject}</h2>
        <button type="button" className="icon-btn asg-card__edit" onClick={onEdit} aria-label={`Due dates and notes for ${s.subject}`}>
          DATES
        </button>
      </div>
      <div className="asg-tiles">
        {s.assignments.map((a) => {
          const overdue = a.dueAt !== null && a.status !== 'submitted' && a.dueAt < now;
          return (
            <button
              key={a.number}
              type="button"
              className={`asg-tile asg-tile--${a.status} ${overdue ? 'asg-tile--overdue' : ''}`}
              onClick={() => cycle(a)}
              title={a.note || undefined}
              aria-label={`Assignment ${a.number}: ${LABEL[a.status]}${a.dueAt ? `, due ${fmtShortDate(a.dueAt)}` : ''}. Tap to change.`}
            >
              <span className="asg-tile__num">A{a.number}</span>
              <span className="asg-tile__mark" aria-hidden="true">
                {a.status === 'submitted' ? '✓' : a.status === 'doing' ? '…' : ''}
              </span>
              <span className="asg-tile__due">{a.dueAt ? fmtShortDate(a.dueAt) : ''}</span>
            </button>
          );
        })}
      </div>
      <Bar thin value={done / s.assignments.length} color="var(--green)" label={`${s.subject} assignments submitted`} />
      <p className="muted">
        {done}/{s.assignments.length} SUBMITTED
        {s.assignments.some((a) => a.note) && ' · HAS NOTES'}
      </p>
    </article>
  );
}

function EditSubject({ subject: s, onDone }: { subject: SubjectAssignments; onDone: () => void }) {
  const update = useUpdateAssignment();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const changes = s.assignments.flatMap((a) => {
      const dueRaw = String(f.get(`due${a.number}`) ?? '');
      const dueAt = dueRaw ? new Date(dueRaw).getTime() : null;
      const note = String(f.get(`note${a.number}`) ?? '').trim();
      const status = f.get(`status${a.number}`) as AssignmentStatus;
      return dueAt !== a.dueAt || note !== a.note || status !== a.status ? [{ subject: s.subject, number: a.number, dueAt, note, status }] : [];
    });
    await Promise.all(changes.map((c) => update.mutateAsync(c)));
    if (changes.length) toast('SAVED', { kind: 'good' });
    onDone();
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      {s.assignments.map((a) => (
        <fieldset key={a.number} className="asg-edit">
          <legend className="px-xs c-yellow">A{a.number}</legend>
          <select className="select" name={`status${a.number}`} defaultValue={a.status} aria-label={`A${a.number} status`}>
            <option value="todo">TODO</option>
            <option value="doing">IN PROGRESS</option>
            <option value="submitted">SUBMITTED</option>
          </select>
          <input className="input" type="datetime-local" name={`due${a.number}`} defaultValue={a.dueAt ? toLocalInput(a.dueAt) : ''} aria-label={`A${a.number} due date`} />
          <input className="input" name={`note${a.number}`} maxLength={200} defaultValue={a.note} placeholder="Note (topic, where to submit…)" aria-label={`A${a.number} note`} />
        </fieldset>
      ))}
      <button className="btn" disabled={update.isPending}>
        SAVE
      </button>
    </form>
  );
}
