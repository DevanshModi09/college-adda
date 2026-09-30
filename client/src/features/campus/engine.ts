import type { Facing, Plate, ServerMessage, WorldPlayer } from '@adda/shared';
import { realtime } from '../../lib/realtime';
import { canStand, findPath, H, standOn, TILE, W, type CampusMap, type DiningTable, type Zone } from './map';
import { drawAvatar, drawBubble, drawLabel } from './render';

const SPEED = 5; // tiles per second
const SEND_EVERY = 90; // ms between position updates
const BUBBLE_MS = 6000;
const PLATE_MS = 10 * 60e3; // matches the server
// Where plates go on a one-tile table (px within the tile), in serving order.
const PLATE_SPOTS = [[4, 7], [12, 7], [8, 11], [8, 4]] as const;

const WAITER_SPEED = 3.2; // tiles per second
const WAITER_PAUSE = 900; // ms spent putting the plate down

interface Waiter {
  uniform: string;
  item: string;
  plateKey: string;
  route: { x: number; y: number }[]; // out to the table, then back
  /** How many waypoints of `route` lead to the table. */
  outLen: number;
  leg: number;
  x: number;
  y: number;
  dir: Facing;
  pauseUntil: number;
  delivered: boolean;
}

const plateKey = (tableId: string, p: Plate) => `${tableId}:${p.at}:${p.userId}`;

/** The café table you're sitting at, and who else is sitting there. */
export interface Seating {
  table: DiningTable;
  mates: WorldPlayer[];
}

interface Avatar {
  p: WorldPlayer;
  /** Rendered position, eased toward p.x/p.y for smooth remote movement. */
  rx: number;
  ry: number;
}

export interface EngineEvents {
  onZone: (zone: Zone | null) => void;
  onPlayers: (players: WorldPlayer[]) => void;
  onPick: (player: WorldPlayer) => void;
  onSeat: (seating: Seating | null) => void;
}

/**
 * The campus game loop: input, collision, camera and drawing on one canvas.
 * React owns the overlays; this owns the pixels.
 */
export class CampusEngine {
  private ctx: CanvasRenderingContext2D;
  private me: WorldPlayer | null = null;
  private others = new Map<string, Avatar>();
  private bubbles = new Map<string, { text: string; until: number }>();
  private keys = new Set<string>();
  private target: { x: number; y: number } | null = null;
  /** Remaining tile waypoints when walking to a seat. */
  private path: { x: number; y: number }[] = [];
  /** Face the table once we arrive at the seat. */
  private arriveDir: Facing | null = null;
  private waiters: Waiter[] = [];
  /** Plates on their way: hidden on the table until the waiter gets there. */
  private inTransit = new Set<string>();
  private raf = 0;
  private last = 0;
  private lastSent = 0;
  private sentMoving = false;
  private zone: Zone | null = null;
  private plates = new Map<string, Plate[]>();
  private mini: HTMLCanvasElement | null = null;
  private seatKey = '';
  private scale = 3;
  private cam = { x: 0, y: 0 };
  private canvas: HTMLCanvasElement;
  private map: CampusMap;
  private mapImage: HTMLCanvasElement;
  private events: EngineEvents;
  private myId: string;

  constructor(canvas: HTMLCanvasElement, map: CampusMap, mapImage: HTMLCanvasElement, myId: string, events: EngineEvents) {
    this.canvas = canvas;
    this.map = map;
    this.mapImage = mapImage;
    this.myId = myId;
    this.events = events;
    this.ctx = canvas.getContext('2d')!;
  }

  start() {
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const cssTile = w < 700 ? 36 : 48;
    this.scale = (cssTile / TILE) * dpr;
  }

  // ---------- input ----------
  press(key: string, down: boolean) {
    if (down) {
      this.keys.add(key);
      this.clearWalk();
    } else this.keys.delete(key);
  }

  private clearWalk() {
    this.target = null;
    this.path = [];
    this.arriveDir = null;
  }

  get seated() {
    const me = this.me;
    return !!me && !me.moving && this.map.isSeat(me.x, me.y - 0.01);
  }

