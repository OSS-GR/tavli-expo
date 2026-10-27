/**
 * Micro-benchmark for the Portes move generator. The goal is < 5 ms for
 * any position. The bounds here are generous so a slow CI machine passes.
 */

import { describe, expect, it } from 'vitest';

import type { Dice } from '../../dice';
import type { GameState } from '../../state';
import { portesState } from '../../testing/position-notation';
import { randomPositions } from '../../testing/random-positions';
import { portes } from './index';

// Vitest runs in Node, which has `performance`. The engine's tsconfig has no
// DOM or Node types, so we declare the one function we use.
declare const performance: { now(): number };

/**
 * The best of 3 runs. A busy CI machine can pause the test at any time, so
 * one run can be slow by chance; three slow runs in a row mean slow code.
 */
function timeMs(state: GameState, dice: Dice): number {
  let best = Infinity;
  for (let run = 0; run < 3; run += 1) {
    const start = performance.now();
    portes.legalTurns(state, dice);
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

describe('Portes move generator speed', () => {
  it('median < 5 ms and worst < 50 ms over 200 random positions', () => {
    const positions = randomPositions(2026, 200, 5);
    // Warm up the JIT first.
    for (const state of positions) portes.legalTurns(state, state.dice ?? [1, 1]);
    const times = positions.map((state) => timeMs(state, state.dice ?? [1, 1]));
    expect(median(times)).toBeLessThan(5);
    expect(Math.max(...times)).toBeLessThan(50);
  });

  it('a spread-out position with small doubles stays < 50 ms', () => {
    // 15 checkers on 15 different points: the most moves a double can have.
    const state = portesState('w: 24 23 22 21 20 19 18 17 16 15 14 13 12 11 10 ; b: 24x15');
    for (const dice of [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ] as const) {
      portes.legalTurns(state, dice);
      expect(timeMs(state, dice)).toBeLessThan(50);
    }
  });
});
