/**
 * The Plakoto move generator.
 *
 * Rules: `docs/rules/plakoto.md` ("Movement rules", "Hitting / pinning /
 * blocking rules", "Bearing off") and `docs/rules/tavli-match.md` ("Must
 * use as much of the roll as possible", "Bearing off (shared)").
 *
 * The search is the one of Portes (`../portes/moves.ts`): a depth-first
 * search plays one die at a time, keeps the plays that use the most dice,
 * then applies the higher-die rule, and keeps one play per end position.
 * Doubles try only orders where each move starts on the same point as the
 * move before it or lower, and remember the (position, dice left) pairs
 * they have seen. The proof that no play is lost holds here too: a move
 * from a lower point never changes whether a move from a higher point is
 * legal (pins change only when a checker lands or leaves, and both happen
 * below the higher point).
 *
 * Plakoto differences:
 *
 * - No bar. Landing on one free opponent checker pins it (`capture: 'pin'`).
 * - A point is closed when it holds 2+ opponent checkers, or when the
 *   opponent pins one of our checkers there.
 * - A pinned checker cannot move. When the last pinner leaves, the pin ends.
 * - No bearing off while one of our checkers is pinned
 *   (`bearOffWhilePinned`).
 * - `intermediatePinBlocks`: a checker that pinned this turn may not move
 *   on. A combined move through a lone opponent checker is then illegal
 *   (`plakoto.md` edge case 9).
 *
 * The mother rule (a game that ends in the middle of a turn) is in
 * `mother.ts`. This file never ends a game.
 */

import type { DieValue } from '../../dice';
import type { Move } from '../../move';
import { FREE, MINE, OFF, OPP, PIN, PositionMap, THEIRS, THEIRS_NEW, put } from './position';
import type { Position } from './position';

