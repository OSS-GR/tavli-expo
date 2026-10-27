/**
 * Random-play fuzz test for Plakoto (issue #98).
 *
 * Plays seeded random games to the end with every mother rule (game `n`
 * uses seed `n`), so a failure always comes back the same way. The error
 * names the seed, the turn and the position.
 *
 * Checks after **every move**:
 *
 * - each player has 15 checkers (points + off), none on the bar or outside;
 * - two colors share a point only as a pin, and a pinned checker is alone;
 * - a pinned checker never moves;
 * - pip counts: the mover's count goes down by exactly the pips moved (the
 *   die, or less for a bear-off with a larger die). The opponent's count
 *   never changes: Plakoto has no hits.
 *
 * After every turn: `applyTurn` gives the same board as the moves played
 * one by one with `applyMoveToBoard`, the turn passes, and `turnNumber`
 * goes up by 1. At the end the result must fit the board.
 *
 * How a turn is picked (as in the Portes fuzz test). Most turns are a
 * random walk: one random legal move at a time, by the simple rules model
 * in `src/testing/plakoto-oracle.ts`. A walk that uses every die is a legal
 * play; when the mother rule ends the game in the middle of it, the turn
 * stops at that move. When the walk gets stuck before all dice are used,
 * and on one turn in `ENGINE_EVERY` anyway, the play is a random pick from
 * `legalTurns`, and every move of it is checked against the oracle.
 *
 * The checks are plain `if`s, not `expect`: they run very often.
 */

import { describe, expect, it } from 'vitest';

import { applyMoveToBoard } from '../../board';
import type { BoardState, PointState } from '../../board';
import { diceMoves, rollDice } from '../../dice';
import type { DieValue } from '../../dice';
import type { Move, Turn } from '../../move';
import { opponent } from '../../player';
import type { PlayerId } from '../../player';
import { resolveRules } from '../../presets';
import type { MotherRules, RuleSet } from '../../rules';
import { createSeededRng } from '../../rng';
import type { Rng } from '../../rng';
import type { GameState } from '../../state';
import { formatPlakoto } from '../../testing/plakoto-notation';
import {
  canStep,
  endsMidTurn,
  playStep,
  sideKey,
  sideOf,
  stepMove,
} from '../../testing/plakoto-oracle';
import type { Side } from '../../testing/plakoto-oracle';
import { plakoto } from './index';
import { isMotherPinned } from './mother';

/** Random games are long (about 90 turns), but far shorter than this. */
const MAX_TURNS = 2000;
/** Take the play from `legalTurns` on about one turn in this many, even when the walk works. */
const ENGINE_EVERY = 32;

/** What the games reached. The test checks that each kind happened. */
interface Tally {
  games: number;
  turns: number;
  moves: number;
  engineTurns: number;
  pins: number;
  bearOffs: number;
  passes: number;
  /** Turns that the mother rule cut short (the game ended in the middle). */
  cut: number;
  offers: number;
  /** Games with `motherRule: "none"` that stopped with both mothers pinned. */
  stalls: number;
  reasons: Record<string, number>;
}

