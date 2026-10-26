import { describe, expect, it } from 'vitest';

import { totalCheckers } from '../../board';
import { rollDice } from '../../dice';
import { PLAYERS } from '../../player';
import { createSeededRng } from '../../rng';
import type { Rng } from '../../rng';
import type { GameState } from '../../state';
import { portes } from './index';

const GAMES = 2000;
/** Random play is slow to finish, but far below this. */
const MAX_TURNS = 2000;

function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[rng.nextUint32() % items.length];
  if (item === undefined) throw new Error('empty list');
  return item;
}

// Plain checks, not `expect`: they run millions of times and must be cheap.
function check(ok: boolean, seed: number, what: string): void {
  if (!ok) throw new Error(`game ${seed}: ${what}`);
}

function checkBoard(state: GameState, seed: number): void {
  const { board } = state;
  for (const player of PLAYERS) {
    check(totalCheckers(board, player) === 15, seed, `${player} does not have 15 checkers`);
    check(board.outside[player] === 0, seed, 'a checker is outside');
  }
  for (const point of board.points) {
    check(point.pinned === null, seed, 'a checker is pinned');
    check(!(point.white > 0 && point.black > 0), seed, 'a point holds both colors');
  }
}

/** Plays one random game to the end and checks the invariants after every turn. */
function playRandomGame(seed: number): { turns: number; points: number } {
  const rng = createSeededRng(seed);
  let state = portes.initialState({ startingPlayer: seed % 2 === 0 ? 'white' : 'black' });
  while (!portes.isGameOver(state)) {
    const dice = rollDice(rng);
    const rolled = { ...state, dice };
    const turns = portes.legalTurns(rolled, dice);
    check(turns.length > 0, seed, 'no legal turn');

    const player = state.toMove;
    const onBar = state.board.bar[player];
    const length = turns[0]?.moves.length ?? 0;
    for (const turn of turns) {
      check(turn.player === player, seed, 'wrong player');
      // Every legal play uses the same number of dice.
      check(turn.moves.length === length, seed, 'plays of different lengths');
      // A player with checkers on the bar enters them before any other move.
      const firstOther = turn.moves.findIndex((m) => m.from !== 'bar');
      if (onBar > 0) check(firstOther === -1 || firstOther >= onBar, seed, 'moved before entering');
      const entries = turn.moves.filter((m) => m.from === 'bar').length;
      check(entries <= onBar, seed, 'entered more checkers than the bar holds');
    }

    const next = portes.applyTurn(rolled, pick(rng, turns));
    check(next.turnNumber === state.turnNumber + 1, seed, 'turnNumber did not go up by 1');
    check(next.toMove !== player && next.dice === null, seed, 'turn did not pass');
    checkBoard(next, seed);
    state = next;
    if (state.turnNumber > MAX_TURNS) throw new Error(`game ${seed} did not end`);
  }
  const result = portes.result(state);
  if (result === null) throw new Error('game over without a result');
  expect([1, 2]).toContain(result.points);
  expect(state.board.off[result.winner ?? 'white']).toBe(15);
  return { turns: state.turnNumber - 1, points: result.points };
}

describe('Portes fuzz', () => {
  it(`plays ${GAMES} random games to the end with all invariants`, { timeout: 60_000 }, () => {
    let turns = 0;
    let doubles = 0;
    for (let seed = 1; seed <= GAMES; seed += 1) {
      const game = playRandomGame(seed);
      turns += game.turns;
      if (game.points === 2) doubles += 1;
    }
    // Random play gives long games and some marses.
    expect(turns / GAMES).toBeGreaterThan(40);
    expect(doubles).toBeGreaterThan(0);
  });
});
