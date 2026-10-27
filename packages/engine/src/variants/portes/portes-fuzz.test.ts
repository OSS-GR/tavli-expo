/**
 * Random-play fuzz test for Portes (issue #26).
 *
 * Plays `GAMES` random games to the end with a seeded RNG (game `n` uses
 * seed `n`), so a failure always comes back the same way. The error names
 * the seed, the turn and the position.
 *
 * Checks after **every move**:
 *
 * - each player has 15 checkers (points + bar + off), none outside;
 * - no point holds both colors, and nothing is pinned;
 * - pip counts: the mover's count goes down by exactly the pips moved (the
 *   die, or less for a bear-off with a larger die). The opponent's count
 *   does not change, except that a hit adds exactly the pips the hit
 *   checker loses. So a pip count never rises, except by a hit.
 *
 * After every turn: `applyTurn` gives the same board as the moves played
 * one by one with `applyMoveToBoard`, the turn passes, and `turnNumber`
 * goes up by 1. At the end: the winner has 15 off, and the score is 1
 * (mono) if the loser bore off a checker, else 2.
 *
 * How a turn is picked. `legalTurns` lists every play, and 10,000 games are
 * about 900,000 turns: too slow for CI. So most turns are a random walk:
 * one random legal move at a time, by the simple rules model in
 * `src/testing/portes-oracle.ts`. A walk that uses every die is a legal
 * play (`tavli-match.md`: use as much of the roll as possible), so
 * `applyTurn` must accept it. When the walk gets stuck before all dice are
 * used (bar, blocks, bear-off), and on one turn in `ENGINE_EVERY` anyway,
 * the play is a random pick from `legalTurns`. Then every move of it is
 * checked against the oracle too. So the engine and the oracle check each
 * other in both directions, on the hard turns most of all.
 *
 * The checks are plain `if`s, not `expect`: they run millions of times and
 * `expect` is far too slow for that.
 */

import { describe, expect, it } from 'vitest';

import { applyMoveToBoard } from '../../board';
import type { BoardState, PointState } from '../../board';
import { diceMoves, rollDice } from '../../dice';
import type { DieValue } from '../../dice';
import type { Move, Turn } from '../../move';
import { opponent } from '../../player';
import type { PlayerId } from '../../player';
import { createSeededRng } from '../../rng';
import type { Rng } from '../../rng';
import type { GameState } from '../../state';
import { canStep, playStep, sideOf, stepMove } from '../../testing/portes-oracle';
import type { Side } from '../../testing/portes-oracle';
import { formatPosition } from '../../testing/position-notation';
import { portes } from './index';

const GAMES = 10_000;
/** Random games are long (about 90 turns), but far shorter than this. */
const MAX_TURNS = 2000;
/** Take the play from `legalTurns` on about one turn in this many, even when the walk works. */
const ENGINE_EVERY = 32;

/** What the games reached. The test checks that each kind happened. */
interface Tally {
  turns: number;
  moves: number;
  /** Turns whose play came from `legalTurns`. */
  engineTurns: number;
  hits: number;
  entries: number;
  bearOffs: number;
  /** Bear-offs with a die larger than the point. */
  highBearOffs: number;
  /** Turns with no legal move. */
  passes: number;
  /** Turns that could use some dice, but not all. */
  partial: number;
  mono: number;
  diplo: number;
}

function newTally(): Tally {
  return {
    turns: 0,
    moves: 0,
    engineTurns: 0,
    hits: 0,
    entries: 0,
    bearOffs: 0,
    highBearOffs: 0,
    passes: 0,
    partial: 0,
    mono: 0,
    diplo: 0,
  };
}

function fail(what: string): never {
  throw new Error(what);
}

function random(rng: Rng, n: number): number {
  return rng.nextUint32() % n;
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[random(rng, items.length)] ?? fail('nothing to pick');
}

/**
 * Checks the board invariants and writes the pip counts into `pips`
 * (`[white, black]`). White's own point is the absolute point; Black's is
 * `25 -` it. The bar counts 25.
 */
