import { describe, expect, it } from 'vitest';

import { diceMoves, isDouble, rollDice, rollDie } from './dice';
import { EngineError } from './errors';
import { createSeededRng, rngFromState } from './rng';
import type { Rng } from './rng';

/** An Rng that returns fixed values, for testing edge cases. */
function scriptedRng(values: readonly number[]): Rng {
  let i = 0;
  return {
    nextUint32() {
      const value = values[i];
      i += 1;
      if (value === undefined) throw new Error('scripted RNG ran out of values');
      return value;
    },
  };
}

function take(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => rng.nextUint32());
}

describe('seeded RNG (xoshiro128**)', () => {
  it('matches the reference output for state [1, 2, 3, 4]', () => {
    const rng = rngFromState([1, 2, 3, 4]);
    expect(take(rng, 8)).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849,
    ]);
    expect(rng.state()).toEqual([857776784, 3957087773, 2428778008, 3837013768]);
  });

  it('same seed gives the same sequence', () => {
    expect(take(createSeededRng(42), 1000)).toEqual(take(createSeededRng(42), 1000));
  });

  it('different seeds give different sequences', () => {
    const seeds = [0, 1, 2, -1, 2 ** 32, 2 ** 32 + 1, Number.MAX_SAFE_INTEGER];
    const firsts = seeds.map((seed) => take(createSeededRng(seed), 4).join(','));
    expect(new Set(firsts).size).toBe(seeds.length);
  });

  it('outputs are unsigned 32-bit integers', () => {
    for (const x of take(createSeededRng(7), 10_000)) {
      expect(Number.isInteger(x) && x >= 0 && x <= 0xffffffff).toBe(true);
    }
  });

  it('state can be saved as JSON and restored mid-stream', () => {
    const rng = createSeededRng(2026);
    take(rng, 37);
    const saved = JSON.parse(JSON.stringify(rng.state())) as [number, number, number, number];
    const restored = rngFromState(saved);
    expect(take(restored, 100)).toEqual(take(rng, 100));
  });

  it('rejects bad seeds and bad states', () => {
    expect(() => createSeededRng(1.5)).toThrow(EngineError);
    expect(() => createSeededRng(Number.NaN)).toThrow(EngineError);
    expect(() => rngFromState([0, 0, 0, 0])).toThrow(/all zeros/);
    expect(() => rngFromState([1, 2, 3] as unknown as [number, number, number, number])).toThrow(
      EngineError,
    );
    expect(() => rngFromState([1, 2, 3, 2 ** 32])).toThrow(EngineError);
    expect(() => rngFromState([1, 2, 3, -1])).toThrow(EngineError);
  });
});

describe('rollDie', () => {
  it('maps raw values to 1–6', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((v) => rollDie(scriptedRng([v])))).toEqual([
      1, 2, 3, 4, 5, 6, 1,
    ]);
  });

  it('throws away the top raw values, so there is no modulo bias', () => {
    // 2^32 - 4 = 4294967292 is the first value that is thrown away.
    const rng = scriptedRng([0xffffffff, 4294967292, 4294967291]);
    expect(rollDie(rng)).toBe(6); // 4294967291 % 6 = 5 → die 6
  });

  it.each([-1, 1.5, 2 ** 32, Number.NaN])('rejects an RNG that returns %s', (bad) => {
    expect(() => rollDie(scriptedRng([bad]))).toThrow(EngineError);
  });
});

// Chi-square critical values at p = 0.001. The seeds are fixed, so these
// tests never flake; the bounds show the generator has no visible bias.
const CHI2_DF5_P001 = 20.515;
const CHI2_DF35_P001 = 66.619;

function chiSquare(observed: readonly number[], expected: number): number {
  return observed.reduce((sum, o) => sum + (o - expected) ** 2 / expected, 0);
}

describe('rollDice distribution (60,000 rolls)', () => {
  it.each([1, 99, 123456789])('seed %i: faces and pairs are uniform', (seed) => {
    const rolls = 60_000;
    const rng = createSeededRng(seed);
    const faces = Array.from({ length: 6 }, () => 0);
    const pairs = Array.from({ length: 36 }, () => 0);
    let doubles = 0;
    for (let i = 0; i < rolls; i += 1) {
      const dice = rollDice(rng);
      const [a, b] = dice;
      faces[a - 1] = (faces[a - 1] ?? 0) + 1;
      faces[b - 1] = (faces[b - 1] ?? 0) + 1;
      pairs[(a - 1) * 6 + (b - 1)] = (pairs[(a - 1) * 6 + (b - 1)] ?? 0) + 1;
      if (isDouble(dice)) doubles += 1;
    }
    expect(chiSquare(faces, (rolls * 2) / 6)).toBeLessThan(CHI2_DF5_P001);
    expect(chiSquare(pairs, rolls / 36)).toBeLessThan(CHI2_DF35_P001);
    expect(Math.abs(doubles / rolls - 1 / 6)).toBeLessThan(0.01);
  });

  it('same seed gives the same dice', () => {
    const a = createSeededRng(5);
    const b = createSeededRng(5);
    const rollsA = Array.from({ length: 100 }, () => rollDice(a));
    const rollsB = Array.from({ length: 100 }, () => rollDice(b));
    expect(rollsA).toEqual(rollsB);
  });
});

describe('dice helpers', () => {
  it('a double gives four moves', () => {
    expect(diceMoves([4, 4])).toEqual([4, 4, 4, 4]);
    expect(isDouble([4, 4])).toBe(true);
  });

  it('a normal roll gives two moves, higher die first', () => {
    expect(diceMoves([3, 5])).toEqual([5, 3]);
    expect(diceMoves([6, 1])).toEqual([6, 1]);
    expect(isDouble([6, 1])).toBe(false);
  });
});
