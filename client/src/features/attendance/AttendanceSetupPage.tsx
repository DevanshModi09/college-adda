import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { PublicUser } from '@adda/shared';
import { useAttendance, useAttendanceSetup } from '../../hooks/queries';
import { canBunk, localDate, mustAttend, pct } from '../../lib/attendance';
import { sectionKeyOf, sectionLabel } from '../../lib/constants';
import { ApiError } from '../../lib/api';
import { toast } from '../../stores/toasts';
import { Empty, Loading, PageHead } from '../../components/ui';
import './attendance.css';

type Row = { attended: string; held: string };

/**
 * First-run: copy each subject's ERP numbers once. After this the student only taps P/A daily.
 * Also reachable later ("ERP SETUP") to re-sync with the ERP.
 */
export function AttendanceSetupPage({ me }: { me: PublicUser }) {
  const [params] = useSearchParams();
  const welcome = params.get('welcome') === '1';
  const navigate = useNavigate();
  const { data: overview, isPending } = useAttendance(localDate());
  const setup = useAttendanceSetup();
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [target, setTarget] = useState(75);
  const [semEnd, setSemEnd] = useState('');
  const [error, setError] = useState('');

  // Prefill from any existing baselines / settings once loaded.
  useEffect(() => {
    if (!overview) return;
    setTarget(overview.target);
    setSemEnd(overview.semEnd ?? '');
    setRows(
      Object.fromEntries(
        overview.subjects.map((s) => [s.subject, { attended: s.baseline.held ? String(s.baseline.attended) : '', held: s.baseline.held ? String(s.baseline.held) : '' }])
      )
    );
  }, [overview]);

  const finish = (skip: boolean) => {
    const baselines = skip
      ? []
      : Object.entries(rows)
          .filter(([, r]) => r.held !== '' || r.attended !== '')
          .map(([subject, r]) => ({ subject, attended: Number(r.attended || 0), held: Number(r.held || 0) }));
    const invalid = baselines.find((b) => b.attended > b.held);
    if (invalid) return setError(`${invalid.subject}: attended can’t be more than held.`);
    setError('');
    setup.mutate(
      { target, semEnd: semEnd || null, baselines },
      {
        onSuccess: () => {
          toast(skip ? 'STARTING FROM ZERO. TAP P / A DAILY.' : 'ATTENDANCE IMPORTED. YOU’RE ALL SET.', { kind: 'good' });
          navigate(welcome ? '/' : '/attendance', { replace: true });
        },
        onError: (err) => setError((err as ApiError).message),
      }
    );
  };

  const set = (subject: string, key: keyof Row, value: string) => setRows((r) => ({ ...r, [subject]: { ...r[subject]!, [key]: value.replace(/\D/g, '').slice(0, 3) } }));

  return (
    <>
      <PageHead
        title={welcome ? `WELCOME, ${me.name.split(' ')[0]!.toUpperCase()}` : 'ERP SETUP'}
        sub={
          welcome
            ? 'One last step: bring your attendance over from the ERP. After this you just tap P / A each day.'
            : 'Re-sync with the ERP any time. These are the counts BEFORE your daily marks in Adda.'
        }
      />

      <div className="setup-steps">
        <p>
          <span className="c-yellow px-xs">1</span> Open the JECRC ERP → Attendance.
        </p>
        <p>
          <span className="c-yellow px-xs">2</span> For each subject, copy <b>attended</b> and <b>held</b> (e.g. 18 of 22).
        </p>
        <p>
          <span className="c-yellow px-xs">3</span> Leave a subject blank if it hasn’t started. New student? Start from zero.
        </p>
      </div>

      {isPending ? (
        <Loading />
      ) : !overview?.subjects.length ? (
        <div className="panel">
          <Empty title="NO TIMETABLE FOR YOUR SECTION">
            {me.branch ? sectionLabel(sectionKeyOf(me)) : 'Your section'} has no timetable yet. <Link to="/profile">Check your section</Link>
          </Empty>
        </div>
      ) : (
        <div className="panel setup">
          <div className="setup__head px-xs muted" aria-hidden="true">
            <span>SUBJECT</span>
            <span>ATTENDED</span>
            <span>HELD</span>
            <span>NOW</span>
          </div>
          {overview.subjects.map((s) => {
            const r = rows[s.subject] ?? { attended: '', held: '' };
            const a = Number(r.attended || 0);
            const h = Number(r.held || 0);
            const bad = a > h;
            const p = pct(a, h);
            const verdict = !h ? '' : bad ? 'CHECK NUMBERS' : p! >= target ? `CAN BUNK ${canBunk(a, h, target)}` : `NEED ${mustAttend(a, h, target)}`;
            return (
              <div key={s.subject} className={`setup__row ${bad ? 'setup__row--bad' : ''}`}>
                <div className="setup__subject">
                  <span className="upper">{s.subject}</span> <span className="tag">{s.kind.toUpperCase()}</span>
                </div>
                <input
                  className="input"
                  inputMode="numeric"
                  value={r.attended}
                  onChange={(e) => set(s.subject, 'attended', e.target.value)}
                  placeholder="0"
                  aria-label={`${s.subject} classes attended`}
                />
                <input
                  className="input"
                  inputMode="numeric"
                  value={r.held}
                  onChange={(e) => set(s.subject, 'held', e.target.value)}
                  placeholder="0"
                  aria-label={`${s.subject} classes held`}
                />
                <div className="setup__now">
                  <span className={p === null ? 'dim' : bad ? 'c-pink' : p >= target ? 'c-green' : 'c-pink'}>{p === null ? '--' : `${p.toFixed(0)}%`}</span>
                  <span className="px-xs dim">{verdict}</span>
                </div>
              </div>
            );
          })}

          <div className="form-grid form-grid--2 setup__settings">
            <label className="field">
              <span className="field__label">TARGET</span>
              <select className="select" value={target} onChange={(e) => setTarget(Number(e.target.value))}>
                {[60, 65, 70, 75, 80, 85, 90].map((t) => (
                  <option key={t} value={t}>
                    {t}%
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">LAST TEACHING DAY (OPTIONAL, FOR THE FORECAST)</span>
              <input className="input" type="date" value={semEnd} onChange={(e) => setSemEnd(e.target.value)} />
            </label>
          </div>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="row setup__actions">
            <button type="button" className="btn" disabled={setup.isPending} onClick={() => finish(false)}>
              SAVE & START TRACKING
            </button>
            <button type="button" className="btn btn--ghost" disabled={setup.isPending} onClick={() => finish(true)}>
              I’M NEW, START FROM ZERO
            </button>
          </div>
        </div>
      )}
    </>
  );
}
