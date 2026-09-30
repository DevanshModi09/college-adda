import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const keys = {
  me: ['me'] as const,
  deadlines: ['deadlines'] as const,
  timetable: (sectionKey: string) => ['timetable', sectionKey] as const,
  sections: ['sections'] as const,
  freeRooms: (day: number, time: string) => ['free-rooms', day, time] as const,
  people: (q: object) => ['people', q] as const,
  person: (id: string) => ['person', id] as const,
  conversations: ['conversations'] as const,
  friends: ['friends'] as const,
  attendance: ['attendance'] as const,
  assignments: ['assignments'] as const,
  attendanceDay: (date: string) => ['attendance', 'day', date] as const,
  thread: (id: string) => ['thread', id] as const,
  rooms: ['rooms'] as const,
  events: ['events'] as const,
  notices: (sectionKey: string) => ['notices', sectionKey] as const,
};

// A 401 anywhere means the session is gone (expired, logged out in another tab):
// drop the cached user so the app falls back to the login screen.
function onAuthError(err: unknown) {
  if (err instanceof ApiError && err.status === 401 && queryClient.getQueryData(keys.me)) {
    queryClient.setQueryData(keys.me, null);
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});
