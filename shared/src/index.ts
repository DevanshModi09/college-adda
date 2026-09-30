// Types (and a few constants) shared by server and client. Keep runtime code here minimal:
// the server loads this file directly through Node's TypeScript type stripping.

export type Priority = 'low' | 'med' | 'high';
export type ClassKind = 'Lecture' | 'Lab' | 'Tutorial';
export type TimerMode = 'focus' | 'break';
export type Role = 'student' | 'admin';

export interface PublicUser {
  id: string;
  username: string;
  name: string;
  branch: string;
  year: number;
  section: string; // letter, e.g. 'B'
  role: Role;
  bio: string;
  interests: string[];
  color: string;
  online: boolean;
  /** One-click demo account: hidden from people search, deleted after a day. */
  guest: boolean;
}

/** Relationship from the viewer's point of view. */
export type FriendStatus = 'none' | 'friends' | 'outgoing' | 'incoming';

/** A user as seen by the viewer (people search, profile). */
export interface Person extends PublicUser {
  friend: FriendStatus;
}

export interface FriendsOverview {
  friends: PublicUser[];
  /** Requests waiting for the viewer to answer. */
  incoming: PublicUser[];
  /** Requests the viewer sent. */
  outgoing: PublicUser[];
}

export interface Deadline {
  id: string;
  title: string;
  subject: string;
  dueAt: number;
  priority: Priority;
  /** Done for the viewer (completion is tracked per user). */
  done: boolean;
  /** Posted by an admin for everyone / a section, vs. the viewer's private deadline. */
  official: boolean;
  /** '' = everyone; otherwise the target section key. Always '' for personal deadlines. */
  audience: string;
  /** Viewer may edit / delete it (owner, or admin for official ones). */
  canEdit: boolean;
  createdAt: number;
}

/** A post on a section's notice board. */
export interface Notice {
  id: string;
  sectionKey: string;
  body: string;
  /** Pinned by an admin: shown first. */
  pinned: boolean;
  author: PublicUser | null;
  /** Viewer may delete it (the author, or an admin). */
  canDelete: boolean;
  createdAt: number;
}

/** A thought on the campus feed. */
export interface Post {
  id: string;
  body: string;
  /** URL of the attached photo, if any. */
  image: string | null;
  author: PublicUser | null;
  likes: number;
  /** The viewer liked it. */
  liked: boolean;
  /** Viewer may delete it (the author, or an admin). */
  canDelete: boolean;
  createdAt: number;
}

/** Something lost or found on campus. Students report it to the admin, who posts it. */
export interface LostFoundPin {
  id: string;
  kind: 'lost' | 'found';
  title: string;
  details: string;
  /** Where it was lost or found, e.g. 'Library, 2nd floor'. */
  place: string;
  /** Back with its owner: kept on the board for a week. */
  resolved: boolean;
  author: PublicUser | null;
  /** Viewer may add, resolve or delete items (admins). */
  canEdit: boolean;
  createdAt: number;
}

export interface LostFoundBoard {
  pins: LostFoundPin[];
  /** The admin to message to report or claim an item. */
  contact: PublicUser | null;
}

/** A class section: branch + year + letter. `key` is 'CSE|3|B'. */
export interface Section {
  key: string;
  branch: string;
  year: number;
  section: string;
  /** Specialisation from the official timetable, e.g. 'AIML Samatrix'. */
  label: string;
  members: number;
  slots: number;
}

export interface ClassSlot {
  id: string;
  sectionKey: string;
  day: number; // 0 = Sunday
  start: string; // HH:MM
  end: string;
  subject: string;
  kind: ClassKind;
  room: string;
  teacher: string;
  /** Imported from the official timetable: only admins can change it. */
  official: boolean;
}

export interface Room {
  id: string;
  name: string;
  topic: string;
  lang: string;
  createdBy: string | null;
  createdAt: number;
}

export interface RoomMember extends PublicUser {
  status: string;
  joinedAt: number;
}

export interface RoomWithMembers extends Room {
  members: RoomMember[];
}

export interface RoomMessage {
  id: string;
  roomId: string;
  userId: string;
  name: string;
  color: string;
  text: string;
  createdAt: number;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  text: string;
  createdAt: number;
  readAt: number | null;
}

export interface Conversation {
  user: PublicUser;
  last: DirectMessage;
  unread: number;
}

export interface CampusEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  category: string;
  startAt: number;
  endAt: number | null;
  host: PublicUser | null;
  attendees: PublicUser[];
  going: boolean;
  createdAt: number;
}

export interface FocusTimer {
  mode: TimerMode;
  duration: number; // seconds
  remaining: number; // seconds, valid while paused
  endsAt: number | null; // epoch ms while running
  serverNow: number;
}

export interface FreeRooms {
  /** The period the answer is for, or null outside class hours. */
  period: { start: string; end: string } | null;
  free: string[];
  busy: number;
  total: number;
}

// ---------- assignments ----------

export const ASSIGNMENTS_PER_SUBJECT = 5;
export type AssignmentStatus = 'todo' | 'doing' | 'submitted';

export interface Assignment {
  number: number; // 1..ASSIGNMENTS_PER_SUBJECT
  status: AssignmentStatus;
  dueAt: number | null;
  note: string;
}

export interface SubjectAssignments {
  subject: string;
  assignments: Assignment[];
}

// ---------- attendance ----------

export type AttendanceStatus = 'present' | 'absent' | 'cancelled';

