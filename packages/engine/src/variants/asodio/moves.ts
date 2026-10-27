/**
 * The Asodio move generator.
 *
 * Rules: `docs/rules/asodio.md` (owner version, "Movement rules", "Hitting
 * / pinning / blocking rules", "Bearing off") and `docs/rules/tavli-match.md`
 * ("Must use as much of the roll as possible", "Bearing off (shared)").
 *
 * The search is the one of Portes and Plakoto: a depth-first search plays
 * one die at a time, keeps the plays that use the most dice, then applies
 * the higher-die rule, and keeps one play per end position. Doubles try
 * only orders where each move starts on the same origin as the move before
 * it or lower (bar, then outside, then own points 24 to 1), and remember
 * the (position, dice left, origin) triples they have seen.
 *
 * Why the "doubles in order" trick still holds with the Asodio rules: a
 * move from a lower origin never makes a move from a higher origin legal
 * or illegal, and a move from a higher origin only ever makes more moves
 * legal for lower origins. Entering the last outside checker ends the
 * loading lock; moving the last checker out of the rear quarter frees the
 * front. Both are moves from the highest origin there is. Pins and hits
 * happen below the moving checker.
 *
 * The rules a single move checks, in order:
 *
 * 1. Hit checkers on the bar enter before anything else moves (movement
 *    rule 4). Checkers that have not entered yet have no such priority.
 * 2. A die `d` enters a checker (bar or outside) on own point `25 - d`
 *    (spot `d` of the starting quarter).
 * 3. A pinned checker cannot move (phase 3.2).
 * 4. While some checkers are still outside: with `moveWhileLoading: false`
 *    no checker on the board moves (phase 1.7); with `mustEnterAllFirst` no
 *    checker leaves the starting quarter (phase 1.6).
 * 5. `quarterLock`: the rear quarter is the quarter of the mover's last
 *    checker. A checker in a quarter in front of it is frozen (phase 2):
 *    it does not move, or with `moveInsideFrozenQuarter` it moves only
 *    inside its quarter.
 * 6. The landing point: not 2+ opponent checkers. With pins, also not a
 *    point where the opponent pins our checker. One free opponent checker
 *    is pinned (`captureMode: "pin"`) or hit to the bar (`"hit"`).
 * 7. Bearing off: nothing outside or on the bar, all checkers home, none
 *    pinned (unless `bearOffWhilePinned`). Exact die, or (without
 *    `exactBearOff`) the highest checker with a larger die.
 *
 * Rules that judge the whole roll (the first-entry gate and
 * `barEntryNeedsSpecial`) are in `rollBlocked`. Everything here is checked
 * after each single move, so a lock that ends in the middle of a roll lets
 * the rest of the roll move freely (like bearing off in the shared rules).
 */

import type { DieValue } from '../../dice';
import type { Move } from '../../move';
import {
  BAR,
  FREE,
  MINE,
  OFF,
  OPP,
  OPP_BAR,
  OUTSIDE,
  PIN,
  PositionMap,
  THEIRS,
  put,
} from './position';
import type { Position } from './position';

/** The flags the search reads, from the `RuleSet`. */
export interface MoveOptions {
  /** `movement.higherDieRule`. */
  readonly higherDieRule: boolean;
  /** `capture.captureMode === "pin"`; else a lone checker is hit. */
  readonly pin: boolean;
  /** `entry.firstEntryGate`. */
  readonly firstEntryGate: boolean;
  /** `entry.firstEntryGateRolls === "doubleOnly"`; else a 1-2 opens the gate too. */
  readonly gateDoubleOnly: boolean;
  /** `entry.mustEnterAllFirst`. */
  readonly mustEnterAllFirst: boolean;
  /** `entry.moveWhileLoading`. */
  readonly moveWhileLoading: boolean;
  /** `entry.barEntryNeedsSpecial`. */
  readonly barEntryNeedsSpecial: boolean;
  /** `quarters.quarterLock`. */
  readonly quarterLock: boolean;
  /** `quarters.moveInsideFrozenQuarter`. */
  readonly moveInsideFrozenQuarter: boolean;
  /** `bearOff.exactBearOff`. */
  readonly exactBearOff: boolean;
  /** `bearOff.bearOffWhilePinned`. */
  readonly bearOffWhilePinned: boolean;
}

/** A finished play: its moves and the position it ends in. */
export interface Play {
  readonly moves: readonly Move[];
  readonly final: Position;
}

