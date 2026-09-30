import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import type { ClassKind, ClassSlot, PublicUser, Section } from '@adda/shared';
import { useCreateClasses, useDeleteClass, useSections, useTimetable } from '../../hooks/queries';
import { useNow } from '../../hooks/useNow';
import { sectionKeyOf, sectionLabel } from '../../lib/constants';
import { countdown, DAYS, nowNext, whenLabel, WEEKDAYS } from '../../lib/time';
import { ApiError } from '../../lib/api';
import { toast } from '../../stores/toasts';
import { Field, Loading, Modal, PageHead, Panel } from '../../components/ui';
import './timetable.css';

export function TimetablePage({ me }: { me: PublicUser }) {
  const mine = sectionKeyOf(me);
  const [params, setParams] = useSearchParams();
  const sectionKey = params.get('section') || mine;
  const isMine = sectionKey === mine;
  const isAdmin = me.role === 'admin';
  const canAdd = isMine || isAdmin;

  const now = useNow();
  const { data: sections } = useSections();
  const { data, isPending, isPlaceholderData } = useTimetable(sectionKey);
  const remove = useDeleteClass(sectionKey);
  const [adding, setAdding] = useState(false);

  const classes = data ?? [];
  const today = new Date(now).getDay();
  const { current, next } = nowNext(classes, new Date(now));
  const current_section = sections?.find((s) => s.key === sectionKey);

  const pick = (key: string) => setParams(key === mine ? {} : { section: key }, { replace: true });
  const canDelete = (c: ClassSlot) => isAdmin || (!c.official && isMine);

  return (
    <>
      <PageHead title="TIMETABLE" sub="Official JECRC timetable for every section. Pick any section to peek at theirs.">
        {canAdd && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            + ADD CLASS
          </button>
        )}
      </PageHead>

      <div className="tt-picker">
        <label className="field tt-picker__field">
          <span className="field__label">SECTION</span>
          <SectionSelect sections={sections ?? []} value={sectionKey} mine={mine} onChange={pick} />
        </label>
        {!isMine && (
          <button type="button" className="btn btn--ghost" onClick={() => pick(mine)}>
            ◀ BACK TO MINE
          </button>
        )}
        <p className="muted tt-picker__note">
          {isMine ? 'YOUR SECTION' : 'VIEWING ANOTHER SECTION'}
          {current_section?.label && ` · ${current_section.label.toUpperCase()}`}
          {!canAdd && ' · READ ONLY'}
        </p>
      </div>

      <Panel className="tt-now" tone="cyan">
        <div>
          <p className="panel__title">NOW</p>
          {current ? (
            <p className="tt-now__text">
              <span className="upper">{current.subject}</span> · {current.room || 'NO ROOM'} · ENDS IN{' '}
              <span className="c-cyan">{countdown(current.endsAt - now)}</span>
            </p>
          ) : (
            <p className="tt-now__text muted">FREE PERIOD</p>
          )}
        </div>
        <div>
          <p className="panel__title">NEXT</p>
          {next ? (
            <p className="tt-now__text">
              <span className="upper">{next.subject}</span> · {next.room || 'NO ROOM'} · <span className="c-cyan">{whenLabel(next, now)}</span>
            </p>
          ) : (
            <p className="tt-now__text muted">NOTHING SCHEDULED</p>
          )}
        </div>
      </Panel>

      {isPending ? (
        <Loading />
      ) : (
        <div className={`week ${isPlaceholderData ? 'week--stale' : ''}`}>
          {WEEKDAYS.map((day) => {
            const list = classes.filter((c) => c.day === day).sort((a, b) => a.start.localeCompare(b.start));
            return (
              <section key={day} className={`week__day ${day === today ? 'week__day--today' : ''}`} aria-label={DAYS[day]}>
                <h2 className="px-sm">
                  {DAYS[day]}
                  {day === today && <span className="c-yellow"> ◀</span>}
                </h2>
                {list.length ? (
                  list.map((c) => (
                    <ClassBlock key={c.id} c={c} live={current?.id === c.id} onDelete={canDelete(c) ? () => remove.mutate(c.id) : undefined} />
                  ))
                ) : (
                  <p className="dim">FREE</p>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Modal open={adding} title={`ADD CLASS · ${sectionLabel(sectionKey)}`} onClose={() => setAdding(false)}>
        <AddClassForm sectionKey={sectionKey} forOtherSection={!isMine} onDone={() => setAdding(false)} />
      </Modal>
    </>
  );
}

/** One dropdown for every section, grouped by branch + year, with the viewer's own first. */
export function SectionSelect({ sections, value, mine, onChange }: { sections: Section[]; value: string; mine: string; onChange: (key: string) => void }) {
  const groups = new Map<string, Section[]>();
  for (const s of sections) {
    const g = `${s.branch} · YEAR ${s.year}`;
    groups.set(g, [...(groups.get(g) ?? []), s]);
  }
  const label = (s: Section) => `${s.section}${s.label ? ` — ${s.label}` : ''}${s.key === mine ? '  (YOU)' : ''}`;
  const known = sections.some((s) => s.key === value);

  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Choose section timetable">
      {!known && <option value={value}>{sectionLabel(value)}</option>}
      {[...groups].map(([g, list]) => (
        <optgroup key={g} label={g}>
          {list.map((s) => (
            <option key={s.key} value={s.key}>
              {label(s)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function ClassBlock({ c, live, onDelete }: { c: ClassSlot; live: boolean; onDelete?: () => void }) {
  return (
    <article className={`class class--${c.kind.toLowerCase()} ${live ? 'class--live' : ''} ${c.official ? '' : 'class--extra'}`}>
      <div className="spread">
        <span className="c-cyan">
          {c.start}–{c.end}
        </span>
        {onDelete && (
          <button type="button" className="icon-btn" onClick={onDelete} aria-label={`Remove ${c.subject} on ${DAYS[c.day]}`}>
            X
          </button>
        )}
      </div>
      <p className="class__subject upper">{c.subject}</p>
      <p className="muted">
        {c.kind.toUpperCase()}
        {c.room && ` · ${c.room}`}
        {!c.official && ' · ADDED'}
      </p>
      {c.teacher && <p className="dim">{c.teacher}</p>}
    </article>
  );
}

function AddClassForm({ sectionKey, forOtherSection, onDone }: { sectionKey: string; forOtherSection: boolean; onDone: () => void }) {
  const create = useCreateClasses(sectionKey);
  const [error, setError] = useState<ApiError | null>(null);
  const today = new Date().getDay();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const days = f.repeat ? [1, 2, 3, 4, 5] : [Number(f.day)];
    setError(null);
    try {
      await create.mutateAsync(
        days.map((day) => ({
          day,
          subject: f.subject!,
          start: f.start!,
          end: f.end!,
          kind: f.kind as ClassKind,
          room: f.room ?? '',
          teacher: f.teacher ?? '',
          ...(forOtherSection && { section: sectionKey }),
        }))
      );
      toast(`${f.subject!.toUpperCase()} ADDED${days.length > 1 ? ' MON–FRI' : ''}`, { kind: 'good' });
      onDone();
    } catch (err) {
      setError(err as ApiError);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <p className="muted">Extra classes (remedials, guest lectures) show for the whole section. The official timetable stays as is.</p>
      <Field label="SUBJECT" error={error?.details.subject}>
        <input className="input" name="subject" required maxLength={60} placeholder="DSA remedial" />
      </Field>
      <div className="form-grid form-grid--3">
        <Field label="DAY">
          <select className="select" name="day" defaultValue={today === 0 ? 1 : today}>
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>
                {DAYS[d]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="START">
          <input className="input" name="start" type="time" required defaultValue="14:00" />
        </Field>
        <Field label="END" error={error?.details.end}>
          <input className="input" name="end" type="time" required defaultValue="15:00" />
        </Field>
      </div>
      <div className="form-grid form-grid--3">
        <Field label="TYPE">
          <select className="select" name="kind" defaultValue="Lecture">
            <option>Lecture</option>
            <option>Lab</option>
            <option>Tutorial</option>
          </select>
        </Field>
        <Field label="ROOM">
          <input className="input" name="room" maxLength={40} placeholder="VIB 016" />
        </Field>
        <Field label="FACULTY">
          <input className="input" name="teacher" maxLength={60} placeholder="optional" />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" name="repeat" /> Repeat every weekday (Mon–Fri)
      </label>
      {error && !Object.keys(error.details).length && <p className="form-error">{error.message}</p>}
      <button className="btn" disabled={create.isPending}>
        SAVE CLASS
      </button>
    </form>
  );
}
