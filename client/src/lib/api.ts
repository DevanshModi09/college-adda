import type {
  Assignment,
  AssignmentStatus,
  SubjectAssignments,
  AttendanceClass,
  AttendanceOverview,
  AttendanceStatus,
  CampusEvent,
  ClassSlot,
  Conversation,
  Deadline,
  LostFoundPin,
  DirectMessage,
  FreeRooms,
  FriendStatus,
  FriendsOverview,
  Notice,
  Post,
  Person,
  Priority,
  PublicUser,
  Room,
  RoomWithMembers,
  Section,
} from '@adda/shared';

export class ApiError extends Error {
  status: number;
  details: Record<string, string>;

  constructor(status: number, message: string, details: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? 'Something went wrong', json.details);
  return json as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body });
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body });
const del = (path: string) => request<void>(path, { method: 'DELETE' });
const put = <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body });

export interface RegisterBody {
  username: string;
  password: string;
  name: string;
  branch: string;
  year: number;
  section: string;
  bio: string;
  interests: string;
}
export interface ProfileBody {
  name: string;
  branch: string;
  year: number;
  section: string;
  bio: string;
  interests: string;
}
export interface DeadlineBody {
  title: string;
  subject: string;
  dueAt: number;
  priority: Priority;
  /** Admin only. */
  official?: boolean;
  /** '' = everyone, else a section key. */
  audience?: string;
}
export type ClassBody = Omit<ClassSlot, 'id' | 'sectionKey' | 'official'> & { section?: string };
export interface RoomBody {
  name: string;
  topic: string;
  lang: string;
}
export interface EventBody {
  title: string;
  description: string;
  location: string;
  category: string;
  startAt: number;
  endAt: number | null;
}
export interface PeopleQuery {
  q?: string;
  branch?: string;
  year?: string;
  section?: string;
  online?: boolean;
}

type UserRes = { user: PublicUser };

export type PinBody = Pick<LostFoundPin, 'kind' | 'title' | 'details' | 'x' | 'y' | 'place'>;

export const api = {
  auth: {
    me: () => get<UserRes>('/me').then((r) => r.user),
    login: (username: string, password: string) => post<UserRes>('/auth/login', { username, password }).then((r) => r.user),
    register: (body: RegisterBody) => post<UserRes>('/auth/register', body).then((r) => r.user),
    guest: () => post<UserRes>('/auth/guest').then((r) => r.user),
    logout: () => post<void>('/auth/logout'),
    updateProfile: (body: ProfileBody) => patch<UserRes>('/me', body).then((r) => r.user),
  },
  deadlines: {
    list: () => get<Deadline[]>('/deadlines'),
    create: (body: DeadlineBody) => post<Deadline>('/deadlines', body),
    update: (id: string, body: Partial<DeadlineBody> & { done?: boolean }) => patch<Deadline>(`/deadlines/${id}`, body),
    remove: (id: string) => del(`/deadlines/${id}`),
  },
  timetable: {
    list: (sectionKey?: string) => get<ClassSlot[]>(`/timetable${sectionKey ? `?section=${encodeURIComponent(sectionKey)}` : ''}`),
    sections: () => get<Section[]>('/sections'),
    freeRooms: (day: number, time: string) => get<FreeRooms>(`/timetable/free-rooms?day=${day}&time=${time}`),
    create: (body: ClassBody) => post<ClassSlot>('/timetable', body),
    remove: (id: string) => del(`/timetable/${id}`),
  },
  people: {
    search: (q: PeopleQuery) => {
      const params = new URLSearchParams();
      if (q.q) params.set('q', q.q);
      if (q.branch) params.set('branch', q.branch);
      if (q.year) params.set('year', q.year);
      if (q.section) params.set('section', q.section);
      if (q.online) params.set('online', 'true');
      return get<Person[]>(`/people?${params}`);
    },
    get: (id: string) => get<Person>(`/people/${id}`),
  },
  assignments: {
    list: () => get<SubjectAssignments[]>('/assignments'),
    update: (body: { subject: string; number: number; status?: AssignmentStatus; dueAt?: number | null; note?: string }) =>
      put<Assignment>('/assignments', body),
  },
  attendance: {
    overview: (today: string) => get<AttendanceOverview>(`/attendance?today=${today}`),
    day: (date: string) => get<AttendanceClass[]>(`/attendance/day?date=${date}`),
    mark: (body: { date: string; today: string; slotId: string; status: AttendanceStatus | null }) => put<AttendanceClass[]>('/attendance/mark', body),
    allPresent: (body: { date: string; today: string }) => post<AttendanceClass[]>('/attendance/all-present', body),
    baseline: (body: { subject: string; attended: number; held: number }) => put<void>('/attendance/baseline', body),
    settings: (body: { target: number; semEnd: string | null }) => put<void>('/attendance/settings', body),
    setup: (body: { target: number; semEnd: string | null; baselines: { subject: string; attended: number; held: number }[] }) =>
      put<void>('/attendance/setup', body),
  },
  friends: {
    overview: () => get<FriendsOverview>('/friends'),
    request: (id: string) => post<{ friend: FriendStatus }>(`/friends/${id}`),
    accept: (id: string) => post<{ friend: FriendStatus }>(`/friends/${id}/accept`),
    remove: (id: string) => del(`/friends/${id}`),
  },
  chat: {
    conversations: () => get<Conversation[]>('/conversations'),
    thread: (userId: string) => get<DirectMessage[]>(`/conversations/${userId}/messages`),
    send: (userId: string, text: string) => post<DirectMessage>(`/conversations/${userId}/messages`, { text }),
    markRead: (userId: string) => post<void>(`/conversations/${userId}/read`),
  },
  rooms: {
    list: () => get<RoomWithMembers[]>('/rooms'),
    create: (body: RoomBody) => post<Room>('/rooms', body),
    remove: (id: string) => del(`/rooms/${id}`),
  },
  feed: {
    list: (before?: number) => get<Post[]>(`/feed${before ? `?before=${before}` : ''}`),
    create: (body: { body: string; image?: string }) => post<Post>('/feed', body),
    like: (id: string) => post<Post>(`/feed/${id}/like`),
    remove: (id: string) => del(`/feed/${id}`),
  },
  lostFound: {
    list: () => get<LostFoundPin[]>('/lostfound'),
    create: (body: PinBody) => post<LostFoundPin>('/lostfound', body),
    resolve: (id: string, resolved: boolean) => patch<LostFoundPin>(`/lostfound/${id}`, { resolved }),
    remove: (id: string) => del(`/lostfound/${id}`),
  },
  notices: {
    list: (sectionKey?: string) => get<Notice[]>(`/notices${sectionKey ? `?section=${encodeURIComponent(sectionKey)}` : ''}`),
    create: (body: { body: string; section?: string; pinned?: boolean }) => post<Notice>('/notices', body),
    pin: (id: string, pinned: boolean) => patch<Notice>(`/notices/${id}`, { pinned }),
    remove: (id: string) => del(`/notices/${id}`),
  },
  events: {
    list: () => get<CampusEvent[]>('/events'),
    create: (body: EventBody) => post<CampusEvent>('/events', body),
    rsvp: (id: string) => post<CampusEvent>(`/events/${id}/rsvp`),
    remove: (id: string) => del(`/events/${id}`),
  },
};
