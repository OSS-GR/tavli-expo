import { describe, expect, it } from 'vitest';

import { rollDice } from '@tavli/engine';

import { createCryptoRng } from './cryptoRng';
import type { RandomSource } from './cryptoRng';

describe('createCryptoRng', () => {
  it('returns the values of the random source, in order', () => {
    let calls = 0;
    const source: RandomSource = {
      getRandomValues(array) {
        calls += 1;
        array.forEach((_, i) => (array[i] = calls * 100 + i));
        return array;
      },
    };
    const rng = createCryptoRng(source);
    const values = Array.from({ length: 20 }, () => rng.nextUint32());
    expect(values.slice(0, 3)).toEqual([100, 101, 102]);
    expect(values[16]).toBe(200);
    // One call per 16 values.
    expect(calls).toBe(2);
  });

  it('uses Web Crypto by default and rolls fair-looking dice', () => {
    const rng = createCryptoRng();
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 3000; i++) {
      for (const die of rollDice(rng)) counts[die - 1] = (counts[die - 1] ?? 0) + 1;
    }
    // 6000 dice: each face about 1000 times. The bounds are far apart, so
    // the test never fails by chance in practice.
    for (const count of counts) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1200);
    }
  });

  it('gives uint32 values', () => {
    const rng = createCryptoRng();
    for (let i = 0; i < 100; i++) {
      const x = rng.nextUint32();
      expect(Number.isInteger(x) && x >= 0 && x <= 0xffffffff).toBe(true);
    }
  });
});
