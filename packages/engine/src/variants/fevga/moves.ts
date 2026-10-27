/**
 * The Fevga move generator.
 *
 * Rules: `docs/rules/fevga.md` ("Movement rules", "Prime restrictions",
 * "Order of checks") and `docs/rules/tavli-match.md` ("Must use as much of
 * the roll as possible", "Bearing off (shared)").
 *
 * The search follows "Order of checks (engine)" in `fevga.md`:
 *
 * 1. A depth-first search plays one die at a time, in every order. Each
 *    step is a real move, so every middle point of a combined move must be
 *    a legal landing point (movement rule 4), and the runner rule is checked
 *    before every single move (rule 5). The rule ends the moment the runner
 *    passes its target, so the rest of the roll may move any checker.
 * 2. Every position the search reaches is a candidate play: also the shorter
 *    ones, and the start position (no move). Drop the candidates whose end
 *    position breaks P1 or P2. So a shorter play can become the longest
 *    legal one (edge case 12).
 * 3. Keep the candidates that use the most dice. If that is one die of a
 *    normal roll and some candidate uses the higher die, keep only those
 *    (`higherDieRule`).
 * 4. P3: if at least one candidate leaves the opponent a move, drop those
 *    that do not. With `p3Priority: "beforeDiceRule"` this runs before
 *    step 3 instead.
 * 5. Plays that end in the same position are listed once.
 *
 * The search remembers each (position, dice left) it has seen, because the
 * same pair always has the same continuations. We cannot use the Portes
 * trick of "each move of a double starts at or below the move before it":
 * in Fevga, moving the runner down can free the checkers on point 24.
 *
 * Canonical play: when several plays end in the same position, we keep the
 * first one the search finds. It tries the higher die first, and for each
 * die the own points from 24 down to 1.
 */

import type { DieValue } from '../../dice';
import type { Move } from '../../move';
import { PositionMap, otherPoint, put } from './position';
import type { Opponent, Position } from './position';

/** All 15 checkers. */
const ALL = 15;

export interface MoveOptions {
  /** `movement.higherDieRule`. */
  readonly higherDieRule: boolean;
  /**
   * The runner rule (`movement.runnerRule`): the other checkers stay on
   * point 24 until a checker is on this own point or lower (11 for
   * `"passMother"`, 12 for `"reachQuarter"`). `null` = no runner rule.
   */
  readonly runnerTarget: number | null;
  /**
   * P1 and P2: own-point windows `[low, high]` that the mover may not hold
   * in full at the end of the turn.
   */
  readonly bannedPrimes: readonly (readonly [number, number])[];
  /** P3 (`p3MustLeaveMove`) and when it runs (`p3Priority`). */
  readonly leaveMove: 'off' | 'afterDiceRule' | 'beforeDiceRule';
}

/** What a position allows, worked out once per position. */
interface Info {
  /** The runner rule keeps the checkers on point 24 where they are. */
  readonly locked: boolean;
  /** All checkers are in home (own 1–6): bearing off is allowed. */
  readonly home: boolean;
  /** The highest home point with a checker (only when `home`). */
  readonly highest: number;
}

/**
 * True while the runner rule holds the checkers on point 24: a checker has
 * left 24, but no checker has reached the target yet (and none is off).
 * The board tells us all of this, so the state stores nothing.
 */
function runnerLocks(counts: readonly number[], target: number | null): boolean {
  if (target === null || counts[24] === ALL || (counts[0] as number) > 0) return false;
  for (let p = 1; p <= target; p += 1) if ((counts[p] as number) > 0) return false;
  return true;
}

function infoOf(counts: readonly number[], target: number | null): Info {
  let home = true;
  for (let p = 7; p <= 24; p += 1) {
    if ((counts[p] as number) > 0) {
      home = false;
      break;
    }
  }
  let highest = 0;
  if (home) {
    for (let p = 6; p >= 1; p -= 1) {
      if ((counts[p] as number) > 0) {
        highest = p;
        break;
      }
    }
  }
  return { locked: runnerLocks(counts, target), home, highest };
}

/**
 * True when one checker of `counts` may move from own point `from` with
 * `die`. `blockers[to] > 0` means the other side holds own point `to`.
 */
