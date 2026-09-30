import type { Facing } from '@adda/shared';
import { H, hash, T, TILE, W, type CampusMap } from './map';

// Pixel-art rendering with plain fillRects, in the Arcade palette.
const C = {
  grass: '#1d4d3a',
  grass2: '#225a43',
  blade: '#2c7154',
  path: '#3a2f66',
  pathDot: '#4a3d80',
  floor: '#2c2058',
  floorLine: '#34276a',
  wall: '#b9aee8',
  wallTop: '#f4f1ff',
  wallShade: '#6a4bd8',
  treeDark: '#145c3c',
  tree: '#1f8a55',
  treeLight: '#3ef2a0',
  trunk: '#4a2f1c',
  water: '#1a8f9e',
  waterLight: '#3ef2e0',
  wood: '#b07b2c',
  woodTop: '#ffe04a',
  shelf: '#6a2a4f',
  books: ['#ff3ea5', '#3ef2e0', '#ffe04a', '#7cff6b'],
  stage: '#5a1f4a',
  stageTop: '#ff3ea5',
  pc: '#100a22',
  screen: '#3ef2e0',
  flower: ['#ff3ea5', '#ffe04a', '#f4f1ff'],
  label: '#ffe04a',
  labelBg: '#170f2e',
  deck: '#6b4a2b',
  deckLine: '#7d5733',
  seat: ['#ff3ea5', '#3ef2e0', '#ffe04a', '#7cff6b'],
  awning: ['#ff3ea5', '#f4f1ff'],
  canopy: ['#ffe04a', '#ff8a3d'],
  felt: '#1f8a55',
  fire: ['#ff8a3d', '#ffe04a'],
  stone: '#8a80b8',
  cup: '#f4f1ff',
};