/** One class on a given day, from the viewer's section timetable. */
export interface AttendanceClass {
  slotId: string;
  subject: string;
  kind: ClassKind;
  start: string;
  end: string;
  room: string;
  status: AttendanceStatus | null;
}

export interface SubjectAttendance {
  subject: string;
  kind: ClassKind;
  /** Baseline (from ERP) + marks. Cancelled classes count as neither. */
  attended: number;
  held: number;
  baseline: { attended: number; held: number };
  /** Classes of this subject still ahead in the timetable until semEnd (null if no semEnd). */
  remaining: number | null;
}

export interface AttendanceOverview {
  target: number;
  semEnd: string | null; // YYYY-MM-DD
  subjects: SubjectAttendance[];
  /** Past days (last 14) that have classes but no marks yet. */
  unmarkedDays: string[];
  /** First-run setup (ERP counts) finished or skipped. */
  setupDone: boolean;
}

export interface ApiError {
  error: string;
  details?: Record<string, string>;
}

// ---------- campus world ----------

export type Facing = 'up' | 'down' | 'left' | 'right';

/** A player on the 2D campus map. Positions are in tiles (floats). */
export interface WorldPlayer {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  dir: Facing;
  moving: boolean;
}

/** A dish someone ordered to a café table; everyone on campus sees it on the table. */
export interface Plate {
  item: string; // an emoji, e.g. '🍜'
  userId: string;
  name: string;
  at: number;
}

/** Plates left on a café table disappear after this, even if nobody gets up. */
export const PLATE_TTL_MS = 3 * 60e3;

/** World size in tiles, shared so server and client agree on bounds. */
export const WORLD_SIZE = { w: 126, h: 54 } as const;

// ---------- mini games (Game Zone) ----------

export type GameKind = 'ttt' | 'c4' | 'rps';
export const GAME_NAMES: Record<GameKind, string> = { ttt: 'XOXO', c4: 'CONNECT 4', rps: 'ROCK PAPER SCISSORS' };
export const RPS_TO_WIN = 2; // best of 3
export const C4 = { cols: 7, rows: 6 } as const;

export interface GamePlayer {
  id: string;
  name: string;
  color: string;
}

/** A two-player game as seen by one of its players (RPS picks stay hidden until both are in). */
export interface GameState {
  id: string;
  kind: GameKind;
  /** players[0] sent the invite and moves first. */
  players: [GamePlayer, GamePlayer];
  status: 'invited' | 'playing' | 'done';
  /** ttt: 9 cells, c4: rows*cols cells (row 0 = top). 0 empty, 1 = players[0], 2 = players[1]. */
  board: number[];
  /** Index into players whose move it is (ttt / c4). */
  turn: 0 | 1;
  /** Index of the winner once done; null for a draw or a declined invite. */
  winner: 0 | 1 | null;
  /** Winning cells to highlight (ttt / c4). */
  line: number[];
  /** rps: revealed rounds as [players[0] pick, players[1] pick]; 0 rock, 1 paper, 2 scissors. */
  rounds: [number, number][];
  score: [number, number];
  /** rps: whether each player has picked this round. */
  picked: [boolean, boolean];
  /** rps: the viewer's own pick this round, if any. */
  myPick: number | null;
  /** Why it ended, when it wasn't a normal finish. */
  ended?: 'declined' | 'left';
}

// ---------- realtime protocol ----------

export type ClientMessage =
  | { type: 'room:join'; roomId: string }
  | { type: 'room:leave' }
  | { type: 'room:status'; status: string }
  | { type: 'room:chat'; text: string }
  | { type: 'room:timer'; action: 'start' | 'pause' | 'reset' }
  | { type: 'room:timer'; action: 'mode'; mode: TimerMode }
  | { type: 'world:join' }
  | { type: 'world:leave' }
  | { type: 'world:move'; x: number; y: number; dir: Facing; moving: boolean }
  | { type: 'world:say'; text: string }
  | { type: 'world:serve'; tableId: string; item: string }
  | { type: 'game:invite'; to: string; kind: GameKind }
  | { type: 'game:respond'; gameId: string; accept: boolean }
  | { type: 'game:move'; gameId: string; move: number }
  | { type: 'game:leave'; gameId: string }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'hello'; online: string[] }
  | { type: 'presence'; userId: string; online: boolean }
  | { type: 'rooms:live'; rooms: RoomWithMembers[] }
  | { type: 'room:state'; room: Room; members: RoomMember[]; messages: RoomMessage[]; timer: FocusTimer }
  | { type: 'room:members'; roomId: string; members: RoomMember[] }
  | { type: 'room:chat'; roomId: string; message: RoomMessage }
  | { type: 'room:timer'; roomId: string; timer: FocusTimer; by: string }
  | { type: 'dm'; message: DirectMessage; from: PublicUser }
  | { type: 'events:changed' }
  | { type: 'deadlines:changed' }
  | { type: 'notices:changed'; sectionKey: string }
  | { type: 'feed:changed' }
  | { type: 'lostfound:changed' }
  | { type: 'friends:changed'; kind: 'request' | 'accepted' | 'removed'; from: PublicUser }
  | { type: 'error'; error: string }
  | { type: 'world:state'; players: WorldPlayer[]; you: WorldPlayer; plates: Record<string, Plate[]> }
  | { type: 'world:plates'; tableId: string; plates: Plate[] }
  | { type: 'game:update'; game: GameState }
  | { type: 'world:player'; player: WorldPlayer }
  | { type: 'world:left'; userId: string }
  | { type: 'world:say'; userId: string; name: string; text: string; at: number }
  | { type: 'pong' };
