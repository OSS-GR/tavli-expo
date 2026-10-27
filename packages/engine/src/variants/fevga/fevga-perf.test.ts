/**
 * Micro-benchmark for the Fevga move generator. The goal is < 5 ms for
 * any position. The bounds here are generous so a slow CI machine passes.
 */

import { describe, expect, it } from 'vitest';

import type { Dice } from '../../dice';
import type { GameState } from '../../state';
import { fevgaState } from '../../testing/fevga-notation';
import { randomFevgaPositions } from '../../testing/random-fevga-positions';
import { fevga } from './index';

// Vitest runs in Node, which has `performance`. The engine's tsconfig has no
// DOM or Node types, so we declare the one function we use.
declare const performance: { now(): number };

function timeMs(state: GameState, dice: Dice): number {
  const start = performance.now();
  fevga.legalTurns(state, dice);
  return performance.now() - start;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

describe('Fevga move generator speed', () => {
  it('median < 5 ms and worst < 50 ms over 200 random positions', () => {
    const positions = randomFevgaPositions(2026, 200, 5);
    // Warm up the JIT first.
    for (const state of positions) fevga.legalTurns(state, state.dice ?? [1, 1]);
    const times = positions.map((state) => timeMs(state, state.dice ?? [1, 1]));
    expect(median(times)).toBeLessThan(5);
    expect(Math.max(...times)).toBeLessThan(50);
  });

  it('a spread-out position with doubles stays < 50 ms', () => {
    // 15 checkers on 15 different points: about 1,100 plays per double.
    const state = fevgaState('w: 24 23 22 21 20 19 18 17 16 15 14 13 11 10 9 ; b: 24x15');
    for (const dice of [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ] as const) {
      fevga.legalTurns(state, dice);
      expect(timeMs(state, dice)).toBeLessThan(50);
    }
  });
});
