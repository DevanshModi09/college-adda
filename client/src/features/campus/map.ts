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

  // Roads: main east-west avenue, south avenue, central north-south spine, the plaza.
  rect(0, 13, W, 2, T.Path);
  rect(0, 25, W, 2, T.Path);
  rect(27, 0, 2, H, T.Path);
  rect(22, 15, 12, 10, T.Path);
  rect(26, 18, 4, 3, T.Water); // fountain

  building('VIB BLOCK', 2, 1, 20, 11, [[12, 11], [13, 11]]);
  building('NYB BLOCK', 34, 1, 20, 11, [[43, 11], [44, 11]]);
  building('LIBRARY', 2, 16, 16, 8, [[17, 19], [17, 20]]);
  building('CODE LAB', 38, 16, 16, 8, [[38, 19], [38, 20]]);
  building('CANTEEN', 2, 28, 16, 7, [[9, 28], [10, 28]]);

  // Short paths from doors to the roads.
  rect(12, 12, 2, 1, T.Path);
  rect(43, 12, 2, 1, T.Path);
  rect(18, 19, 4, 2, T.Path);
  rect(34, 19, 4, 2, T.Path);
  rect(9, 27, 2, 1, T.Path);

  // Classrooms: desk rows with a centre aisle.
  for (const bx of [2, 34]) {
    for (const y of [3, 5, 7, 9]) {
      for (let x = bx + 3; x < bx + 17; x += 3) if (Math.abs(x - (bx + 10)) > 1) {
        set(x, y, T.Desk);
        set(x + 1, y, T.Desk);
      }
    }
  }
  // Library shelves.
  for (const y of [18, 20, 22]) for (let x = 4; x < 15; x++) if (x !== 9) set(x, y, T.Shelf);
  // Code lab: rows of PCs.
  for (const y of [18, 21]) for (let x = 41; x < 52; x += 2) set(x, y, T.Pc);
  // Canteen: counter + tables.
  rect(4, 29, 6, 1, T.Counter);
  for (const [x, y] of [[5, 32], [8, 32], [11, 31], [14, 31], [11, 33], [14, 33]]) set(x!, y!, T.Desk);

  // Event ground: open-air stage and benches.
  rect(41, 28, 10, 2, T.Stage);
  for (let x = 40; x < 53; x += 3) {
    set(x, 32, T.Bench);
    set(x + 1, 32, T.Bench);
  }
  rect(44, 27, 2, 1, T.Path);

  // Plaza benches and the main gate.
  for (const [x, y] of [[23, 16], [32, 16], [23, 23], [32, 23]]) set(x!, y!, T.Bench);
  set(26, 34, T.Wall);
  set(29, 34, T.Wall);
  set(26, 35, T.Wall);
  set(29, 35, T.Wall);

  // ---------- Food street (east side): cafés and places to hang out ----------
  rect(68, 0, 2, H, T.Path); // the food street itself

  // Chai tapri: counter, then a table for 2, a table for 4, a table for 3 and another for 2.
  building('CHAI TAPRI', 57, 1, 10, 11, [[61, 11], [62, 11]]);
  rect(61, 12, 2, 1, T.Path);
  rect(59, 3, 6, 1, T.Counter);
  table('chai', 59, 6, 2);
  table('chai', 64, 6, 4);
  table('chai', 59, 9, 3);
  table('chai', 64, 9, 2);

  // Food court: three stalls along the back wall, tables either side of the aisle.
  building('FOOD COURT', 71, 1, 12, 11, [[76, 11], [77, 11]]);
  rect(76, 12, 2, 1, T.Path);
  for (const x of [72, 76, 80]) rect(x, 3, 2, 1, T.Stall);
  table('foodcourt', 73, 6, 4);
  table('foodcourt', 80, 6, 4);
  table('foodcourt', 73, 9, 3);
  table('foodcourt', 80, 9, 2);

  // Adda lawn: open-air deck, umbrella tables with bean bags, and a juice cart.
  rect(57, 16, 10, 8, T.Deck);
  rect(61, 16, 2, 1, T.Stall);
  table('lawn', 59, 18, 2, true);
  table('lawn', 64, 18, 4, true);
  table('lawn', 59, 21, 3, true);
  table('lawn', 64, 21, 2, true);

  // Maggi point: door onto the food street.
  building('MAGGI POINT', 71, 16, 12, 8, [[71, 19], [71, 20]]);
  rect(70, 19, 1, 2, T.Path);
  rect(74, 18, 8, 1, T.Counter); // staff work behind it, along the back wall
  table('maggi', 74, 19, 2);
  table('maggi', 78, 20, 4);
  table('maggi', 74, 21, 3);

  // Game zone: carrom + foosball with seats, arcade cabinets along the back.
  building('GAME ZONE', 71, 28, 12, 7, [[76, 28], [77, 28]]);
  rect(76, 27, 2, 1, T.Path);
  for (const x of [73, 79]) {
    rect(x, 30, 2, 1, T.Game);
    set(x - 1, 30, T.Seat);
    set(x + 2, 30, T.Seat);
  }
  for (const x of [73, 75, 79, 81]) set(x, 33, T.Pc);

  // Chill garden: bonfire ringed by bean bags.
  rect(57, 28, 10, 7, T.Deck);
  rect(61, 31, 2, 1, T.Fire);
  for (const [x, y] of [[61, 29], [62, 29], [59, 30], [64, 30], [59, 32], [64, 32], [61, 33], [62, 33]] as const) set(x, y, T.Beanbag);

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
    { id: 'vib', label: 'VIB BLOCK', x: 3, y: 2, w: 18, h: 9 },
    { id: 'nyb', label: 'NYB BLOCK', x: 35, y: 2, w: 18, h: 9 },
    { id: 'library', label: 'LIBRARY', x: 3, y: 17, w: 14, h: 6 },
    { id: 'codelab', label: 'CODE LAB', x: 39, y: 17, w: 14, h: 6 },
    { id: 'canteen', label: 'CANTEEN', x: 3, y: 29, w: 14, h: 5 },
    { id: 'events', label: 'EVENT GROUND', x: 38, y: 27, w: 16, h: 8 },
    { id: 'plaza', label: 'FOUNTAIN PLAZA', x: 22, y: 15, w: 12, h: 10 },
    { id: 'gate', label: 'MAIN GATE', x: 25, y: 30, w: 6, h: 6 },
    { id: 'chai', label: 'CHAI TAPRI', x: 58, y: 2, w: 8, h: 9 },
    { id: 'foodcourt', label: 'FOOD COURT', x: 72, y: 2, w: 10, h: 9 },
    { id: 'lawn', label: 'ADDA LAWN', x: 57, y: 16, w: 10, h: 8 },
    { id: 'maggi', label: 'MAGGI POINT', x: 72, y: 17, w: 10, h: 6 },
    { id: 'gamezone', label: 'GAME ZONE', x: 72, y: 29, w: 10, h: 5 },
    { id: 'garden', label: 'CHILL GARDEN', x: 57, y: 28, w: 10, h: 7 },
  ];

  const at = (x: number, y: number): T => (x < 0 || y < 0 || x >= W || y >= H ? T.Wall : (tiles[y * W + x] as T));
  const counters: Counter[] = [
    {
      zone: 'chai',
      uniform: '#ff8a3d',
      kitchen: [65, 2],
      staff: [{ x: 60, y: 2, name: 'RAJU' }, { x: 62, y: 2, name: 'CHOTU' }, { x: 64, y: 2, name: 'PAPPU' }],
    },
    {
      zone: 'foodcourt',
      uniform: '#ff3ea5',
      kitchen: [75, 2],
      staff: [{ x: 73, y: 2, name: 'SUNIL' }, { x: 77, y: 2, name: 'PINKY' }, { x: 81, y: 2, name: 'AMAN' }],
    },
    {
      zone: 'maggi',
      uniform: '#ffe04a',
      kitchen: [73, 17],
      staff: [{ x: 75, y: 17, name: 'BABLU' }, { x: 78, y: 17, name: 'MONU' }, { x: 80, y: 17, name: 'GOLU' }],
    },
    { zone: 'lawn', uniform: '#7cff6b', kitchen: [60, 16], staff: [{ x: 63, y: 16, name: 'KAKA' }, { x: 60, y: 17, name: 'LALLU' }] },
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
