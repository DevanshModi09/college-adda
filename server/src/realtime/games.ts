import crypto from 'node:crypto';
import { C4, RPS_TO_WIN, type GameKind, type GamePlayer, type GameState } from '@adda/shared';

// Two-player mini games for the Game Zone. In-memory like the world: a game lives
// as long as the server process, and each player is in at most one game at a time.

interface Game {
  id: string;
  kind: GameKind;
  players: [GamePlayer, GamePlayer];
  status: GameState['status'];
  board: number[];
  turn: 0 | 1;
  winner: 0 | 1 | null;
  line: number[];
  rounds: [number, number][];
  score: [number, number];
  picks: [number | null, number | null];
  ended?: GameState['ended'];
  updatedAt: number;
}

export class GameError extends Error {}

const games = new Map<string, Game>();
/** userId -> id of the game they're invited to or playing. */
const active = new Map<string, string>();

const TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function tttWinner(b: number[]): number[] {
  return TTT_LINES.find(([a, c, d]) => b[a!] && b[a!] === b[c!] && b[a!] === b[d!]) ?? [];
}

/** Four in a row through the cell just played, or []. */
function c4Line(b: number[], at: number): number[] {
  const { cols, rows } = C4;
  const r0 = Math.floor(at / cols);
  const c0 = at % cols;
  const who = b[at];
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]] as const) {
    const cells = [at];
    for (const sign of [1, -1]) {
      for (let k = 1; k < 4; k++) {
        const r = r0 + dr * k * sign;
        const c = c0 + dc * k * sign;
        if (r < 0 || r >= rows || c < 0 || c >= cols || b[r * cols + c] !== who) break;
        cells.push(r * cols + c);
      }
    }
    if (cells.length >= 4) return cells;
  }
  return [];
}

/** 0 rock, 1 paper, 2 scissors: paper beats rock, scissors beat paper, rock beats scissors. */
const rpsBeats = (a: number, b: number) => (a - b + 3) % 3 === 1;

function finish(g: Game, winner: 0 | 1 | null) {
  g.status = 'done';
  g.winner = winner;
  for (const p of g.players) if (active.get(p.id) === g.id) active.delete(p.id);
}

function get(gameId: string, userId: string): { g: Game; seat: 0 | 1 } {
  const g = games.get(gameId);
  const seat = g?.players.findIndex((p) => p.id === userId);
  if (!g || seat === undefined || seat < 0) throw new GameError('Game not found');
  return { g, seat: seat as 0 | 1 };
}

export const gameRules = {
  invite(from: GamePlayer, to: GamePlayer, kind: GameKind): Game {
    if (from.id === to.id) throw new GameError("You can't challenge yourself");
    if (active.has(from.id)) throw new GameError('Finish your current game first');
    if (active.has(to.id)) throw new GameError(`${to.name} is already in a game`);
    const g: Game = {
      id: crypto.randomBytes(8).toString('hex'),
      kind,
      players: [from, to],
      status: 'invited',
      board: kind === 'ttt' ? Array(9).fill(0) : kind === 'c4' ? Array(C4.cols * C4.rows).fill(0) : [],
      turn: 0,
      winner: null,
      line: [],
      rounds: [],
      score: [0, 0],
      picks: [null, null],
      updatedAt: Date.now(),
    };
    games.set(g.id, g);
    active.set(from.id, g.id);
    active.set(to.id, g.id);
    return g;
  },

  respond(gameId: string, userId: string, accept: boolean): Game {
    const { g, seat } = get(gameId, userId);
    if (g.status !== 'invited' || seat !== 1) throw new GameError('No invite to answer');
    if (accept) g.status = 'playing';
    else {
      g.ended = 'declined';
      finish(g, null);
    }
    g.updatedAt = Date.now();
    return g;
  },

  move(gameId: string, userId: string, move: number): Game {
    const { g, seat } = get(gameId, userId);
    if (g.status !== 'playing') throw new GameError('Game is not running');

    if (g.kind === 'rps') {
      if (![0, 1, 2].includes(move)) throw new GameError('Bad move');
      if (g.picks[seat] !== null) throw new GameError('Already picked');
      g.picks[seat] = move;
      const [a, b] = g.picks;
      if (a !== null && b !== null) {
        g.rounds.push([a, b]);
        if (rpsBeats(a, b)) g.score[0]++;
        else if (rpsBeats(b, a)) g.score[1]++;
        g.picks = [null, null];
        if (g.score[0] >= RPS_TO_WIN) finish(g, 0);
        else if (g.score[1] >= RPS_TO_WIN) finish(g, 1);
      }
    } else {
      if (g.turn !== seat) throw new GameError('Not your turn');
      let cell = move;
      if (g.kind === 'c4') {
        // move = column; the piece drops to the lowest empty row.
        if (!Number.isInteger(move) || move < 0 || move >= C4.cols) throw new GameError('Bad move');
        cell = -1;
        for (let r = C4.rows - 1; r >= 0; r--) {
          if (!g.board[r * C4.cols + move]) {
            cell = r * C4.cols + move;
            break;
          }
        }
        if (cell < 0) throw new GameError('That column is full');
      } else if (!Number.isInteger(move) || move < 0 || move > 8 || g.board[move]) throw new GameError('Bad move');

      g.board[cell] = seat + 1;
      g.line = g.kind === 'ttt' ? tttWinner(g.board) : c4Line(g.board, cell);
      if (g.line.length) finish(g, seat);
      else if (g.board.every(Boolean)) finish(g, null);
      else g.turn = seat === 0 ? 1 : 0;
    }
    g.updatedAt = Date.now();
    return g;
  },

  /** Quit (or cancel an invite): the other player wins a running game. */
  leave(gameId: string, userId: string): Game | null {
    const { g, seat } = get(gameId, userId);
    if (g.status === 'done') return null;
    g.ended = g.status === 'invited' ? 'declined' : 'left';
    finish(g, g.status === 'playing' ? (seat === 0 ? 1 : 0) : null);
    g.updatedAt = Date.now();
    return g;
  },

  /** The user's unfinished game, e.g. to forfeit it when they go offline. */
  activeFor: (userId: string) => {
    const id = active.get(userId);
    return id ? (games.get(id) ?? null) : null;
  },

  /** Drops finished games after a while so memory doesn't grow forever. */
  sweep(now = Date.now()) {
    for (const [id, g] of games) if (g.status === 'done' && now - g.updatedAt > 10 * 60e3) games.delete(id);
  },

  /** What one player gets to see: the opponent's RPS pick stays secret until the round resolves. */
  view(g: Game, viewerId: string): GameState {
    const seat = g.players[0].id === viewerId ? 0 : 1;
    return {
      id: g.id,
      kind: g.kind,
      players: g.players,
      status: g.status,
      board: g.board,
      turn: g.turn,
      winner: g.winner,
      line: g.line,
      rounds: g.rounds,
      score: g.score,
      picked: [g.picks[0] !== null, g.picks[1] !== null],
      myPick: g.picks[seat],
      ...(g.ended ? { ended: g.ended } : {}),
    };
  },

  /** Test helper. */
  reset() {
    games.clear();
    active.clear();
  },
};
