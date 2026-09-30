import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GameError, gameRules } from '../src/realtime/games.ts';

const A = { id: 'a1', name: 'Amy', color: '#fff' };
const B = { id: 'b2', name: 'Ben', color: '#000' };
const C = { id: 'c3', name: 'Cat', color: '#f0f' };

function start(kind: 'ttt' | 'c4' | 'rps') {
  const g = gameRules.invite(A, B, kind);
  gameRules.respond(g.id, B.id, true);
  return g;
}

describe('game zone rules', () => {
  beforeEach(() => gameRules.reset());

  it('only lets the invitee answer, and keeps players to one game each', () => {
    const g = gameRules.invite(A, B, 'ttt');
    assert.throws(() => gameRules.respond(g.id, A.id, true), GameError);
    assert.throws(() => gameRules.invite(C, B, 'rps'), /already in a game/);
    assert.throws(() => gameRules.move(g.id, A.id, 0), /not running/);
    gameRules.respond(g.id, B.id, false);
    assert.equal(g.status, 'done');
    assert.equal(g.ended, 'declined');
    gameRules.invite(C, B, 'rps'); // B is free again
  });

  it('plays XOXO in turns and spots three in a row', () => {
    const g = start('ttt');
    assert.throws(() => gameRules.move(g.id, B.id, 4), /Not your turn/);
    for (const [who, cell] of [[A, 0], [B, 3], [A, 1], [B, 4]] as const) gameRules.move(g.id, who.id, cell);
    assert.throws(() => gameRules.move(g.id, A.id, 3), /Bad move/); // taken
    gameRules.move(g.id, A.id, 2);
    assert.equal(g.status, 'done');
    assert.equal(g.winner, 0);
    assert.deepEqual(g.line, [0, 1, 2]);
  });

  it('calls a full XOXO board without a line a draw', () => {
    const g = start('ttt');
    // X O X / X O O / O X X
    for (const [who, cell] of [[A, 0], [B, 1], [A, 2], [B, 4], [A, 3], [B, 5], [A, 7], [B, 6], [A, 8]] as const) gameRules.move(g.id, who.id, cell);
    assert.equal(g.status, 'done');
    assert.equal(g.winner, null);
  });

  it('drops Connect 4 pieces to the bottom and finds four in a row', () => {
    const g = start('c4');
    gameRules.move(g.id, A.id, 3);
    assert.equal(g.board[5 * 7 + 3], 1); // bottom row
    gameRules.move(g.id, B.id, 3);
    assert.equal(g.board[4 * 7 + 3], 2); // stacked on top
    for (const [who, col] of [[A, 0], [B, 6], [A, 1], [B, 6], [A, 2]] as const) gameRules.move(g.id, who.id, col);
    assert.equal(g.winner, 0);
    assert.deepEqual([...g.line].sort((x, y) => x - y), [35, 36, 37, 38]);
  });

  it('hides RPS picks until both are in, first to two wins', () => {
    const g = start('rps');
    gameRules.move(g.id, A.id, 0); // rock
    const benSees = gameRules.view(g, B.id);
    assert.deepEqual(benSees.picked, [true, false]);
    assert.equal(benSees.myPick, null);
    assert.equal(gameRules.view(g, A.id).myPick, 0);
    gameRules.move(g.id, B.id, 1); // paper beats rock
    assert.deepEqual(g.score, [0, 1]);
    gameRules.move(g.id, A.id, 2);
    gameRules.move(g.id, B.id, 2); // tie, no point
    assert.deepEqual(g.score, [0, 1]);
    gameRules.move(g.id, A.id, 2);
    gameRules.move(g.id, B.id, 0); // rock beats scissors
    assert.equal(g.status, 'done');
    assert.equal(g.winner, 1);
  });

  it('gives the win to the other player when someone leaves', () => {
    const g = start('c4');
    gameRules.leave(g.id, B.id);
    assert.equal(g.winner, 0);
    assert.equal(g.ended, 'left');
    assert.equal(gameRules.activeFor(A.id), null);
  });
});