  /**
   * Sit on the nearest free seat (walking there around the furniture), or stand up if seated.
   * Returns false when there's no free seat close by.
   */
  toggleSit(): boolean {
    const me = this.me;
    if (!me) return false;
    if (this.seated) {
      // Stand up: step off the seat to the nearest open floor.
      const off = findPath(this.map, [Math.floor(me.x), Math.floor(me.y - 0.01)], (x, y) => !this.map.isSeat(x + 0.5, y + 0.5), 4);
      if (off?.length) this.walk(off);
      return true;
    }
    const taken = new Set([...this.others.values()].filter((a) => !a.p.moving).map((a) => `${Math.floor(a.p.x)},${Math.floor(a.p.y - 0.01)}`));
    const path = findPath(
      this.map,
      [Math.floor(me.x), Math.floor(me.y - 0.01)],
      (x, y) => this.map.isSeat(x + 0.5, y + 0.5) && !taken.has(`${x},${y}`),
      14
    );
    if (!path?.length) return false;
    const [sx, sy] = path[path.length - 1]!;
    const table = this.map.tableAt(sx + 0.5, sy + 0.5);
    this.walk(path);
    this.arriveDir = table ? (table.x < sx ? 'left' : table.x > sx ? 'right' : table.y < sy ? 'up' : 'down') : 'down';
    return true;
  }

  private walk(tiles: [number, number][]) {
    this.keys.clear();
    this.path = tiles.map(([x, y]) => standOn(x, y));
    this.target = this.path.shift() ?? null;
    this.arriveDir = null;
  }

  releaseAll() {
    this.keys.clear();
  }

  /** Small overview map (drawn every frame) that you can click to walk somewhere. */
  setMinimap(canvas: HTMLCanvasElement | null) {
    this.mini = canvas;
  }

  /** Minimap click at (fx, fy), each 0..1 across the minimap. */
  miniClick(fx: number, fy: number) {
    this.goTo(fx * W, fy * H);
  }

  /** Walk to the spot (x, y), around walls. */
  goTo(x: number, y: number) {
    const me = this.me;
    if (!me) return;
    const gx = Math.floor(x);
    const gy = Math.floor(y - 0.01);
    const path = findPath(this.map, [Math.floor(me.x), Math.floor(me.y - 0.01)], (tx, ty) => Math.abs(tx - gx) + Math.abs(ty - gy) <= 1, 600);
    if (path?.length) this.walk(path);
    else {
      this.clearWalk();
      this.target = { x, y };
    }
  }

  /** Click/tap: pick a player under the pointer, otherwise walk there. */
  click(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const wx = ((clientX - rect.left) * dpr) / this.scale + this.cam.x;
    const wy = ((clientY - rect.top) * dpr) / this.scale + this.cam.y;
    const tx = wx / TILE;
    const ty = wy / TILE;
    for (const a of this.others.values()) {
      if (Math.abs(a.rx - tx) < 0.6 && ty > a.ry - 1.2 && ty < a.ry + 0.2) {
        this.events.onPick(a.p);
        return;
      }
    }
    this.clearWalk();
    this.target = { x: tx, y: ty + 0.2 };
  }

  // ---------- network ----------
  apply(msg: ServerMessage) {
    switch (msg.type) {
      case 'world:state':
        this.me = { ...msg.you };
        this.others.clear();
        for (const p of msg.players) if (p.id !== this.myId) this.others.set(p.id, { p, rx: p.x, ry: p.y });
        this.plates = new Map(Object.entries(msg.plates));
        this.emitPlayers();
        break;
      case 'world:plates': {
        const known = new Set((this.plates.get(msg.tableId) ?? []).map((p) => plateKey(msg.tableId, p)));
        this.plates.set(msg.tableId, msg.plates);
        for (const p of msg.plates) if (!known.has(plateKey(msg.tableId, p))) this.sendWaiter(msg.tableId, p);
        break;
      }
      case 'world:player': {
        const p = msg.player;
        if (p.id === this.myId) {
          // Server refused our step (or we reconnected): snap back.
          if (this.me && Math.hypot(this.me.x - p.x, this.me.y - p.y) > 1.5) Object.assign(this.me, { x: p.x, y: p.y });
          return;
        }
        const known = this.others.get(p.id);
        if (known) known.p = p;
        else {
          this.others.set(p.id, { p, rx: p.x, ry: p.y });
          this.emitPlayers();
        }
        break;
      }
      case 'world:left':
        this.others.delete(msg.userId);
        this.bubbles.delete(msg.userId);
        this.emitPlayers();
        break;
      case 'world:say':
        this.bubbles.set(msg.userId, { text: msg.text, until: Date.now() + BUBBLE_MS });
        break;
    }
  }