export interface MoveOptions {
  /** `movement.higherDieRule`. */
  readonly higherDieRule: boolean;
  /** `capture.intermediatePinBlocks`. */
  readonly intermediatePinBlocks: boolean;
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

/** Movement rules 2 and 3: empty, ours on top, or one free opponent checker. */
function canLand(pos: Position, to: number): boolean {
  const theirs = pos[OPP + to] as number;
  if (theirs === 0) return true;
  const pin = pos[PIN + to] as number;
  return pin >= THEIRS || (theirs === 1 && pin === FREE);
}

/** True when the mover may bear off: all checkers home, and none pinned (unless the flag allows it). */
function mayBearOff(pos: Position, options: MoveOptions): boolean {
  for (let p = 7; p <= 24; p += 1) if ((pos[p] as number) > 0) return false;
  if (!options.bearOffWhilePinned) {
    for (let p = 1; p <= 6; p += 1) if (pos[PIN + p] === MINE) return false;
  }
  return true;
}

/** The highest own point with a checker, or 0 if none. Only used when all are home. */
function highestHomePoint(pos: Position): number {
  for (let p = 6; p >= 1; p -= 1) if ((pos[p] as number) > 0) return p;
  return 0;
}

function legalFrom(
  pos: Position,
  from: number,
  die: number,
  bearOff: boolean,
  highest: number,
): boolean {
  const here = pos[from] as number;
  if (here === 0) return false;
  const pin = pos[PIN + from] as number;
  // Movement rule 5 / pinning rule 2: a pinned checker cannot move.
  if (pin === MINE) return false;
  // intermediatePinBlocks: the last checker of a pin made this turn stays.
  if (pin === THEIRS_NEW && here === 1) return false;
  const to = from - die;
  if (to >= 1) return canLand(pos, to);
  if (!bearOff) return false;
  // tavli-match.md "Bearing off (shared)" 2–4.
  return to === 0 || from === highest;
}

/** True when one checker may move from own point `from` with `die`. */
export function isLegalMove(
  pos: Position,
  from: number,
  die: number,
  options: MoveOptions,
): boolean {
  if (!Number.isInteger(from) || from < 1 || from > 24) return false;
  const bearOff = mayBearOff(pos, options);
  return legalFrom(pos, from, die, bearOff, bearOff ? highestHomePoint(pos) : 0);
}

/**
 * Plays one checked move on `pos` itself (no copy) and returns a number
 * that `undoMove` needs to take it back. The search uses this pair, so it
 * copies a position only when it keeps it.
 *
 * Bits: 0–4 the landing point (0 = off), 5 a new pin, 6 a pin released on
 * `from`, 7–8 the pin value that was released.
 */
function doMove(pos: Position, from: number, die: number, options: MoveOptions): number {
  const to = Math.max(from - die, 0);
  let code = to;
  put(pos, from, (pos[from] as number) - 1);
  const fromPin = pos[PIN + from] as number;
  if (pos[from] === 0 && fromPin >= THEIRS) {
    put(pos, PIN + from, FREE);
    code |= 64 | (fromPin << 7);
  }
  if (to === 0) {
    put(pos, OFF, (pos[OFF] as number) + 1);
    return code;
  }
  if (pos[OPP + to] === 1 && pos[PIN + to] === FREE) {
    put(pos, PIN + to, options.intermediatePinBlocks ? THEIRS_NEW : THEIRS);
    code |= 32;
  }
  put(pos, to, (pos[to] as number) + 1);
  return code;
}

function undoMove(pos: Position, from: number, code: number): void {
  const to = code & 31;
  if (to === 0) {
    put(pos, OFF, (pos[OFF] as number) - 1);
  } else {
    put(pos, to, (pos[to] as number) - 1);
    if ((code & 32) !== 0) put(pos, PIN + to, FREE);
  }
  if ((code & 64) !== 0) put(pos, PIN + from, (code >> 7) & 3);
  put(pos, from, (pos[from] as number) + 1);
}

function moveOf(from: number, die: number, code: number): Move {
  const to = code & 31;
  return {
    from,
    to: to === 0 ? 'off' : to,
    die: die as DieValue,
    capture: (code & 32) !== 0 ? 'pin' : 'none',
  };
}

/** Plays one checked move and returns a new position. */
export function playMove(
  pos: Position,
  from: number,
  die: number,
  options: MoveOptions,
): { readonly next: Position; readonly move: Move } {
  const next = pos.slice();
  const to = Math.max(from - die, 0);
  put(next, from, (next[from] as number) - 1);
  // Movement rule 6: the last pinner leaves, the pinned checker is free.
  if (next[from] === 0 && (next[PIN + from] as number) >= THEIRS) put(next, PIN + from, FREE);
  let pin = false;
  if (to === 0) {
    put(next, OFF, (next[OFF] as number) + 1);
  } else {
    if (next[OPP + to] === 1 && next[PIN + to] === FREE) {
      // Pinning rule 1: landing on one free opponent checker pins it.
      pin = true;
      put(next, PIN + to, options.intermediatePinBlocks ? THEIRS_NEW : THEIRS);
    }
    put(next, to, (next[to] as number) + 1);
  }
  return {
    next,
    move: {
      from,
      to: to === 0 ? 'off' : to,
      die: die as DieValue,
      capture: pin ? 'pin' : 'none',
    },
  };
}

/**
 * The position with every `THEIRS_NEW` pin written as `THEIRS`, so two
 * plays that end on the same board compare equal (a pin can end and be
 * made again in one turn). Returns `pos` itself when it has no such pin,
 * else a new copy.
 */
export function normal(pos: Position): Position {
  let copy: Position | null = null;
  for (let p = 1; p <= 24; p += 1) {
    if (pos[PIN + p] !== THEIRS_NEW) continue;
    copy ??= pos.slice();
    put(copy, PIN + p, THEIRS);
  }
  return copy ?? pos;
}

interface Leaf {
  readonly moves: readonly Move[];
  readonly final: Position;
  readonly usesHighDie: boolean;
}

/**
 * Every legal play for `dice` from the mover's view, without the mother
 * rule. `dice` is the list of single-die moves (`diceMoves`).
 */
export function generatePlays(
  start: Position,
  dice: readonly DieValue[],
  options: MoveOptions,
): Generated {
  const highDie = dice[0] as DieValue;
  const isDouble = dice.length === 4;
  const seen = new PositionMap<true>();
  const leaves: Leaf[] = [];
  const leafIndex = new PositionMap<number>();
  let mostUsed = 0;
  const path: Move[] = [];
  // Only pins made this turn carry `THEIRS_NEW`, so a path without a pin needs no fix.
  const norm = (pos: Position): Position =>
    options.intermediatePinBlocks && path.some((m) => m.capture === 'pin') ? normal(pos) : pos;

  const record = (pos: Position): void => {
    const used = path.length;
    const usesHighDie = used > 0 && path[0]?.die === highDie;
    if (used > mostUsed) mostUsed = used;
    const key = norm(pos);
    const index = leafIndex.get(key);
    if (index === undefined) {
      const final = key === pos ? pos.slice() : key;
      leafIndex.set(final, leaves.length);
      leaves.push({ moves: path.slice(), final, usesHighDie });
      return;
    }
    // Prefer more dice, then a play that uses the higher die; else keep the first.
    const old = leaves[index] as Leaf;
    if (old.moves.length < used || (old.moves.length === used && !old.usesHighDie && usesHighDie)) {
      leaves[index] = { moves: path.slice(), final: old.final, usesHighDie };
    }
  };

  const search = (pos: Position, left: readonly DieValue[], top: number): void => {
    if (left.length === 0) {
      record(pos);
      return;
    }
    if (isDouble) {
      const tag = left.length * 25 + top;
      if (seen.get(pos, tag) !== undefined) return;
      seen.set(pos.slice(), true, tag);
    }
    const bearOff = mayBearOff(pos, options);
    const highest = bearOff ? highestHomePoint(pos) : 0;
    let moved = false;
    for (let i = 0; i < left.length; i += 1) {
      const die = left[i] as DieValue;
      if (i > 0 && left[i - 1] === die) continue;
      const rest = left.filter((_, j) => j !== i);
      for (let from = top; from >= 1; from -= 1) {
        if (!legalFrom(pos, from, die, bearOff, highest)) continue;
        // `pos` is changed in place and restored after the search below.
        const code = doMove(pos, from, die, options);
        moved = true;
        path.push(moveOf(from, die, code));
        search(pos, rest, isDouble ? from : 24);
        path.pop();
        undoMove(pos, from, code);
      }
    }
    if (!moved) record(pos);
  };

  search(start.slice(), dice, 24);

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
    isFinal: (pos) => finals.get(options.intermediatePinBlocks ? normal(pos) : pos) !== undefined,
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
    const bearOff = mayBearOff(pos, options);
    const highest = bearOff ? highestHomePoint(pos) : 0;
    let ok = false;
    for (let i = 0; i < left.length && !ok; i += 1) {
      const die = left[i] as DieValue;
      if (i > 0 && left[i - 1] === die) continue;
      const rest = left.filter((_, j) => j !== i);
      for (let from = 24; from >= 1 && !ok; from -= 1) {
        if (!legalFrom(pos, from, die, bearOff, highest)) continue;
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
