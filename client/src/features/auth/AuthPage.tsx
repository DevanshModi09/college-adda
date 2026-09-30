import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type { PublicUser } from '@adda/shared';
import { api, ApiError } from '../../lib/api';
import { Field } from '../../components/ui';
import { SectionFields } from '../../components/SectionFields';
import './auth.css';

type Mode = 'login' | 'register';

export function AuthPage({ onAuthed }: { onAuthed: (u: PublicUser) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    setError(null);
    try {
      const user =
        mode === 'login'
          ? await api.auth.login(f.username!, f.password!)
          : await api.auth.register({
              username: f.username!,
              password: f.password!,
              name: f.name!,
              branch: f.branch!,
              year: Number(f.year),
              section: f.section!,
              bio: f.bio ?? '',
              interests: f.interests ?? '',
            });
      if (mode === 'register') navigate('/attendance/setup?welcome=1', { replace: true });
      onAuthed(user);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  }

  async function playAsGuest() {
    setBusy(true);
    setError(null);
    try {
      const user = await api.auth.guest();
      navigate('/', { replace: true });
      onAuthed(user);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  }

  const fieldErr = (k: string) => error?.details[k];

  return (
    <div className="auth">
      <section className="auth__intro">
        <p className="auth__logo">
          <span className="logo-top">COLLEGE</span>
          ADDA
        </p>
        <p className="px-sm c-cyan">JECRC · JAIPUR</p>
        <h1 className="auth__title">Your whole campus on one screen.</h1>
        <ul className="auth__list">
          <li><span className="c-pink">BOSS FIGHTS</span> Deadlines with live countdowns. 11:59 PM won't sneak up again.</li>
          <li><span className="c-yellow">NEXT LEVEL</span> Your timetable tells you what's next, and in which room.</li>
          <li><span className="c-cyan">PLAYERS ONLINE</span> Code desks: sit with others, share a focus timer, chat.</li>
          <li><span className="c-green">PARTY UP</span> Find JECRC people by branch, year and interests. DM them.</li>
          <li><span className="c-pink">QUESTS</span> Study groups, hackathon teams, club meets. RSVP in one tap.</li>
        </ul>
      </section>

      <section className="panel panel--pink auth__card">
        <div className="tabs" role="group" aria-label="Log in or sign up">
          <button type="button" className="tab" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setError(null); }}>
            CONTINUE
          </button>
          <button type="button" className="tab" aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setError(null); }}>
            NEW PLAYER
          </button>
        </div>

        <form className="form-grid" onSubmit={submit} key={mode}>
          {mode === 'register' && (
            <Field label="FULL NAME" error={fieldErr('name')}>
              <input className="input" name="name" required maxLength={60} autoComplete="name" />
            </Field>
          )}
          <div className={mode === 'register' ? 'form-grid form-grid--2' : 'form-grid'}>
            <Field label="USERNAME" error={fieldErr('username')}>
              <input className="input" name="username" required autoComplete="username" autoCapitalize="off" spellCheck={false} />
            </Field>
            <Field label="PASSWORD" error={fieldErr('password')}>
              <input
                className="input"
                name="password"
                type="password"
                required
                minLength={mode === 'register' ? 8 : undefined}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </Field>
          </div>
          {mode === 'register' && (
            <>
              <SectionFields error={fieldErr('section')} />
              <Field label="INTERESTS (COMMA SEPARATED)">
                <input className="input" name="interests" placeholder="DSA, React, ML, Robotics" />
              </Field>
              <Field label="ONE-LINE BIO">
                <input className="input" name="bio" maxLength={200} placeholder="Looking for a hackathon team" />
              </Field>
            </>
          )}
          {error && !Object.keys(error.details).length && <p className="form-error" role="alert">{error.message}</p>}
          <button className="btn btn--block" disabled={busy}>
            {busy ? 'LOADING...' : mode === 'login' ? 'PRESS START' : 'CREATE PLAYER'}
          </button>
        </form>

        <div className="auth__guest">
          <span className="auth__or px-sm">OR</span>
          <button type="button" className="btn btn--ghost btn--block" onClick={playAsGuest} disabled={busy}>
            ▶ TRY AS GUEST
          </button>
          <p className="muted">No sign-up. You get a demo player in CSE II-B for 24 hours.</p>
        </div>
      </section>
    </div>
  );
}
