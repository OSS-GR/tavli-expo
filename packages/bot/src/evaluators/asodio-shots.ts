/**
 * Shot counting for Asodio: with how many of the 36 rolls can the player on
 * roll pin (or, with `captureMode: "hit"`, hit) a lone checker of the other
 * player?
 *
 * It plays the roll one die at a time with the single-move rules of
 * `asodio-board.ts`, so the army rules hold: only the checkers the rules
 * let move can shoot, a checker that enters a new quarter is frozen there
 * (so a combined move stops at the quarter line), and a lock that ends in
 * the middle of the roll frees the rest of it. Doubles try the moves in
 * the engine's order (origins never go up), which reaches every end
 * position. Like the Portes and Plakoto counts, it ignores the "use as much
 * of the roll as possible" rules.
 */

import {
  BAR,
  PINNED,
  WAIT,
  allOutside,
  canMove,
  moveContext,
  moveOne,
  quarterOf,
} from './asodio-board';
import type { AsodioOptions, AsodioSide } from './asodio-board';

/** The 21 different rolls: [die 1, die 2, how many of the 36 rolls]. */
const ROLLS: readonly (readonly [number, number, number])[] = (() => {
  const rolls: [number, number, number][] = [];
  for (let a = 1; a <= 6; a += 1) {
    for (let b = a; b <= 6; b += 1) rolls.push([a, b, a === b ? 1 : 2]);
  }
  return rolls;
})();

export interface AsodioShots {
  /** Rolls out of 36 that pin (or hit) at least one checker. */
  readonly any: number;
  /** Rolls out of 36 that pin each lone checker, by its point in the **waiting** player's own numbering. Length 25. */
  readonly perBlot: readonly number[];
  /** Rolls out of 36 that pin a checker in a quarter up to `lockQuarter` (see `countAsodioShots`). */
  readonly lock: number;
}

const NO_SHOTS: AsodioShots = { any: 0, perBlot: new Array<number>(25).fill(0), lock: 0 };

/** True when the waiter's checker on its own point `q` can be pinned (or hit). */
export function isTarget(roller: AsodioSide, waiter: AsodioSide, q: number, pin: boolean): boolean {
  if ((waiter[q] ?? 0) !== 1) return false;
  if (!pin) return true;
  return waiter[PINNED + q] !== 1 && (roller[25 - q] ?? 0) === 0;
}

/** True when the roll cannot move at all (the first-entry gate, or a bar checker that needs a 1-2 or a double). */
function rollGated(me: AsodioSide, a: number, b: number, options: AsodioOptions): boolean {
  const double = a === b;
  const special = double || a + b === 3;
  if (options.firstEntryGate && allOutside(me) && !(options.gateDoubleOnly ? double : special)) {
    return true;
  }
  return options.barEntryNeedsSpecial && (me[BAR] ?? 0) > 0 && !special;
}

/**
 * Counts the shots of `roller` at the lone checkers of `waiter`. Both in
 * their own numbering. `lock` counts the rolls that pin a waiter checker
 * in its own quarter `lockQuarter` or lower (−1: none). The evaluator uses
 * it for pins that would lock both armies (`mutualLock`).
 */
export function countAsodioShots(
  roller: AsodioSide,
  waiter: AsodioSide,
  options: AsodioOptions,
  lockQuarter = -1,
): AsodioShots {
  let targets = 0;
  // The lowest target, in the roller's numbering. A checker on or below it
  // can never reach a target, and moving it never helps a higher checker
  // (see the "doubles in order" note in the engine's `moves.ts`).
  let lowest = 25;
  for (let q = 1; q <= 24; q += 1) {
    if (!isTarget(roller, waiter, q, options.pin)) continue;
    targets += 1;
    lowest = Math.min(lowest, 25 - q);
  }
  if (targets === 0) return NO_SHOTS;
  // below[t]: targets on the roller's points 1 … t.
  const below = new Array<number>(26).fill(0);
  for (let t = 1; t <= 25; t += 1) {
    below[t] =
      (below[t - 1] ?? 0) + (t <= 24 && isTarget(roller, waiter, 25 - t, options.pin) ? 1 : 0);
  }
  // True when some checker of `me` (at `top` or below) has a target within `pips` in front of it.
  const inReach = (me: AsodioSide, pips: number, top: number): boolean => {
    for (let s = top; s > lowest; s -= 1) {
      if ((me[s] ?? 0) === 0) continue;
      if ((below[s - 1] ?? 0) - (below[Math.max(0, s - 1 - pips)] ?? 0) > 0) return true;
    }
    return false;
  };

  const perBlot = new Array<number>(25).fill(0);
  const hit: boolean[] = new Array<boolean>(25).fill(false);
  let hits = 0;

  // A move from `from` with `die` lands on own point `to`; true when it pins (or hits) there.
  const capturesAt = (me: AsodioSide, them: AsodioSide, from: number, die: number): number => {
    const to = from === WAIT ? 25 - die : from - die;
    if (to < 1) return 0;
    return isTarget(me, them, 25 - to, options.pin) ? 25 - to : 0;
  };

  const search = (me: AsodioSide, them: AsodioSide, left: readonly number[], top: number) => {
    if (hits === targets) return;
    let pips = 0;
    for (const die of left) pips += die;
    // No checker can reach a target with the dice left, whatever moves first.
    if (!inReach(me, pips, top)) return;
    const ctx = moveContext(me, options);
    const double = left.length > 1 && left[0] === left[1];
    for (let i = 0; i < left.length; i += 1) {
      const die = left[i] as number;
      if (i > 0 && left[i - 1] === die) continue;
      const rest = left.filter((_, j) => j !== i);
      for (let from = top; from > lowest; from -= 1) {
        if ((me[from] ?? 0) === 0 || !canMove(me, them, from, die, ctx, options)) continue;
        const q = capturesAt(me, them, from, die);
        if (q > 0 && !hit[q]) {
          hit[q] = true;
          hits += 1;
          if (hits === targets) return;
        }
        if (rest.length === 0) continue;
        const next = moveOne(me, them, from, die, options);
        search(next.me, next.them, rest, double ? from : WAIT);
        if (hits === targets) return;
      }
    }
  };

  let any = 0;
  let lock = 0;
  for (const [a, b, weight] of ROLLS) {
    if (rollGated(roller, a, b, options)) continue;
    hit.fill(false);
    hits = 0;
    search(roller, waiter, a === b ? [a, a, a, a] : [b, a], WAIT);
    if (hits === 0) continue;
    any += weight;
    let locks = false;
    for (let q = 1; q <= 24; q += 1) {
      if (hit[q] !== true) continue;
      perBlot[q] = (perBlot[q] ?? 0) + weight;
      if (quarterOf(q) <= lockQuarter) locks = true;
    }
    if (locks) lock += weight;
  }
  return { any, perBlot, lock };
}
