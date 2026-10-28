/**
 * A small one-sided bear-off table, for the end of a race
 * (docs/architecture/bot-ai.md, section 5.4).
 *
 * The race formulas in `race.ts` are good for long races. In a short race
 * they miss that checkers come off in whole rolls: 6 checkers against 5 on
 * the low points is about 50 % for the formula and nearly 80 % in real play.
 * So when both sides have all their checkers home and only a few left, we
 * use exact numbers instead.
 *
 * For one side alone, the table holds the chance to finish in exactly
 * 1, 2, 3, … rolls when that side plays to finish as fast as it can on
 * average (the classic one-sided bear-off database, as in gnubg). It knows
 * the Portes bear-off rules (`docs/rules/portes.md`): a die bears off a
 * checker from its own point, or from the highest point when the die is
 * larger; it can always move a checker inside home instead. With all
 * checkers home and no contact, every die can be played, so the "use as
 * much of the roll as possible" rules never cut a play short.
 *
 * The table is filled lazily and kept for the life of the app. With at
 * most `BEAROFF_MAX_CHECKERS` (6) checkers there are 924 positions. In Node
 * the whole table takes about 35 ms to fill. More checkers cost much more
 * (8 checkers: 3,003 positions, about 100 ms), so a full 15-checker table
 * is left for the hard bot (a precomputed file, #52).
 */

import { OFF } from './portes-board';
import type { Side } from './portes-board';
import { ROLLS } from './rolls';

/** The table covers sides with at most this many checkers left, all on own points 1–6. */
export const BEAROFF_MAX_CHECKERS = 6;

/** Rolls beyond this are summed into the last entry (their chance is tiny). */
const MAX_ROLLS = 16;

/** The chance to finish in exactly `k` rolls, index k = 0 … MAX_ROLLS. */
export type RollsToFinish = ArrayLike<number>;

/**
 * A home position is one integer: base 16, digit `p − 1` = checkers on own
 * point `p` (at most 15). Moving a checker is then plain arithmetic.
 */
const POW: readonly number[] = [1, 16, 256, 4096, 65536, 1048576];

/** Each entry: the chances for 0 … MAX_ROLLS rolls, then the mean at index MAX_ROLLS + 1. */
const table = new Map<number, Float64Array>();
const MEAN = MAX_ROLLS + 1;

function count(key: number, point: number): number {
  return Math.floor(key / (POW[point - 1] ?? 1)) % 16;
}

/** Adds `key` to `list` unless it is there already. The lists are short. */
function addOnce(list: number[], key: number): void {
  if (!list.includes(key)) list.push(key);
}

/** Adds every position after playing one die to `out`. An empty home stays as it is. */
function playDie(key: number, die: number, out: number[]): void {
  let top = 6;
  while (top > 0 && count(key, top) === 0) top -= 1;
  if (top === 0) {
    addOnce(out, key);
    return;
  }
  // A die larger than the highest point bears off from the highest point.
  if (die > top) {
    addOnce(out, key - (POW[top - 1] ?? 0));
    return;
  }
  for (let p = die; p <= top; p += 1) {
    if (count(key, p) === 0) continue;
    // Off with the exact die (p = die), or a move inside home.
    const from = POW[p - 1] ?? 0;
    addOnce(out, p === die ? key - from : key - from + (POW[p - die - 1] ?? 0));
  }
}

/**
 * Every end position of one roll, each listed once. A non-double is played
 * in both orders. Exported for tests: they check it against the engine.
 */
export function endPositions(key: number, a: number, b: number): number[] {
  if (a !== b) {
    const ends: number[] = [];
    for (const [first, second] of [
      [a, b],
      [b, a],
    ] as const) {
      const middle: number[] = [];
      playDie(key, first, middle);
      for (const k of middle) playDie(k, second, ends);
    }
    return ends;
  }
  let layer = [key];
  for (let step = 0; step < 4; step += 1) {
    const next: number[] = [];
    for (const k of layer) playDie(k, a, next);
    layer = next;
  }
  return layer;
}

function rollsToFinish(key: number): Float64Array {
  const known = table.get(key);
  if (known !== undefined) return known;
  const dist = new Float64Array(MAX_ROLLS + 2);
  if (key === 0) {
    dist[0] = 1;
  } else {
    for (const [a, b, weight] of ROLLS) {
      // Play the roll that finishes fastest on average.
      let best: Float64Array | undefined;
      for (const after of endPositions(key, a, b)) {
        const next = rollsToFinish(after);
        if (best === undefined || (next[MEAN] ?? 0) < (best[MEAN] ?? 0)) best = next;
      }
      if (best === undefined) continue;
      const share = weight / 36;
      for (let k = 0; k < MAX_ROLLS; k += 1)
        dist[k + 1] = (dist[k + 1] ?? 0) + (best[k] ?? 0) * share;
      dist[MAX_ROLLS] = (dist[MAX_ROLLS] ?? 0) + (best[MAX_ROLLS] ?? 0) * share;
    }
  }
  let mean = 0;
  for (let k = 1; k <= MAX_ROLLS; k += 1) mean += (dist[k] ?? 0) * k;
  dist[MEAN] = mean;
  table.set(key, dist);
  return dist;
}

/**
 * The bear-off numbers of a side, or `null` if the table does not cover it
 * (a checker outside home or on the bar, or more than `BEAROFF_MAX_CHECKERS`
 * left).
 */
export function bearoffRolls(side: Side): RollsToFinish | null {
  if (15 - (side[OFF] ?? 0) > BEAROFF_MAX_CHECKERS) return null;
  for (let p = 7; p <= 25; p += 1) if ((side[p] ?? 0) > 0) return null;
  return rollsToFinish(homeKey(side)).subarray(0, MAX_ROLLS + 1);
}

/** The table key of a side's home (own points 1–6). */
export function homeKey(side: Side): number {
  let key = 0;
  for (let p = 6; p >= 1; p -= 1) key = key * 16 + (side[p] ?? 0);
  return key;
}

/** The mean number of rolls to finish. */
export function meanRolls(dist: RollsToFinish): number {
  let mean = 0;
  for (let k = 0; k < dist.length; k += 1) mean += (dist[k] ?? 0) * k;
  return mean;
}

/**
 * The chance that the player on roll finishes first: they need `roller`
 * rolls, the other player needs `waiter` rolls and rolls second.
 */
export function bearoffWinChance(roller: RollsToFinish, waiter: RollsToFinish): number {
  // P(waiter needs at least k rolls), from the top down.
  const atLeast = new Array<number>(MAX_ROLLS + 2).fill(0);
  for (let k = MAX_ROLLS; k >= 0; k -= 1) atLeast[k] = (atLeast[k + 1] ?? 0) + (waiter[k] ?? 0);
  let win = 0;
  for (let k = 0; k <= MAX_ROLLS; k += 1) win += (roller[k] ?? 0) * (atLeast[k] ?? 0);
  return Math.min(1, Math.max(0, win));
}
