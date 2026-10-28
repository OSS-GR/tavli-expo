/**
 * The 21 distinct rolls in the form the evaluators use (#234). It comes
 * from the engine's `DISTINCT_ROLLS`, so there is one list of rolls.
 *
 * Each entry is `[low die, high die, rolls out of 36]`. The order is by the
 * low die, then by the high die (1-1, 1-2, …, 1-6, 2-2, …, 6-6). This is
 * not the order of `DISTINCT_ROLLS`; it is the order the evaluators always
 * used, and their scores depend on it:
 *
 * - the bear-off table (`bearoff.ts`) adds floats roll by roll, so another
 *   order can change the last bit;
 * - the Asodio shot search (`asodio-shots.ts`) plays a roll a-b in a fixed
 *   order (`pairInOrder` needs a < b);
 * - the weight is a whole number, so the shot counts stay exact.
 */

import { DISTINCT_ROLLS } from '@tavli/engine';

/** One roll: `[low die, high die, rolls out of 36]`. */
export type RollOutOf36 = readonly [low: number, high: number, outOf36: number];

export const ROLLS: readonly RollOutOf36[] = Object.freeze(
  DISTINCT_ROLLS.map(({ dice: [high, low], weight }): RollOutOf36 =>
    Object.freeze([low, high, Math.round(weight * 36)] as const),
  ).sort((x, y) => x[0] - y[0] || x[1] - y[1]),
);
