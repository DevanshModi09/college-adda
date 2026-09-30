import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);
const required = (max: number, label: string) => z.string().trim().min(1, `${label} is required`).max(max);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const epochMs = z.coerce.number().int().positive();
const section = z.string().trim().toUpperCase().regex(/^[A-Z]{1,3}$/, 'Pick your section');

const interests = z
  .union([z.array(z.string()), z.string()])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')))
  .transform((list) => [...new Set(list.map((s) => s.trim().slice(0, 24)).filter(Boolean))].slice(0, 8));

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{3,24}$/, 'Username: 3–24 letters, numbers, _ or .'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  name: required(60, 'Name'),
  branch: text(40).default(''),
  year: z.coerce.number().int().min(1).max(5).default(1),
  section: section.default('A'),
  bio: text(200).default(''),
  interests: interests.default([]),
});

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().max(24),
  password: z.string().max(128),
});

export const profileSchema = z.object({
  name: required(60, 'Name'),
  branch: text(40),
  year: z.coerce.number().int().min(1).max(5),
  section,
  bio: text(200),
  interests,
});

export const deadlineCreateSchema = z.object({
  title: required(120, 'Title'),
  subject: text(60).default(''),
  dueAt: epochMs,
  priority: z.enum(['low', 'med', 'high']).default('med'),
  /** Admin only: post for everyone (audience '') or one section. */
  official: z.boolean().default(false),
  audience: z.string().max(80).default(''),
});

export const deadlineUpdateSchema = z.object({
  title: required(120, 'Title').optional(),
  subject: text(60).optional(),
  dueAt: epochMs.optional(),
  priority: z.enum(['low', 'med', 'high']).optional(),
  done: z.boolean().optional(),
});

export const classCreateSchema = z
  .object({
    subject: required(60, 'Subject'),
    day: z.coerce.number().int().min(0).max(6),
    start: hhmm,
    end: hhmm,
    kind: z.enum(['Lecture', 'Lab', 'Tutorial']).default('Lecture'),
    room: text(40).default(''),
    teacher: text(60).default(''),
    /** Admins may add to any section; everyone else adds to their own. */
    section: z.string().max(80).optional(),
  })
  .refine((c) => c.end > c.start, { message: 'End time must be after start time', path: ['end'] });

export const timetableQuerySchema = z.object({
  section: z.string().max(80).optional(),
});

// Client sends its local weekday/time: the campus runs on IST even if the server doesn't.
export const freeRoomsQuerySchema = z.object({
  day: z.coerce.number().int().min(0).max(6),
  time: hhmm,
});

// ---------- assignments ----------
export const assignmentUpdateSchema = z
  .object({
    subject: required(80, 'Subject'),
    number: z.coerce.number().int().min(1).max(5),
    status: z.enum(['todo', 'doing', 'submitted']).optional(),
    dueAt: epochMs.nullable().optional(),
    note: text(200).optional(),
  })
  .refine((v) => v.status !== undefined || v.dueAt !== undefined || v.note !== undefined, 'Nothing to update');
export type AssignmentUpdate = z.infer<typeof assignmentUpdateSchema>;

// ---------- attendance ----------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'Invalid date');
/** The student's local "today": trusted only within a day of the server clock. */
const clientToday = isoDate.refine((d) => Math.abs(Date.parse(`${d}T12:00:00Z`) - Date.now()) < 1.6 * 864e5, 'Your device clock looks wrong');

export const attendanceTodaySchema = z.object({ today: clientToday });
export const attendanceDaySchema = z.object({ date: isoDate });
export const attendanceMarkSchema = z.object({
  date: isoDate,
  today: clientToday,
  slotId: z.string().regex(/^[a-f0-9]{8,40}$/),
  status: z.enum(['present', 'absent', 'cancelled']).nullable(),
});
export const attendanceAllSchema = z.object({ date: isoDate, today: clientToday });
export const attendanceBaselineSchema = z.object({
  subject: required(80, 'Subject'),
  attended: z.coerce.number().int().min(0).max(1000),
  held: z.coerce.number().int().min(0).max(1000),
});
export const attendanceSettingsSchema = z.object({
  target: z.coerce.number().int().min(1).max(100),
  semEnd: isoDate.nullable(),
});

export const attendanceSetupSchema = attendanceSettingsSchema.extend({
  baselines: z.array(attendanceBaselineSchema).max(40),
});

export const roomCreateSchema = z.object({
  name: required(40, 'Desk name'),
  topic: text(160).default(''),
  lang: text(24).default('').transform((v) => v || 'Any'),
});

export const peopleQuerySchema = z.object({
  q: text(60).optional(),
  branch: text(40).optional(),
  year: z.coerce.number().int().min(1).max(5).optional().catch(undefined),
  section: z.string().trim().toUpperCase().regex(/^[A-Z]{1,3}$/).optional().catch(undefined),
  online: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const dmSendSchema = z.object({ text: required(1000, 'Message') });

export const dmQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const eventCreateSchema = z
  .object({
    title: required(100, 'Title'),
    description: text(1000).default(''),
    location: text(100).default(''),
    category: text(30).default('').transform((v) => v || 'Meetup'),
    startAt: epochMs,
    endAt: epochMs.nullish().transform((v) => v ?? null),
  })
  .refine((e) => e.endAt === null || e.endAt > e.startAt, { message: 'End must be after start', path: ['endAt'] });

export const postCreateSchema = z.object({
  body: text(500).default(''),
  /** Optional photo as a data URL; the service checks the bytes. */
  image: z.string().max(2_200_000).optional(),
});

export const feedQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export const idParam = z.object({ id: z.string().regex(/^[a-f0-9]{8,40}$/, 'Bad id') });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type DeadlineCreate = z.infer<typeof deadlineCreateSchema>;
export type DeadlineUpdate = z.infer<typeof deadlineUpdateSchema>;
export type ClassCreate = z.infer<typeof classCreateSchema>;
export type RoomCreate = z.infer<typeof roomCreateSchema>;
export type EventCreate = z.infer<typeof eventCreateSchema>;
