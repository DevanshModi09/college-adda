// Populates a database with demo players, deadlines, a timetable, events and chats.
// Usage: npm run seed -w @adda/server   (password for every demo account: DEMO_PASSWORD or "adda-demo-123")
import { disconnect } from '../src/db/database.ts';
import { authService } from '../src/services/auth.service.ts';
import { deadlinesService } from '../src/services/deadlines.service.ts';
import { timetableService } from '../src/services/timetable.service.ts';
import { eventsService } from '../src/services/events.service.ts';
import { messagesService } from '../src/services/messages.service.ts';
import { friendsService } from '../src/services/friends.service.ts';
import { roomsService } from '../src/services/rooms.service.ts';
import { noticesService } from '../src/services/notices.service.ts';
import { feedService } from '../src/services/feed.service.ts';
import { usersRepo } from '../src/repositories/users.repo.ts';
import { eventsRepo } from '../src/repositories/events.repo.ts';

const PASSWORD = process.env.DEMO_PASSWORD ?? 'adda-demo-123';
const H = 3600e3;
const D = 864e5;
const now = Date.now();

await roomsService.seedDefaults();
await timetableService.importCatalogIfEmpty(); // real CSE II-year timetables from server/catalog

const players = [
  { username: 'devansh', name: 'Devansh Modi', branch: 'CSE', year: 2, section: 'B', bio: 'Building College Adda. Looking for a SIH team.', interests: ['DSA', 'React', 'Node'] },
  { username: 'aarav', name: 'Aarav Sharma', branch: 'CSE', year: 2, section: 'SA', bio: 'ML nerd, chai enthusiast.', interests: ['ML', 'Python', 'Kaggle'] },
  { username: 'priya', name: 'Priya Jain', branch: 'CSE', year: 2, section: 'C', bio: 'Frontend + design. Ask me about Figma.', interests: ['React', 'UI/UX', 'Figma'] },
  { username: 'kabir', name: 'Kabir Singh', branch: 'ECE', year: 4, section: 'A', bio: 'Robotics club lead.', interests: ['Robotics', 'Arduino', 'C++'] },
  { username: 'ananya', name: 'Ananya Gupta', branch: 'CSE', year: 2, section: 'DA', bio: 'Competitive programming, 4★ on CodeChef.', interests: ['DSA', 'C++', 'CP'] },
];

const ids: Record<string, string> = {};
for (const p of players) {
  const existing = await usersRepo.findByUsername(p.username);
  ids[p.username] = existing
    ? existing.id
    : (await authService.register({ ...p, password: PASSWORD })).user.id;
}
const me = ids.devansh!;
await usersRepo.promoteAdmins(['devansh']); // demo admin: posts official deadlines
const admin = (await usersRepo.findById(me))!;

if (!(await deadlinesService.list(admin)).length) {
  const tonight = new Date();
  tonight.setHours(23, 59, 0, 0);
  const SEC = 'CSE|2|B';
  // Official: visible to everyone (audience '') or to one section.
  const official = [
    { title: 'DBMS Assignment 3', subject: 'DBMS', dueAt: tonight.getTime(), priority: 'high' as const, audience: SEC },
    { title: 'OS lab file', subject: 'OS', dueAt: tonight.getTime() + 2 * D, priority: 'med' as const, audience: SEC },
    { title: 'CN quiz 2', subject: 'CN', dueAt: tonight.getTime() + 3 * D - 14 * H, priority: 'med' as const, audience: SEC },
    { title: 'Mid-sem exam form', subject: 'Exam cell', dueAt: tonight.getTime() + 5 * D, priority: 'high' as const, audience: '' },
  ];
  for (const d of official) await deadlinesService.create(admin, { ...d, official: true });
  // Personal: only the creator sees these.
  await deadlinesService.create(admin, { title: 'Minor project report', subject: 'Project', dueAt: tonight.getTime() + 6 * D, priority: 'low', official: false, audience: '' });
  const done = await deadlinesService.create(admin, { title: 'TOC problem set', subject: 'TOC', dueAt: now - D, priority: 'med', official: false, audience: '' });
  await deadlinesService.update(admin, done.id, { done: true });
}

