import { WORLD_SIZE, type Facing, type Plate, type WorldPlayer } from '@adda/shared';

// The 2D campus: one shared, in-memory world. Positions are in tiles.
// The client handles collisions against the map; the server keeps players honest
// on bounds and speed, and decides who is close enough to hear proximity chat.

export const SPAWN = { x: 27.5, y: 33 } as const;
export const HEARING_RADIUS = 7; // tiles
const MAX_SPEED = 9; // tiles/second, generous vs. the client's 5 to absorb network jitter
const MIN_MOVE_INTERVAL = 45; // ms; extra moves are dropped, not queued

interface Entry extends WorldPlayer {
  connections: Set<string>;
  lastMoveAt: number;
}

const players = new Map<string, Entry>();

// Café tables: what's been ordered to each one. The map (and so which tables exist)
// lives on the client; the server just keeps a few recent plates per table id.
const PLATE_TTL = 10 * 60e3;
const MAX_PLATES = 6;
const plates = new Map<string, Plate[]>();
const fresh = (list: Plate[], now: number) => list.filter((p) => now - p.at < PLATE_TTL);

const view = ({ connections: _c, lastMoveAt: _l, ...p }: Entry): WorldPlayer => p;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const world = {
  join(user: { id: string; name: string; color: string }, connId: string): { you: WorldPlayer; players: WorldPlayer[]; isNew: boolean } {
    let entry = players.get(user.id);
    const isNew = !entry;
    if (!entry) {
      entry = { id: user.id, name: user.name, color: user.color, ...SPAWN, dir: 'up', moving: false, connections: new Set(), lastMoveAt: 0 };
      players.set(user.id, entry);
    }
    entry.connections.add(connId);
    return { you: view(entry), players: [...players.values()].map(view), isNew };
  },

  /** Returns true when the user has left the world entirely (last tab closed). */
  leave(userId: string, connId: string): boolean {
    const entry = players.get(userId);
    if (!entry) return false;
    entry.connections.delete(connId);
    if (entry.connections.size) return false;
    players.delete(userId);
    return true;
  },

  /** Applies a move if it's plausible; returns the accepted state or null if dropped. */
  move(userId: string, to: { x: number; y: number; dir: Facing; moving: boolean }, now = Date.now()): WorldPlayer | null {
    const p = players.get(userId);
    if (!p || now - p.lastMoveAt < MIN_MOVE_INTERVAL) return null;
    const x = clamp(to.x, 0.5, WORLD_SIZE.w - 0.5);
    const y = clamp(to.y, 0.5, WORLD_SIZE.h - 0.5);
    const elapsed = Math.max(0.05, (now - (p.lastMoveAt || now - 1000)) / 1000);
    const dist = Math.hypot(x - p.x, y - p.y);
    // Too far too fast: keep them where they were (the client snaps back on the echo).
    const ok = dist <= MAX_SPEED * elapsed + 0.5;
    if (ok) {
      p.x = x;
      p.y = y;
    }
    p.dir = to.dir;
    p.moving = to.moving && ok;
    p.lastMoveAt = now;
    return view(p);
  },

  get: (userId: string) => {
    const p = players.get(userId);
    return p ? view(p) : null;
  },

  isIn: (userId: string) => players.has(userId),

  memberIds: () => [...players.keys()],

  /** Users within earshot of `userId`, including themselves. */
  nearby(userId: string, radius = HEARING_RADIUS): string[] {
    const me = players.get(userId);
    if (!me) return [];
    return [...players.values()].filter((p) => Math.hypot(p.x - me.x, p.y - me.y) <= radius).map((p) => p.id);
  },

  /** Puts a dish on a table (oldest plate goes when it's full); returns what's on it now. */
  serve(tableId: string, plate: Plate): Plate[] {
    const list = [...fresh(plates.get(tableId) ?? [], plate.at), plate].slice(-MAX_PLATES);
    plates.set(tableId, list);
    return list;
  },

  /** Everything still on the tables, for players joining the world. */
  plates(now = Date.now()): Record<string, Plate[]> {
    const out: Record<string, Plate[]> = {};
    for (const [id, list] of plates) {
      const kept = fresh(list, now);
      if (kept.length) out[id] = kept;
      else plates.delete(id);
    }
    return out;
  },

  /** Test helper. */
  reset: () => {
    players.clear();
    plates.clear();
  },
};