export interface Generated {
  /** The legal plays, one per final position. Never empty: a pass has no moves. */
  readonly plays: readonly Play[];
  /** True when `pos` is the end position of a legal play. */
  readonly isFinal: (pos: Position) => boolean;
  /** How many dice every legal play uses. */
  readonly diceUsed: number;
  /** True when the higher-die rule applies: a one-move play must use `highDie`. */
  readonly mustUseHighDie: boolean;
  readonly highDie: DieValue;
}

/** The quarter of own point `p`: 0 = 19–24 (the starting quarter) … 3 = 1–6 (home). */
export function quarterOf(p: number): number {
  return Math.floor((24 - p) / 6);
}

/**
 * The rear quarter: the quarter of the mover's last checker. Checkers on
 * the bar or outside count as the starting quarter. With all checkers
 * borne off it is home (3).
 */
export function rearQuarter(pos: Position): number {
  if ((pos[BAR] as number) > 0 || (pos[OUTSIDE] as number) > 0) return 0;
  for (let p = 24; p >= 1; p -= 1) if ((pos[p] as number) > 0) return quarterOf(p);
  return 3;
}

/** A 1-2 (ασόδυο), from the single-die list of a roll. */
function isAceDeuce(dice: readonly DieValue[]): boolean {
  return dice.length === 2 && dice.includes(1) && dice.includes(2);
}

/**
 * True when the roll cannot move any checker, whatever the board:
 *
 * - `firstEntryGate`: no checker has entered yet (all 15 outside) and the
 *   roll is not a 1-2 or a double (`"doubleOnly"`: not a double). Owner
 *   phase 1.2, edge cases 2 and 14.
 * - `barEntryNeedsSpecial`: a hit checker is on the bar and the roll is not
 *   a 1-2 or a double. The bar checker must enter first, so nothing moves.
 *
 * `dice` is the single-die list (`diceMoves`). A chosen double counts as a
 * double.
 */
export function rollBlocked(
  pos: Position,
  dice: readonly DieValue[],
  options: MoveOptions,
): boolean {
  const double = dice.length === 4;
  const special = double || isAceDeuce(dice);
  if (options.firstEntryGate && pos[OUTSIDE] === 15) {
    if (!(options.gateDoubleOnly ? double : special)) return true;
  }
  return options.barEntryNeedsSpecial && (pos[BAR] as number) > 0 && !special;
}

/** Movement rule 5 and phase 3: no door; with pins, no point where the opponent pins us. */
function canLand(pos: Position, to: number, pin: boolean): boolean {
  const theirs = pos[OPP + to] as number;
  if (theirs === 0) return true;
  if (!pin) return theirs === 1;
  const state = pos[PIN + to] as number;
  return state === THEIRS || (theirs === 1 && state === FREE);
}

/** Bearing off: nothing outside or on the bar, all home, none pinned (unless the flag allows it). */
function mayBearOff(pos: Position, options: MoveOptions): boolean {
  if ((pos[BAR] as number) > 0 || (pos[OUTSIDE] as number) > 0) return false;
  for (let p = 7; p <= 24; p += 1) if ((pos[p] as number) > 0) return false;
  if (options.pin && !options.bearOffWhilePinned) {
    for (let p = 1; p <= 6; p += 1) if (pos[PIN + p] === MINE) return false;
  }
  return true;
}

/** What the single-move test needs to know about a position, computed once. */
interface Context {
  readonly bar: number;
  readonly outside: number;
  readonly rear: number;
  readonly bearOff: boolean;
  /** The highest own point with a checker, when bearing off. */
  readonly highest: number;
}

function contextOf(pos: Position, options: MoveOptions): Context {
  const bearOff = mayBearOff(pos, options);
  let highest = 0;
  if (bearOff) {
    for (let p = 6; p >= 1 && highest === 0; p -= 1) if ((pos[p] as number) > 0) highest = p;
  }
  return {
    bar: pos[BAR] as number,
    outside: pos[OUTSIDE] as number,
    rear: options.quarterLock ? rearQuarter(pos) : 0,
    bearOff,
    highest,
  };
}

