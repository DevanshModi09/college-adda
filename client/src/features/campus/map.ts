import { WORLD_SIZE } from '@adda/shared';

// A stylised JECRC campus, built in code (no image assets). Tile units throughout.
// Inspired by the real campus layout, not a survey of it.

export const W = WORLD_SIZE.w;
export const H = WORLD_SIZE.h;
export const TILE = 16; // source pixels per tile

export const T = {
  Grass: 0,
  Path: 1,
  Floor: 2,
  Wall: 3,
  Tree: 4,
  Water: 5,
  Bench: 6,
  Desk: 7,
  Shelf: 8,
  Counter: 9,
  Stage: 10,
  Flower: 11,
  Pc: 12,
  // Food street + hangouts
  Deck: 13, // outdoor wooden deck, walkable
  Seat: 14, // indoor stool, walkable: stop on it to sit
  Table: 15, // small café table
  Stall: 16, // food stall with an awning
  Umbrella: 17, // outdoor table under an umbrella
  Beanbag: 18, // outdoor bean bag, walkable: stop on it to sit
  Fire: 19, // bonfire
  Game: 20, // carrom / foosball table
} as const;
export type T = (typeof T)[keyof typeof T];

const BLOCKING = new Set<T>([T.Wall, T.Tree, T.Water, T.Bench, T.Desk, T.Shelf, T.Counter, T.Pc, T.Table, T.Stall, T.Umbrella, T.Fire, T.Game]);
const SEATS = new Set<T>([T.Seat, T.Beanbag]);

export type ZoneId =
  | 'gate'
  | 'plaza'
  | 'vib'
  | 'nyb'
  | 'library'
  | 'codelab'
  | 'canteen'
  | 'events'
  | 'chai'
  | 'foodcourt'
  | 'lawn'
  | 'maggi'
  | 'gamezone'
  | 'garden';

export interface Zone {
  id: ZoneId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Building {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A café table and the seats around it. Sitting on a seat puts you at the table. */
export interface DiningTable {
  id: string;
  zone: ZoneId;
  size: 2 | 3 | 4;
  x: number;
  y: number;
  seats: [number, number][];
}

/** A food counter: its staff (in uniform) and where the waiter comes out from. */
export interface Counter {
  zone: ZoneId;
  uniform: string;
  /** Walkable tile the waiter starts from and returns to. */
  kitchen: [number, number];
  staff: { x: number; y: number; name: string }[];
}

export interface CampusMap {
  tiles: Uint8Array;
  tables: DiningTable[];
  counters: Counter[];
  zones: Zone[];
  buildings: Building[];
  at: (x: number, y: number) => T;
  blocked: (x: number, y: number) => boolean;
  /** Standing still here makes you sit down. */
  isSeat: (x: number, y: number) => boolean;
  /** The café table whose seat is at this position, if any. */
  tableAt: (x: number, y: number) => DiningTable | null;
  zoneAt: (x: number, y: number) => Zone | null;
}

/** Deterministic per-tile noise so the map looks the same for everyone. */
export const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) % 1000;
};

