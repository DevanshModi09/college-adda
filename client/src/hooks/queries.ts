import { useMutation, useQuery } from '@tanstack/react-query';
import type { AssignmentStatus, AttendanceStatus, CampusEvent, ClassSlot, Deadline, Post, SubjectAssignments } from '@adda/shared';
import { api, type ClassBody, type DeadlineBody, type EventBody, type PeopleQuery, type RoomBody } from '../lib/api';
import { keys, queryClient } from '../lib/queryClient';
import { toast } from '../stores/toasts';

const onError = (err: Error) => toast(err.message, { kind: 'bad' });

// ---------- auth ----------
export const useMe = () => useQuery({ queryKey: keys.me, queryFn: api.auth.me, retry: false, staleTime: Infinity });

// ---------- deadlines ----------
export const useDeadlines = () => useQuery({ queryKey: keys.deadlines, queryFn: api.deadlines.list });

const setDeadlines = (fn: (list: Deadline[]) => Deadline[]) =>
  queryClient.setQueryData<Deadline[]>(keys.deadlines, (prev) => fn(prev ?? []).sort((a, b) => a.dueAt - b.dueAt));

export const useCreateDeadline = () =>
  useMutation({
    mutationFn: (body: DeadlineBody) => api.deadlines.create(body),
    onSuccess: (d) => setDeadlines((list) => [...list, d]),
  });

export const useToggleDeadline = () =>
  useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => api.deadlines.update(id, { done }),
    // Optimistic: flip immediately, roll back on failure.
    onMutate: ({ id, done }) => {
      const before = queryClient.getQueryData<Deadline[]>(keys.deadlines);
      setDeadlines((list) => list.map((d) => (d.id === id ? { ...d, done } : d)));
      return { before };
    },
    onError: (err, _v, ctx) => {
      queryClient.setQueryData(keys.deadlines, ctx?.before);
      onError(err);
    },
  });

export const useDeleteDeadline = () =>
  useMutation({
    mutationFn: (id: string) => api.deadlines.remove(id),
    onSuccess: (_r, id) => setDeadlines((list) => list.filter((d) => d.id !== id)),
    onError,
  });

// ---------- timetable (per section) ----------
export const useTimetable = (sectionKey: string) =>
  useQuery({ queryKey: keys.timetable(sectionKey), queryFn: () => api.timetable.list(sectionKey), placeholderData: (prev) => prev });

/** Free rooms for the viewer's current local weekday + minute. */
export const useFreeRooms = (now: number) => {
  const d = new Date(now);
  const day = d.getDay();
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return useQuery({ queryKey: keys.freeRooms(day, time), queryFn: () => api.timetable.freeRooms(day, time), placeholderData: (prev) => prev });
};

export const useSections = () => useQuery({ queryKey: keys.sections, queryFn: api.timetable.sections });

const refreshSections = () => queryClient.invalidateQueries({ queryKey: keys.sections });

export const useCreateClasses = (sectionKey: string) =>
  useMutation({
    mutationFn: (bodies: ClassBody[]) => Promise.all(bodies.map(api.timetable.create)),
    onSuccess: (created) => {
      queryClient.setQueryData<ClassSlot[]>(keys.timetable(sectionKey), (prev) => [...(prev ?? []), ...created]);
      refreshSections();
    },
  });

export const useDeleteClass = (sectionKey: string) =>
  useMutation({
    mutationFn: (id: string) => api.timetable.remove(id),
    onSuccess: (_r, id) => {
      queryClient.setQueryData<ClassSlot[]>(keys.timetable(sectionKey), (prev) => prev?.filter((c) => c.id !== id));
      refreshSections();
    },
    onError,
  });

// ---------- people & chat ----------
export const usePeople = (q: PeopleQuery) =>
  useQuery({ queryKey: keys.people(q), queryFn: () => api.people.search(q), placeholderData: (prev) => prev });

export const usePerson = (id: string | undefined) =>
  useQuery({ queryKey: keys.person(id ?? ''), queryFn: () => api.people.get(id!), enabled: !!id });