/** True when one checker may move from `from` (own point, `OUTSIDE` or `BAR`) with `die`. */
function legalFrom(
  pos: Position,
  from: number,
  die: number,
  ctx: Context,
  options: MoveOptions,
): boolean {
  // Movement rule 4: hit checkers enter first.
  if (ctx.bar > 0 && from !== BAR) return false;
  if ((pos[from] as number) === 0) return false;
  // Movement rule 1 / phase 1.3–1.5: die d enters on own point 25 - d.
  if (from >= OUTSIDE) return canLand(pos, 25 - die, options.pin);
  // Phase 3.2: a pinned checker cannot move.
  if (pos[PIN + from] === MINE) return false;
  const to = from - die;
  if (ctx.outside > 0) {
    // Phase 1.7 (moveWhileLoading) and 1.6 (mustEnterAllFirst).
    if (!options.moveWhileLoading) return false;
    if (options.mustEnterAllFirst && to < 19) return false;
  }
  if (options.quarterLock) {
    // Phase 2.2–2.4: a checker in front of the rear quarter is frozen.
    const quarter = quarterOf(from);
    if (quarter > ctx.rear) {
      if (!options.moveInsideFrozenQuarter || to < 1 || quarterOf(to) !== quarter) return false;
    }
  }
  if (to >= 1) return canLand(pos, to, options.pin);
  if (!ctx.bearOff) return false;
  // tavli-match.md "Bearing off (shared)" 2–4, or the exact die only.
  return to === 0 || (!options.exactBearOff && from === ctx.highest);
}

/** True when one checker may move from `from` (own point 1–24, `OUTSIDE` or `BAR`) with `die`. */
export function isLegalMove(
  pos: Position,
  from: number,
  die: number,
  options: MoveOptions,
): boolean {
  if (!Number.isInteger(from) || from < 1 || from > BAR) return false;
  return legalFrom(pos, from, die, contextOf(pos, options), options);
}

/** Plays one checked move and returns a new position. */
export function playMove(
  pos: Position,
  from: number,
  die: number,
  options: MoveOptions,
): { readonly next: Position; readonly move: Move } {
  const next = pos.slice();
  const to = from >= OUTSIDE ? 25 - die : Math.max(from - die, 0);
  put(next, from, (next[from] as number) - 1);
  // Phase 3.4: the last pinner leaves, the pinned checker is free.
  if (from < OUTSIDE && next[from] === 0 && next[PIN + from] === THEIRS) {
    put(next, PIN + from, FREE);
  }
  let capture: Move['capture'] = 'none';
  if (to === 0) {
    put(next, OFF, (next[OFF] as number) + 1);
  } else {
    if (next[OPP + to] === 1 && next[PIN + to] === FREE) {
      if (options.pin) {
        // Phase 3.2: landing on a lone opponent checker pins it.
        capture = 'pin';
        put(next, PIN + to, THEIRS);
      } else {
        // captureMode "hit": the checker goes to the bar.
        capture = 'hit';
        put(next, OPP + to, 0);
        put(next, OPP_BAR, (next[OPP_BAR] as number) + 1);
      }
    }
    put(next, to, (next[to] as number) + 1);
  }
  return {
    next,
    move: {
      from: from === BAR ? 'bar' : from === OUTSIDE ? 'outside' : from,
      to: to === 0 ? 'off' : to,
      die: die as DieValue,
      capture,
    },
  };
}

/** True when the mover has a legal single move with some die 1–6 (the roll gates aside). */
export function hasAnyMove(pos: Position, options: MoveOptions): boolean {
  const ctx = contextOf(pos, options);
  for (let die = 1; die <= 6; die += 1) {
    for (let from = BAR; from >= 1; from -= 1) {
      if (legalFrom(pos, from, die, ctx, options)) return true;
    }
  }
  return false;
}

interface Leaf {
  readonly moves: readonly Move[];
  readonly final: Position;
  readonly usesHighDie: boolean;
}

/** The result for a roll that cannot move: one pass. */
function pass(start: Position, highDie: DieValue): Generated {
  const finals = new PositionMap<true>();
  finals.set(start, true);
  return {
    plays: [{ moves: [], final: start }],
    isFinal: (pos) => finals.get(pos) !== undefined,
    diceUsed: 0,
    mustUseHighDie: false,
    highDie,
  };
}

/**
 * Every legal play for `dice` from the mover's view. `dice` is the list of
 * single-die moves (`diceMoves`: higher die first, or four of a double).
 */