function tile(ctx: CanvasRenderingContext2D, t: T, x: number, y: number) {
  const px = x * TILE;
  const py = y * TILE;
  const n = hash(x, y);
  const r = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(px + dx, py + dy, w, h);
  };
  const deck = () => {
    r(0, 0, 16, 16, C.deck);
    r(0, 3, 16, 1, C.deckLine);
    r(0, 8, 16, 1, C.deckLine);
    r(0, 13, 16, 1, C.deckLine);
  };
  const grass = () => {
    r(0, 0, 16, 16, n % 2 ? C.grass : C.grass2);
    for (let i = 0; i < 3; i++) r((n * (i + 3)) % 14, (n * (i + 7)) % 14, 1, 2, C.blade);
  };

  switch (t) {
    case T.Grass:
      return grass();
    case T.Flower:
      grass();
      r(5, 6, 2, 2, C.flower[n % 3]!);
      r(10, 10, 2, 2, C.flower[(n + 1) % 3]!);
      return;
    case T.Path:
      r(0, 0, 16, 16, C.path);
      if (n % 3 === 0) r((n % 12) + 2, (n % 9) + 3, 2, 1, C.pathDot);
      return;
    case T.Floor:
    case T.Stage: {
      const stage = t === T.Stage;
      r(0, 0, 16, 16, stage ? C.stage : C.floor);
      r(0, 15, 16, 1, stage ? C.stageTop : C.floorLine);
      r(15, 0, 1, 16, stage ? C.stageTop : C.floorLine);
      return;
    }
    case T.Wall:
      r(0, 0, 16, 16, C.wall);
      r(0, 0, 16, 3, C.wallTop);
      r(0, 13, 16, 3, C.wallShade);
      return;
    case T.Tree:
      grass();
      r(7, 11, 3, 5, C.trunk);
      r(2, 3, 12, 9, C.treeDark);
      r(3, 2, 10, 8, C.tree);
      r(5, 3, 3, 2, C.treeLight);
      return;
    case T.Water:
      r(0, 0, 16, 16, C.water);
      r((n % 10) + 2, (n % 7) + 3, 4, 1, C.waterLight);
      return;
    case T.Bench:
      grass();
      r(1, 6, 14, 3, C.wood);
      r(1, 5, 14, 1, C.woodTop);
      r(2, 9, 2, 4, C.wood);
      r(12, 9, 2, 4, C.wood);
      return;
    case T.Desk:
    case T.Counter:
      r(0, 0, 16, 16, C.floor);
      r(1, 4, 14, 8, C.wood);
      r(1, 3, 14, 2, C.woodTop);
      return;
    case T.Pc:
      r(0, 0, 16, 16, C.floor);
      r(1, 8, 14, 5, C.wood);
      r(4, 2, 8, 6, C.pc);
      r(5, 3, 6, 4, C.screen);
      return;
    case T.Deck:
      return deck();
    case T.Seat:
      r(0, 0, 16, 16, C.floor);
      r(4, 12, 2, 3, C.wood);
      r(10, 12, 2, 3, C.wood);
      r(3, 8, 10, 4, C.seat[n % 4]!);
      r(3, 8, 10, 1, C.cup);
      return;
    case T.Table:
      r(0, 0, 16, 16, C.floor);
      r(7, 9, 2, 6, C.wood);
      r(1, 4, 14, 6, C.wood);
      r(1, 3, 14, 2, C.woodTop);
      r(4 + (n % 5), 1, 3, 3, C.cup); // a cup of chai
      return;
    case T.Stall:
      r(0, 0, 16, 16, C.floor);
      r(0, 7, 16, 9, C.wood);
      r(0, 7, 16, 2, C.woodTop);
      for (let i = 0; i < 4; i++) r(i * 4, 0, 4, 5, C.awning[i % 2]!);
      r(0, 5, 16, 1, C.wallShade);
      r(3 + (n % 3) * 3, 3, 3, 4, C.seat[n % 4]!); // something tasty on display
      return;
    case T.Umbrella:
      deck();
      r(7, 6, 2, 9, C.trunk);
      r(3, 10, 10, 3, C.wood);
      r(3, 9, 10, 1, C.woodTop);
      for (let i = 0; i < 4; i++) r(i * 4, 1, 4, 5, C.canopy[i % 2]!);
      r(1, 0, 14, 1, C.canopy[0]!);
      return;
    case T.Beanbag:
      deck();
      r(2, 7, 12, 8, C.seat[n % 4]!);
      r(3, 5, 10, 3, C.seat[n % 4]!);
      r(4, 6, 4, 2, C.cup);
      return;
    case T.Fire:
      deck();
      r(1, 11, 14, 4, C.stone);
      r(3, 9, 10, 3, C.trunk);
      r(4, 4, 8, 6, C.fire[0]!);
      r(6, 1, 4, 6, C.fire[1]!);
      return;
    case T.Game:
      r(0, 0, 16, 16, C.floor);
      r(1, 2, 14, 12, C.wood);
      r(2, 3, 12, 10, C.felt);
      r(7, 7, 2, 2, C.woodTop);
      r(3, 4, 2, 2, C.pc);
      r(11, 10, 2, 2, C.pc);
      return;
    case T.Shelf:
      r(0, 0, 16, 16, C.shelf);
      for (let i = 0; i < 5; i++) r(1 + i * 3, 2, 2, 5, C.books[(n + i) % 4]!), r(1 + i * 3, 9, 2, 5, C.books[(n + i + 2) % 4]!);
      return;
  }
}

/** Draws the static map once; the game loop just blits it. */
export function prerenderMap(map: CampusMap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W * TILE;
  canvas.height = H * TILE;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) tile(ctx, map.at(x, y), x, y);

  // Building signs on the top wall.
  ctx.font = '8px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const b of map.buildings) {
    const cx = (b.x + b.w / 2) * TILE;
    const cy = b.y * TILE + 8;
    const w = ctx.measureText(b.label).width + 10;
    ctx.fillStyle = C.labelBg;
    ctx.fillRect(Math.round(cx - w / 2), cy - 6, Math.round(w), 12);
    ctx.fillStyle = C.label;
    ctx.fillText(b.label, cx, cy + 1);
  }
  // Open-air labels.
  ctx.fillStyle = C.label;
  const outdoor = [
    ['EVENT GROUND', 46, 27.5],
    ['MAIN GATE', 28, 35.5],
    ['FOOD STREET', 69, 0.5],
    ['ADDA LAWN', 62, 15.5],
    ['CHILL GARDEN', 62, 27.5],
  ] as const;
  for (const [label, x, y] of outdoor) {
    const w = ctx.measureText(label).width + 10;
    ctx.fillStyle = C.labelBg;
    ctx.fillRect(Math.round(x * TILE - w / 2), y * TILE - 6, Math.round(w), 12);
    ctx.fillStyle = C.label;
    ctx.fillText(label, x * TILE, y * TILE + 1);
  }
  return canvas;
}

