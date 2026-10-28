/**
 * Dice.
 *
 * `Dice` is one roll of two dice, as rolled (order kept for display).
 * A double is played four times; `diceMoves` expands it.
 */

import { EngineError } from './errors';
import type { Rng } from './rng';

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

/** One roll of two dice. */
export type Dice = readonly [DieValue, DieValue];

export const DIE_VALUES: readonly DieValue[] = [1, 2, 3, 4, 5, 6];

/** One roll of two dice, with its chance out of all 36 rolls. */
export interface WeightedRoll {
  readonly dice: Dice;
  /** 1/36 for a double, 2/36 for the rest (both orders of the dice). */
  readonly weight: number;
}

/**
 * The 21 distinct rolls: 6 doubles and 15 others. Each roll is higher die
 * first. The order is fixed: by the higher die, then by the lower die
 * (1-1, 2-1, 2-2, 3-1, …, 6-6). The weights add up to 1.
 */
export const DISTINCT_ROLLS: readonly WeightedRoll[] = Object.freeze(
  DIE_VALUES.flatMap((high) =>
    DIE_VALUES.filter((low) => low <= high).map((low): WeightedRoll =>
      Object.freeze({
        dice: Object.freeze([high, low] as const),
        weight: high === low ? 1 / 36 : 2 / 36,
      }),
    ),
  ),
);

export function isDieValue(value: unknown): value is DieValue {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 6;
}

export function isDouble(dice: Dice): boolean {
  return dice[0] === dice[1];
}

/**
 * The single-die moves a roll gives: two for a normal roll, four for a
 * double. Higher die first for a normal roll.
 */
export function diceMoves(dice: Dice): readonly DieValue[] {
  const [a, b] = dice;
  if (a === b) return [a, a, a, a];
  return a > b ? [a, b] : [b, a];
}

// The largest multiple of 6 that fits in 2^32. Values at or above it are
// thrown away, so each face gets exactly the same number of raw values.
const UNBIASED_LIMIT = 0x1_0000_0000 - (0x1_0000_0000 % 6);

/**
 * Rolls one die. Uses rejection sampling, so there is no modulo bias.
 * Throws if the RNG returns something that is not a uint32.
 */
export function rollDie(rng: Rng): DieValue {
  for (;;) {
    const x = rng.nextUint32();
    if (!Number.isInteger(x) || x < 0 || x > 0xffffffff) {
      throw new EngineError('OUT_OF_RANGE', `Rng.nextUint32 returned ${x}`);
    }
    if (x < UNBIASED_LIMIT) return ((x % 6) + 1) as DieValue;
  }
}

/** Rolls two dice. */
export function rollDice(rng: Rng): Dice {
  const first = rollDie(rng);
  const second = rollDie(rng);
  return [first, second];
}