export function generatePlays(
  start: Position,
  dice: readonly DieValue[],
  options: MoveOptions,
): Generated {
  const highDie = dice[0] as DieValue;
  if (rollBlocked(start, dice, options)) return pass(start, highDie);
  const isDouble = dice.length === 4;
  const seen = new PositionMap<true>();
  const leaves: Leaf[] = [];
  const leafIndex = new PositionMap<number>();
  let mostUsed = 0;
  const path: Move[] = [];

  const record = (pos: Position): void => {
    const used = path.length;
    const usesHighDie = used > 0 && path[0]?.die === highDie;
    if (used > mostUsed) mostUsed = used;
    const index = leafIndex.get(pos);
    if (index === undefined) {
      leafIndex.set(pos, leaves.length);
      leaves.push({ moves: path.slice(), final: pos, usesHighDie });
      return;
    }
    // Prefer more dice, then a play that uses the higher die; else keep the first.
    const old = leaves[index] as Leaf;
    if (old.moves.length < used || (old.moves.length === used && !old.usesHighDie && usesHighDie)) {
      leaves[index] = { moves: path.slice(), final: old.final, usesHighDie };
    }
  };

  // `top` is the highest origin the next move may use. For a double it is
  // the origin of the previous move (see the file comment); else the bar.
  const search = (pos: Position, left: readonly DieValue[], top: number): void => {
    if (left.length === 0) {
      record(pos);
      return;
    }
    if (isDouble) {
      const tag = left.length * 27 + top;
      if (seen.get(pos, tag) !== undefined) return;
      seen.set(pos, true, tag);
    }
    const ctx = contextOf(pos, options);
    let moved = false;
    for (let i = 0; i < left.length; i += 1) {
      const die = left[i] as DieValue;
      if (i > 0 && left[i - 1] === die) continue; // same die value, same moves
      const rest = left.filter((_, j) => j !== i);
      for (let from = top; from >= 1; from -= 1) {
        if (!legalFrom(pos, from, die, ctx, options)) continue;
        const { next, move } = playMove(pos, from, die, options);
        moved = true;
        path.push(move);
        search(next, rest, isDouble ? from : BAR);
        path.pop();
      }
    }
    if (!moved) record(pos);
  };

  search(start, dice, BAR);

  const mustUseHighDie =
    mostUsed === 1 &&
    !isDouble &&
    options.higherDieRule &&
    leaves.some((leaf) => leaf.moves.length === 1 && leaf.usesHighDie);

  const plays: Play[] = [];
  const finals = new PositionMap<true>();
  for (const leaf of leaves) {
    if (leaf.moves.length !== mostUsed) continue;
    if (mustUseHighDie && !leaf.usesHighDie) continue;
    plays.push({ moves: leaf.moves, final: leaf.final });
    finals.set(leaf.final, true);
  }
  return {
    plays,
    isFinal: (pos) => finals.get(pos) !== undefined,
    diceUsed: mostUsed,
    mustUseHighDie,
    highDie,
  };
}

/** See `finisher`. */
export type Finish = (pos: Position, left: readonly DieValue[], more: number) => boolean;

/**
 * Builds a test for the plays of one roll (`legal`): can a play that is at
 * `pos`, with the dice `left`, still end as a legal play with exactly
 * `more` more moves? With every die used, any legal moves do. Else the play
 * must end in an end position of `legal`. `pos` must be reached by legal
 * moves from the turn start. Results are remembered per (position, dice
 * left), so one test serves a whole turn.
 */
export function finisher(legal: Generated, options: MoveOptions): Finish {
  const memo = new PositionMap<boolean>();
  const finish: Finish = (pos, left, more) => {
    if (more === 0) return left.length === 0 || legal.isFinal(pos);
    if (left.length < more) return false;
    const tag = diceTag(left);
    const known = memo.get(pos, tag);
    if (known !== undefined) return known;
    const ctx = contextOf(pos, options);
    let ok = false;
    for (let i = 0; i < left.length && !ok; i += 1) {
      const die = left[i] as DieValue;
      if (i > 0 && left[i - 1] === die) continue;
      const rest = left.filter((_, j) => j !== i);
      for (let from = BAR; from >= 1 && !ok; from -= 1) {
        if (!legalFrom(pos, from, die, ctx, options)) continue;
        ok = finish(playMove(pos, from, die, options).next, rest, more - 1);
      }
    }
    memo.set(pos, ok, tag);
    return ok;
  };
  return finish;
}

/** A number (0–319) for a list of dice left, for `PositionMap` tags. */
export function diceTag(left: readonly DieValue[]): number {
  return left.length * 64 + (left[0] ?? 0) * 8 + (left[1] ?? 0);
}
