import { create } from 'zustand';
import type { GameKind, GameState } from '@adda/shared';
import { realtime } from '../lib/realtime';

interface GamesState {
  /** The game (or invite) on screen; kept after it ends until the player closes it. */
  game: GameState | null;
  set: (game: GameState) => void;
  dismiss: () => void;
}

/** Games the player closed: later updates for them (e.g. "declined") shouldn't pop back up. */
const closed = new Set<string>();

export const useGames = create<GamesState>((set, get) => ({
  game: null,
  set: (game) => {
    if (!closed.has(game.id)) set({ game });
  },
  dismiss: () => {
    const id = get().game?.id;
    if (id) closed.add(id);
    set({ game: null });
  },
}));

export const games = {
  challenge: (to: string, kind: GameKind) => realtime.send({ type: 'game:invite', to, kind }),
  respond: (gameId: string, accept: boolean) => realtime.send({ type: 'game:respond', gameId, accept }),
  move: (gameId: string, move: number) => realtime.send({ type: 'game:move', gameId, move }),
  leave: (gameId: string) => realtime.send({ type: 'game:leave', gameId }),
};