function canMove(
  counts: readonly number[],
  from: number,
  die: number,
  info: Info,
  blockers: readonly number[],
): boolean {
  if ((counts[from] as number) === 0) return false;
  // Movement rule 5: the runner rule.
  if (from === 24 && info.locked) return false;
  const to = from - die;
  // Rules 2 and 3: never land on a point with any opponent checker.
  if (to >= 1) return (blockers[to] as number) === 0;
  // Moving past point 1 is bearing off (tavli-match.md, "Bearing off").
  if (!info.home) return false;
  // Exact die, or the highest checker when the die is larger.
  return to === 0 || from === info.highest;
}

/** True when one checker may move from `from` (own point 1–24) with `die`. */
export function isLegalMove(
  pos: Position,
  opp: Opponent,
  from: number,
  die: number,
  options: MoveOptions,
): boolean {
  if (!Number.isInteger(from) || from < 1 || from > 24) return false;
  return canMove(pos, from, die, infoOf(pos, options.runnerTarget), opp.on);
}

/** Plays one checked move and returns a new position. */
export function playMove(
  pos: Position,
  from: number,
  die: number,
): { readonly next: Position; readonly move: Move } {
  const next = pos.slice();
  const to = Math.max(from - die, 0);
  put(next, from, (next[from] as number) - 1);
  put(next, to, (next[to] as number) + 1);
  return {
    next,
    move: { from, to: to === 0 ? 'off' : to, die: die as DieValue, capture: 'none' },
  };
}

/** True when `pos` holds every own point from `low` to `high`. */
function holdsAll(pos: Position, low: number, high: number): boolean {
  for (let p = low; p <= high; p += 1) if ((pos[p] as number) === 0) return false;
  return true;
}

/** True when the end position `pos` breaks P1 or P2. */
export function breaksPrimeBan(pos: Position, options: MoveOptions): boolean {
  for (const [low, high] of options.bannedPrimes) if (holdsAll(pos, low, high)) return true;
  return false;
}

/**
 * P3: true when the opponent has at least one legal single-die move, for
 * at least one die value 1–6, after the mover ends in `pos`. It uses the
 * opponent's movement rules: their runner rule and bearing off. `info` is
 * `infoOf(opp.own)`, which does not change during the mover's turn.
 */