function checkBoard(board: BoardState, pips: number[]): void {
  let white = board.bar.white + board.off.white;
  let black = board.bar.black + board.off.black;
  let whitePips = 25 * board.bar.white;
  let blackPips = 25 * board.bar.black;
  for (let i = 0; i < 24; i += 1) {
    const point = board.points[i] as PointState;
    if (point.pinned !== null) fail(`point ${i + 1} has a pinned checker`);
    if (point.white > 0 && point.black > 0) fail(`point ${i + 1} holds both colors`);
    white += point.white;
    black += point.black;
    whitePips += point.white * (i + 1);
    blackPips += point.black * (24 - i);
  }
  if (white !== 15 || black !== 15) fail(`checkers: white ${white}, black ${black}`);
  if (board.outside.white + board.outside.black > 0) fail('a checker is outside');
  pips[0] = whitePips;
  pips[1] = blackPips;
}

function sameBoard(a: BoardState, b: BoardState): boolean {
  for (let i = 0; i < 24; i += 1) {
    const p = a.points[i] as PointState;
    const q = b.points[i] as PointState;
    if (p.white !== q.white || p.black !== q.black || p.pinned !== q.pinned) return false;
  }
  return (
    a.bar.white === b.bar.white &&
    a.bar.black === b.bar.black &&
    a.off.white === b.off.white &&
    a.off.black === b.off.black &&
    a.outside.white === b.outside.white &&
    a.outside.black === b.outside.black
  );
}

/**
 * A random walk: one random legal move at a time (by the oracle), dice in
 * random order. Changes `side`. Stops early when no die left can move.
 */
function randomWalk(side: Side, dice: readonly DieValue[], rng: Rng): Move[] {
  const left = [...dice];
  if (left.length === 2 && random(rng, 2) === 0) left.reverse();
  const moves: Move[] = [];
  const origins: number[] = [];
  while (left.length > 0) {
    let used = -1;
    for (let i = 0; i < left.length && used < 0; i += 1) {
      const die = left[i] as DieValue;
      origins.length = 0;
      for (let from = 25; from >= 1; from -= 1) if (canStep(side, from, die)) origins.push(from);
      if (origins.length === 0) continue;
      const from = pick(rng, origins);
      moves.push(stepMove(side, from, die));
      playStep(side, from, die);
      used = i;
    }
    if (used < 0) break; // stuck
    left.splice(used, 1);
  }
  return moves;
}

/** Checks the plays `legalTurns` lists for one roll. */
function checkListed(turns: readonly Turn[], state: GameState, walked: number): void {
  if (turns.length === 0) fail('no legal turn');
  const player = state.toMove;
  const onBar = state.board.bar[player];
  const length = turns[0]?.moves.length ?? 0;
  // A walk found a play this long, so the longest legal play is at least as long.
  if (length < walked) fail(`legalTurns uses ${length} dice, a walk used ${walked}`);
  for (const turn of turns) {
    if (turn.player !== player) fail('wrong player');
    // Every legal play uses the same number of dice.
    if (turn.moves.length !== length) fail('plays of different lengths');
    // A player with checkers on the bar enters them before any other move.
    const firstOther = turn.moves.findIndex((m) => m.from !== 'bar');
    if (onBar > 0 && firstOther !== -1 && firstOther < onBar) fail('moved before entering');
  }
}

/**
 * Plays one move on the board and checks every invariant. `pips` holds the
 * counts before the move and gets the counts after it. With a `side`, the
 * move is also checked against the oracle (and played on `side`).
 */
