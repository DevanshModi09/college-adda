import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { AttendanceStatus, SubjectAttendance } from '@adda/shared';
import { useAttendance, useAttendanceDay, useMarkAllPresent, useMarkAttendance, useSaveAttendanceSettings, useSaveBaseline } from '../../hooks/queries';
import { useNow } from '../../hooks/useNow';
import { canBunk, forecastIfAllAttended, localDate, mustAttend, pct, prettyDate, shiftDate } from '../../lib/attendance';
import { ApiError } from '../../lib/api';
import { toast } from '../../stores/toasts';
import { Bar, Empty, Loading, Modal, PageHead, Panel } from '../../components/ui';
import './attendance.css';

const STATUS: { id: AttendanceStatus; label: string; short: string }[] = [
  { id: 'present', label: 'Present', short: 'P' },
  { id: 'absent', label: 'Absent', short: 'A' },
  { id: 'cancelled', label: 'Cancelled', short: 'X' },
];

export function AttendancePage() {
  const today = localDate(useNow(60_000));
  const [params, setParams] = useSearchParams();
  const date = params.get('date') && params.get('date')! <= today ? params.get('date')! : today;
  const setDate = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true });

  const { data: overview, isPending } = useAttendance(today);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const target = overview?.target ?? 75;
  const totals = (overview?.subjects ?? []).reduce((a, s) => ({ attended: a.attended + s.attended, held: a.held + s.held }), { attended: 0, held: 0 });
  const overall = pct(totals.attended, totals.held);
  const atRisk = (overview?.subjects ?? []).filter((s) => s.held && (pct(s.attended, s.held) ?? 100) < target).length;

  return (
    <>
      <PageHead title="ATTENDANCE" sub="Tap once per class. Adda does the 75% math so you know exactly what you can bunk.">
        <div className="row">
          <Link to="/attendance/setup" className="btn btn--ghost">
            ERP SETUP
          </Link>
          <button type="button" className="btn btn--ghost" onClick={() => setSettingsOpen(true)}>
            SETTINGS
          </button>
        </div>
      </PageHead>

      {overview && !overview.setupDone && (
        <div className="panel panel--pink att-setup-banner">
          <div className="grow">
            <p className="panel__title">FIRST TIME HERE?</p>
            <p className="muted">Bring over what the ERP shows today (2 minutes), then just tap P / A each day.</p>
          </div>
          <Link to="/attendance/setup" className="btn">
            SET UP NOW
          </Link>
        </div>
      )}

      <div className="att-top">
        <Panel title="OVERALL" tone={overall !== null && overall < target ? 'pink' : 'cyan'}>
          <p className={`att-big ${overall !== null && overall < target ? 'c-pink' : 'c-green'}`}>{overall === null ? '--' : `${overall.toFixed(1)}%`}</p>
          <p className="muted">
            {totals.attended}/{totals.held} CLASSES · TARGET {target}%
          </p>
          <p className={atRisk ? 'c-pink' : 'c-green'}>{atRisk ? `${atRisk} SUBJECT${atRisk > 1 ? 'S' : ''} BELOW ${target}%` : 'ALL SUBJECTS SAFE'}</p>
        </Panel>
        <DayMarker date={date} today={today} setDate={setDate} unmarked={overview?.unmarkedDays ?? []} />
      </div>

      {isPending ? (
        <Loading />
      ) : overview?.subjects.length ? (
        <div className="att-grid">
          {overview.subjects.map((s) => (
            <SubjectCard key={s.subject} s={s} target={target} />
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty title="NO SUBJECTS">Your section has no timetable yet. Set your section on your profile.</Empty>
        </div>
      )}

      <Modal open={settingsOpen} title="ATTENDANCE SETTINGS" onClose={() => setSettingsOpen(false)}>
        {overview && <SettingsForm target={overview.target} semEnd={overview.semEnd} onDone={() => setSettingsOpen(false)} />}
      </Modal>
    </>
  );
}

function DayMarker({ date, today, setDate, unmarked }: { date: string; today: string; setDate: (d: string) => void; unmarked: string[] }) {
  const { data: classes, isPending } = useAttendanceDay(date);
  const mark = useMarkAttendance();
  const allPresent = useMarkAllPresent();
  const hasUnmarked = classes?.some((c) => !c.status);
  const behind = unmarked.filter((d) => d !== today);

  return (
    <Panel
      title="MARK A DAY"
      className="att-day"
      action={
        <div className="row att-nav">
          <button type="button" className="icon-btn" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">
            ◀
          </button>
          <span className="px-xs">{date === today ? 'TODAY' : prettyDate(date)}</span>
          <button type="button" className="icon-btn" onClick={() => setDate(shiftDate(date, 1))} disabled={date >= today} aria-label="Next day">
            ▶
          </button>
        </div>
      }
    >
      {isPending ? (
        <Loading />
      ) : classes?.length ? (
        <>
          <ul className="att-classes">
            {classes.map((c) => (
              <li key={c.slotId} className={c.status ? `att-class att-class--${c.status}` : 'att-class'}>
                <div className="grow">
                  <p className="upper truncate">{c.subject}</p>
                  <p className="dim">
                    {c.start}–{c.end}
                    {c.room && ` · ${c.room}`}
                  </p>
                </div>
                <div className="att-toggle" role="group" aria-label={`${c.subject} attendance`}>
                  {STATUS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`att-btn att-btn--${s.id}`}
                      aria-pressed={c.status === s.id}
                      title={s.label}
                      aria-label={s.label}
                      onClick={() => mark.mutate({ date, today, slotId: c.slotId, status: c.status === s.id ? null : s.id })}
                    >
                      {s.short}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {hasUnmarked && (
            <button type="button" className="btn btn--block att-all" disabled={allPresent.isPending} onClick={() => allPresent.mutate({ date, today }, { onSuccess: () => toast('MARKED PRESENT. NICE STREAK.', { kind: 'good' }) })}>
              MARK REST PRESENT
            </button>
          )}
        </>
      ) : (
        <p className="muted att-free">NO CLASSES THIS DAY.</p>
      )}
      {behind.length > 0 && (
        <div className="att-behind">
          <span className="px-xs c-pink">UNMARKED</span>
          {behind.slice(0, 6).map((d) => (
            <button key={d} type="button" className="chip" onClick={() => setDate(d)}>
              {prettyDate(d)}
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

function SubjectCard({ s, target }: { s: SubjectAttendance; target: number }) {
  const [editing, setEditing] = useState(false);
  const p = pct(s.attended, s.held);
  const safe = p === null || p >= target;
  const bunk = canBunk(s.attended, s.held, target);
  const need = mustAttend(s.attended, s.held, target);
  const forecast = s.remaining !== null && s.remaining > 0 ? forecastIfAllAttended(s.attended, s.held, s.remaining) : null;

  return (
    <article className={`panel att-card ${safe ? '' : 'panel--pink'}`}>
      <div className="spread">
        <span className="tag">{s.kind.toUpperCase()}</span>
        <button type="button" className="icon-btn" onClick={() => setEditing(true)} title="Set counts from ERP" aria-label={`Set ${s.subject} counts from ERP`}>
          ERP
        </button>
      </div>
      <h2 className="att-card__name upper">{s.subject}</h2>
      <p className={`att-card__pct ${p === null ? 'dim' : safe ? 'c-green' : 'c-pink'}`}>{p === null ? '--' : `${p.toFixed(1)}%`}</p>
      <div className="att-bar">
        <Bar thin value={(p ?? 0) / 100} color={safe ? 'var(--green)' : 'var(--pink)'} label={`${s.subject} attendance`} />
        <span className="att-bar__target" style={{ left: `${target}%` }} aria-hidden="true" />
      </div>
      <p className="muted">
        {s.attended}/{s.held} ATTENDED
      </p>
      <p className={`att-verdict ${safe ? 'c-green' : 'c-pink'}`}>
        {s.held === 0 ? 'NO CLASSES MARKED YET' : safe ? (bunk ? `CAN BUNK ${bunk} MORE` : 'ON THE EDGE. DON’T BUNK') : `ATTEND NEXT ${need} TO HIT ${target}%`}
      </p>
      {forecast !== null && (
        <p className="dim">
          {s.remaining} LEFT THIS SEM · MAX POSSIBLE {forecast.toFixed(1)}%
        </p>
      )}
      <Modal open={editing} title={`ERP COUNTS · ${s.subject.toUpperCase()}`} onClose={() => setEditing(false)}>
        <BaselineForm s={s} onDone={() => setEditing(false)} />
      </Modal>
    </article>
  );
}

function BaselineForm({ s, onDone }: { s: SubjectAttendance; onDone: () => void }) {
  const save = useSaveBaseline();
  const [error, setError] = useState('');
  const marked = { attended: s.attended - s.baseline.attended, held: s.held - s.baseline.held };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await save.mutateAsync({ subject: s.subject, attended: Number(f.get('attended')), held: Number(f.get('held')) });
      toast('ERP COUNTS SAVED', { kind: 'good' });
      onDone();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <p className="muted">
        Copy what the ERP shows <b>before</b> you started marking here. Adda adds your marks on top ({marked.attended}/{marked.held} so far).
      </p>
      <div className="form-grid form-grid--2">
        <label className="field">
          <span className="field__label">ATTENDED</span>
          <input className="input" name="attended" type="number" min={0} max={1000} required defaultValue={s.baseline.attended} />
        </label>
        <label className="field">
          <span className="field__label">HELD</span>
          <input className="input" name="held" type="number" min={0} max={1000} required defaultValue={s.baseline.held} />
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <button className="btn" disabled={save.isPending}>
        SAVE
      </button>
    </form>
  );
}

function SettingsForm({ target, semEnd, onDone }: { target: number; semEnd: string | null; onDone: () => void }) {
  const save = useSaveAttendanceSettings();
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save.mutate({ target: Number(f.get('target')), semEnd: String(f.get('semEnd') || '') || null }, { onSuccess: onDone });
      }}
    >
      <label className="field">
        <span className="field__label">TARGET %</span>
        <select className="select" name="target" defaultValue={target}>
          {[60, 65, 70, 75, 80, 85, 90].map((t) => (
            <option key={t} value={t}>
              {t}%
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">LAST TEACHING DAY (FOR THE FORECAST)</span>
        <input className="input" name="semEnd" type="date" defaultValue={semEnd ?? ''} />
      </label>
      <button className="btn" disabled={save.isPending}>
        SAVE
      </button>
    </form>
  );
}
