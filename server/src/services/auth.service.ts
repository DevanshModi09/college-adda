import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PublicUser } from '@adda/shared';
import { env } from '../config/env.ts';
import { usersRepo, type UserRecord } from '../repositories/users.repo.ts';
import { sessionsRepo } from '../repositories/sessions.repo.ts';
import { friendsRepo } from '../repositories/friends.repo.ts';
import { conflict, newId, sha256, unauthorized } from '../utils/http.ts';
import type { LoginInput, RegisterInput } from '../validators/schemas.ts';
import { toPublicUser } from './users.service.ts';
import { messagesService } from './messages.service.ts';

const PALETTE = ['#3ef2e0', '#ff3ea5', '#ffe04a', '#8b6cff', '#7cff6b', '#ff8a3d', '#5ab0ff', '#ff5e5e'];
const colorFor = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length]!;

/** Guests land in the section the demo data is built around, and vanish after a day. */
const GUEST = { branch: 'CSE', year: 2, section: 'B', lifetimeMs: 864e5 };
const GUEST_NAMES = ['Chai Coder', 'Canteen Legend', 'Backbencher', 'Lab Rat', 'Night Owl', 'Library Ghost', 'Bug Hunter', 'Proxy Master'];

// Precomputed so failed logins for unknown usernames cost the same as wrong passwords.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export interface Session {
  token: string;
  expiresAt: number;
  user: PublicUser;
}

async function startSession(user: UserRecord, lifetimeMs = env.sessionDays * 864e5): Promise<Session> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + lifetimeMs;
  await sessionsRepo.create(sha256(token), user.id, expiresAt);
  return { token, expiresAt, user: toPublicUser(user) };
}

export const authService = {
  async register(input: RegisterInput): Promise<Session> {
    if (await usersRepo.findByUsername(input.username)) throw conflict('That username is taken');
    const user: UserRecord = {
      id: newId(),
      username: input.username,
      name: input.name,
      branch: input.branch,
      year: input.year,
      section: input.section,
      role: 'student',
      bio: input.bio,
      interests: input.interests,
      color: colorFor(input.username),
      passwordHash: await bcrypt.hash(input.password, 10),
      guest: false,
      createdAt: Date.now(),
    };
    await usersRepo.insert(user);
    return startSession(user);
  },

  async login(input: LoginInput): Promise<Session> {
    const user = await usersRepo.findByUsername(input.username);
    const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw unauthorized('Wrong username or password');
    return startSession(user);
  },

  /** One-click demo account. Usernames contain '-', which real usernames can't, so no clashes. */
  async guest(): Promise<Session> {
    const tag = crypto.randomBytes(3).toString('hex');
    const user: UserRecord = {
      id: newId(),
      username: `guest-${tag}`,
      name: `${GUEST_NAMES[crypto.randomInt(GUEST_NAMES.length)]} ${tag.slice(0, 3).toUpperCase()}`,
      branch: GUEST.branch,
      year: GUEST.year,
      section: GUEST.section,
      role: 'student',
      bio: 'Just looking around College Adda.',
      interests: [],
      color: colorFor(tag),
      // Nobody knows this password, so the account can only be reached through its session.
      passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
      guest: true,
      createdAt: Date.now(),
    };
    await usersRepo.insert(user);

    // Give the guest someone to talk to: the first configured admin befriends and greets them.
    const host = (await Promise.all(env.adminUsernames.map((u) => usersRepo.findByUsername(u)))).find(Boolean);
    if (host) {
      await friendsRepo.request(host.id, user.id);
      await friendsRepo.accept(host.id, user.id);
      await messagesService.send(host.id, user.id, `hey ${user.name.split(' ')[0]}! welcome to College Adda 👋 try the campus map, check the notice board, and mark today's attendance.`);
    }
    return startSession(user, GUEST.lifetimeMs);
  },

  /** Guest accounts expire with their session; clear them out along with everything they made. */
  deleteStaleGuests: () => usersRepo.deleteGuestsBefore(Date.now() - GUEST.lifetimeMs),

  async logout(token: string): Promise<void> {
    await sessionsRepo.delete(sha256(token));
  },

  async userFromToken(token: string | undefined): Promise<UserRecord | null> {
    if (!token) return null;
    const userId = await sessionsRepo.findUserId(sha256(token));
    return userId ? usersRepo.findById(userId) : null;
  },
};
