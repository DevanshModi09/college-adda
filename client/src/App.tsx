import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router';
import type { PublicUser } from '@adda/shared';
import { useMe } from './hooks/queries';
import { api } from './lib/api';
import { keys, queryClient } from './lib/queryClient';
import { realtime } from './lib/realtime';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { AuthPage } from './features/auth/AuthPage';
import { HomePage } from './features/home/HomePage';
import { DeadlinesPage } from './features/deadlines/DeadlinesPage';
import { TimetablePage } from './features/timetable/TimetablePage';
import { RoomsPage } from './features/rooms/RoomsPage';
import { RoomPage } from './features/rooms/RoomPage';
import { PeoplePage } from './features/people/PeoplePage';
import { ChatPage } from './features/chat/ChatPage';
import { EventsPage } from './features/events/EventsPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { CampusPage } from './features/campus/CampusPage';
import { AttendancePage } from './features/attendance/AttendancePage';
import { AttendanceSetupPage } from './features/attendance/AttendanceSetupPage';
import { AssignmentsPage } from './features/assignments/AssignmentsPage';
import { FeedPage } from './features/feed/FeedPage';

function LegacyRoomRedirect() {
  const { roomId } = useParams();
  return <Navigate to={`/desks/${roomId}`} replace />;
}

export function App() {
  const { data: user, isPending } = useMe();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    realtime.connect(user.id);
    return () => realtime.disconnect();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPending) return <Loading label="INSERT COIN" />;
  if (!user) {
    // Logging in always lands on home, whatever page you were on when you left.
    const onAuthed = (u: PublicUser) => {
      navigate('/', { replace: true });
      queryClient.setQueryData(keys.me, u);
    };
    return <AuthPage onAuthed={onAuthed} />;
  }

  const logout = async () => {
    await api.auth.logout().catch(() => {});
    realtime.disconnect();
    queryClient.clear();
    queryClient.setQueryData(keys.me, null);
    navigate('/', { replace: true });
  };

  return (
    <Routes>
      <Route element={<Layout user={user} onLogout={logout} />}>
        <Route index element={<HomePage user={user} />} />
        <Route path="feed" element={<FeedPage me={user} />} />
        <Route path="campus" element={<CampusPage me={user} />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="deadlines" element={<DeadlinesPage me={user} />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="attendance/setup" element={<AttendanceSetupPage me={user} />} />
        <Route path="timetable" element={<TimetablePage me={user} />} />
        <Route path="desks" element={<RoomsPage />} />
        <Route path="desks/:roomId" element={<RoomPage me={user} />} />
        {/* old links */}
        <Route path="rooms" element={<Navigate to="/desks" replace />} />
        <Route path="rooms/:roomId" element={<LegacyRoomRedirect />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="chat" element={<ChatPage me={user} />} />
        <Route path="chat/:userId" element={<ChatPage me={user} />} />
        <Route path="events" element={<EventsPage me={user} />} />
        <Route path="profile" element={<ProfilePage user={user} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