if (!(await eventsService.listUpcoming(me)).length) {
  const at = (days: number, hour: number) => {
    const d = new Date(now + days * D);
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  };
  const evs = [
    // Only admins create events, so the demo admin hosts them all.
    { host: 'devansh', title: 'Hack night', category: 'Hackathon', location: 'Tech Lab', startAt: at(1, 19), endAt: at(1, 23), description: 'Bring a laptop and an idea. Pizza at 9.' },
    { host: 'devansh', title: 'SIH team formation', category: 'Hackathon', location: 'Seminar Hall', startAt: at(4, 17), endAt: at(4, 18), description: 'Need 2 frontend + 1 ML person.' },
    { host: 'devansh', title: 'DBMS revision', category: 'Study Group', location: 'Central Library', startAt: at(6, 16), endAt: at(6, 18), description: 'Normalization + transactions before the mid-sem.' },
  ];
  for (const e of evs) {
    const created = await eventsService.create((await usersRepo.findById(ids[e.host]!))!, { title: e.title, category: e.category, location: e.location, startAt: e.startAt, endAt: e.endAt, description: e.description });
    for (const u of Object.values(ids)) if (Math.random() > 0.35) await eventsRepo.addAttendee(created.id, u);
  }
}

// Friends: priya + aarav accepted, kabir waiting on you, you waiting on ananya.
if (await friendsService.status(me, ids.priya!) === 'none') {
  await friendsService.request(ids.priya!, me);
  await friendsService.accept(me, ids.priya!);
  await friendsService.request(me, ids.aarav!);
  await friendsService.accept(ids.aarav!, me);
  await friendsService.request(ids.kabir!, me);
  await friendsService.request(me, ids.ananya!);
}

if (!(await messagesService.conversations(me)).length) {
  await messagesService.send(ids.priya!, me, 'hey! saw you are building College Adda, need a designer?');
  await messagesService.send(me, ids.priya!, 'YES. can you look at the rooms page?');
  await messagesService.send(ids.priya!, me, 'on it, sending mocks tonight');
  await messagesService.send(ids.aarav!, me, 'SIH team still open? I can do the ML part');
}

if (!(await noticesService.list(admin, 'CSE|2|B')).length) {
  await noticesService.create(admin, { body: 'Mid-sem exams start 13 Oct. Admit cards from the exam cell on Friday, bring your ID.', section: 'CSE|2|B', pinned: true });
  await noticesService.create(admin, { body: 'DBMS lab shifted to Lab 4 this week. Bring your lab file, sir is checking.', section: 'CSE|2|B', pinned: false });
  await noticesService.create(admin, { body: 'Anyone found a black boAt charger in 2nd floor washroom corridor? DM me.', section: 'CSE|2|B', pinned: false });
}

if (!(await feedService.list(admin, { limit: 1 })).length) {
  const user = async (name: string) => (await usersRepo.findById(ids[name]!))!;
  const posts = [
    { by: 'ananya', body: 'Solved the DP question from yesterday’s contest after 3 hours. Sleep is for the weak.' },
    { by: 'kabir', body: 'Robotics club is taking new members this week. Come to the Tech Lab at 5, bring curiosity (and snacks).' },
    { by: 'priya', body: 'Hot take: the maggi point beats the food court. Fight me at the Game Zone, XOXO, best of 3.' },
    { by: 'aarav', body: 'Anyone else’s DBMS assignment 3 just… refusing to normalise? 😭' },
    { by: 'devansh', body: 'College Adda is live! Walk around the campus, grab a chai with friends, and post here. Welcome 👋' },
  ];
  const liked = [['priya', 'aarav', 'ananya', 'kabir'], ['devansh'], ['aarav', 'ananya'], ['priya', 'devansh', 'kabir'], []];
  for (const [i, p] of posts.entries()) {
    const post = await feedService.create(await user(p.by), { body: p.body });
    for (const fan of liked[i] ?? []) await feedService.toggleLike(await user(fan), post.id);
  }
}

console.log(`Seeded ${players.length} demo players (password: ${PASSWORD}).`);
await disconnect();
