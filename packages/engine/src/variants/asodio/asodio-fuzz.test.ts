/**
 * Random-play fuzz test for Asodio (issue #115).
 *
 * Plays seeded random games to the end (game `n` uses seed `n`), with every
 * preset and a mix of flags, so a failure always comes back the same way.
 * The error names the seed, the turn and the position.
 *
 * Checks after **every move**:
 *
 * - each player has 15 checkers (points + bar + outside + off);
 * - stacking: with pins, two colors share a point only as a pin (one lone
 *   checker under the other color) and nothing is on the bar; with hits,
 *   never two colors on a point and no pins; outside checkers only with
 *   `startPosition: "offBoard"`;
 * - a pinned checker never moves;
 * - pip counts: the mover's count goes down by exactly the pips moved (an
 *   entry from 25 counts too). The opponent's count only rises by a hit,
 *   by exactly the pips the hit checker loses;
 * - the army rules (pins with `quarterLock`): while checkers are outside,
 *   every entered checker is in the starting quarter (`mustEnterAllFirst`);
 *   after that, a player's checkers fill at most two quarters next to each
 *   other;
 * - every move is legal in the simple rules model
 *   (`src/testing/asodio-oracle.ts`).
 *
 * After every turn: `applyTurn` gives the same board as the single moves,
 * `turnNumber` goes up by 1, and the same player moves again exactly when
 * the roll chain says so (`asodio.md`, "Turn & dice rules"). At the end
 * the result must fit the board.
 *
 * How a turn is picked (as in the Plakoto fuzz test): mostly a random walk
 * by the oracle; when the walk gets stuck, and on one turn in
 * `ENGINE_EVERY` anyway, a random pick from `legalTurns`. The checks are
 * plain `if`s, not `expect`: they run very often.
 */

import { describe, expect, it } from 'vitest';

import { applyMoveToBoard } from '../../board';
import type { BoardState, PointState } from '../../board';
import { diceMoves, rollDice } from '../../dice';
import type { Dice, DieValue } from '../../dice';
import type { Move, Turn } from '../../move';
import { PLAYERS, opponent } from '../../player';
import type { PlayerId } from '../../player';
import type { RuleSet } from '../../rules';
import { createSeededRng } from '../../rng';
import type { Rng } from '../../rng';
import type { GameState } from '../../state';
import { formatAsodio } from '../../testing/asodio-notation';
import {
  ORIGINS,
  anyStep,
  canStep,
  playStep,
  rollStopped,
  sideKey,
  sideOf,
  stepMove,
} from '../../testing/asodio-oracle';
import type { From, Side } from '../../testing/asodio-oracle';
import { ASODIO_RULE_MIX, mixRules } from '../../testing/random-asodio';
import { asodio } from './index';

/** Far longer than any random game. */
const MAX_TURNS = 5000;
/** Take the play from `legalTurns` on about one turn in this many, even when the walk works. */
const ENGINE_EVERY = 16;

interface Tally {
  games: number;
  turns: number;
  moves: number;
  engineTurns: number;
  entries: number;
  pins: number;
  hits: number;
  bearOffs: number;
  passes: number;
  /** Turns after which the same player rolled again. */
  rollAgain: number;
  /** Chosen doubles after a 1-2. */
  chosen: number;
  reasons: Record<string, number>;
}