export function buildCampus(): CampusMap {
  const tiles = new Uint8Array(W * H).fill(T.Grass);
  const set = (x: number, y: number, t: T) => {
    if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = t;
  };
  const rect = (x: number, y: number, w: number, h: number, t: T) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, t);
  };
  const buildings: Building[] = [];
  const tables: DiningTable[] = [];
  /**
   * A café table with 2, 3 or 4 seats: left + right, then above, then below
   * (above first so a 3-seat table's third diner doesn't hide the plates).
   * `outdoor` uses an umbrella table and bean bags instead of a table and stools.
   */
  const table = (zone: ZoneId, x: number, y: number, size: 2 | 3 | 4, outdoor = false) => {
    const seats: [number, number][] = ([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as [number, number][]).slice(0, size);
    set(x, y, outdoor ? T.Umbrella : T.Table);
    for (const [sx, sy] of seats) set(sx, sy, outdoor ? T.Beanbag : T.Seat);
    tables.push({ id: `t${tables.length + 1}`, zone, size, x, y, seats });
  };
  const building = (label: string, x: number, y: number, w: number, h: number, doors: [number, number][]) => {
    rect(x, y, w, h, T.Wall);
    rect(x + 1, y + 1, w - 2, h - 2, T.Floor);
    for (const [dx, dy] of doors) set(dx, dy, T.Floor);
    buildings.push({ label, x, y, w, h });
  };

  // Roads (3 wide): main east-west avenue, south avenue, central north-south spine, the plaza.
  rect(0, 20, W, 3, T.Path);
  rect(0, 38, W, 3, T.Path);
  rect(40, 0, 3, H, T.Path);
  rect(33, 23, 17, 15, T.Path);
  rect(38, 28, 7, 5, T.Water); // fountain

  building('VIB BLOCK', 3, 2, 30, 16, [[17, 17], [18, 17]]);
  building('NYB BLOCK', 50, 2, 30, 16, [[64, 17], [65, 17]]);
  building('LIBRARY', 3, 24, 24, 12, [[26, 29], [26, 30]]);
  building('CODE LAB', 57, 24, 24, 12, [[57, 29], [57, 30]]);
  building('CANTEEN', 3, 42, 24, 11, [[14, 42], [15, 42]]);

  // Short paths from doors to the roads.
  rect(17, 18, 2, 2, T.Path);
  rect(64, 18, 2, 2, T.Path);
  rect(27, 29, 6, 2, T.Path);
  rect(50, 29, 7, 2, T.Path);
  rect(14, 41, 2, 1, T.Path);

  // Classrooms: rows of two-seat desks with room between them and a centre aisle to the door.
  for (const bx of [3, 50]) {
    for (const y of [5, 8, 11, 14]) {
      for (let x = bx + 3; x + 1 < bx + 27; x += 4) if (x + 1 < bx + 13 || x > bx + 16) {
        set(x, y, T.Desk);
        set(x + 1, y, T.Desk);
      }
    }
  }
  // Library shelves.
  for (const y of [26, 29, 32]) for (let x = 5; x < 24; x++) if (x < 13 || x > 14) set(x, y, T.Shelf);
  // Code lab: rows of PCs.
  for (const y of [27, 32]) for (let x = 61; x < 79; x += 3) set(x, y, T.Pc);
  // Canteen: counter + tables.
  rect(5, 44, 7, 1, T.Counter);
  for (const y of [47, 50]) for (const x of [6, 10, 14, 18, 22]) set(x, y, T.Desk);

  // Event ground: open-air stage and benches.
  rect(62, 42, 15, 3, T.Stage);
  for (let x = 59; x < 80; x += 4) {
    for (const y of [48, 51]) {
      set(x, y, T.Bench);
      set(x + 1, y, T.Bench);
    }
  }
  rect(68, 41, 2, 1, T.Path);

  // Plaza benches and the main gate.
  for (const [x, y] of [[34, 24], [48, 24], [34, 36], [48, 36]]) set(x!, y!, T.Bench);
  for (const y of [52, 53]) {
    set(39, y, T.Wall);
    set(43, y, T.Wall);
  }

  // ---------- Food street (east side): cafés and places to hang out ----------
  rect(102, 0, 3, H, T.Path); // the food street itself

  // Chai tapri: counter, then a table for 2, a table for 4, a table for 3 and another for 2.
  building('CHAI TAPRI', 85, 2, 15, 16, [[92, 17], [93, 17]]);
  rect(92, 18, 2, 2, T.Path);
  rect(88, 4, 9, 1, T.Counter);
  table('chai', 89, 9, 2);
  table('chai', 95, 9, 4);
  table('chai', 89, 13, 3);
  table('chai', 95, 13, 2);

  // Food court: three stalls along the back wall, tables either side of the aisle.
  building('FOOD COURT', 106, 2, 18, 16, [[114, 17], [115, 17]]);
  rect(114, 18, 2, 2, T.Path);
  for (const x of [108, 113, 118]) rect(x, 4, 2, 1, T.Stall);
  table('foodcourt', 110, 9, 4);
  table('foodcourt', 119, 9, 4);
  table('foodcourt', 110, 13, 3);
  table('foodcourt', 119, 13, 2);

  // Adda lawn: open-air deck, umbrella tables with bean bags, and a juice cart.
  rect(85, 24, 15, 12, T.Deck);
  rect(91, 25, 2, 1, T.Stall);
  table('lawn', 88, 29, 2, true);
  table('lawn', 96, 29, 4, true);
  table('lawn', 88, 33, 3, true);
  table('lawn', 96, 33, 2, true);

  // Maggi point: door onto the food street.
  building('MAGGI POINT', 106, 24, 18, 12, [[106, 29], [106, 30]]);
  rect(105, 29, 1, 2, T.Path);
  rect(110, 26, 10, 1, T.Counter); // staff work behind it, along the back wall
  table('maggi', 111, 29, 2);
  table('maggi', 118, 30, 4);
  table('maggi', 111, 33, 3);

  // Game zone: carrom + foosball with seats, arcade cabinets along the back.
  building('GAME ZONE', 106, 42, 18, 11, [[114, 42], [115, 42]]);
  rect(114, 41, 2, 1, T.Path);
  for (const x of [110, 118]) {
    rect(x, 46, 2, 1, T.Game);
    set(x - 1, 46, T.Seat);
    set(x + 2, 46, T.Seat);
  }
  for (const x of [109, 112, 117, 120]) set(x, 50, T.Pc);

  // Chill garden: bonfire ringed by bean bags.
  rect(85, 42, 15, 11, T.Deck);
  rect(91, 46, 2, 1, T.Fire);
  for (const [x, y] of [[91, 43], [92, 43], [87, 45], [96, 45], [87, 47], [96, 47], [91, 49], [92, 49]] as const) set(x, y, T.Beanbag);

  // Trees and flowers on open grass, kept off anything walkable-important.
  const nearNonGrass = (x: number, y: number) => {
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const xx = x + i;
        const yy = y + j;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && tiles[yy * W + xx] !== T.Grass) return true;
      }
    return false;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (tiles[y * W + x] !== T.Grass) continue;
      const edge = x === 0 || x === W - 1 || y === H - 1;
      const n = hash(x, y);
      if ((edge && n % 3 !== 0 && !nearNonGrass(x, y)) || (n < 55 && !nearNonGrass(x, y))) set(x, y, T.Tree);
      else if (n > 930) set(x, y, T.Flower);
    }

  const zones: Zone[] = [
    { id: 'vib', label: 'VIB BLOCK', x: 4, y: 3, w: 28, h: 14 },
    { id: 'nyb', label: 'NYB BLOCK', x: 51, y: 3, w: 28, h: 14 },
    { id: 'library', label: 'LIBRARY', x: 4, y: 25, w: 22, h: 10 },
    { id: 'codelab', label: 'CODE LAB', x: 58, y: 25, w: 22, h: 10 },
    { id: 'canteen', label: 'CANTEEN', x: 4, y: 43, w: 22, h: 9 },
    { id: 'events', label: 'EVENT GROUND', x: 57, y: 41, w: 25, h: 12 },
    { id: 'plaza', label: 'FOUNTAIN PLAZA', x: 33, y: 23, w: 17, h: 15 },
    { id: 'gate', label: 'MAIN GATE', x: 37, y: 45, w: 9, h: 9 },
    { id: 'chai', label: 'CHAI TAPRI', x: 86, y: 3, w: 13, h: 14 },
    { id: 'foodcourt', label: 'FOOD COURT', x: 107, y: 3, w: 16, h: 14 },
    { id: 'lawn', label: 'ADDA LAWN', x: 85, y: 24, w: 15, h: 12 },
    { id: 'maggi', label: 'MAGGI POINT', x: 107, y: 25, w: 16, h: 10 },
    { id: 'gamezone', label: 'GAME ZONE', x: 107, y: 43, w: 16, h: 9 },
    { id: 'garden', label: 'CHILL GARDEN', x: 85, y: 42, w: 15, h: 11 },
  ];

  const at = (x: number, y: number): T => (x < 0 || y < 0 || x >= W || y >= H ? T.Wall : (tiles[y * W + x] as T));
  const counters: Counter[] = [
    {
      zone: 'chai',
      uniform: '#ff8a3d',
      kitchen: [98, 3],
      staff: [{ x: 89, y: 3, name: 'RAJU' }, { x: 92, y: 3, name: 'CHOTU' }, { x: 95, y: 3, name: 'PAPPU' }],
    },
    {
      zone: 'foodcourt',
      uniform: '#ff3ea5',
      kitchen: [111, 3],
      staff: [{ x: 109, y: 3, name: 'SUNIL' }, { x: 114, y: 3, name: 'PINKY' }, { x: 119, y: 3, name: 'AMAN' }],
    },
    {
      zone: 'maggi',
      uniform: '#ffe04a',
      kitchen: [108, 25],
      staff: [{ x: 111, y: 25, name: 'BABLU' }, { x: 114, y: 25, name: 'MONU' }, { x: 117, y: 25, name: 'GOLU' }],
    },
    { zone: 'lawn', uniform: '#7cff6b', kitchen: [90, 25], staff: [{ x: 94, y: 25, name: 'KAKA' }, { x: 90, y: 26, name: 'LALLU' }] },
  ];

  const seatTable = new Map<number, DiningTable>();
  for (const t of tables) for (const [sx, sy] of t.seats) seatTable.set(sy * W + sx, t);

  return {
    tiles,
    tables,
    counters,
    zones,
    buildings,
    at,
    blocked: (x, y) => BLOCKING.has(at(Math.floor(x), Math.floor(y))),
    isSeat: (x, y) => SEATS.has(at(Math.floor(x), Math.floor(y))),
    tableAt: (x, y) => seatTable.get(Math.floor(y) * W + Math.floor(x)) ?? null,
    zoneAt: (x, y) => zones.find((z) => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) ?? null,
  };
}