function playChecked(
  board: BoardState,
  player: PlayerId,
  move: Move,
  pips: number[],
  side: Side | null,
  tally: Tally,
): BoardState {
  const from = move.from === 'bar' ? 25 : (move.from as number);
  const to = move.to === 'off' ? 0 : (move.to as number);
  const name = (): string => `move ${from}/${to} (die ${move.die})`;
  if (side !== null) {
    if (!canStep(side, from, move.die)) fail(`${name()} breaks the rules`);
    const expected = stepMove(side, from, move.die);
    if (expected.to !== move.to || expected.capture !== move.capture) {
      fail(`${name()} should be to ${expected.to} (${expected.capture})`);
    }
    playStep(side, from, move.die);
  }

  const next = applyMoveToBoard(board, player, move, 'contrary');
  const me = player === 'white' ? 0 : 1;
  const myPips = pips[me] as number;
  const theirPips = pips[1 - me] as number;
  checkBoard(next, pips);
  // The mover loses exactly the pips moved: the die, or less when bearing off high.
  const moved = from - to;
  if (to === 0 ? moved > move.die : moved !== move.die) fail(`${name()} moves ${moved} pips`);
  if (myPips - (pips[me] as number) !== moved) fail(`${name()}: the mover's pips are wrong`);
  // The opponent's pips change only by a hit: the hit checker goes back to 25.
  const gained = (pips[1 - me] as number) - theirPips;
  if (gained !== (move.capture === 'hit' ? to : 0)) fail(`${name()}: opponent pips rose`);

  tally.moves += 1;
  if (move.capture === 'hit') tally.hits += 1;
  if (from === 25) tally.entries += 1;
  if (to === 0) tally.bearOffs += 1;
  if (to === 0 && moved < move.die) tally.highBearOffs += 1;
  return next;
}

function playTurn(state: GameState, rng: Rng, tally: Tally): GameState {
  const player = state.toMove;
  const dice = rollDice(rng);
  const rolled = { ...state, dice };
  const all = diceMoves(dice);

  const forced = random(rng, ENGINE_EVERY) === 0;
  let moves: readonly Move[] = forced ? [] : randomWalk(sideOf(state.board, player), all, rng);
  // Moves from the engine are checked against the oracle, one by one.
  let side: Side | null = null;
  if (forced || moves.length < all.length) {
    const turns = portes.legalTurns(rolled, dice);
    checkListed(turns, state, moves.length);
    moves = pick(rng, turns).moves;
    side = sideOf(state.board, player);
    tally.engineTurns += 1;
  }
  if (moves.length === 0) tally.passes += 1;
  else if (moves.length < all.length) tally.partial += 1;

  const pips = [0, 0];
  checkBoard(state.board, pips);
  let board = state.board;
  for (const move of moves) board = playChecked(board, player, move, pips, side, tally);

  const next = portes.applyTurn(rolled, { player, dice, moves });
  if (!sameBoard(next.board, board)) fail('applyTurn and the single moves give different boards');
  if (next.toMove !== opponent(player) || next.dice !== null) fail('the turn did not pass');
  if (next.turnNumber !== state.turnNumber + 1) fail('turnNumber did not go up by 1');
  tally.turns += 1;
  return next;
}

/** Plays one random game to the end with all checks. */
function playGame(seed: number, tally: Tally): void {
  const rng = createSeededRng(seed);
  let state = portes.initialState({ startingPlayer: seed % 2 === 0 ? 'white' : 'black' });
  try {
    while (!portes.isGameOver(state)) {
      state = playTurn(state, rng, tally);
      if (state.turnNumber > MAX_TURNS) fail('the game did not end');
    }
    const result = portes.result(state);
    const winner = result?.winner ?? fail('game over without a winner');
    if (state.board.off[winner] !== 15) fail('the winner did not bear off 15');
    // portes.md "Winning & scoring": mono = 1 if the loser bore off any, else diplo = 2.
    const loserOff = state.board.off[opponent(winner)];
    if (result?.points !== (loserOff > 0 ? 1 : 2)) fail(`wrong score ${result?.points}`);
    if (result.points === 1) tally.mono += 1;
    else tally.diplo += 1;
  } catch (error) {
    const where = `${formatPosition(state.board)}, ${state.toMove} to move`;
    throw new Error(`game ${seed}, turn ${state.turnNumber} (${where}): ${String(error)}`, {
      cause: error,
    });
  }
}

describe('Portes fuzz', () => {
  it(`plays ${GAMES} random games and checks the invariants after every move`, () => {
    const tally = newTally();
    for (let seed = 1; seed <= GAMES; seed += 1) playGame(seed, tally);

    expect(tally.mono + tally.diplo).toBe(GAMES);
    // The games reached every kind of move, turn and result.
    for (const key of Object.keys(tally) as (keyof Tally)[]) {
      expect(tally[key], key).toBeGreaterThan(0);
    }
    expect(tally.turns / GAMES).toBeGreaterThan(40);
    // About 9 s on a fast machine. Leave a busy 2-core CI runner a lot of room.
  }, 120_000);
});