  get position() {
    return this.me;
  }

  private emitPlayers() {
    this.events.onPlayers([...(this.me ? [this.me] : []), ...[...this.others.values()].map((a) => a.p)]);
  }

  // ---------- simulation ----------
  private step(dt: number) {
    const me = this.me;
    if (!me) return;
    let dx = 0;
    let dy = 0;
    const k = this.keys;
    if (k.has('left')) dx -= 1;
    if (k.has('right')) dx += 1;
    if (k.has('up')) dy -= 1;
    if (k.has('down')) dy += 1;
    if (!dx && !dy && this.target) {
      const tx = this.target.x - me.x;
      const ty = this.target.y - me.y;
      const d = Math.hypot(tx, ty);
      if (d < 0.12) {
        this.target = this.path.shift() ?? null;
        if (!this.target && this.arriveDir) {
          me.dir = this.arriveDir; // settle in facing the table
          this.arriveDir = null;
          this.sentMoving = true; // make sure the new facing is sent
        }
      } else {
        dx = tx / d;
        dy = ty / d;
      }
    }
    const len = Math.hypot(dx, dy);
    const moving = len > 0;
    if (moving) {
      const vx = (dx / len) * SPEED * dt;
      const vy = (dy / len) * SPEED * dt;
      const before = { x: me.x, y: me.y };
      // Axis-separated collision lets you slide along walls.
      if (canStand(this.map, me.x + vx, me.y)) me.x += vx;
      if (canStand(this.map, me.x, me.y + vy)) me.y += vy;
      me.x = Math.min(W - 0.5, Math.max(0.5, me.x));
      me.y = Math.min(H - 0.5, Math.max(0.5, me.y));
      me.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : ('down' as Facing);
      if (this.target && before.x === me.x && before.y === me.y) this.clearWalk(); // stuck
    }
    me.moving = moving;

    const now = performance.now();
    if ((moving && now - this.lastSent > SEND_EVERY) || (!moving && this.sentMoving)) {
      realtime.move({ type: 'world:move', x: +me.x.toFixed(3), y: +me.y.toFixed(3), dir: me.dir, moving });
      this.lastSent = now;
      this.sentMoving = moving;
    }

    const zone = this.map.zoneAt(me.x, me.y - 0.1);
    if (zone?.id !== this.zone?.id) {
      this.zone = zone;
      this.events.onZone(zone);
    }

    this.updateSeating(me);
    this.stepWaiters(dt);

    // Ease remote avatars toward their latest reported position.
    const ease = 1 - Math.exp(-dt * 12);
    for (const a of this.others.values()) {
      a.rx += (a.p.x - a.rx) * ease;
      a.ry += (a.p.y - a.ry) * ease;
    }
  }

  /** Who's sitting at my table: only re-emitted when it actually changes. */
  private updateSeating(me: WorldPlayer) {
    const table = me.moving ? null : this.map.tableAt(me.x, me.y - 0.01);
    const mates = table
      ? [...this.others.values()].filter((a) => !a.p.moving && this.map.tableAt(a.p.x, a.p.y - 0.01)?.id === table.id).map((a) => a.p)
      : [];
    const key = table ? `${table.id}:${mates.map((m) => m.id).join(',')}` : '';
    if (key === this.seatKey) return;
    this.seatKey = key;
    this.events.onSeat(table ? { table, mates } : null);
  }

