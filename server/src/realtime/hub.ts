import type { IncomingMessage, Server } from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import type { ServerMessage } from '@adda/shared';
import { authService } from '../services/auth.service.ts';
import { roomsService } from '../services/rooms.service.ts';
import { SESSION_COOKIE } from '../middleware/auth.ts';
import { logger } from '../utils/logger.ts';
import { presence } from './presence.ts';
import { roomTimers } from './timers.ts';
import { bus } from './bus.ts';
import { world } from './world.ts';
import { GameError, gameRules } from './games.ts';
import { usersRepo } from '../repositories/users.repo.ts';

interface Client {
  id: string;
  ws: WebSocket;
  userId: string;
  name: string;
  roomId: string | null;
  inWorld: boolean;
  color: string;
  alive: boolean;
  // naive flood control: tokens refill once per second
  tokens: number;
}

const clientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room:join'), roomId: z.string().max(40) }),
  z.object({ type: z.literal('room:leave') }),
  z.object({ type: z.literal('room:status'), status: z.string().trim().max(80) }),
  z.object({ type: z.literal('room:chat'), text: z.string().trim().min(1).max(500) }),
  z.object({
    type: z.literal('room:timer'),
    action: z.enum(['start', 'pause', 'reset', 'mode']),
    mode: z.enum(['focus', 'break']).optional(),
  }),
  z.object({ type: z.literal('world:join') }),
  z.object({ type: z.literal('world:leave') }),
  z.object({
    type: z.literal('world:move'),
    x: z.number().finite(),
    y: z.number().finite(),
    dir: z.enum(['up', 'down', 'left', 'right']),
    moving: z.boolean(),
  }),
  z.object({ type: z.literal('world:say'), text: z.string().trim().min(1).max(140) }),
  z.object({
    type: z.literal('world:serve'),
    tableId: z.string().regex(/^t\d{1,3}$/),
    item: z.string().max(16).regex(/^\p{Extended_Pictographic}/u),
  }),
  z.object({ type: z.literal('game:invite'), to: z.string().regex(/^[a-f0-9]{8,40}$/), kind: z.enum(['ttt', 'c4', 'rps']) }),
  z.object({ type: z.literal('game:respond'), gameId: z.string().max(40), accept: z.boolean() }),
  z.object({ type: z.literal('game:move'), gameId: z.string().max(40), move: z.number().int().min(0).max(8) }),
  z.object({ type: z.literal('game:leave'), gameId: z.string().max(40) }),
  z.object({ type: z.literal('ping') }),
]);

const MAX_TOKENS = 20;

function readCookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
  const clients = new Set<Client>();

  const send = (c: Client, msg: ServerMessage) => c.ws.readyState === c.ws.OPEN && c.ws.send(JSON.stringify(msg));
  const broadcast = (msg: ServerMessage) => clients.forEach((c) => send(c, msg));
  const toUser = (userId: string, msg: ServerMessage) => clients.forEach((c) => c.userId === userId && send(c, msg));
  const toRoom = (roomId: string, msg: ServerMessage) => clients.forEach((c) => c.roomId === roomId && send(c, msg));

  const toWorld = (msg: ServerMessage) => clients.forEach((c) => c.inWorld && send(c, msg));
  const toWorldUsers = (ids: string[], msg: ServerMessage) => {
    const set = new Set(ids);
    clients.forEach((c) => c.inWorld && set.has(c.userId) && send(c, msg));
  };

  type Game = ReturnType<typeof gameRules.invite>;
  /** Each player gets their own view of the game (RPS picks stay hidden). */
  const pushGame = (g: Game) => g.players.forEach((p) => toUser(p.id, { type: 'game:update', game: gameRules.view(g, p.id) }));

  async function playGame(c: Client, msg: Extract<z.infer<typeof clientMessage>, { type: `game:${string}` }>) {
    try {
      switch (msg.type) {
        case 'game:invite': {
          const to = await usersRepo.findById(msg.to);
          if (!to || !presence.isOnline(to.id)) throw new GameError('They’re not online right now');
          return pushGame(gameRules.invite({ id: c.userId, name: c.name, color: c.color }, { id: to.id, name: to.name, color: to.color }, msg.kind));
        }
        case 'game:respond':
          return pushGame(gameRules.respond(msg.gameId, c.userId, msg.accept));
        case 'game:move':
          return pushGame(gameRules.move(msg.gameId, c.userId, msg.move));
        case 'game:leave': {
          const g = gameRules.leave(msg.gameId, c.userId);
          if (g) pushGame(g);
          return;
        }
      }
    } catch (err) {
      if (err instanceof GameError) return send(c, { type: 'error', error: err.message });
      throw err;
    }
  }

  function leaveWorld(c: Client) {
    if (!c.inWorld) return;
    c.inWorld = false;
    if (!world.leave(c.userId, c.id)) return;
    toWorld({ type: 'world:left', userId: c.userId });
    const cleared = world.clearTable(c.userId, true); // their food goes when they leave campus
    if (cleared) toWorld({ type: 'world:plates', ...cleared });
  }

  const pushRooms = async () => broadcast({ type: 'rooms:live', rooms: await roomsService.listWithMembers() });
  const pushMembers = async (roomId: string) => toRoom(roomId, { type: 'room:members', roomId, members: await roomsService.members(roomId) });
  /** Members of the room + the live room list, after someone sits down, stands up or changes status. */
  const pushRoom = (roomId: string) => Promise.all([pushMembers(roomId), pushRooms()]);

  async function leave(c: Client) {
    const roomId = c.roomId;
    if (!roomId) return;
    c.roomId = null;
    presence.leaveRoom(roomId, c.userId, c.id);
    if (presence.isEmpty(roomId)) roomTimers.drop(roomId);
    await pushRoom(roomId);
  }

  async function handle(c: Client, raw: string) {
    let parsed;
    try {
      parsed = clientMessage.safeParse(JSON.parse(raw));
    } catch {
      return;
    }
    if (!parsed.success) return send(c, { type: 'error', error: 'Bad message' });
    const msg = parsed.data;

    switch (msg.type) {
      case 'ping':
        return send(c, { type: 'pong' });

      case 'room:join': {
        let room;
        try {
          room = await roomsService.get(msg.roomId);
        } catch {
          return send(c, { type: 'error', error: 'Desk not found' });
        }
        await leave(c);
        c.roomId = room.id;
        presence.joinRoom(room.id, c.userId, c.id);
        const [members, messages] = await Promise.all([roomsService.members(room.id), roomsService.history(room.id)]);
        send(c, { type: 'room:state', room, members, messages, timer: roomTimers.get(room.id) });
        await pushRoom(room.id);
        return;
      }

      case 'room:leave':
        return leave(c);

      case 'world:join': {
        const { you, players, isNew } = world.join({ id: c.userId, name: c.name, color: c.color }, c.id);
        c.inWorld = true;
        send(c, { type: 'world:state', players, you, plates: world.plates() });
        if (isNew) toWorld({ type: 'world:player', player: you });
        return;
      }

      case 'world:leave':
        return leaveWorld(c);

      case 'world:move': {
        if (!c.inWorld) return;
        const player = world.move(c.userId, msg);
        // Everyone (the mover too: if the server rejected the step, their client snaps back).
        if (player) toWorld({ type: 'world:player', player });
        const cleared = world.clearTable(c.userId);
        if (cleared) toWorld({ type: 'world:plates', ...cleared });
        return;
      }

      case 'world:say': {
        if (!c.inWorld) return;
        toWorldUsers(world.nearby(c.userId), { type: 'world:say', userId: c.userId, name: c.name, text: msg.text, at: Date.now() });
        return;
      }

      case 'world:serve': {
        if (!c.inWorld) return;
        const list = world.serve(msg.tableId, { item: msg.item, userId: c.userId, name: c.name, at: Date.now() });
        toWorld({ type: 'world:plates', tableId: msg.tableId, plates: list });
        return;
      }

      case 'game:invite':
      case 'game:respond':
      case 'game:move':
      case 'game:leave':
        return playGame(c, msg);

      case 'room:status':
        if (c.roomId && presence.setStatus(c.roomId, c.userId, msg.status)) await pushRoom(c.roomId);
        return;

      case 'room:chat': {
        const roomId = c.roomId;
        if (!roomId) return;
        toRoom(roomId, { type: 'room:chat', roomId, message: await roomsService.postMessage(roomId, c.userId, msg.text) });
        return;
      }

      case 'room:timer': {
        if (!c.roomId) return;
        const cmd = msg.action === 'mode' ? { action: 'mode' as const, mode: msg.mode ?? 'focus' } : { action: msg.action };
        toRoom(c.roomId, { type: 'room:timer', roomId: c.roomId, timer: roomTimers.apply(c.roomId, cmd), by: c.name });
        return;
      }
    }
  }

  const MAX_PENDING = 20; // messages we'll hold while the session is being checked

  wss.on('connection', (ws, req) => {
    // Checking the session is async now; messages that arrive meanwhile wait in this
    // per-connection queue, which also keeps every message from one client in order
    // (e.g. a chat line can't overtake the room:join before it).
    let c: Client | null = null;
    let pending = 0;
    let queue: Promise<unknown> = (async () => {
      const user = await authService.userFromToken(readCookie(req, SESSION_COOKIE)).catch(() => null);
      if (!user || ws.readyState !== ws.OPEN) return ws.close(4001, 'unauthorized');
      c = { id: crypto.randomUUID(), ws, userId: user.id, name: user.name, color: user.color, roomId: null, inWorld: false, alive: true, tokens: MAX_TOKENS };
      clients.add(c);
      if (presence.connect(user.id, c.id)) broadcast({ type: 'presence', userId: user.id, online: true });
      send(c, { type: 'hello', online: presence.onlineIds() });
      send(c, { type: 'rooms:live', rooms: await roomsService.listWithMembers() });
    })();
    const enqueue = (task: (client: Client) => Promise<unknown> | unknown) => {
      queue = queue
        .then(() => c && task(c))
        .catch((err) => logger.error('ws handler failed', { err: String(err) }));
    };

    ws.on('pong', () => c && (c.alive = true));
    ws.on('message', (data) => {
      const raw = data.toString();
      if (!c && ++pending > MAX_PENDING) return; // flooding before auth finished
      // Movement has its own rate limit in world.move; everything else spends a token.
      const isMove = raw.length < 200 && raw.includes('"world:move"');
      if (!isMove && c) {
        if (c.tokens <= 0) return;
        c.tokens--;
      }
      enqueue((client) => handle(client, raw));
    });
    ws.on('close', () => {
      enqueue(async (client) => {
        await leave(client);
        leaveWorld(client);
        clients.delete(client);
        if (presence.disconnect(client.userId, client.id)) {
          broadcast({ type: 'presence', userId: client.userId, online: false });
          // Went offline mid-game: forfeit (or cancel the invite) so the other player isn't stuck.
          const g = gameRules.activeFor(client.userId);
          if (g) {
            gameRules.leave(g.id, client.userId);
            pushGame(g);
          }
        }
      });
    });
  });

  bus.on('dm:created', ({ message, from }) => {
    toUser(message.recipientId, { type: 'dm', message, from });
    toUser(message.senderId, { type: 'dm', message, from });
  });
  bus.on('events:changed', () => broadcast({ type: 'events:changed' }));
  bus.on('deadlines:changed', () => broadcast({ type: 'deadlines:changed' }));
  bus.on('feed:changed', () => broadcast({ type: 'feed:changed' }));
  bus.on('lostfound:changed', () => broadcast({ type: 'lostfound:changed' }));
  bus.on('notices:changed', ({ sectionKey }) => broadcast({ type: 'notices:changed', sectionKey }));
  bus.on('rooms:changed', () => void pushRooms().catch((err) => logger.error('rooms push failed', { err: String(err) })));
  bus.on('friends:changed', ({ to, kind, from }) => toUser(to, { type: 'friends:changed', kind, from }));

  const refill = setInterval(() => clients.forEach((c) => (c.tokens = Math.min(MAX_TOKENS, c.tokens + 5))), 1000);
  const sweep = setInterval(() => gameRules.sweep(), 60_000);
  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, 30_000);

  wss.on('close', () => {
    clearInterval(refill);
    clearInterval(sweep);
    clearInterval(heartbeat);
  });
  return wss;
}
