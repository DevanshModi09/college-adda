import { NavLink, Link, Outlet, useLocation } from 'react-router';
import type { PublicUser } from '@adda/shared';
import { useConversations, useDeadlines, useFriends } from '../hooks/queries';
import { useDeadlineNudges } from '../hooks/useDeadlineNudges';
import { levelOf } from '../lib/progress';
import { useLive } from '../stores/live';
import { Toaster } from './Toaster';
import { GameModal } from './GameModal';

const LINKS = [
  { to: '/campus', label: 'CAMPUS' },
  { to: '/feed', label: 'FEED' },
  { to: '/events', label: 'EVENTS' },
  { to: '/people', label: 'PEOPLE' },
  { to: '/deadlines', label: 'DEADLINES' },
  { to: '/assignments', label: 'ASSIGNMENTS' },
  { to: '/timetable', label: 'TIMETABLE' },
  { to: '/attendance', label: 'ATTENDANCE' },
  { to: '/desks', label: 'CODE DESK' },
];

export function Layout({ user, onLogout }: { user: PublicUser; onLogout: () => void }) {
  const connected = useLive((s) => s.connected);
  const { data: deadlines } = useDeadlines();
  const { data: convos } = useConversations();
  const unread = convos?.reduce((n, c) => n + c.unread, 0) ?? 0;
  const requests = useFriends().data?.incoming.length ?? 0;
  const onChat = useLocation().pathname.startsWith('/chat');
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
            <NavLink key={l.to} to={l.to} className={l.to === '/campus' ? 'nav__glow' : undefined}>
              {l.label}
              {l.to === '/people' && requests > 0 && (
                <span className="nav__badge" aria-label={`${requests} friend requests`}>
                  {requests}
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
      {!onChat && <ChatButton unread={unread} />}
      <Toaster />
      <GameModal me={user} />
    </div>
  );
}

/** Floating chat button, bottom right: opens the chats page and shows the unread count. */
function ChatButton({ unread }: { unread: number }) {
  return (
    <Link to="/chat" className="chat-fab" aria-label={unread ? `Chats, ${unread} unread` : 'Chats'} title="Chats">
      <svg viewBox="0 0 16 16" width="28" height="28" shapeRendering="crispEdges" aria-hidden="true">
        <path fill="currentColor" d="M2 2h12v1h1v8h-1v1H7l-3 3v-3H2v-1H1V3h1z" />
        <path fill="var(--cyan)" d="M4 6h2v2H4zM7 6h2v2H7zM10 6h2v2h-2z" />
      </svg>
      {unread > 0 && <span className="chat-fab__badge">{unread > 99 ? '99+' : unread}</span>}
    </Link>
  );
}
