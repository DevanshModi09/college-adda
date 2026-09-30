import type { ClientMessage, DirectMessage, ServerMessage } from '@adda/shared';
import { useLive } from '../stores/live';
import { useGames } from '../stores/games';
import { toast } from '../stores/toasts';
import { keys, queryClient } from './queryClient';

type Listener = (msg: ServerMessage) => void;

/**
 * Single websocket for the whole app. Reconnects with backoff, re-joins the
 * current room after a reconnect, and feeds global state (presence, live rooms,
 * DMs, events) into the stores / query cache.
 */
class RealtimeClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private queue: string[] = [];
  private retries = 0;
  private stopped = true;
  private pingTimer: number | undefined;
  private roomId: string | null = null;
  private inWorld = false;
  private myId: string | null = null;

  connect(myId: string) {
    this.myId = myId;
    this.stopped = false;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      useLive.getState().setConnected(true);
      if (this.roomId) ws.send(JSON.stringify({ type: 'room:join', roomId: this.roomId } satisfies ClientMessage));
      if (this.inWorld) ws.send(JSON.stringify({ type: 'world:join' } satisfies ClientMessage));
      this.queue.splice(0).forEach((m) => ws.send(m));
      window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.send({ type: 'ping' }), 25_000);
    };

    ws.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.handleGlobal(msg);
      this.listeners.forEach((fn) => fn(msg));
    };

    ws.onclose = (e) => {
      useLive.getState().setConnected(false);
      window.clearInterval(this.pingTimer);
      if (this.ws === ws) this.ws = null;
      if (this.stopped || e.code === 4001) return;
      this.retries = Math.min(this.retries + 1, 6);
      window.setTimeout(() => this.myId && !this.stopped && this.connect(this.myId), 400 * 2 ** this.retries);
    };
  }

  disconnect() {
    this.stopped = true;
    this.roomId = null;
    this.inWorld = false;
    this.queue = [];
    this.ws?.close();
    this.ws = null;
    useLive.getState().reset();
  }

  send(msg: ClientMessage) {
    const raw = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(raw);
    else if (msg.type !== 'ping') this.queue.push(raw);
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  joinRoom(roomId: string) {
    this.roomId = roomId;
    this.send({ type: 'room:join', roomId });
  }

  joinWorld() {
    this.inWorld = true;
    this.send({ type: 'world:join' });
  }

  leaveWorld() {
    this.inWorld = false;
    this.send({ type: 'world:leave' });
  }

  /** Moves are real-time: drop them instead of queueing while offline. */
  move(msg: Extract<ClientMessage, { type: 'world:move' }>) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  leaveRoom() {
    this.roomId = null;
    this.send({ type: 'room:leave' });
  }

  private handleGlobal(msg: ServerMessage) {
    const live = useLive.getState();
    switch (msg.type) {
      case 'hello':
        live.setOnline(msg.online);
        break;
      case 'presence':
        live.setPresence(msg.userId, msg.online);
        break;
      case 'rooms:live':
        live.setRooms(msg.rooms);
        queryClient.setQueryData(keys.rooms, msg.rooms);
        break;
      case 'events:changed':
        queryClient.invalidateQueries({ queryKey: keys.events });
        break;
      case 'deadlines:changed':
        queryClient.invalidateQueries({ queryKey: keys.deadlines });
        break;
      case 'game:update':
        useGames.getState().set(msg.game);
        break;
      case 'error':
        toast(msg.error.toUpperCase(), { kind: 'bad' });
        break;
      case 'feed:changed':
        queryClient.invalidateQueries({ queryKey: keys.feed });
        break;
      case 'notices:changed':
        queryClient.invalidateQueries({ queryKey: keys.notices(msg.sectionKey) });
        break;
      case 'dm':
        this.handleDm(msg.message, msg.from.name);
        break;
      case 'friends:changed': {
        for (const key of [keys.friends, ['people'], ['person']]) queryClient.invalidateQueries({ queryKey: key });
        const who = msg.from.name.toUpperCase();
        if (msg.kind === 'request') toast(`${who} SENT YOU A FRIEND REQUEST`, { href: '/people?tab=requests' });
        if (msg.kind === 'accepted') toast(`${who} ACCEPTED. YOU CAN DM NOW`, { kind: 'good', href: `/chat/${msg.from.id}` });
        break;
      }
    }
  }

  private handleDm(message: DirectMessage, fromName: string) {
    const partner = message.senderId === this.myId ? message.recipientId : message.senderId;
    queryClient.setQueryData<DirectMessage[]>(keys.thread(partner), (prev) =>
      prev && !prev.some((m) => m.id === message.id) ? [...prev, message] : prev
    );
    queryClient.invalidateQueries({ queryKey: keys.conversations });
    const incoming = message.senderId !== this.myId;
    if (incoming && useLive.getState().activeChat !== partner) {
      toast(`${fromName.toUpperCase()}: ${message.text.slice(0, 60)}`, { href: `/chat/${partner}` });
    }
  }
}

export const realtime = new RealtimeClient();
