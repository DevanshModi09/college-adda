import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import type { ServerMessage } from '@adda/shared';
import { db, disconnect } from '../src/db/database.ts';
import { createApp } from '../src/app.ts';
import { attachRealtime } from '../src/realtime/hub.ts';
import { roomsService } from '../src/services/rooms.service.ts';
import { usersRepo } from '../src/repositories/users.repo.ts';
import { SPAWN, world } from '../src/realtime/world.ts';
import { CATALOG_DIR, timetableService } from '../src/services/timetable.service.ts';
import path from 'node:path';

// Fresh, empty test branch for every run (use-test-db.ts guarantees this is the test branch).
const tables = await db().$queryRaw<{ tablename: string }[]>`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
if (tables.length) await db().$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
await roomsService.seedDefaults();

const server = http.createServer(createApp());
const wss = attachRealtime(server);
let base = '';

before(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  wss.clients.forEach((c) => c.terminate());
  wss.close();
  server.close();
  await disconnect(); // close the pool so the test process can exit
});

async function call(cookie: string, path: string, method = 'GET', body?: unknown) {
  const res = await fetch(base + '/api' + path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = res.status === 204 ? null : await res.json();
  return { status: res.status, json, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? cookie };
}

async function register(username: string, name: string) {
  const r = await call('', '/auth/register', 'POST', { username, password: 'password123', name, branch: 'CSE', year: 3, interests: 'DSA, React' });
  assert.equal(r.status, 201);
  return { cookie: r.cookie, user: r.json.user };
}

async function befriend(a: { cookie: string; user: { id: string } }, b: { cookie: string; user: { id: string } }) {
  assert.equal((await call(a.cookie, `/friends/${b.user.id}`, 'POST')).json.friend, 'outgoing');
  assert.equal((await call(b.cookie, `/friends/${a.user.id}/accept`, 'POST')).json.friend, 'friends');
}

function connect(cookie: string) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/ws', { headers: { cookie } });
  const inbox: ServerMessage[] = [];
  ws.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  const next = (type: ServerMessage['type'], timeout = 2000) =>
    new Promise<ServerMessage>((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        const i = inbox.findIndex((m) => m.type === type);
        if (i >= 0) return resolve(inbox.splice(i, 1)[0]!);
        if (Date.now() - started > timeout) return reject(new Error(`timed out waiting for ${type}`));
        setTimeout(tick, 10);
      };
      tick();
    });
  return new Promise<{ ws: WebSocket; next: typeof next; inbox: ServerMessage[] }>((resolve) =>
    ws.on('open', () => resolve({ ws, next, inbox }))
  );
}

describe('auth', () => {
  it('rejects duplicate usernames, bad passwords and anonymous access', async () => {
    await register('alice', 'Alice A');
    assert.equal((await call('', '/auth/register', 'POST', { username: 'alice', password: 'password123', name: 'x' })).status, 409);
    assert.equal((await call('', '/auth/login', 'POST', { username: 'alice', password: 'nope' })).status, 401);
    assert.equal((await call('', '/me')).status, 401);
    const short = await call('', '/auth/register', 'POST', { username: 'bob', password: '123', name: 'Bob' });
    assert.equal(short.status, 400);
    assert.ok(short.json.details.password);
  });

  it('creates throwaway guest players that stay out of people search', async () => {
    const g = await call('', '/auth/guest', 'POST');
    assert.equal(g.status, 201);
    assert.equal(g.json.user.guest, true);
    assert.match(g.json.user.username, /^guest-/);
    assert.equal((await call(g.cookie, '/me')).json.user.id, g.json.user.id);
    const people = (await call(g.cookie, '/people')).json as { id: string }[];
    const other = await call('', '/auth/guest', 'POST');
    assert.ok(!(await call(other.cookie, '/people')).json.some((p: { id: string }) => p.id === g.json.user.id));
    assert.ok(Array.isArray(people));
  });

  it('logs in, and logout kills the session', async () => {
    const { cookie } = await call('', '/auth/login', 'POST', { username: 'ALICE', password: 'password123' });
    assert.equal((await call(cookie, '/me')).json.user.username, 'alice');
    assert.equal((await call(cookie, '/auth/logout', 'POST')).status, 204);
    assert.equal((await call(cookie, '/me')).status, 401);
  });
});

describe('planner', () => {
  it('keeps personal deadlines private and done-state per user', async () => {
    const a = await register('carol', 'Carol');
    const b = await register('dave', 'Dave');
    const d = await call(a.cookie, '/deadlines', 'POST', { title: 'DBMS A3', dueAt: Date.now() + 3600e3, priority: 'high' });
    assert.equal(d.status, 201);
    assert.equal(d.json.official, false);
    assert.equal((await call(b.cookie, '/deadlines')).json.length, 0, 'not visible to others');
    assert.equal((await call(b.cookie, `/deadlines/${d.json.id}`, 'PATCH', { done: true })).status, 404);
    const done = await call(a.cookie, `/deadlines/${d.json.id}`, 'PATCH', { done: true });
    assert.equal(done.json.done, true);
    assert.equal(done.json.title, 'DBMS A3');
  });

  it('lets only admins post official deadlines, shown to everyone or one section', async () => {
    const reg = async (username: string, section: string) =>
      (await call('', '/auth/register', 'POST', { username, password: 'password123', name: username, branch: 'IT', year: 2, section })).cookie;
    const adminCookie = await reg('boss_admin', 'A');
    const studentA = await reg('stud_a', 'A');
    const studentB = await reg('stud_b', 'B');
    await usersRepo.promoteAdmins(['boss_admin']);

    const denied = await call(studentA, '/deadlines', 'POST', { title: 'x', dueAt: Date.now() + 1e6, official: true });
    assert.equal(denied.status, 403);

    const all = await call(adminCookie, '/deadlines', 'POST', { title: 'Exam form', dueAt: Date.now() + 864e5, official: true });
    const onlyB = await call(adminCookie, '/deadlines', 'POST', { title: 'IT-2-B lab', dueAt: Date.now() + 864e5, official: true, audience: 'IT|2|B' });
    assert.equal(all.status, 201);
    assert.equal(onlyB.json.audience, 'IT|2|B');

    const titles = async (c: string) => (await call(c, '/deadlines')).json.map((d: { title: string }) => d.title).sort();
    assert.deepEqual(await titles(studentA), ['Exam form']);
    assert.deepEqual(await titles(studentB), ['Exam form', 'IT-2-B lab']);

    // Students tick official deadlines for themselves only, and can't edit or delete them.
    assert.equal((await call(studentA, `/deadlines/${all.json.id}`, 'PATCH', { done: true })).json.done, true);
    const forB = (await call(studentB, '/deadlines')).json.find((d: { id: string }) => d.id === all.json.id);
    assert.equal(forB.done, false);
    assert.equal(forB.canEdit, false);
    assert.equal((await call(studentA, `/deadlines/${all.json.id}`, 'PATCH', { title: 'hacked' })).status, 403);
    assert.equal((await call(studentA, `/deadlines/${all.json.id}`, 'DELETE')).status, 403);
    assert.equal((await call(adminCookie, `/deadlines/${all.json.id}`, 'DELETE')).status, 204);
  });

  it('shares timetables per section: readable by all, editable by members only', async () => {
    const reg = async (username: string, section: string) =>
      (await call('', '/auth/register', 'POST', { username, password: 'password123', name: username, branch: 'CSE', year: 3, section })).cookie;
    const b1 = await reg('secb_one', 'B');
    const b2 = await reg('secb_two', 'B');
    const a1 = await reg('seca_one', 'A');

    assert.equal((await call(b1, '/timetable', 'POST', { subject: 'OS', day: 1, start: '10:00', end: '09:00' })).status, 400);
    const slot = await call(b1, '/timetable', 'POST', { subject: 'OS', day: 1, start: '09:00', end: '10:00', room: 'A-204' });
    assert.equal(slot.status, 201);
    assert.equal(slot.json.sectionKey, 'CSE|3|B');

    // Same section sees it by default; another section sees its own (empty) one.
    assert.equal((await call(b2, '/timetable')).json.length, 1);
    assert.equal((await call(a1, '/timetable')).json.length, 0);
    // ...but can browse section B explicitly.
    assert.equal((await call(a1, '/timetable?section=' + encodeURIComponent('CSE|3|B'))).json.length, 1);
    assert.equal((await call(a1, '/timetable?section=nonsense')).status, 400);

    // Only section B members may delete B's slots.
    assert.equal((await call(a1, `/timetable/${slot.json.id}`, 'DELETE')).status, 403);
    const sections = (await call(a1, '/sections')).json.map((s: { key: string }) => s.key);
    assert.ok(sections.includes('CSE|3|A') && sections.includes('CSE|3|B'));
    assert.equal((await call(b2, `/timetable/${slot.json.id}`, 'DELETE')).status, 204);
  });
});

describe('feed', () => {
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  it('posts thoughts and photos, toggles likes, and only lets authors or admins delete', async () => {
    const a = await register('feed_ana', 'Ana');
    const b = await register('feed_bo', 'Bo');

    const text = await call(a.cookie, '/feed', 'POST', { body: 'canteen samosas hit different today' });
    assert.equal(text.status, 201);
    assert.equal(text.json.image, null);
    assert.equal((await call(a.cookie, '/feed', 'POST', { body: '  ' })).status, 400);

    const photo = await call(b.cookie, '/feed', 'POST', { body: '', image: `data:image/png;base64,${PNG}` });
    assert.equal(photo.status, 201);
    const img = await fetch(base + photo.json.image, { headers: { cookie: a.cookie } });
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal(Buffer.from(await img.arrayBuffer()).toString('base64'), PNG);

    // The claimed type doesn't matter: the bytes must really be a raster image (no SVG).
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    assert.equal((await call(b.cookie, '/feed', 'POST', { image: `data:image/png;base64,${svg}` })).status, 400);
    assert.equal((await call(b.cookie, '/feed', 'POST', { image: `data:image/svg+xml;base64,${svg}` })).status, 400);

    const liked = await call(b.cookie, `/feed/${text.json.id}/like`, 'POST');
    assert.deepEqual([liked.json.likes, liked.json.liked], [1, true]);
    const unliked = await call(b.cookie, `/feed/${text.json.id}/like`, 'POST');
    assert.deepEqual([unliked.json.likes, unliked.json.liked], [0, false]);

    const feed = (await call(a.cookie, '/feed')).json;
    assert.deepEqual(feed.slice(0, 2).map((p: { id: string }) => p.id), [photo.json.id, text.json.id]);
    assert.equal((await call(b.cookie, `/feed/${text.json.id}`, 'DELETE')).status, 403);
    assert.equal((await call(a.cookie, `/feed/${text.json.id}`, 'DELETE')).status, 204);
  });
});

describe('café plates', () => {
  it('clears a diner’s plates when they walk away or leave campus, keeping everyone else’s', () => {
    const t = Date.now() + 10_000; // clear of any earlier moves
    world.join({ id: 'plate-ana', name: 'Ana', color: '#fff' }, 'c1');
    world.join({ id: 'plate-bo', name: 'Bo', color: '#fff' }, 'c2');
    world.serve('t-plates', { item: '🍜', userId: 'plate-ana', name: 'Ana', at: t });
    world.serve('t-plates', { item: '☕', userId: 'plate-bo', name: 'Bo', at: t });

    assert.equal(world.clearTable('plate-ana'), null, 'still sitting there');
    world.move('plate-ana', { x: SPAWN.x + 1, y: SPAWN.y, dir: 'right', moving: true }, t + 1000);
    assert.equal(world.clearTable('plate-ana'), null, 'a small shuffle keeps the food');
    world.move('plate-ana', { x: SPAWN.x + 4, y: SPAWN.y, dir: 'right', moving: true }, t + 2000);
    assert.deepEqual(world.clearTable('plate-ana')?.plates.map((p) => p.item), ['☕'], 'walked off: only their plate goes');
    assert.equal(world.clearTable('plate-ana'), null, 'nothing left to clear');

    world.leave('plate-bo', 'c2');
    assert.deepEqual(world.clearTable('plate-bo', true), { tableId: 't-plates', plates: [] }, 'leaving campus clears it too');
    world.leave('plate-ana', 'c1');
  });
});

describe('feed photos on Cloudinary', () => {
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  it('uploads signed to Cloudinary when configured, stores the URL, and deletes it with the post', async () => {
    const realFetch = globalThis.fetch;
    const hits: { action: string; form: FormData }[] = [];
    // Stand-in for Cloudinary's API that checks signatures the way Cloudinary does.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith('https://api.cloudinary.com/')) return realFetch(input, init);
      const form = init!.body as FormData;
      const signed = [...form.keys()].filter((k) => !['file', 'api_key', 'signature'].includes(k)).sort();
      const expected = crypto.createHash('sha1').update(signed.map((k) => `${k}=${form.get(k)}`).join('&') + 'shh-secret').digest('hex');
      assert.equal(url.split('/')[4], 'demo-cloud');
      assert.equal(form.get('api_key'), '1234');
      assert.equal(form.get('signature'), expected, 'request must be signed with the API secret');
      const action = url.endsWith('/upload') ? 'upload' : 'destroy';
      hits.push({ action, form });
      const body = action === 'upload' ? { secure_url: 'https://res.cloudinary.com/demo-cloud/image/upload/v1/college-adda/feed/abc.png', public_id: 'college-adda/feed/abc' } : { result: 'ok' };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    process.env.CLOUDINARY_URL = 'cloudinary://1234:shh-secret@demo-cloud';
    try {
      const a = await register('cloud_cy', 'Cy');
      const post = await call(a.cookie, '/feed', 'POST', { body: 'sunset from the canteen', image: `data:image/png;base64,${PNG}` });
      assert.equal(post.status, 201);
      assert.equal(post.json.image, 'https://res.cloudinary.com/demo-cloud/image/upload/v1/college-adda/feed/abc.png');
      assert.equal(hits[0]?.action, 'upload');
      assert.equal(hits[0]?.form.get('folder'), 'college-adda/feed');
      assert.equal((await call(a.cookie, `/feed/${post.json.id}/image`)).status, 404, 'nothing stored locally');

      assert.equal((await call(a.cookie, `/feed/${post.json.id}`, 'DELETE')).status, 204);
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(hits[1]?.action, 'destroy');
      assert.equal(hits[1]?.form.get('public_id'), 'college-adda/feed/abc');
    } finally {
      delete process.env.CLOUDINARY_URL;
      globalThis.fetch = realFetch;
    }
  });
});

describe('official timetable catalog', () => {
  it('imports every section, is public to browse, and locks official slots to admins', async () => {
    const r = await timetableService.importCatalog(path.join(CATALOG_DIR, 'cse-y2-2026-27.json'));
    assert.equal(r.sections, 36);

    const sections = (await call('', '/sections')).json;
    const sa = sections.find((s: { key: string }) => s.key === 'CSE|2|SA');
    assert.equal(sa.label, 'AIML Samatrix');
    assert.ok(sa.slots > 0);

    const reg = async (username: string) =>
      (await call('', '/auth/register', 'POST', { username, password: 'password123', name: username, branch: 'CSE', year: 2, section: 'A' })).cookie;
    const student = await reg('cat_student');
    const admin = await reg('cat_admin');
    await usersRepo.promoteAdmins(['cat_admin']);

    const mine = (await call(student, '/timetable')).json;
    assert.ok(mine.length > 15, 'own section loads by default');
    const cnLab = mine.find((s: { subject: string; day: number }) => s.subject === 'Computer Network Lab' && s.day === 1);
    assert.deepEqual([cnLab.start, cnLab.end, cnLab.room, cnLab.official], ['08:00', '09:40', 'VIB 502', true]);

    assert.equal((await call(student, `/timetable/${cnLab.id}`, 'DELETE')).status, 403);
    const extra = await call(student, '/timetable', 'POST', { subject: 'Extra DSA class', day: 6, start: '14:00', end: '15:00' });
    assert.equal(extra.json.official, false);
    assert.equal((await call(student, `/timetable/${extra.json.id}`, 'DELETE')).status, 204);
    assert.equal((await call(admin, `/timetable/${cnLab.id}`, 'DELETE')).status, 204);

    // Re-import restores official slots.
    await timetableService.importCatalog(path.join(CATALOG_DIR, 'cse-y2-2026-27.json'));
    assert.equal((await call(student, '/timetable')).json.length, mine.length);

    // Monday 08:30: VIB 502 hosts Sec A's CN lab, so it can't be free.
    const free = (await call(student, '/timetable/free-rooms?day=1&time=08:30')).json;
    assert.deepEqual(free.period, { start: '08:00', end: '08:50' });
    assert.ok(!free.free.includes('VIB 502'));
    assert.equal(free.free.length + free.busy, free.total);
    const night = (await call(student, '/timetable/free-rooms?day=1&time=20:00')).json;
    assert.equal(night.period, null);
    assert.equal(night.free.length, night.total);

  });
});

describe('campus world', () => {
  it('syncs players, rejects teleports, and keeps chat within earshot', async () => {
    const a = await register('w_ada', 'Ada');
    const b = await register('w_bob', 'Bob');
    const c = await register('w_cyd', 'Cyd');
    const [sa, sb, sc] = await Promise.all([connect(a.cookie), connect(b.cookie), connect(c.cookie)]);

    sa.ws.send(JSON.stringify({ type: 'world:join' }));
    const first = await sa.next('world:state');
    assert.ok(first.type === 'world:state' && first.you.id === a.user.id);
    sb.ws.send(JSON.stringify({ type: 'world:join' }));
    sc.ws.send(JSON.stringify({ type: 'world:join' }));
    await sb.next('world:state');
    const state = await sc.next('world:state');
    assert.equal(state.type === 'world:state' && state.players.length, 3);

    // A normal step is broadcast...
    await new Promise((r) => setTimeout(r, 120));
    sa.inbox.length = 0;
    sb.ws.send(JSON.stringify({ type: 'world:move', x: SPAWN.x, y: SPAWN.y - 0.4, dir: 'up', moving: true }));
    let seen;
    do seen = await sa.next('world:player');
    while (seen.type === 'world:player' && seen.player.id !== b.user.id);
    assert.ok(seen.type === 'world:player' && Math.abs(seen.player.y - (SPAWN.y - 0.4)) < 0.01);

    // ...a teleport across the map is refused (position unchanged).
    await new Promise((r) => setTimeout(r, 120));
    sa.inbox.length = 0;
    sc.ws.send(JSON.stringify({ type: 'world:move', x: SPAWN.x + 40, y: 3, dir: 'up', moving: true }));
    do seen = await sa.next('world:player');
    while (seen.type === 'world:player' && seen.player.id !== c.user.id);
    assert.ok(seen.type === 'world:player' && Math.abs(seen.player.x - SPAWN.x) < 2 && Math.abs(seen.player.y - SPAWN.y) < 2);

    // Walk C away (legit steps), then chat: B (near) hears A, C (far) doesn't.
    for (let i = 1; i <= 12; i++) {
      await new Promise((r) => setTimeout(r, 110));
      sc.ws.send(JSON.stringify({ type: 'world:move', x: SPAWN.x - i * 0.9, y: SPAWN.y, dir: 'left', moving: true }));
    }
    await new Promise((r) => setTimeout(r, 150));
    sa.ws.send(JSON.stringify({ type: 'world:say', text: 'hi campus' }));
    const heard = await sb.next('world:say');
    assert.ok(heard.type === 'world:say' && heard.text === 'hi campus');
    await new Promise((r) => setTimeout(r, 150));
    assert.ok(!sc.inbox.some((m) => m.type === 'world:say'), 'far player must not hear');

    // Café tables: an order shows up on the table for everyone in the world.
    sa.ws.send(JSON.stringify({ type: 'world:serve', tableId: 't3', item: '🍜' }));
    const served = await sc.next('world:plates');
    assert.ok(served.type === 'world:plates' && served.tableId === 't3' && served.plates[0]?.item === '🍜');
    sa.ws.send(JSON.stringify({ type: 'world:serve', tableId: 't3', item: 'not food' }));
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(sc.inbox.filter((m) => m.type === 'world:plates').length, 0, 'non-emoji orders are rejected');

    // Game zone: challenge -> accept -> both players see the same board.
    sa.ws.send(JSON.stringify({ type: 'game:invite', to: b.user.id, kind: 'ttt' }));
    const invite = await sb.next('game:update');
    assert.ok(invite.type === 'game:update' && invite.game.status === 'invited' && invite.game.players[0].id === a.user.id);
    await sa.next('game:update');
    sb.ws.send(JSON.stringify({ type: 'game:respond', gameId: invite.game.id, accept: true }));
    await sb.next('game:update');
    await sa.next('game:update');
    sa.ws.send(JSON.stringify({ type: 'game:move', gameId: invite.game.id, move: 4 }));
    const moved = await sb.next('game:update');
    assert.ok(moved.type === 'game:update' && moved.game.board[4] === 1 && moved.game.turn === 1);
    await sa.next('game:update');

    sb.ws.close();
    // B went offline mid-game, so A wins by forfeit.
    const forfeit = await sa.next('game:update');
    assert.ok(forfeit.type === 'game:update' && forfeit.game.ended === 'left' && forfeit.game.winner === 0);
    let left;
    do left = await sa.next('world:left');
    while (left.type === 'world:left' && left.userId !== b.user.id);
    sa.ws.close();
    sc.ws.close();
  });
});

describe('friends', () => {
  it('runs request -> accept -> unfriend, with live notifications', async () => {
    const a = await register('fr_amy', 'Amy');
    const b = await register('fr_ben', 'Ben');
    const c = await register('fr_cat', 'Cat');
    const sb = await connect(b.cookie);

    assert.equal((await call(a.cookie, `/friends/${a.user.id}`, 'POST')).status, 400);
    assert.equal((await call(a.cookie, `/friends/${b.user.id}`, 'POST')).json.friend, 'outgoing');
    const note = await sb.next('friends:changed');
    assert.ok(note.type === 'friends:changed' && note.kind === 'request' && note.from.id === a.user.id);

    let ov = (await call(b.cookie, '/friends')).json;
    assert.deepEqual(ov.incoming.map((u: { id: string }) => u.id), [a.user.id]);
    const seen = (await call(b.cookie, `/people/${a.user.id}`)).json;
    assert.equal(seen.friend, 'incoming');
    assert.equal((await call(c.cookie, `/friends/${b.user.id}/accept`, 'POST')).status, 404, "can't accept a request you never got");

    assert.equal((await call(b.cookie, `/friends/${a.user.id}/accept`, 'POST')).json.friend, 'friends');
    ov = (await call(a.cookie, '/friends')).json;
    assert.deepEqual(ov.friends.map((u: { id: string }) => u.id), [b.user.id]);

    // Mutual requests auto-accept.
    await call(a.cookie, `/friends/${c.user.id}`, 'POST');
    assert.equal((await call(c.cookie, `/friends/${a.user.id}`, 'POST')).json.friend, 'friends');

    // Unfriending closes DMs again.
    assert.equal((await call(a.cookie, `/conversations/${b.user.id}/messages`, 'POST', { text: 'yo' })).status, 201);
    assert.equal((await call(b.cookie, `/friends/${a.user.id}`, 'DELETE')).status, 204);
    assert.equal((await call(a.cookie, `/conversations/${b.user.id}/messages`, 'POST', { text: 'yo?' })).status, 403);
    sb.ws.close();
  });
});

describe('attendance', () => {
  it('marks classes from the section timetable and keeps per-subject totals', async () => {
    await timetableService.importCatalog(path.join(CATALOG_DIR, 'cse-y2-2026-27.json'));
    const r = await call('', '/auth/register', 'POST', { username: 'att_stu', password: 'password123', name: 'Att', branch: 'CSE', year: 2, section: 'A' });
    const c = r.cookie;
    const today = new Date().toISOString().slice(0, 10);
    // Find the most recent Monday (Sec A has CN Lab, DSA, OS, COD on Mondays).
    const d = new Date(`${today}T00:00:00Z`);
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1);
    const monday = d.toISOString().slice(0, 10);

    // First run: not set up; setup is all-or-nothing and flips the flag.
    assert.equal((await call(c, `/attendance?today=${today}`)).json.setupDone, false);
    const badSetup = await call(c, '/attendance/setup', 'PUT', { target: 75, semEnd: null, baselines: [{ subject: 'DBMS', attended: 5, held: 4 }] });
    assert.equal(badSetup.status, 400);
    assert.equal((await call(c, `/attendance?today=${today}`)).json.setupDone, false, 'failed setup changes nothing');
    const setup = await call(c, '/attendance/setup', 'PUT', { target: 75, semEnd: null, baselines: [{ subject: 'Software Engineering', attended: 9, held: 10 }] });
    assert.equal(setup.status, 204);
    const afterSetup = (await call(c, `/attendance?today=${today}`)).json;
    assert.equal(afterSetup.setupDone, true);
    assert.deepEqual(
      ((s) => [s.attended, s.held])(afterSetup.subjects.find((s: { subject: string }) => s.subject === 'Software Engineering')),
      [9, 10]
    );

    const day = (await call(c, `/attendance/day?date=${monday}`)).json;
    assert.deepEqual(day.map((x: { subject: string }) => x.subject), ['Computer Network Lab', 'Data Structure and Algorithms', 'Operating System', 'Computer Organisation and Design']);

    // Baseline from ERP, then mark: CN lab absent, the rest via "all present".
    assert.equal((await call(c, '/attendance/baseline', 'PUT', { subject: 'Operating System', attended: 18, held: 22 })).status, 204);
    assert.equal((await call(c, '/attendance/baseline', 'PUT', { subject: 'Operating System', attended: 30, held: 22 })).status, 400);
    const cnLab = day[0].slotId;
    assert.equal((await call(c, '/attendance/mark', 'PUT', { date: monday, today, slotId: cnLab, status: 'absent' })).status, 200);
    const all = (await call(c, '/attendance/all-present', 'POST', { date: monday, today })).json;
    assert.deepEqual(all.map((x: { status: string }) => x.status), ['absent', 'present', 'present', 'present']);

    const ov = (await call(c, `/attendance?today=${today}`)).json;
    const os = ov.subjects.find((s: { subject: string }) => s.subject === 'Operating System');
    assert.deepEqual([os.attended, os.held], [19, 23]);
    const lab = ov.subjects.find((s: { subject: string }) => s.subject === 'Computer Network Lab');
    assert.deepEqual([lab.attended, lab.held, lab.kind], [0, 1, 'Lab']);
    assert.ok(!ov.unmarkedDays.includes(monday));

    // Cancelled counts as neither; clearing a mark removes it; future marks are refused.
    await call(c, '/attendance/mark', 'PUT', { date: monday, today, slotId: cnLab, status: 'cancelled' });
    const ov2 = (await call(c, `/attendance?today=${today}`)).json;
    assert.equal(ov2.subjects.find((s: { subject: string }) => s.subject === 'Computer Network Lab').held, 0);
    const future = new Date(Date.now() + 8 * 864e5).toISOString().slice(0, 10);
    assert.equal((await call(c, '/attendance/all-present', 'POST', { date: future, today })).status, 400);
    assert.equal((await call(c, `/attendance?today=2020-01-01`)).status, 400, 'device clock sanity check');

    // Forecast: remaining classes until semester end come from the weekly timetable.
    const end = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    await call(c, '/attendance/settings', 'PUT', { target: 75, semEnd: end });
    const ov3 = (await call(c, `/attendance?today=${today}`)).json;
    const osRemaining = ov3.subjects.find((s: { subject: string }) => s.subject === 'Operating System').remaining;
    assert.ok(osRemaining >= 4 && osRemaining <= 8, `OS is ~3x/week, got ${osRemaining}`);
  });
});

describe('assignments', () => {
  it('gives every theory subject 5 private assignments and tracks their status', async () => {
    await timetableService.importCatalog(path.join(CATALOG_DIR, 'cse-y2-2026-27.json'));
    const reg = async (username: string) =>
      (await call('', '/auth/register', 'POST', { username, password: 'password123', name: username, branch: 'CSE', year: 2, section: 'A' })).cookie;
    const a = await reg('asg_one');
    const b = await reg('asg_two');

    const list = (await call(a, '/assignments')).json;
    const names = list.map((s: { subject: string }) => s.subject);
    assert.ok(names.includes('Operating System') && names.includes('Computer Network'));
    assert.ok(!names.some((n: string) => /lab/i.test(n)), 'labs have no assignments');
    assert.ok(list.every((s: { assignments: unknown[] }) => s.assignments.length === 5));

    const due = Date.now() + 3 * 864e5;
    const upd = await call(a, '/assignments', 'PUT', { subject: 'Operating System', number: 2, status: 'doing', dueAt: due, note: 'Moodle' });
    assert.deepEqual(upd.json, { number: 2, status: 'doing', dueAt: due, note: 'Moodle' });
    // Partial update keeps the other fields.
    assert.deepEqual((await call(a, '/assignments', 'PUT', { subject: 'Operating System', number: 2, status: 'submitted' })).json.dueAt, due);

    assert.equal((await call(a, '/assignments', 'PUT', { subject: 'Operating System', number: 6, status: 'doing' })).status, 400);
    assert.equal((await call(a, '/assignments', 'PUT', { subject: 'Operating System Lab', number: 1, status: 'doing' })).status, 400);
    assert.equal((await call(a, '/assignments', 'PUT', { subject: 'Underwater Basket Weaving', number: 1, status: 'doing' })).status, 400);

    const os = (await call(b, '/assignments')).json.find((s: { subject: string }) => s.subject === 'Operating System');
    assert.equal(os.assignments[1].status, 'todo', 'progress is private per student');
  });
});

describe('social', () => {
  it('searches people, sends DMs with unread counts, and RSVPs', async () => {
    const a = await register('erin', 'Erin');
    const b = await register('frank', 'Frank');
    const people = await call(a.cookie, '/people?q=fra');
    assert.deepEqual(people.json.map((u: { username: string }) => u.username), ['frank']);
    assert.equal((await call(a.cookie, '/people?q=%25')).json.length, 0, 'LIKE wildcards are escaped');

    // DMs need friendship.
    assert.equal((await call(a.cookie, `/conversations/${b.user.id}/messages`, 'POST', { text: 'hey' })).status, 403);
    await befriend(a, b);
    await call(a.cookie, `/conversations/${b.user.id}/messages`, 'POST', { text: 'hey' });
    await call(a.cookie, `/conversations/${b.user.id}/messages`, 'POST', { text: 'you there?' });
    let convos = (await call(b.cookie, '/conversations')).json;
    assert.equal(convos[0].unread, 2);
    assert.equal(convos[0].last.text, 'you there?');
    await call(b.cookie, `/conversations/${a.user.id}/read`, 'POST');
    convos = (await call(b.cookie, '/conversations')).json;
    assert.equal(convos[0].unread, 0);
    assert.equal((await call(a.cookie, `/conversations/${a.user.id}/messages`, 'POST', { text: 'me' })).status, 400);

    const newEvent = { title: 'Hack night', startAt: Date.now() + 864e5, category: 'Hackathon' };
    assert.equal((await call(a.cookie, '/events', 'POST', newEvent)).status, 403);
    await usersRepo.promoteAdmins([a.user.username]);
    const ev = await call(a.cookie, '/events', 'POST', newEvent);
    assert.equal(ev.json.attendees.length, 1);
    const rsvp = await call(b.cookie, `/events/${ev.json.id}/rsvp`, 'POST');
    assert.equal(rsvp.json.going, true);
    assert.equal(rsvp.json.attendees.length, 2);
    assert.equal((await call(b.cookie, `/events/${ev.json.id}`, 'DELETE')).status, 403);
  });
});

describe('realtime', () => {
  it('rejects unauthenticated sockets', async () => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    const code = await new Promise((r) => ws.on('close', r));
    assert.equal(code, 4001);
  });

  it('shares room presence, chat, timer and DMs', async () => {
    const a = await register('gita', 'Gita');
    const b = await register('hari', 'Hari');
    const room = (await call(a.cookie, '/rooms')).json[0];
    const sa = await connect(a.cookie);
    const sb = await connect(b.cookie);

    sa.ws.send(JSON.stringify({ type: 'room:join', roomId: room.id }));
    await sa.next('room:state');
    sb.ws.send(JSON.stringify({ type: 'room:join', roomId: room.id }));
    const state = await sb.next('room:state');
    assert.equal(state.type === 'room:state' && state.members.length, 2);

    sb.ws.send(JSON.stringify({ type: 'room:status', status: 'Graphs' }));
    let members;
    do members = await sa.next('room:members');
    while (members.type === 'room:members' && !members.members.some((m) => m.status === 'Graphs'));

    sa.ws.send(JSON.stringify({ type: 'room:chat', text: 'hello room' }));
    const chat = await sb.next('room:chat');
    assert.equal(chat.type === 'room:chat' && chat.message.text, 'hello room');

    sa.ws.send(JSON.stringify({ type: 'room:timer', action: 'start' }));
    const timer = await sb.next('room:timer');
    assert.ok(timer.type === 'room:timer' && timer.timer.endsAt);

    await befriend(a, b);
    await call(b.cookie, `/conversations/${a.user.id}/messages`, 'POST', { text: 'ping' });
    const dm = await sa.next('dm');
    assert.equal(dm.type === 'dm' && dm.message.text, 'ping');

    const live = (await call(a.cookie, '/rooms')).json.find((r: { id: string }) => r.id === room.id);
    assert.equal(live.members.length, 2);

    sb.ws.close();
    let offline;
    do offline = await sa.next('presence');
    while (offline.type === 'presence' && offline.online);
    assert.deepEqual(offline, { type: 'presence', userId: b.user.id, online: false });
    sa.ws.close();
  });
});
