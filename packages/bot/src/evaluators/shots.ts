/**
 * Shot counting for Portes: with how many of the 36 rolls can the player on
 * roll hit a blot of the other player?
 *
 * The count follows the Portes movement rules (`docs/rules/portes.md`):
 *
 * - a checker hits with one die, or with both dice when the middle point is
 *   not a door (every middle point for a double);
 * - bar checkers enter first (`25 - die`), and an entry can hit;
 * - one checker on the bar: after it enters, the other die may hit with any
 *   checker, the entered one too;
 * - two or more on the bar: only an entering checker can hit (a double can
 *   move the dice left after all bar checkers are in).
 *
 * It ignores the "use as much of the roll as possible" rules and
 * `noHitAndRunInHome`. They change the count very rarely.
 */

import { BAR } from './portes-board';
import type { Side } from './portes-board';

/** The 21 different rolls: [die 1, die 2, how many of the 36 rolls]. */
const ROLLS: readonly (readonly [number, number, number])[] = (() => {
  const rolls: [number, number, number][] = [];
  for (let a = 1; a <= 6; a += 1) {
    for (let b = a; b <= 6; b += 1) rolls.push([a, b, a === b ? 1 : 2]);
  }
  return rolls;
})();

export interface ShotCount {
  /** Rolls out of 36 that hit at least one blot. */
  readonly any: number;
  /**
   * Rolls out of 36 that hit each blot, by the blot's point in the
   * **waiting** player's own numbering. Length 26; 0 where there is no blot.
   */
  readonly perBlot: readonly number[];
}

/**
 * Counts the shots of `roller` (the player to roll) at the blots of `waiter`.
 * Both sides are in their own numbering.
 */
export function countShots(roller: Side, waiter: Side): ShotCount {
  const perBlot = new Array<number>(26).fill(0);
  // Blots and doors, in the roller's numbering (roller point p = waiter point 25 - p).
  const blot: boolean[] = new Array<boolean>(26).fill(false);
  const door: boolean[] = new Array<boolean>(26).fill(false);
  const blots: number[] = [];
  for (let p = 1; p <= 24; p += 1) {
    const n = waiter[25 - p] ?? 0;
    if (n === 1) {
      blot[p] = true;
      blots.push(p);
    } else if (n >= 2) {
      door[p] = true;
    }
  }
  if (blots.length === 0) return { any: 0, perBlot };

  // Points the roller can hit from: only those above the lowest blot matter.
  const lowest = blots[0] ?? 25;
  const from: number[] = [];
  for (let s = 24; s > lowest; s -= 1) if ((roller[s] ?? 0) > 0) from.push(s);
  const onBar = roller[BAR] ?? 0;
  if (from.length === 0 && onBar === 0) return { any: 0, perBlot };

  const hit: boolean[] = new Array<boolean>(26).fill(false);
  let any = 0;

  /** Marks blots one die away from `s`. */
  const single = (s: number, die: number): void => {
    const p = s - die;
    if (p >= 1 && blot[p]) hit[p] = true;
  };
  /** Walks up to `steps` moves of `die` from `s`, stopping at a door. */
  const walk = (s: number, die: number, steps: number): void => {
    let p = s;
    for (let k = 0; k < steps; k += 1) {
      p -= die;
      if (p < 1 || door[p]) return;
      if (blot[p]) hit[p] = true;
    }
  };

  for (const [a, b, weight] of ROLLS) {
    for (const p of blots) hit[p] = false;

    if (a === b) {
      // A double: enter up to four bar checkers, then walk with the rest.
      let steps = 4;
      const extra: number[] = [];
      if (onBar > 0) {
        const entry = 25 - a;
        if (door[entry]) continue;
        if (blot[entry]) hit[entry] = true;
        steps -= Math.min(onBar, 4);
        extra.push(entry);
      }
      if (steps > 0) {
        for (const s of from) walk(s, a, steps);
        for (const s of extra) walk(s, a, steps);
      }
    } else if (onBar === 0) {
      for (const s of from) {
        single(s, a);
        single(s, b);
        const p = s - a - b;
        if (p >= 1 && blot[p] && (!door[s - a] || !door[s - b])) hit[p] = true;
      }
    } else {
      // Enter with one die. With one checker on the bar, the other die is free.
      for (const [enter, other] of [
        [a, b],
        [b, a],
      ] as const) {
        const entry = 25 - enter;
        if (door[entry]) continue;
        if (blot[entry]) hit[entry] = true;
        if (onBar === 1) {
          single(entry, other);
          for (const s of from) single(s, other);
        }
      }
    }

    let hitSome = false;
    for (const p of blots) {
      if (hit[p]) {
        hitSome = true;
        const own = 25 - p;
        perBlot[own] = (perBlot[own] ?? 0) + weight;
      }
    }
    if (hitSome) any += weight;
  }
  return { any, perBlot };
}
