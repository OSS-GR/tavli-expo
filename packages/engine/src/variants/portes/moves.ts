/**
 * The Portes move generator.
 *
 * Rules: `docs/rules/portes.md` ("Movement rules", "Hitting", "Bearing off")
 * and `docs/rules/tavli-match.md` ("Must use as much of the roll as
 * possible", "Bearing off (shared)").
 *
 * The search follows the engine algorithm in `tavli-match.md`:
 *
 * 1. A depth-first search plays one die at a time, in every order (both
 *    orders for a normal roll, up to four moves for a double). Because each
 *    step is a real move, the middle point of a combined move must be a legal
 *    landing point (portes.md, movement rule 4).
 * 2. A play ends when all dice are used or no remaining die can move.
 * 3. Keep the plays that use the most dice.
 * 4. If that is one die of a normal roll and some play uses the higher die,
 *    keep only those (`higherDieRule`).
 * 5. Plays that end in the same position are kept once.
 *
 * Pruning (doubles): the search remembers each (position, moves left, top
 * origin) it has seen. The same triple always has the same continuations,
 * so it is searched only once: different moves often meet in the same
 * middle position. A normal roll has only two levels and needs no pruning.
 *
 * Doubles: all four moves use the same die, so the order of the moves only
 * matters when one checker moves twice. The search only tries orders where
 * each move starts on the same point as the move before it or lower (the bar
 * counts as 25). Every legal play can be put in that order and stay legal
 * with the same end position: checkers only move down, so a move from a
 * lower point can never make a move from a higher point legal or illegal.
 * This cuts the 4! orders of four moves to one. A shorter play that stops
 * only because of this order is never the longest, so step 3 drops it.
 *
 * Canonical play: when several plays end in the same position, we keep the
 * **first one the search finds**. The search tries the higher die first, and
 * for each die it tries the bar first, then own points from 24 down to 1. So
 * the kept play moves the higher die first and the back checkers first.
 * `applyTurn` accepts any legal order of moves that ends in a legal position.
 */

import type { DieValue } from '../../dice';
import type { Move } from '../../move';
import { BAR, FROZEN, OFF, OPP, OPP_BAR, PositionMap, put } from './position';
import type { Position } from './position';

export interface MoveOptions {
  /** `movement.higherDieRule`. */
  readonly higherDieRule: boolean;
  /** `capture.noHitAndRunInHome`. */
  readonly noHitAndRunInHome: boolean;
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

/** True when all checkers are home (own points 1–6) and none is on the bar. */
function allHome(pos: Position): boolean {
  if ((pos[BAR] as number) > 0) return false;
  for (let p = 7; p <= 24; p += 1) if ((pos[p] as number) > 0) return false;
  return true;
}

/** The highest own point with a checker, or 0 if none. Only used when all are home. */
function highestHomePoint(pos: Position): number {
  for (let p = 6; p >= 1; p -= 1) if ((pos[p] as number) > 0) return p;
  return 0;
}

/** Checkers on `from` that may still move this turn. */
function movable(pos: Position, from: number): number {
  const here = pos[from] as number;
  return from <= 6 ? here - (pos[FROZEN + from] as number) : here;
}

/**
 * True when one checker may move from `from` (own point 1–24, or `BAR`)
 * with `die`. `home` and `highest` are `allHome(pos)` and
 * `highestHomePoint(pos)`, passed in so a caller can reuse them.
 */
function legalFrom(
  pos: Position,
  from: number,
  die: number,
  home: boolean,
  highest: number,
): boolean {
  // portes.md movement rule 5: bar checkers enter before anything else moves.
  if ((pos[BAR] as number) > 0 && from !== BAR) return false;
  if (movable(pos, from) <= 0) return false;
  const to = from - die;
  // Rules 2 and 3 (and hitting rule 3 for entry): no landing on a door.
  if (to >= 1) return (pos[OPP + to] as number) < 2;
  // Moving past point 1 is bearing off (tavli-match.md, "Bearing off").
  if (!home) return false;
  // Exact die, or the highest checker when the die is larger (rules 2–4).
  return to === 0 || from === highest;
}

/** True when one checker may move from `from` (own point 1–24, or `BAR`) with `die`. */
export function isLegalMove(pos: Position, from: number, die: number): boolean {
  if (!Number.isInteger(from) || from < 1 || from > BAR) return false;
  return legalFrom(pos, from, die, allHome(pos), highestHomePoint(pos));
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
  let hit = false;
  if (to === 0) {
    put(next, OFF, (next[OFF] as number) + 1);
  } else {
    put(next, to, (next[to] as number) + 1);
    if (next[OPP + to] === 1) {
      // Hitting rule 1: the hit checker goes to the bar.
      hit = true;
      put(next, OPP + to, 0);
      put(next, OPP_BAR, (next[OPP_BAR] as number) + 1);
      // Flag noHitAndRunInHome: a checker that hits in own home stays there this turn.
      if (options.noHitAndRunInHome && to <= 6) put(next, FROZEN + to, 1);
    }
  }
  return {
    next,
    move: {
      from: from === BAR ? 'bar' : from,
      to: to === 0 ? 'off' : to,
      die: die as DieValue,
      capture: hit ? 'hit' : 'none',
    },
  };
}

interface Leaf {
  readonly moves: readonly Move[];
  readonly final: Position;
  readonly usesHighDie: boolean;
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
  const isDouble = dice.length === 4;
  // (position, dice left, top) already searched.
  const seen = new PositionMap<true>();
  // The best leaf per final position, in the order first found.
  const leaves: Leaf[] = [];
  const leafIndex = new PositionMap<number>();
  let mostUsed = 0;
  const path: Move[] = [];

  const record = (pos: Position): void => {
    const used = path.length;
    const usesHighDie = used > 0 && path[0]?.die === highDie;
    const leaf: Leaf = { moves: path.slice(), final: pos, usesHighDie };
    if (used > mostUsed) mostUsed = used;
    const index = leafIndex.get(pos);
    if (index === undefined) {
      leafIndex.set(pos, leaves.length);
      leaves.push(leaf);
      return;
    }
    // Prefer more dice, then a play that uses the higher die; else keep the first.
    const old = leaves[index] as Leaf;
    if (old.moves.length < used || (old.moves.length === used && !old.usesHighDie && usesHighDie)) {
      leaves[index] = leaf;
    }
  };

  // `top` is the highest origin the next move may use. For a double it is
  // the origin of the previous move (see "Doubles" above); else the bar.
  const search = (pos: Position, left: readonly DieValue[], top: number): void => {
    if (left.length === 0) {
      record(pos);
      return;
    }
    // Pruning only pays for doubles. In a normal roll two different first
    // moves never meet in the same position with the same die left.
    if (isDouble) {
      const tag = left.length * 26 + top;
      if (seen.get(pos, tag) !== undefined) return;
      seen.set(pos, true, tag);
    }

    const home = allHome(pos);
    const highest = home ? highestHomePoint(pos) : 0;
    let moved = false;
    for (let i = 0; i < left.length; i += 1) {
      const die = left[i] as DieValue;
      if (i > 0 && left[i - 1] === die) continue; // same die value, same moves
      const rest = left.filter((_, j) => j !== i);
      for (let from = top; from >= 1; from -= 1) {
        if (!legalFrom(pos, from, die, home, highest)) continue;
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