  // ---------- café staff ----------
  /** A waiter walks the dish from the counter to the table; the plate appears when they get there. */
  private sendWaiter(tableId: string, plate: Plate) {
    const table = this.map.tables.find((t) => t.id === tableId);
    const counter = table && this.map.counters.find((c) => c.zone === table.zone);
    if (!table || !counter) return;
    const out = findPath(this.map, counter.kitchen, (x, y) => Math.abs(x - table.x) + Math.abs(y - table.y) === 1, 60);
    if (!out) return;
    const start = standOn(...counter.kitchen);
    const there = out.map(([x, y]) => standOn(x, y));
    const back = [...there].reverse().slice(1).concat(start);
    const key = plateKey(tableId, plate);
    this.inTransit.add(key);
    this.waiters.push({ uniform: counter.uniform, item: plate.item, plateKey: key, route: [...there, ...back], outLen: there.length, leg: 0, ...start, dir: 'down', pauseUntil: 0, delivered: false });
  }

  private stepWaiters(dt: number) {
    const now = performance.now();
    for (const w of this.waiters) {
      if (now < w.pauseUntil) continue;
      const to = w.route[w.leg];
      if (!to) continue;
      const dx = to.x - w.x;
      const dy = to.y - w.y;
      const d = Math.hypot(dx, dy);
      const stepLen = WAITER_SPEED * dt;
      if (d <= stepLen) {
        w.x = to.x;
        w.y = to.y;
        w.leg++;
        if (!w.delivered && w.leg >= w.outLen) {
          w.delivered = true;
          this.inTransit.delete(w.plateKey);
          w.pauseUntil = now + WAITER_PAUSE;
        }
      } else {
        w.x += (dx / d) * stepLen;
        w.y += (dy / d) * stepLen;
        w.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
      }
    }
    this.waiters = this.waiters.filter((w) => w.leg < w.route.length);
  }