function newTally(): Tally {
  return {
    games: 0,
    turns: 0,
    moves: 0,
    engineTurns: 0,
    entries: 0,
    pins: 0,
    hits: 0,
    bearOffs: 0,
    passes: 0,
    rollAgain: 0,
    chosen: 0,
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

function quarter(own: number): number {
  return Math.floor((24 - own) / 6);
}

/** Own point of absolute index `i` (0–23). */
function own(player: PlayerId, i: number): number {
  return player === 'white' ? i + 1 : 24 - i;
}

/** Checks the board invariants and writes the pip counts into `pips` (`[white, black]`). */
function checkBoard(board: BoardState, rules: RuleSet, pips: number[]): void {
  const pin = rules.capture.captureMode === 'pin';
  const counts = { white: 0, black: 0 };
  const sums = { white: 0, black: 0 };
  for (let i = 0; i < 24; i += 1) {
    const point = board.points[i] as PointState;
    const both = point.white > 0 && point.black > 0;
    if (pin) {
      if (point.pinned === null ? both : !both || point[point.pinned] !== 1) {
        fail(`point ${i + 1} is not empty, one color, or one checker pinned under the other`);
      }
    } else if (both || point.pinned !== null) {
      fail(`point ${i + 1} has two colors or a pin in a hitting game`);
    }
    for (const player of PLAYERS) {
      counts[player] += point[player];
      sums[player] += point[player] * own(player, i);
    }
  }
  for (const player of PLAYERS) {
    const total = counts[player] + board.bar[player] + board.outside[player] + board.off[player];
    if (total !== 15) fail(`${player} has ${total} checkers`);
    if (pin && board.bar[player] > 0) fail(`${player} has a checker on the bar in a pinning game`);
    if (rules.board.startPosition !== 'offBoard' && board.outside[player] > 0) {
      fail(`${player} has a checker outside`);
    }
    sums[player] += 25 * (board.bar[player] + board.outside[player]);
  }
  pips[0] = sums.white;
  pips[1] = sums.black;
  if (pin && rules.quarters.quarterLock)
    for (const player of PLAYERS) checkArmy(board, player, rules);
}

/** The owner's army rules, seen on the board. */
function checkArmy(board: BoardState, player: PlayerId, rules: RuleSet): void {
  const quarters = new Set<number>();
  board.points.forEach((point, i) => {
    if (point[player] > 0) quarters.add(quarter(own(player, i)));
  });
  if (board.outside[player] > 0) {
    if (rules.entry.mustEnterAllFirst && [...quarters].some((q) => q !== 0)) {
      fail(`${player} left the starting quarter before all 15 entered`);
    }
    return;
  }
  const list = [...quarters].sort();
  if (list.length > 2 || (list.length === 2 && (list[1] as number) - (list[0] as number) !== 1)) {
    fail(`${player}'s army is spread over quarters ${list.join(', ')}`);
  }
}

function sameBoard(a: BoardState, b: BoardState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fromOf(move: Move): From {
  return move.from;
}

/** A random walk: one random legal move at a time (by the oracle). Changes `side`. */
function randomWalk(side: Side, dice: readonly DieValue[], rules: RuleSet, rng: Rng): Move[] {
  const left = [...dice];
  if (left.length === 2 && random(rng, 2) === 0) left.reverse();
  const moves: Move[] = [];
  const origins: From[] = [];
  while (left.length > 0) {
    let used = -1;
    for (let i = 0; i < left.length && used < 0; i += 1) {
      const die = left[i] as DieValue;
      origins.length = 0;
      for (const from of ORIGINS) if (canStep(side, from, die, rules)) origins.push(from);
      if (origins.length === 0) continue;
      const from = pick(rng, origins);
      moves.push(stepMove(side, from, die, rules));
      playStep(side, from, die, rules);
      used = i;
    }
    if (used < 0) break; // stuck
    left.splice(used, 1);
  }
  return moves;
}

function finalKey(state: GameState, moves: readonly Move[]): string {
  const side = sideOf(state.board, state.toMove);
  for (const m of moves) playStep(side, fromOf(m), m.die, state.rules);
  return sideKey(side);
}

function checkListed(
  turns: readonly Turn[],
  state: GameState,
  walked: readonly Move[],
  usedAll: boolean,
): void {
  if (turns.length === 0) fail('no legal turn');
  const longest = Math.max(...turns.map((t) => t.moves.length));
  for (const turn of turns) {
    if (turn.player !== state.toMove) fail('wrong player');
    if (turn.moves.length !== longest) fail('plays of different lengths');
  }
  if (usedAll) {
    const key = finalKey(state, walked);
    if (!turns.some((t) => finalKey(state, t.moves) === key)) fail('a legal walk is not listed');
  } else if (longest < walked.length) {
    fail(`legalTurns uses ${longest} dice, a walk used ${walked.length}`);
  }
}

function playChecked(
  board: BoardState,
  player: PlayerId,
  move: Move,
  pips: number[],
  side: Side | null,
  rules: RuleSet,
  tally: Tally,
): BoardState {
  const from = typeof move.from === 'number' ? move.from : 25;
  const to = move.to === 'off' ? 0 : move.to;
  const name = (): string => `move ${String(move.from)}/${to} (die ${move.die})`;
  if (side !== null) {
    if (!canStep(side, move.from, move.die, rules)) fail(`${name()} breaks the rules`);
    const expected = stepMove(side, move.from, move.die, rules);
    if (expected.to !== move.to || expected.capture !== move.capture) {
      fail(`${name()} should be to ${expected.to} (${expected.capture})`);
    }
    playStep(side, move.from, move.die, rules);
  }
  if (typeof move.from === 'number') {
    const point = board.points[player === 'white' ? from - 1 : 24 - from] as PointState;
    if (point.pinned === player) fail(`${name()}: a pinned checker moved`);
  }
  const next = applyMoveToBoard(board, player, move, 'contrary');
  const me = player === 'white' ? 0 : 1;
  const myPips = pips[me] as number;
  const theirPips = pips[1 - me] as number;
  checkBoard(next, rules, pips);
  const moved = from - to;
  if (to === 0 ? moved > move.die : moved !== move.die) fail(`${name()} moves ${moved} pips`);
  if (myPips - (pips[me] as number) !== moved) fail(`${name()}: the mover's pips are wrong`);
  const gained = move.capture === 'hit' ? to : 0;
  if ((pips[1 - me] as number) - theirPips !== gained)
    fail(`${name()}: the opponent's pips are wrong`);

  tally.moves += 1;
  if (typeof move.from !== 'number') tally.entries += 1;
  if (move.capture === 'pin') tally.pins += 1;
  if (move.capture === 'hit') tally.hits += 1;
  if (to === 0) tally.bearOffs += 1;
  return next;
}

/** Who moves next and what waits, by the roll chain rules, written apart from the variant. */
function expectedChain(state: GameState, dice: Dice, moves: number): 'next' | 'again' | 'choose' {
  const { extraRolls, specialRolls } = state.rules;
  if (state.variantData !== null && 'chosenDouble' in state.variantData) {
    return moves === 4 && extraRolls.aceDeuceExtraRoll ? 'again' : 'next';
  }
  const aceDeuce = Math.min(...dice) === 1 && Math.max(...dice) === 2;
  if (aceDeuce && moves === 2) {
    if (specialRolls.aceDeuceChoosesDouble) return 'choose';
    return extraRolls.aceDeuceExtraRoll ? 'again' : 'next';
  }
  if (dice[0] === dice[1] && moves === 4 && extraRolls.doublesGiveExtraRoll) return 'again';
  return 'next';
}

function playTurn(state: GameState, rng: Rng, tally: Tally): GameState {
  const player = state.toMove;
  const { rules } = state;
  const dice = state.dice ?? rollDice(rng);
  const rolled = { ...state, dice };
  const all = diceMoves(dice);

  const stopped = rollStopped(sideOf(state.board, player), dice, rules);
  const walked = stopped ? [] : randomWalk(sideOf(state.board, player), all, rules, rng);
  const usedAll = walked.length === all.length;
  let moves: readonly Move[] = walked;
  let side: Side | null = null;
  if (stopped || !usedAll || random(rng, ENGINE_EVERY) === 0) {
    const turns = asodio.legalTurns(rolled, dice);
    if (stopped && (turns.length !== 1 || turns[0]?.moves.length !== 0)) {
      fail('a gated roll has a move');
    }
    checkListed(turns, state, walked, usedAll);
    moves = pick(rng, turns).moves;
    side = sideOf(state.board, player);
    tally.engineTurns += 1;
  }
  if (moves.length === 0) tally.passes += 1;

  const pips = [0, 0];
  checkBoard(state.board, rules, pips);
  let board = state.board;
  for (const move of moves) board = playChecked(board, player, move, pips, side, rules, tally);

  const next = asodio.applyTurn(rolled, { player, dice, moves });
  if (!sameBoard(next.board, board)) fail('applyTurn and the single moves give different boards');
  if (next.dice !== null) fail('dice left after the turn');
  if (next.turnNumber !== state.turnNumber + 1) fail('turnNumber did not go up by 1');
  if (!asodio.isGameOver(next)) {
    const chain = expectedChain(state, dice, moves.length);
    const same = next.toMove === player;
    if (same !== (chain !== 'next')) fail(`the roll chain is wrong: expected ${chain}`);
    const asks = asodio.prompt?.(next) ?? null;
    if ((asks !== null) !== (chain === 'choose')) fail('the chosen-double question is wrong');
    if (same) tally.rollAgain += 1;
  } else if (next.toMove !== opponent(player)) {
    fail('the game ended but the same player is to move');
  }
  tally.turns += 1;
  return next;
}

function checkResult(state: GameState, tally: Tally): void {
  const result = asodio.result(state) ?? fail('game over without a result');
  const { board, rules } = state;
  const winner = result.winner;
  switch (result.reason) {
    case 'borneOff': {
      if (winner === null || board.off[winner] !== 15) fail('the winner did not bear off 15');
      const off = board.off[opponent(winner)];
      const points =
        rules.scoring.method === 'perChecker'
          ? 15 - off
          : rules.scoring.method === 'singleOnly' || off > 0
            ? 1
            : 2;
      if (result.points !== points) fail('wrong score');
      break;
    }
    case 'deadlock':
      if (winner !== null || result.points !== 0) fail('a deadlock has a winner');
      for (const player of PLAYERS) {
        if (anyStep(sideOf(board, player), rules)) fail(`${player} can still move: no deadlock`);
      }
      break;
    default:
      fail(`unexpected reason ${result.reason}`);
  }
  tally.reasons[result.reason] = (tally.reasons[result.reason] ?? 0) + 1;
}

function playGame(seed: number, rules: RuleSet, tally: Tally): void {
  const rng = createSeededRng(seed);
  let state = asodio.initialState({ startingPlayer: seed % 2 === 0 ? 'white' : 'black', rules });
  try {
    while (!asodio.isGameOver(state)) {
      const question = asodio.prompt?.(state) ?? null;
      if (question !== null) {
        tally.chosen += 1;
        const choice = pick(rng, question.choices);
        state = asodio.answerPrompt?.(state, question.player, choice) ?? fail('no answer');
        continue;
      }
      state = playTurn(state, rng, tally);
      if (state.turnNumber > MAX_TURNS) fail('the game did not end');
    }
    checkResult(state, tally);
    tally.games += 1;
  } catch (error) {
    const where = `${formatAsodio(state.board)}, ${state.toMove} to move`;
    throw new Error(`game ${seed}, turn ${state.turnNumber} (${where}): ${String(error)}`, {
      cause: error,
    });
  }
}

function run(games: number, firstSeed: number, rules: RuleSet): Tally {
  const tally = newTally();
  for (let seed = firstSeed; seed < firstSeed + games; seed += 1) playGame(seed, rules, tally);
  return tally;
}

/**
 * Games per rule set. The engine tests run on one worker on a 2-core CI
 * runner, so the counts are kept small. Raise them for a longer local run.
 */
const KAFENEIO_GAMES = 300;
const MIX_GAMES = 40;

// Generous timeouts: CI runners have 2 shared cores.
describe('Asodio fuzz', () => {
  it(`kafeneio (default rules): ${KAFENEIO_GAMES} games`, { timeout: 60_000 }, () => {
    const tally = run(KAFENEIO_GAMES, 1, mixRules('asodio.kafeneio', {}));
    expect(tally.games).toBe(KAFENEIO_GAMES);
    for (const key of ['moves', 'engineTurns', 'entries', 'pins', 'bearOffs', 'passes'] as const) {
      expect(tally[key], key).toBeGreaterThan(0);
    }
    // A3: no extra rolls and no chosen double in the owner version.
    expect(tally.rollAgain).toBe(0);
    expect(tally.chosen).toBe(0);
    expect(tally.hits).toBe(0);
    expect(tally.reasons['borneOff']).toBeGreaterThan(0);
    // Random play often freezes both armies (A5, open question Q28).
    expect(tally.reasons['deadlock']).toBeGreaterThan(0);
  });

  it.each(
    ASODIO_RULE_MIX.slice(1).map(
      ([name, preset, overrides], i) => [name, preset, overrides, i] as const,
    ),
  )(`%s: ${MIX_GAMES} games`, { timeout: 60_000 }, (_name, preset, overrides, i) => {
    const rules = mixRules(preset, overrides);
    const tally = run(MIX_GAMES, 100_000 * (i + 1), rules);
    expect(tally.games).toBe(MIX_GAMES);
    expect(tally.moves).toBeGreaterThan(0);
    if (rules.capture.captureMode === 'hit') expect(tally.hits).toBeGreaterThan(0);
    if (rules.specialRolls.aceDeuceChoosesDouble) expect(tally.chosen).toBeGreaterThan(0);
    if (rules.extraRolls.doublesGiveExtraRoll) expect(tally.rollAgain).toBeGreaterThan(0);
  });
});
