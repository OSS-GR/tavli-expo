/**
 * Shot counting for Plakoto: with how many of the 36 rolls can the player on
 * roll pin a lone checker of the other player?
 *
 * The count follows the Plakoto movement rules (`docs/rules/plakoto.md`):
 *
 * - a checker pins with one die, or with both dice when the middle point is
 *   open (every middle point for a double);
 * - a point is closed (a door) when it holds 2+ opponent checkers, or when
 *   the opponent pins one of our checkers there;
 * - a pinned checker cannot move; a pinning checker can;
 * - a lone checker that pins, or is pinned, cannot be pinned.
 *
 * Passing over a lone checker in the middle of a combined move is allowed
 * (the default `intermediatePinBlocks: false`). Like the Portes count, it
 * ignores the "use as much of the roll as possible" rules.
 */

import { DISTINCT_ROLLS } from '@tavli/engine';

import { PINNED } from './plakoto-board';
import type { PlakotoSide } from './plakoto-board';

export interface PlakotoShots {
  /** Rolls out of 36 that pin at least one checker. */
  readonly any: number;
  /**
   * Rolls out of 36 that pin each lone checker, by its point in the
   * **waiting** player's own numbering. Length 25; 0 where there is none.
   */
  readonly perBlot: readonly number[];
}

/** True when the waiter's checker on the roller's point `p` is a lone, free checker. */
export function isPinnable(roller: PlakotoSide, waiter: PlakotoSide, p: number): boolean {
  return (waiter[25 - p] ?? 0) === 1 && (roller[p] ?? 0) === 0;
}

/** Counts the shots of `roller` at the lone checkers of `waiter`. Both in their own numbering. */
export function countPlakotoShots(roller: PlakotoSide, waiter: PlakotoSide): PlakotoShots {
  const perBlot = new Array<number>(25).fill(0);
  // Blots and doors, in the roller's numbering (roller point p = waiter point 25 - p).
  const blot: boolean[] = new Array<boolean>(25).fill(false);
  const door: boolean[] = new Array<boolean>(25).fill(false);
  const blots: number[] = [];
  for (let p = 1; p <= 24; p += 1) {
    const n = waiter[25 - p] ?? 0;
    if (n === 0) continue;
    if (isPinnable(roller, waiter, p)) {
      blot[p] = true;
      blots.push(p);
    } else if (n >= 2 || roller[PINNED + p] === 1) {
      door[p] = true;
    }
  }
  if (blots.length === 0) return { any: 0, perBlot };

  // Points the roller can move from: only those above the lowest blot matter.
  const lowest = blots[0] ?? 25;
  const from: number[] = [];
  for (let s = 24; s > lowest; s -= 1) {
    if ((roller[s] ?? 0) > 0 && roller[PINNED + s] !== 1) from.push(s);
  }
  if (from.length === 0) return { any: 0, perBlot };

  const hit: boolean[] = new Array<boolean>(25).fill(false);
  let any = 0;
  for (const { dice, weight: chance } of DISTINCT_ROLLS) {
    // `dice` is [high, low]. `weight` counts the roll out of 36: 1 or 2.
    const [b, a] = dice;
    const weight = chance * 36;
    for (const p of blots) hit[p] = false;
    if (a === b) {
      for (const s of from) {
        let p = s;
        for (let k = 0; k < 4; k += 1) {
          p -= a;
          if (p < 1 || door[p]) break;
          if (blot[p]) hit[p] = true;
        }
      }
    } else {
      for (const s of from) {
        const pa = s - a;
        const pb = s - b;
        if (pa >= 1 && blot[pa]) hit[pa] = true;
        if (pb >= 1 && blot[pb]) hit[pb] = true;
        const p = s - a - b;
        if (p >= 1 && blot[p] && (!door[pa] || !door[pb])) hit[p] = true;
      }
    }
    let pinSome = false;
    for (const p of blots) {
      if (hit[p]) {
        pinSome = true;
        const own = 25 - p;
        perBlot[own] = (perBlot[own] ?? 0) + weight;
      }
    }
    if (pinSome) any += weight;
  }
  return { any, perBlot };
}