const SKIN = '#f1c27d';
const HAIR = '#2b1d0e';
const LEGS = '#100a22';
const UNIFORM_WHITE = '#f4f1ff';

/** 12x16 pixel avatar anchored at the feet (world px). */
/**
 * `staff` draws a café worker: `color` becomes the uniform, with a white cap and apron.
 * `carrying` is a dish (emoji) held up in front.
 */
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  color: string,
  dir: Facing,
  moving: boolean,
  t: number,
  { sitting = false, staff = false, carrying }: { sitting?: boolean; staff?: boolean; carrying?: string } = {}
) {
  const x = Math.round(fx - 6);
  const y = Math.round(fy - 16) + (sitting ? 3 : 0); // sitting drops the body onto the seat
  const r = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + dx, y + dy, w, h);
  };
  const step = moving ? Math.floor(t / 140) % 2 : -1;

  if (sitting) {
    // legs tucked forward instead of standing
    r(2, 12, 8, 1, LEGS);
    if (dir !== 'up') r(3, 13, 2, 1, LEGS), r(7, 13, 2, 1, LEGS);
  } else {
    r(2, 15, 8, 1, 'rgba(0,0,0,0.35)'); // shadow
    // legs
    r(3, 12, 2, step === 0 ? 3 : 4, LEGS);
    r(7, 12, 2, step === 1 ? 3 : 4, LEGS);
  }
  // body + arms
  r(2, 7, 8, 6, color);
  r(1, 8, 1, 4, SKIN);
  r(10, 8, 1, 4, SKIN);
  // head
  r(2, 0, 8, 7, SKIN);
  r(2, 0, 8, dir === 'up' ? 6 : 2, HAIR);
  if (dir === 'left') r(2, 2, 2, 3, HAIR);
  if (dir === 'right') r(8, 2, 2, 3, HAIR);
  if (dir === 'down') r(4, 4, 1, 1, LEGS), r(7, 4, 1, 1, LEGS);
  if (dir === 'left') r(4, 4, 1, 1, LEGS);
  if (dir === 'right') r(7, 4, 1, 1, LEGS);

  if (staff) {
    r(1, -2, 10, 3, UNIFORM_WHITE); // cap
    r(3, -4, 6, 2, UNIFORM_WHITE);
    if (dir !== 'up') r(3, 8, 6, 5, UNIFORM_WHITE); // apron
  }
  if (carrying) {
    r(0, 7, 12, 1, UNIFORM_WHITE); // tray
    ctx.font = '7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(carrying, x + 6, y + 7);
  }
}

export function drawLabel(ctx: CanvasRenderingContext2D, text: string, cx: number, top: number, fg: string, bg = 'rgba(16,10,34,0.85)') {
  ctx.font = '8px VT323';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const w = Math.ceil(ctx.measureText(text).width) + 4;
  ctx.fillStyle = bg;
  ctx.fillRect(Math.round(cx - w / 2), top, w, 9);
  ctx.fillStyle = fg;
  ctx.fillText(text, cx, top + 1);
}

/** Wrapped speech bubble, bottom edge at `bottom`. */
export function drawBubble(ctx: CanvasRenderingContext2D, text: string, cx: number, bottom: number) {
  ctx.font = '8px VT323';
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > 70 && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 4);
  const width = Math.ceil(Math.max(...shown.map((l) => ctx.measureText(l).width))) + 6;
  const height = shown.length * 8 + 4;
  const left = Math.round(cx - width / 2);
  const top = bottom - height - 3;
  ctx.fillStyle = '#f4f1ff';
  ctx.fillRect(left, top, width, height);
  ctx.fillRect(Math.round(cx) - 1, top + height, 3, 3);
  ctx.fillStyle = '#170f2e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  shown.forEach((l, i) => ctx.fillText(l, cx, top + 2 + i * 8));
}