/** Feet hitbox (in tiles) around the player's anchor point. */
const HALF_W = 0.28;
const HEIGHT = 0.3;

export function canStand(map: CampusMap, x: number, y: number): boolean {
  return (
    !map.blocked(x - HALF_W, y - HEIGHT) &&
    !map.blocked(x + HALF_W, y - HEIGHT) &&
    !map.blocked(x - HALF_W, y - 0.01) &&
    !map.blocked(x + HALF_W, y - 0.01)
  );
}

/**
 * Shortest walk over whole tiles (4-way BFS) from a tile to the nearest tile matching `goal`.
 * Returns the tiles to step through, excluding the start; null if none is reachable within `maxSteps`.
 */
export function findPath(map: CampusMap, from: [number, number], goal: (x: number, y: number) => boolean, maxSteps = 400): [number, number][] | null {
  const key = (x: number, y: number) => y * W + x;
  const prev = new Map<number, number>([[key(...from), -1]]);
  let frontier: [number, number][] = [from];
  for (let step = 0; step < maxSteps && frontier.length; step++) {
    const next: [number, number][] = [];
    for (const [x, y] of frontier) {
      if (goal(x, y) && step > 0) {
        const path: [number, number][] = [];
        for (let k = key(x, y); k !== key(...from); k = prev.get(k)!) path.unshift([k % W, Math.floor(k / W)]);
        return path;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev.has(key(nx, ny)) || map.blocked(nx + 0.5, ny + 0.5)) continue;
        prev.set(key(nx, ny), key(x, y));
        next.push([nx, ny]);
      }
    }
    frontier = next;
  }
  return null;
}

/** Where a character stands on a tile: centred, feet near the bottom. */
export const standOn = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.75 });
