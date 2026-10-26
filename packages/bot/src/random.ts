/**
 * Small helpers on top of the engine's `Rng`. The bot never uses
 * `Math.random`.
 */

import type { Rng } from '@tavli/engine';

const UINT32 = 0x1_0000_0000;

/**
 * A uniform integer from 0 to `n - 1`. Uses rejection sampling, so there is
 * no modulo bias. `n` must be an integer from 1 to 2^32.
 */
export function randomInt(rng: Rng, n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > UINT32) {
    throw new RangeError(`randomInt needs an integer from 1 to 2^32, got ${n}`);
  }
  const limit = UINT32 - (UINT32 % n);
  for (;;) {
    const x = rng.nextUint32();
    if (x < limit) return x % n;
  }
}

/** A uniform integer from `min` to `max`, both included. */
export function randomIntBetween(rng: Rng, min: number, max: number): number {
  return min + randomInt(rng, max - min + 1);
}

/** One uniform item of a non-empty list. */
export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  const item = items[randomInt(rng, items.length)];
  if (item === undefined) throw new RangeError('pickOne needs a non-empty list');
  return item;
}
