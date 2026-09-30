import { C4, GAME_NAMES, RPS_TO_WIN, type GameState, type PublicUser } from '@adda/shared';
import { games, useGames } from '../stores/games';
import { Modal } from './ui';
import './games.css';

const RPS = ['✊', '✋', '✌️'] as const;
const RPS_NAMES = ['ROCK', 'PAPER', 'SCISSORS'] as const;

/** Game Zone popup: invites, the board, and the result. Lives in the layout so invites reach you anywhere. */
export function GameModal({ me }: { me: PublicUser }) {
  const game = useGames((s) => s.game);
  const dismiss = useGames((s) => s.dismiss);
  if (!game) return null;

  const mySeat = game.players[0].id === me.id ? 0 : 1;
  const them = game.players[mySeat === 0 ? 1 : 0];
  const name = GAME_NAMES[game.kind];

  // Closing always means "get me out": decline, cancel, forfeit, or just close the result.
  const close = () => {
    if (game.status === 'invited' && mySeat === 1) games.respond(game.id, false);
    else if (game.status !== 'done') games.leave(game.id);
    dismiss();
  };

  const title =
    game.status === 'invited' ? (mySeat === 1 ? 'CHALLENGE!' : 'CHALLENGE SENT') : game.status === 'playing' ? name : 'GAME OVER';

  return (
    <Modal open title={title} onClose={close}>
      <div className="game">
        {game.status === 'invited' ? (
          mySeat === 1 ? (
            <div className="stack game__invite">
              <p className="game__big">
                <span style={{ color: them.color }}>{them.name.toUpperCase()}</span> challenges you to <span className="c-yellow">{name}</span>
              </p>
              <div className="row game__actions">
                <button type="button" className="btn" onClick={() => games.respond(game.id, true)}>
                  ACCEPT
                </button>
                <button type="button" className="btn btn--ghost" onClick={close}>
                  DECLINE
                </button>
              </div>
            </div>
          ) : (
            <div className="stack game__invite">
              <p className="game__big">
                Waiting for <span style={{ color: them.color }}>{them.name.toUpperCase()}</span> to accept {name}
                <span className="blink">...</span>
              </p>
              <button type="button" className="btn btn--ghost" onClick={close}>
                CANCEL
              </button>
            </div>
          )
        ) : (
          <>
            <Scoreline game={game} mySeat={mySeat} />
            {game.kind === 'ttt' && <TicTacToe game={game} mySeat={mySeat} />}
            {game.kind === 'c4' && <ConnectFour game={game} mySeat={mySeat} />}
            {game.kind === 'rps' && <RockPaperScissors game={game} mySeat={mySeat} />}
            {game.status === 'done' ? (
              <div className="row game__actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    dismiss();
                    games.challenge(them.id, game.kind);
                  }}
                >
                  REMATCH
                </button>
                <button type="button" className="btn btn--ghost" onClick={dismiss}>
                  CLOSE
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn--ghost btn--sm game__quit" onClick={close}>
                QUIT (THEY WIN)
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function Scoreline({ game, mySeat }: { game: GameState; mySeat: 0 | 1 }) {
  const [p0, p1] = game.players;
  const mark = (i: 0 | 1) => (game.kind === 'ttt' ? (i === 0 ? ' ✕' : ' ◯') : '');
  let status: string;
  if (game.status === 'done') {
    if (game.ended === 'declined') status = mySeat === 0 ? 'INVITE DECLINED' : 'CHALLENGE CANCELLED';
    else if (game.winner === null) status = 'DRAW!';
    else status = game.winner === mySeat ? (game.ended === 'left' ? 'THEY LEFT. YOU WIN 🏆' : 'YOU WIN 🏆') : 'YOU LOSE';
  } else if (game.kind === 'rps') {
    status = game.picked[mySeat] ? (game.picked[mySeat === 0 ? 1 : 0] ? '' : 'WAITING FOR THEIR PICK...') : 'PICK ONE!';
  } else status = game.turn === mySeat ? 'YOUR TURN' : 'THEIR TURN...';

  return (
    <div className="game__head">
      <p className="spread">
        <span style={{ color: p0.color }}>
          {mySeat === 0 ? 'YOU' : p0.name.split(' ')[0]!.toUpperCase()}
          {mark(0)}
        </span>
        {game.kind === 'rps' && (
          <span className="c-yellow">
            {game.score[0]} – {game.score[1]} <span className="dim">(FIRST TO {RPS_TO_WIN})</span>
          </span>
        )}
        <span style={{ color: p1.color }}>
          {mySeat === 1 ? 'YOU' : p1.name.split(' ')[0]!.toUpperCase()}
          {mark(1)}
        </span>
      </p>
      {status && <p className={`game__status px-sm ${game.status === 'done' && game.winner === mySeat ? 'c-green' : 'c-yellow'}`}>{status}</p>}
    </div>
  );
}

function TicTacToe({ game, mySeat }: { game: GameState; mySeat: 0 | 1 }) {
  const myTurn = game.status === 'playing' && game.turn === mySeat;
  return (
    <div className="ttt" role="grid" aria-label="XOXO board">
      {game.board.map((v, i) => (
        <button
          key={i}
          type="button"
          className={`ttt__cell ${game.line.includes(i) ? 'is-win' : ''}`}
          style={v ? { color: game.players[v - 1]!.color } : undefined}
          disabled={!myTurn || !!v}
          onClick={() => games.move(game.id, i)}
          aria-label={`Cell ${i + 1}${v ? (v === 1 ? ', X' : ', O') : ''}`}
        >
          {v === 1 ? '✕' : v === 2 ? '◯' : ''}
        </button>
      ))}
    </div>
  );
}

function ConnectFour({ game, mySeat }: { game: GameState; mySeat: 0 | 1 }) {
  const myTurn = game.status === 'playing' && game.turn === mySeat;
  const full = (col: number) => !!game.board[col];
  return (
    <div className="c4" style={{ gridTemplateColumns: `repeat(${C4.cols}, 1fr)` }}>
      {Array.from({ length: C4.cols }, (_, col) => (
        <button
          key={col}
          type="button"
          className="c4__col"
          disabled={!myTurn || full(col)}
          onClick={() => games.move(game.id, col)}
          aria-label={`Drop in column ${col + 1}`}
        >
          {Array.from({ length: C4.rows }, (_, row) => {
            const i = row * C4.cols + col;
            const v = game.board[i]!;
            return (
              <span
                key={row}
                className={`c4__disc ${game.line.includes(i) ? 'is-win' : ''}`}
                style={v ? { background: game.players[v - 1]!.color } : undefined}
              />
            );
          })}
        </button>
      ))}
    </div>
  );
}

function RockPaperScissors({ game, mySeat }: { game: GameState; mySeat: 0 | 1 }) {
  const last = game.rounds[game.rounds.length - 1];
  const canPick = game.status === 'playing' && game.myPick === null;
  return (
    <div className="stack">
      {last && (
        <p className="game__big rps__last">
          LAST ROUND: YOU {RPS[last[mySeat]]} vs {RPS[last[mySeat === 0 ? 1 : 0]]} THEM
        </p>
      )}
      <div className="rps">
        {RPS.map((icon, i) => (
          <button
            key={i}
            type="button"
            className={`rps__pick ${game.myPick === i ? 'is-picked' : ''}`}
            disabled={!canPick}
            onClick={() => games.move(game.id, i)}
          >
            <span className="rps__icon">{icon}</span>
            <span className="px-xs">{RPS_NAMES[i]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