function opponentCanMove(pos: Position, opp: Opponent, info: Info): boolean {
  const theirs = opp.own;
  for (let die = 1; die <= 6; die += 1) {
    for (let from = 24; from >= 1; from -= 1) {
      if (theirs[from] === 0 || (from === 24 && info.locked)) continue;
      const to = from - die;
      // The opponent's own point `to` is the mover's `otherPoint(to)`.
      if (to >= 1) {
        if (pos[otherPoint(to)] === 0) return true;
      } else if (info.home && (to === 0 || from === info.highest)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * True when a play that uses **every** die and ends in `pos` is legal,
 * without the full search. No longer play exists, so only the end checks
 * can drop it: P1, P2 and P3. A play that passes P1 and P2 and leaves the
 * opponent a move survives every step of the order of checks. (A play that
 * blocks the opponent needs the full search: it is legal only if every
 * play blocks.)
 */
export function fullPlayIsLegal(pos: Position, opp: Opponent, options: MoveOptions): boolean {
  if (breaksPrimeBan(pos, options)) return false;
  if (options.leaveMove === 'off') return true;
  return opponentCanMove(pos, opp, infoOf(opp.own, options.runnerTarget));
}

/** A finished play: its moves and the position it ends in. */
export interface Play {
  readonly moves: readonly Move[];
  readonly final: Position;
}

export interface Generated {
  /** The legal plays, one per end position. Never empty: a pass has no moves. */
  readonly plays: readonly Play[];
  /** How many dice every legal play uses. */
  readonly diceUsed: number;
  /** True when a play that uses the dice `used` and ends in `pos` is legal. */
  readonly isLegal: (pos: Position, used: readonly DieValue[]) => boolean;
}

/** A play the search found. `legal` is set once it passes every filter. */
interface Candidate extends Play {
  legal: boolean;
}

/**
 * A tag for the dice used (or left) in one roll. Within one roll, the count
 * and the first die tell them apart: a normal roll has one die of each
 * value, a double has only one value.
 */
function diceTag(dice: readonly DieValue[]): number {
  return dice.length === 1 ? 7 + (dice[0] as number) : dice.length * 7;
}

/**
 * Every legal play for `dice` from the mover's view. `dice` is the list of
 * single-die moves (`diceMoves`: higher die first, or four of a double).
 */
export function generatePlays(
  start: Position,
  opp: Opponent,
  dice: readonly DieValue[],
  options: MoveOptions,
): Generated {
  const highDie = dice[0] as DieValue;
  const isDouble = dice.length === 4;
  const target = options.runnerTarget;

  // Step 1: every position reachable with some of the dice, first path kept.
  // The key is (position, dice used); within one roll the dice used also
  // tell which dice are left.
  let candidates: Candidate[] = [];
  const seen = new PositionMap<Candidate>();
  const path: Move[] = [];
  const used: DieValue[] = [];
  const search = (pos: Position, left: readonly DieValue[]): void => {
    const tag = diceTag(used);
    if (seen.get(pos, tag) !== undefined) return;
    const candidate: Candidate = { moves: path.slice(), final: pos, legal: false };
    seen.add(pos, candidate, tag);
    candidates.push(candidate);
    if (left.length === 0) return;
    const info = infoOf(pos, target);
    for (let i = 0; i < left.length; i += 1) {
      const die = left[i] as DieValue;
      if (i > 0 && left[i - 1] === die) continue; // same die value, same moves
      const rest = left.filter((_, j) => j !== i);
      for (let from = 24; from >= 1; from -= 1) {
        if (!canMove(pos, from, die, info, opp.on)) continue;
        const { next, move } = playMove(pos, from, die);
        path.push(move);
        used.push(die);
        search(next, rest);
        used.pop();
        path.pop();
      }
    }
  };
  search(start, dice);

  // Step 2: P1 and P2 are absolute bans on the end position.
  if (options.bannedPrimes.length > 0) {
    const allowed = candidates.filter((play) => !breaksPrimeBan(play.final, options));
    // Only a made-up start position can break a ban before any move. Then
    // nothing is left, and the player passes.
    candidates = allowed.length > 0 ? allowed : candidates.slice(0, 1);
  }

  const leavesMove = (plays: Candidate[]): Candidate[] => {
    const info = infoOf(opp.own, target);
    const open = plays.filter((play) => opponentCanMove(play.final, opp, info));
    return open.length > 0 ? open : plays;
  };

  if (options.leaveMove === 'beforeDiceRule') candidates = leavesMove(candidates);

  // Step 3: as many dice as possible, then the higher die rule.
  let diceUsed = 0;
  for (const play of candidates) diceUsed = Math.max(diceUsed, play.moves.length);
  candidates = candidates.filter((play) => play.moves.length === diceUsed);
  if (diceUsed === 1 && !isDouble && options.higherDieRule) {
    const high = candidates.filter((play) => play.moves[0]?.die === highDie);
    if (high.length > 0) candidates = high;
  }

  // Step 4: P3, if at least one play leaves the opponent a move.
  if (options.leaveMove === 'afterDiceRule') candidates = leavesMove(candidates);

  // Step 5: one play per end position. Any order of a legal play is legal.
  // Plays of the same length can only share an end position when one die
  // of a normal roll is played (5 or 6 from point 5 bears off the same).
  const finals = diceUsed === 1 && !isDouble ? new PositionMap<true>() : null;
  const plays: Play[] = [];
  for (const play of candidates) {
    play.legal = true;
    if (finals === null || finals.add(play.final, true)) plays.push(play);
  }
  return {
    plays,
    diceUsed,
    isLegal: (pos, dice) => seen.get(pos, diceTag(dice))?.legal === true,
  };
}

/**
 * True when a play that is at `pos`, with the dice `left` and the dice
 * `used` so far, can still end as a legal play with exactly `more` moves.
 * `failed` remembers dead ends for one caller.
 */
export function canFinish(
  pos: Position,
  opp: Opponent,
  left: readonly DieValue[],
  used: readonly DieValue[],
  more: number,
  legal: Generated,
  options: MoveOptions,
  failed: PositionMap<true> = new PositionMap(),
): boolean {
  if (more === 0) return legal.isLegal(pos, used);
  const tag = diceTag(left);
  if (failed.get(pos, tag) !== undefined) return false;
  const info = infoOf(pos, options.runnerTarget);
  for (let i = 0; i < left.length; i += 1) {
    const die = left[i] as DieValue;
    if (i > 0 && left[i - 1] === die) continue;
    const rest = left.filter((_, j) => j !== i);
    for (let from = 24; from >= 1; from -= 1) {
      if (!canMove(pos, from, die, info, opp.on)) continue;
      const { next } = playMove(pos, from, die);
      if (canFinish(next, opp, rest, [...used, die], more - 1, legal, options, failed)) {
        return true;
      }
    }
  }
  failed.add(pos, true, tag);
  return false;
}