export const useConversations = () => useQuery({ queryKey: keys.conversations, queryFn: api.chat.conversations });

export const useThread = (id: string | undefined) =>
  useQuery({ queryKey: keys.thread(id ?? ''), queryFn: () => api.chat.thread(id!), enabled: !!id, staleTime: Infinity });

export const useSendMessage = (id: string) =>
  useMutation({ mutationFn: (text: string) => api.chat.send(id, text), onError });

// ---------- assignments ----------
export const useAssignments = () => useQuery({ queryKey: keys.assignments, queryFn: api.assignments.list });

type AssignmentPatch = { subject: string; number: number; status?: AssignmentStatus; dueAt?: number | null; note?: string };

/** Optimistic: the tile flips instantly, rolls back if the server says no. */
export const useUpdateAssignment = () =>
  useMutation({
    mutationFn: (v: AssignmentPatch) => api.assignments.update(v),
    onMutate: (v) => {
      const before = queryClient.getQueryData<SubjectAssignments[]>(keys.assignments);
      queryClient.setQueryData<SubjectAssignments[]>(keys.assignments, (prev) =>
        prev?.map((s) =>
          s.subject !== v.subject
            ? s
            : {
                ...s,
                assignments: s.assignments.map((a) =>
                  a.number !== v.number
                    ? a
                    : { ...a, ...(v.status && { status: v.status }), ...(v.dueAt !== undefined && { dueAt: v.dueAt }), ...(v.note !== undefined && { note: v.note }) }
                ),
              }
        )
      );
      return { before };
    },
    onError: (err, _v, ctx) => {
      queryClient.setQueryData(keys.assignments, ctx?.before);
      onError(err);
    },
  });

// ---------- attendance ----------
export const useAttendance = (today: string) =>
  useQuery({ queryKey: [...keys.attendance, 'overview', today], queryFn: () => api.attendance.overview(today), placeholderData: (prev) => prev });

export const useAttendanceDay = (date: string) =>
  useQuery({ queryKey: keys.attendanceDay(date), queryFn: () => api.attendance.day(date), placeholderData: (prev) => prev });

const refreshAttendance = () => queryClient.invalidateQueries({ queryKey: keys.attendance });

export const useMarkAttendance = () =>
  useMutation({
    mutationFn: (v: { date: string; today: string; slotId: string; status: AttendanceStatus | null }) => api.attendance.mark(v),
    onSuccess: (day, v) => {
      queryClient.setQueryData(keys.attendanceDay(v.date), day);
      refreshAttendance();
    },
    onError,
  });

export const useMarkAllPresent = () =>
  useMutation({
    mutationFn: (v: { date: string; today: string }) => api.attendance.allPresent(v),
    onSuccess: (day, v) => {
      queryClient.setQueryData(keys.attendanceDay(v.date), day);
      refreshAttendance();
    },
    onError,
  });

export const useSaveBaseline = () =>
  useMutation({ mutationFn: (v: { subject: string; attended: number; held: number }) => api.attendance.baseline(v), onSuccess: refreshAttendance });

export const useAttendanceSetup = () =>
  useMutation({
    mutationFn: (v: { target: number; semEnd: string | null; baselines: { subject: string; attended: number; held: number }[] }) => api.attendance.setup(v),
    onSuccess: refreshAttendance,
  });

export const useSaveAttendanceSettings = () =>
  useMutation({ mutationFn: (v: { target: number; semEnd: string | null }) => api.attendance.settings(v), onSuccess: refreshAttendance, onError });

// ---------- friends ----------
export const useFriends = () => useQuery({ queryKey: keys.friends, queryFn: api.friends.overview });

/** Anything that changes a friendship can change people cards, profiles and the overview. */
export const refreshFriendships = () =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.friends }),
    queryClient.invalidateQueries({ queryKey: ['people'] }),
    queryClient.invalidateQueries({ queryKey: ['person'] }),
  ]);

