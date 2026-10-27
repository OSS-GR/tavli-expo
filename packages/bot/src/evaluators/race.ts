/**
 * Pure race formulas, for positions with no contact left.
 *
 * 1. **Keith count** (Tom Keith, 2004; described at bkgm.com, "The Keith
 *    count"). It adds the wastage of a bad bear-off shape to the pip count:
 *    +2 for each checker more than 1 on the 1-point, +1 for each checker
 *    more than 1 on the 2-point, +1 for each checker more than 3 on the
 *    3-point, +1 for each empty 4-, 5- and 6-point. (Keith then adds 1/7 for
 *    the player on roll to make cube decisions. We have no cube, so we use
 *    the adjusted count with the formula below instead.)
 * 2. **Kleinman metric** (Danny Kleinman; described at bkgm.com and in
 *    Kleinman's "Vision Laughs at Counting"). With D = the opponent's count
 *    minus the roller's count and S = the sum of both counts, the roller's
 *    winning chance is about Φ((D + 4) / √(2·(S − 4))): the player on roll is
 *    about 4 pips ahead, and the spread grows with the length of the race.
 *    We checked it against our own simulated races (see the README).
 *
 * A short race needs one more fix: each checker needs at least one die. On
 * average a roll moves 2⅓ dice and 8⅙ pips, so a checker costs at least
 * 3.5 pips. `effectiveRacePips` uses the larger of the two numbers.
 */

import { OFF } from './portes-board';
import type { Side } from './portes-board';

/** The Keith count of one side (all checkers home or on their way, no contact). */
export function keithCount(side: Side): number {
  let count = 0;
  for (let p = 1; p <= 25; p += 1) count += (side[p] ?? 0) * p;
  const one = side[1] ?? 0;
  const two = side[2] ?? 0;
  const three = side[3] ?? 0;
  count += 2 * Math.max(0, one - 1) + Math.max(0, two - 1) + Math.max(0, three - 3);
  // Empty 4-, 5- and 6-points waste pips, but only while there are checkers to bear off.
  if (15 - (side[OFF] ?? 0) > 0) {
    for (const p of [4, 5, 6]) if ((side[p] ?? 0) === 0) count += 1;
  }
  return count;
}

/** The pips a side still needs, with the bear-off fix for few checkers. */
export function effectiveRacePips(side: Side): number {
  const left = 15 - (side[OFF] ?? 0);
  if (left === 0) return 0;
  return Math.max(keithCount(side), 3.5 * left);
}

/** The standard normal CDF Φ (Abramowitz and Stegun 7.1.26, error < 1.5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * Kleinman: the chance that the player on roll finishes first. `roller` and
 * `waiter` are pip counts still to go (use `effectiveRacePips`).
 */
export function kleinmanWinChance(roller: number, waiter: number): number {
  if (roller <= 0) return 1;
  if (waiter <= 0) return 0;
  const lead = waiter - roller + 4;
  const sum = Math.max(roller + waiter - 4, 8);
  return normalCdf(lead / Math.sqrt(2 * sum));
}

/**
 * The pips the loser needs to save the diplo: bring every checker home and
 * bear one off. 0 if one checker is already off (no diplo is possible).
 */
export function pipsToSaveDouble(side: Side): number {
  if ((side[OFF] ?? 0) > 0) return 0;
  let toHome = 0;
  let lowestHome = 0;
  for (let p = 25; p >= 7; p -= 1) toHome += (side[p] ?? 0) * (p - 6);
  for (let p = 1; p <= 6; p += 1) {
    if ((side[p] ?? 0) > 0) {
      lowestHome = p;
      break;
    }
  }
  // Then one checker must go off: from the lowest home point, or about 4 pips
  // for a checker that has just come in.
  return toHome + (lowestHome === 0 ? 4 : lowestHome);
}

/**
 * The chance that `winner` bears off all checkers before `loser` saves the
 * diplo, with the same normal model. `winnerOnRoll` says who rolls next.
 */
export function raceDoubleChance(winner: Side, loser: Side, winnerOnRoll: boolean): number {
  const save = pipsToSaveDouble(loser);
  if (save === 0) return 0;
  const need = effectiveRacePips(winner);
  const lead = save - need + (winnerOnRoll ? 4 : -4);
  const sum = Math.max(save + need - 4, 8);
  return normalCdf(lead / Math.sqrt(2 * sum));
}
