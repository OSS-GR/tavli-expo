/**
 * Random numbers.
 *
 * The engine never calls `Math.random`. Every function that needs chance
 * takes an `Rng`. This keeps games repeatable in tests, bots and replays.
 *
 * `createSeededRng` uses **xoshiro128\*\***:
 *
 * - It is small (4 × 32-bit words of state) and fast in plain JS
 *   (`Math.imul`, shifts).
 * - It passes the standard statistical test suites (BigCrush). mulberry32
 *   is smaller, but it has only 2^32 states and a known weak spot: it never
 *   outputs about a third of all 32-bit values.
 * - Its period is 2^128 − 1, so two games never share a stream by accident.
 * - Its state is four numbers, so a server can save it as JSON and resume.
 *
 * The seed is spread over the 128-bit state with splitmix32, as the
 * xoshiro authors recommend (never seed xoshiro with raw small numbers).
 *
 * This PRNG is **not** cryptographically secure. Someone who sees enough
 * dice can predict the next ones. For online games, the server must keep the
 * seed/state secret, or pass in an `Rng` backed by a secure source (an
 * adapter, outside this package).
 */

import { EngineError } from './errors';

/** A source of random 32-bit unsigned integers. */
export interface Rng {
  /** Returns an integer from 0 to 2^32 − 1, uniformly. */
  nextUint32(): number;
}

/** The full xoshiro128** state. Plain data, safe to store as JSON. */
export type RngState = readonly [number, number, number, number];

/** A seeded RNG whose state can be saved and restored. */
export interface SeededRng extends Rng {
  /** A copy of the current state. `rngFromState(rng.state())` continues the same stream. */
  state(): RngState;
}

const UINT32 = 0x1_0000_0000;

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** A 32-bit integer hash. It is a bijection, so no two inputs collide. */
function mix32(x: number): number {
  let z = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

/** splitmix32: one step of a 32-bit mixing generator, used only for seeding. */
function splitmix32(state: { s: number }): number {
  state.s = (state.s + 0x9e3779b9) | 0;
  return mix32(state.s);
}

/**
 * Creates a seeded RNG. The same seed always gives the same sequence.
 * The seed can be any safe integer (negative is fine).
 */
export function createSeededRng(seed: number): SeededRng {
  if (!Number.isSafeInteger(seed)) {
    throw new EngineError('OUT_OF_RANGE', `seed must be a safe integer, got ${seed}`);
  }
  const low = seed >>> 0;
  const high = Math.floor(seed / UINT32) >>> 0;
  // Fold the high bits in through a hash, so simple seed patterns do not collide.
  const mixer = { s: low ^ (high === 0 ? 0 : mix32(high ^ 0x85ebca6b)) };
  const words: [number, number, number, number] = [
    splitmix32(mixer),
    splitmix32(mixer),
    splitmix32(mixer),
    splitmix32(mixer),
  ];
  // An all-zero state would output zeros forever. splitmix32 makes this
  // practically impossible, but we guard anyway.
  if (words.every((w) => w === 0)) words[0] = 1;
  return rngFromState(words);
}

/** Restores an RNG from a saved state. Throws if the state is not valid. */
export function rngFromState(saved: RngState): SeededRng {
  // The state may come from JSON, so check it at run time too.
  const raw: unknown = saved;
  if (
    !Array.isArray(raw) ||
    raw.length !== 4 ||
    !raw.every((w: unknown) => Number.isInteger(w) && (w as number) >= 0 && (w as number) < UINT32)
  ) {
    throw new EngineError('OUT_OF_RANGE', 'RNG state must be four unsigned 32-bit integers');
  }
  if (saved.every((w) => w === 0)) {
    throw new EngineError('OUT_OF_RANGE', 'RNG state must not be all zeros');
  }
  let [s0, s1, s2, s3] = saved;
  return {
    nextUint32(): number {
      const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
      const t = s1 << 9;
      s2 ^= s0;
      s3 ^= s1;
      s1 ^= s2;
      s0 ^= s3;
      s2 ^= t;
      s3 = rotl(s3, 11);
      return result;
    },
    state(): RngState {
      return [s0 >>> 0, s1 >>> 0, s2 >>> 0, s3 >>> 0];
    },
  };
}