function newTally(): Tally {
  return {
    games: 0,
    turns: 0,
    moves: 0,
    engineTurns: 0,
    pins: 0,
    bearOffs: 0,
    passes: 0,
    cut: 0,
    offers: 0,
    stalls: 0,
    reasons: {},
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

/** Checks the board invariants and writes the pip counts into `pips` (`[white, black]`). */
function checkBoard(board: BoardState, pips: number[]): void {
  let white = board.off.white;
  let black = board.off.black;
  let whitePips = 0;
  let blackPips = 0;
  for (let i = 0; i < 24; i += 1) {
    const point = board.points[i] as PointState;
    const both = point.white > 0 && point.black > 0;
    if (point.pinned === null ? both : !both || point[point.pinned] !== 1) {
      fail(`point ${i + 1} is not empty, one color, or one checker pinned under the other`);
    }
    white += point.white;
    black += point.black;
    whitePips += point.white * (i + 1);
    blackPips += point.black * (24 - i);
  }
  if (white !== 15 || black !== 15) fail(`checkers: white ${white}, black ${black}`);
  if (board.bar.white + board.bar.black + board.outside.white + board.outside.black > 0) {
    fail('a checker is on the bar or outside');
  }
  pips[0] = whitePips;
  pips[1] = blackPips;
}

function sameBoard(a: BoardState, b: BoardState): boolean {
  for (let i = 0; i < 24; i += 1) {
    const p = a.points[i] as PointState;
    const q = b.points[i] as PointState;
    if (p.white !== q.white || p.black !== q.black || p.pinned !== q.pinned) return false;
  }
  return a.off.white === b.off.white && a.off.black === b.off.black;
}

/**
 * A random walk: one random legal move at a time (by the oracle), dice in
 * random order. Changes `side`. Stops early when no die left can move.
 * It ignores the mother rule; `playTurn` cuts the play afterwards.
 */
function randomWalk(side: Side, dice: readonly DieValue[], rules: RuleSet, rng: Rng): Move[] {
  const left = [...dice];
  if (left.length === 2 && random(rng, 2) === 0) left.reverse();
  const moves: Move[] = [];
  const origins: number[] = [];
  while (left.length > 0) {
    let used = -1;
    for (let i = 0; i < left.length && used < 0; i += 1) {
      const die = left[i] as DieValue;
      origins.length = 0;
      for (let from = 24; from >= 1; from -= 1) {
        if (canStep(side, from, die, rules)) origins.push(from);
      }
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

/** The moves up to the one that ends the game by the mother rule (all of them if none does). */
function cutByMother(state: GameState, moves: readonly Move[]): readonly Move[] {
  const side = sideOf(state.board, state.toMove);
  const end = moves.findIndex((m) => {
    playStep(side, m.from as number, m.die);
    return endsMidTurn(side, state.rules);
  });
  return end < 0 ? moves : moves.slice(0, end + 1);
}

/** The oracle's end position of `moves`. */
function finalKey(state: GameState, moves: readonly Move[]): string {
  const side = sideOf(state.board, state.toMove);
  for (const m of moves) playStep(side, m.from as number, m.die);
  return sideKey(side);
}

/**
 * Checks the plays `legalTurns` lists for one roll against a random walk
 * of `walked` moves (`cut` = the walk cut by the mother rule).
 */
function checkListed(
  turns: readonly Turn[],
  state: GameState,
  walked: readonly Move[],
  cut: readonly Move[],
  usedAll: boolean,
): void {
  if (turns.length === 0) fail('no legal turn');
  const longest = Math.max(...turns.map((t) => t.moves.length));
  for (const turn of turns) {
    if (turn.player !== state.toMove) fail('wrong player');
    // No play goes on after a move that ended the game.
    if (cutByMother(state, turn.moves).length !== turn.moves.length) {
      fail('a play goes on after the game ended');
    }
    // A shorter play is legal only when the mother rule ended the game on its last move.
    if (turn.moves.length < longest) {
      const side = sideOf(state.board, state.toMove);
      for (const move of turn.moves) playStep(side, move.from as number, move.die);
      if (!endsMidTurn(side, state.rules)) fail('a short play that does not end the game');
    }
  }
  if (usedAll) {
    // A walk that uses every die is a legal play: its (cut) end position must be listed.
    const key = finalKey(state, cut);
    if (!turns.some((t) => finalKey(state, t.moves) === key)) fail('a legal walk is not listed');
  } else if (cut.length === walked.length && longest < walked.length) {
    // A walk found this many legal moves in a row, so the longest legal play is as long.
    fail(`legalTurns uses ${longest} dice, a walk used ${walked.length}`);
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
  rules: RuleSet,
  tally: Tally,
): BoardState {
  const from = move.from as number;
  const to = move.to === 'off' ? 0 : move.to;
  const name = (): string => `move ${from}/${to} (die ${move.die})`;
  if (side !== null) {
    if (!canStep(side, from, move.die, rules)) fail(`${name()} breaks the rules`);
    const expected = stepMove(side, from, move.die);
    if (expected.to !== move.to || expected.capture !== move.capture) {
      fail(`${name()} should be to ${expected.to} (${expected.capture})`);
    }
    playStep(side, from, move.die);
  }
  const fromPoint = board.points[player === 'white' ? from - 1 : 24 - from] as PointState;
  if (fromPoint.pinned === player) fail(`${name()}: a pinned checker moved`);

  const next = applyMoveToBoard(board, player, move, 'contrary');
  const me = player === 'white' ? 0 : 1;
  const myPips = pips[me] as number;
  const theirPips = pips[1 - me] as number;
  checkBoard(next, pips);
  const moved = from - to;
  if (to === 0 ? moved > move.die : moved !== move.die) fail(`${name()} moves ${moved} pips`);
  if (myPips - (pips[me] as number) !== moved) fail(`${name()}: the mover's pips are wrong`);
  if (pips[1 - me] !== theirPips) fail(`${name()}: the opponent's pips changed`);

  tally.moves += 1;
  if (move.capture === 'pin') tally.pins += 1;
  if (to === 0) tally.bearOffs += 1;
  return next;
}

function playTurn(state: GameState, rng: Rng, tally: Tally): GameState {
  const player = state.toMove;
  const { rules } = state;
  const dice = rollDice(rng);
  const rolled = { ...state, dice };
  const all = diceMoves(dice);

  const forced = random(rng, ENGINE_EVERY) === 0;
  const walked = randomWalk(sideOf(state.board, player), all, rules, rng);
  const usedAll = walked.length === all.length;
  // The mother rule cuts the walk at the move that ends the game.
  const cut = cutByMother(state, walked);
  let moves = cut;
  let cutShort = cut.length < walked.length;
  // Moves from the engine are checked against the oracle, one by one.
  let side: Side | null = null;
  if (forced || !usedAll) {
    const turns = plakoto.legalTurns(rolled, dice);
    checkListed(turns, state, walked, cut, usedAll);
    moves = pick(rng, turns).moves;
    cutShort = moves.length < Math.max(...turns.map((t) => t.moves.length));
    side = sideOf(state.board, player);
    tally.engineTurns += 1;
  }
  if (moves.length === 0) tally.passes += 1;

  const pips = [0, 0];
  checkBoard(state.board, pips);
  let board = state.board;
  for (const move of moves) board = playChecked(board, player, move, pips, side, rules, tally);

  const next = plakoto.applyTurn(rolled, { player, dice, moves });
  if (!sameBoard(next.board, board)) fail('applyTurn and the single moves give different boards');
  if (next.toMove !== opponent(player) || next.dice !== null) fail('the turn did not pass');
  if (next.turnNumber !== state.turnNumber + 1) fail('turnNumber did not go up by 1');
  if (cutShort) {
    // Only the mother rule may cut a play short, and only by ending the game.
    if (!plakoto.isGameOver(next)) fail('a play was cut short, but the game goes on');
    tally.cut += 1;
  }
  tally.turns += 1;
  return next;
}

/** The result fits the board. */
function checkResult(state: GameState, tally: Tally): void {
  const result = plakoto.result(state) ?? fail('game over without a result');
  const { board } = state;
  const winner = result.winner;
  switch (result.reason) {
    case 'borneOff': {
      if (winner === null || board.off[winner] !== 15) fail('the winner did not bear off 15');
      // Single 1 if the loser bore off any, else double 2.
      if (result.points !== (board.off[opponent(winner)] > 0 ? 1 : 2)) fail('wrong score');
      break;
    }
    case 'motherPinned':
      if (winner === null || !isMotherPinned(board, opponent(winner))) fail('no pinned mother');
      if (result.points !== 2) fail('a mother win is not 2 points');
      break;
    case 'bothMothersPinned':
      if (!isMotherPinned(board, 'white') || !isMotherPinned(board, 'black')) fail('no draw');
      if (winner !== null || result.points !== 0) fail('a draw has a winner');
      break;
    case 'resigned':
      if (result.points !== 2) fail('a mother resignation is not 2 points');
      break;
    default:
      fail(`unexpected reason ${result.reason}`);
  }
  tally.reasons[result.reason] = (tally.reasons[result.reason] ?? 0) + 1;
}

/** Plays one random game to the end with all checks. */
function playGame(seed: number, rules: RuleSet, tally: Tally): void {
  const rng = createSeededRng(seed);
  let state = plakoto.initialState({ startingPlayer: seed % 2 === 0 ? 'white' : 'black', rules });
  try {
    while (!plakoto.isGameOver(state)) {
      const question = plakoto.prompt?.(state) ?? null;
      if (question !== null) {
        // offerConcede: mostly "play on", so the games go on and reach the later rules.
        tally.offers += 1;
        const choice = random(rng, 8) === 0 ? 'resign' : 'playOn';
        state = plakoto.answerPrompt?.(state, question.player, choice) ?? fail('no answer');
        continue;
      }
      if (
        rules.mother.motherRule === 'none' &&
        isMotherPinned(state.board, 'white') &&
        isMotherPinned(state.board, 'black')
      ) {
        // With "none", two pinned mothers never move again: the game cannot end.
        tally.stalls += 1;
        return;
      }
      state = playTurn(state, rng, tally);
      if (state.turnNumber > MAX_TURNS) fail('the game did not end');
    }
    checkResult(state, tally);
    tally.games += 1;
  } catch (error) {
    const where = `${formatPlakoto(state.board)}, ${state.toMove} to move`;
    throw new Error(`game ${seed}, turn ${state.turnNumber} (${where}): ${String(error)}`, {
      cause: error,
    });
  }
}

/** Mixes the other Plakoto flags into some games. */
function rulesFor(seed: number, mother: Partial<MotherRules>): RuleSet {
  return resolveRules('plakoto', {
    mother,
    capture: { intermediatePinBlocks: seed % 5 === 1 },
    bearOff: { bearOffWhilePinned: seed % 7 === 3 },
    movement: { higherDieRule: seed % 11 !== 4 },
  });
}

function run(games: number, firstSeed: number, mother: Partial<MotherRules>): Tally {
  const tally = newTally();
  for (let seed = firstSeed; seed < firstSeed + games; seed += 1) {
    playGame(seed, rulesFor(seed, mother), tally);
  }
  return tally;
}

/**
 * Games per mother rule: 1,000 in all, about 1.3 s on one core of the dev
 * container. The engine tests run on one worker on a 2-core CI runner, so
 * every second counts. Raise these numbers for a longer local run.
 */
const GAMES = {
  offerConcede: 300,
  offerConcedeEndOfTurn: 100,
  federation: 250,
  federationEndOfTurn: 100,
  instant: 150,
  none: 100,
};

// Generous timeouts: CI runners have 2 shared cores.
describe('Plakoto fuzz', () => {
  it(`offerConcede (default rules): ${GAMES.offerConcede} games`, { timeout: 60_000 }, () => {
    const tally = run(GAMES.offerConcede, 1, { motherRule: 'offerConcede' });
    expect(tally.games).toBe(GAMES.offerConcede);
    expect(tally.offers).toBeGreaterThan(GAMES.offerConcede / 5);
    expect(tally.reasons['resigned']).toBeGreaterThan(0);
    expect(tally.reasons['borneOff']).toBeGreaterThan(0);
    for (const key of ['moves', 'engineTurns', 'pins', 'bearOffs', 'passes'] as const) {
      expect(tally[key], key).toBeGreaterThan(0);
    }
    expect(tally.turns / tally.games).toBeGreaterThan(30);
  });

  it(`offerConcede, endOfTurn: ${GAMES.offerConcedeEndOfTurn} games`, { timeout: 60_000 }, () => {
    const n = GAMES.offerConcedeEndOfTurn;
    const tally = run(n, 100_001, { motherRule: 'offerConcede', motherCheckTiming: 'endOfTurn' });
    expect(tally.games).toBe(n);
    expect(tally.offers).toBeGreaterThan(n / 10);
    expect(tally.cut).toBe(0);
  });

  it(`federation, afterEachMove: ${GAMES.federation} games`, { timeout: 60_000 }, () => {
    const tally = run(GAMES.federation, 200_001, { motherRule: 'federation' });
    expect(tally.games).toBe(GAMES.federation);
    expect(tally.reasons['motherPinned']).toBeGreaterThan(0);
    expect(tally.reasons['bothMothersPinned']).toBeGreaterThan(0);
    // Some games end in the middle of a turn.
    expect(tally.cut).toBeGreaterThan(0);
  });

  it(`federation, endOfTurn: ${GAMES.federationEndOfTurn} games`, { timeout: 60_000 }, () => {
    const n = GAMES.federationEndOfTurn;
    const tally = run(n, 300_001, { motherRule: 'federation', motherCheckTiming: 'endOfTurn' });
    expect(tally.games).toBe(n);
    expect(tally.reasons['motherPinned']).toBeGreaterThan(0);
    expect(tally.cut).toBe(0);
  });

  it(`instant: ${GAMES.instant} games, never a draw`, { timeout: 60_000 }, () => {
    const tally = run(GAMES.instant, 400_001, { motherRule: 'instant' });
    expect(tally.games).toBe(GAMES.instant);
    expect(tally.reasons['motherPinned']).toBeGreaterThan(0);
    expect(tally.reasons['bothMothersPinned']).toBeUndefined();
    expect(tally.cut).toBeGreaterThan(0);
  });

  it(`none: ${GAMES.none} games; both mothers pinned stalls the game`, { timeout: 60_000 }, () => {
    const tally = run(GAMES.none, 500_001, { motherRule: 'none' });
    expect(tally.games + tally.stalls).toBe(GAMES.none);
    expect(tally.reasons['motherPinned']).toBeUndefined();
    expect(tally.reasons['borneOff']).toBe(tally.games);
  });
});