  private drawPlates() {
    const { ctx } = this;
    const now = Date.now();
    ctx.font = '7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.map.tables) {
      const list = (this.plates.get(t.id) ?? [])
        .filter((p) => now - p.at < PLATE_MS && !this.inTransit.has(plateKey(t.id, p)))
        .slice(-PLATE_SPOTS.length);
      list.forEach((p, i) => {
        const [dx, dy] = PLATE_SPOTS[i]!;
        ctx.fillText(p.item, t.x * TILE + dx, t.y * TILE + dy);
      });
    }
  }

  // ---------- drawing ----------
  private drawMinimap(t: number) {
    const c = this.mini;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(c.clientWidth * dpr);
    const h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const m = c.getContext('2d')!;
    m.imageSmoothingEnabled = true;
    m.drawImage(this.mapImage, 0, 0, w, h);
    const sx = w / W;
    const sy = h / H;
    const d = Math.max(3, Math.round(3 * dpr));
    const dot = (x: number, y: number, color: string, size = d) => {
      m.fillStyle = color;
      m.fillRect(Math.round(x * sx - size / 2), Math.round(y * sy - size / 2), size, size);
    };
    for (const a of this.others.values()) dot(a.rx, a.ry - 0.3, a.p.color);
    const me = this.me;
    if (me) {
      dot(me.x, me.y - 0.3, '#100a22', d + 2 * Math.round(dpr));
      dot(me.x, me.y - 0.3, Math.floor(t / 500) % 2 ? '#ffe04a' : '#f4f1ff');
    }
    // What the main view is showing.
    const { canvas, scale } = this;
    const vw = Math.min(W, canvas.width / scale / TILE);
    const vh = Math.min(H, canvas.height / scale / TILE);
    m.strokeStyle = 'rgba(244,241,255,0.85)';
    m.lineWidth = Math.max(1, Math.round(dpr));
    m.strokeRect(Math.round((this.cam.x / TILE) * sx) + 0.5, Math.round((this.cam.y / TILE) * sy) + 0.5, Math.round(vw * sx) - 1, Math.round(vh * sy) - 1);
  }

  private frame = (t: number) => {
    // Advance by real elapsed time (capped after long pauses), in small sub-steps so
    // collisions stay exact even when the browser only gives us a few frames a second.
    let remaining = Math.min(0.5, (t - (this.last || t)) / 1000);
    this.last = t;
    do {
      const dt = Math.min(0.03, remaining);
      this.step(dt);
      remaining -= dt;
    } while (remaining > 0);
    this.draw(t);
    this.drawMinimap(t);
    this.raf = requestAnimationFrame(this.frame);
  };

  private draw(t: number) {
    const { ctx, canvas, scale } = this;
    const viewW = canvas.width / scale;
    const viewH = canvas.height / scale;
    const worldW = W * TILE;
    const worldH = H * TILE;
    const me = this.me;
    const focusX = me ? me.x * TILE : worldW / 2;
    const focusY = me ? me.y * TILE : worldH / 2;
    this.cam.x = viewW >= worldW ? (worldW - viewW) / 2 : Math.min(worldW - viewW, Math.max(0, focusX - viewW / 2));
    this.cam.y = viewH >= worldH ? (worldH - viewH) / 2 : Math.min(worldH - viewH, Math.max(0, focusY - viewH / 2));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#100a22';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(scale, 0, 0, scale, -Math.round(this.cam.x * scale), -Math.round(this.cam.y * scale));
    ctx.drawImage(this.mapImage, 0, 0);

    // Café staff and waiters are drawn in the same y-sorted pass so people overlap correctly.
    type Npc = { y: number; draw: () => void };
    const npcs: Npc[] = [];
    for (const c of this.map.counters) {
      for (const [i, s] of c.staff.entries()) {
        const pos = standOn(s.x, s.y);
        const busy = Math.floor(t / 900 + i * 1.7) % 3 === 0; // little idle shuffle
        npcs.push({
          y: pos.y,
          draw: () => {
            drawAvatar(ctx, pos.x * TILE, pos.y * TILE, c.uniform, busy ? 'left' : 'down', busy, t, { staff: true });
            drawLabel(ctx, s.name, pos.x * TILE, pos.y * TILE - 27, '#b9aee8');
          },
        });
      }
    }
    for (const w of this.waiters) {
      npcs.push({
        y: w.y,
        draw: () => drawAvatar(ctx, w.x * TILE, w.y * TILE, w.uniform, w.dir, performance.now() >= w.pauseUntil, t, { staff: true, carrying: w.delivered ? undefined : w.item }),
      });
    }

    const avatars = [
      ...[...this.others.values()].map((a) => ({ p: a.p, x: a.rx, y: a.ry, self: false })),
      ...(me ? [{ p: me, x: me.x, y: me.y, self: true }] : []),
    ];
    const drawOrder = [...avatars.map((a) => ({ y: a.y, a })), ...npcs.map((n) => ({ y: n.y, n }))].sort((a, b) => a.y - b.y);

    const now = Date.now();
    for (const item of drawOrder) {
      if ('n' in item) {
        item.n.draw();
        continue;
      }
      const a = item.a;
      const fx = a.x * TILE;
      const fy = a.y * TILE;
      const sitting = !a.p.moving && this.map.isSeat(a.x, a.y - 0.01);
      drawAvatar(ctx, fx, fy, a.p.color, a.p.dir, a.p.moving, t, { sitting });
      drawLabel(ctx, a.self ? 'YOU' : a.p.name.split(' ')[0]!.toUpperCase(), fx, fy - 27, a.self ? '#ffe04a' : '#f4f1ff');
      const b = this.bubbles.get(a.p.id);
      if (b && b.until > now) drawBubble(ctx, b.text, fx, fy - 28);
    }

    this.drawPlates(); // over people, so a diner's name tag never hides the food

    if (this.target) {
      ctx.fillStyle = 'rgba(255,224,74,0.8)';
      const tx = Math.round(this.target.x * TILE);
      const ty = Math.round(this.target.y * TILE);
      ctx.fillRect(tx - 3, ty, 7, 1);
      ctx.fillRect(tx, ty - 3, 1, 7);
    }
  }
}
