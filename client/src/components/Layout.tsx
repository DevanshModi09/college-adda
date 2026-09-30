import { NavLink, Link, Outlet } from 'react-router';
import type { PublicUser } from '@adda/shared';
import { useConversations, useDeadlines, useFriends } from '../hooks/queries';
import { useDeadlineNudges } from '../hooks/useDeadlineNudges';
import { levelOf } from '../lib/progress';
import { useLive } from '../stores/live';
import { Toaster } from './Toaster';
import { GameModal } from './GameModal';

const LINKS = [
  { to: '/', label: 'HOME', end: true },
  { to: '/feed', label: 'FEED' },
  { to: '/campus', label: 'CAMPUS' },
  { to: '/deadlines', label: 'DEADLINES' },
  { to: '/assignments', label: 'ASSIGNMENTS' },
  { to: '/timetable', label: 'TIMETABLE' },
  { to: '/notices', label: 'NOTICES' },
  { to: '/attendance', label: 'ATTENDANCE' },
  { to: '/desks', label: 'CODE DESK' },
  { to: '/people', label: 'PEOPLE' },
  { to: '/chat', label: 'CHATS' },
  { to: '/events', label: 'EVENTS' },
];

export function Layout({ user, onLogout }: { user: PublicUser; onLogout: () => void }) {
  const connected = useLive((s) => s.connected);
  const { data: deadlines } = useDeadlines();
  const { data: convos } = useConversations();
  const unread = convos?.reduce((n, c) => n + c.unread, 0) ?? 0;
  const requests = useFriends().data?.incoming.length ?? 0;
  useDeadlineNudges();

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="topbar__logo" aria-label="College Adda home">
          <span className="logo-top">COLLEGE</span>
          ADDA
        </Link>
        <nav className="nav" aria-label="Main">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              {l.label}
              {l.to === '/people' && requests > 0 && (
                <span className="nav__badge" aria-label={`${requests} friend requests`}>
                  {requests}
                </span>
              )}
              {l.to === '/chat' && unread > 0 && (
                <span className="nav__badge" aria-label={`${unread} unread`}>
                  {unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="topbar__player">
          <Link to="/profile" title="Edit profile">
            P1 {user.name.split(' ')[0]?.toUpperCase()} · {user.section ? `SEC ${user.section}` : ''} · LV {levelOf(deadlines)}
            {user.role === 'admin' && <span className="c-yellow"> · ADMIN</span>}
          </Link>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onLogout}>
            Quit
          </button>
        </div>
      </header>
      {user.guest && (
        <div className="guest-bar" role="status">
          YOU'RE PLAYING AS A GUEST · EVERYTHING RESETS IN 24H ·{' '}
          <button type="button" className="guest-bar__cta" onClick={onLogout}>
            MAKE A REAL ACCOUNT
          </button>
        </div>
      )}
      {!connected && (
        <div className="offline-bar" role="status">
          RECONNECTING TO LIVE SERVER<span className="blink">...</span>
        </div>
      )}
      <main className="main">
        <Outlet />
      </main>
      <Toaster />
      <GameModal me={user} />
    </div>
  );
}