export const useFriendAction = () =>
  useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'request' | 'accept' | 'remove' }): Promise<void> => {
      if (action === 'request') await api.friends.request(id);
      else if (action === 'accept') await api.friends.accept(id);
      else await api.friends.remove(id);
    },
    onSuccess: refreshFriendships,
    onError,
  });

// ---------- rooms ----------
export const useRooms = () => useQuery({ queryKey: keys.rooms, queryFn: api.rooms.list });

export const useCreateRoom = () => useMutation({ mutationFn: (body: RoomBody) => api.rooms.create(body) });

// ---------- events ----------
export const useEvents = () => useQuery({ queryKey: keys.events, queryFn: api.events.list });

const replaceEvent = (e: CampusEvent) =>
  queryClient.setQueryData<CampusEvent[]>(keys.events, (prev) => prev?.map((x) => (x.id === e.id ? e : x)));

export const useCreateEvent = () =>
  useMutation({
    mutationFn: (body: EventBody) => api.events.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.events }),
  });

export const useRsvp = () => useMutation({ mutationFn: (id: string) => api.events.rsvp(id), onSuccess: replaceEvent, onError });

export const useDeleteEvent = () =>
  useMutation({
    mutationFn: (id: string) => api.events.remove(id),
    onSuccess: (_r, id) => queryClient.setQueryData<CampusEvent[]>(keys.events, (prev) => prev?.filter((e) => e.id !== id)),
    onError,
  });

// ---------- notice board ----------
// Keyed by the section actually shown, so realtime pushes for that section refresh it.
export const useNotices = (sectionKey: string) =>
  useQuery({ queryKey: keys.notices(sectionKey), queryFn: () => api.notices.list(sectionKey), enabled: !!sectionKey });

const refreshNotices = (sectionKey: string) => queryClient.invalidateQueries({ queryKey: keys.notices(sectionKey) });

export const usePostNotice = () =>
  useMutation({
    mutationFn: (body: { body: string; section: string; pinned?: boolean }) => api.notices.create(body),
    onSuccess: (n) => refreshNotices(n.sectionKey),
  });

export const usePinNotice = () =>
  useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => api.notices.pin(id, pinned),
    onSuccess: (n) => refreshNotices(n.sectionKey),
    onError,
  });

export const useDeleteNotice = () =>
  useMutation({
    mutationFn: ({ id }: { id: string; sectionKey: string }) => api.notices.remove(id),
    onSuccess: (_r, { sectionKey }) => refreshNotices(sectionKey),
    onError,
  });

// ---------- feed ----------
export const useFeed = () => useQuery({ queryKey: keys.feed, queryFn: () => api.feed.list() });

const replacePost = (p: Post) => queryClient.setQueryData<Post[]>(keys.feed, (prev) => prev?.map((x) => (x.id === p.id ? p : x)));

export const useCreatePost = () =>
  useMutation({
    mutationFn: (body: { body: string; image?: string }) => api.feed.create(body),
    onSuccess: (p) => queryClient.setQueryData<Post[]>(keys.feed, (prev) => [p, ...(prev ?? []).filter((x) => x.id !== p.id)]),
  });

export const useLikePost = () =>
  useMutation({
    mutationFn: (id: string) => api.feed.like(id),
    // Optimistic: flip the heart right away.
    onMutate: (id) => {
      const before = queryClient.getQueryData<Post[]>(keys.feed);
      queryClient.setQueryData<Post[]>(keys.feed, (prev) =>
        prev?.map((p) => (p.id === id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p))
      );
      return { before };
    },
    onSuccess: replacePost,
    onError: (err, _id, ctx) => {
      queryClient.setQueryData(keys.feed, ctx?.before);
      onError(err);
    },
  });

export const useDeletePost = () =>
  useMutation({
    mutationFn: (id: string) => api.feed.remove(id),
    onSuccess: (_r, id) => queryClient.setQueryData<Post[]>(keys.feed, (prev) => prev?.filter((p) => p.id !== id)),
    onError,
  });
