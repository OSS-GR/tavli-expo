/**
 * The dice RNG of online games (#126, ADR-0004 point 3).
 *
 * It reads Web Crypto (`crypto.getRandomValues`), which the Convex runtime
 * has. It is never the seeded engine RNG (`createSeededRng`): that one is
 * predictable to anyone who sees enough dice.
 *
 * Note: Convex makes queries and mutations deterministic. Its docs say
 * `Math.random` there is a seeded strong PRNG whose seed is a hidden input
 * of the function call. We expect Web Crypto in a mutation to work the same
 * way. The seed stays on the server, so clients cannot predict a roll.
 * Check this on a real deployment (open point in
 * `docs/architecture/online-game-service.md`).
 */

import type { Rng } from '@tavli/engine';

/** The part of Web Crypto we use. */
export interface RandomSource {
  getRandomValues(array: Uint32Array<ArrayBuffer>): Uint32Array<ArrayBuffer>;
}

/** Values read per `getRandomValues` call. A turn uses about two. */
const BATCH = 16;

/** An `Rng` over `source` (default: the global `crypto`). */
export function createCryptoRng(source: RandomSource = globalThis.crypto): Rng {
  const buffer = new Uint32Array(BATCH);
  let next = BATCH;
  return {
    nextUint32(): number {
      if (next === BATCH) {
        source.getRandomValues(buffer);
        next = 0;
      }
      const value = buffer[next] as number;
      next += 1;
      return value;
    },
  };
}
