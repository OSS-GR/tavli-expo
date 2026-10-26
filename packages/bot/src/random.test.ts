import { describe, expect, it } from 'vitest';

import { createSeededRng } from '@tavli/engine';
import type { Rng } from '@tavli/engine';

import { FORCED_DELAY_MS, THINKING_DELAY_MS, pickOne, randomInt, thinkingDelayMs } from './index';

/** An RNG that returns the given values in a loop. */
function fixedRng(values: readonly number[]): Rng {
  let i = 0;
  return {
    nextUint32() {
      const value = values[i % values.length] ?? 0;
      i += 1;
      return value;
    },
  };
}

describe('random helpers', () => {
  it('randomInt stays in range', () => {
    const rng = createSeededRng(5);
    for (let i = 0; i < 1000; i += 1) {
      const x = randomInt(rng, 7);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(7);
    }
    expect(randomInt(rng, 1)).toBe(0);
  });

  it('randomInt throws away values that would give a bias', () => {
    // For n = 3, 2^32 - 1 is above the last full block of 3, so it is skipped.
    expect(randomInt(fixedRng([0xffffffff, 4]), 3)).toBe(1);
  });

  it('randomInt and pickOne reject bad input', () => {
    const rng = createSeededRng(1);
    expect(() => randomInt(rng, 0)).toThrow(RangeError);
    expect(() => randomInt(rng, 1.5)).toThrow(RangeError);
    expect(() => pickOne(rng, [])).toThrow(RangeError);
  });
});

describe('thinkingDelayMs', () => {
  it('stays in the range of each level', () => {
    const rng = createSeededRng(9);
    for (const level of ['easy', 'medium', 'hard'] as const) {
      const { min, max } = THINKING_DELAY_MS[level];
      const seen = new Set<number>();
      for (let i = 0; i < 500; i += 1) {
        const ms = thinkingDelayMs(level, rng);
        expect(Number.isInteger(ms)).toBe(true);
        expect(ms).toBeGreaterThanOrEqual(min);
        expect(ms).toBeLessThanOrEqual(max);
        seen.add(ms);
      }
      expect(seen.size).toBeGreaterThan(100);
    }
  });

  it('is short for a forced move', () => {
    const rng = createSeededRng(9);
    for (let i = 0; i < 100; i += 1) {
      const ms = thinkingDelayMs('hard', rng, { forced: true });
      expect(ms).toBeGreaterThanOrEqual(FORCED_DELAY_MS.min);
      expect(ms).toBeLessThanOrEqual(FORCED_DELAY_MS.max);
    }
  });

  it('is repeatable with the same seed', () => {
    const a = thinkingDelayMs('medium', createSeededRng(3));
    const b = thinkingDelayMs('medium', createSeededRng(3));
    expect(a).toBe(b);
  });
});
