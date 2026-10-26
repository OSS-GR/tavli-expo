/**
 * Decision time of the medium bot. The target is < 200 ms on a mid-range
 * phone. Node is many times faster than Hermes on a phone, so the Node bound
 * here (median < 20 ms) is generous and safe on a slow CI machine. The README
 * has the real numbers.
 */

import { describe, expect, it } from 'vitest';

import { createSeededRng } from '@tavli/engine';

import { createBot } from './index';
import { randomPositions } from './testing/random-positions';

// The package has no DOM or Node types (`"types": []`).
declare const performance: { now(): number };

describe('medium decision time', () => {
  it('has a median below 20 ms over 300 random positions', { timeout: 30_000 }, () => {
    const bot = createBot();
    const positions = randomPositions(2026, 300);
    const rng = createSeededRng(1);
    // Warm up the JIT first, like a game in progress.
    for (const state of positions.slice(0, 30)) {
      bot.chooseTurn(state, state.dice ?? [1, 2], 'medium', { rng });
    }
    const times = positions.map((state) => {
      const t0 = performance.now();
      bot.chooseTurn(state, state.dice ?? [1, 2], 'medium', { rng });
      return performance.now() - t0;
    });
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)] ?? Infinity;
    expect(median).toBeLessThan(20);
    // The worst case (a double with many plays) must stay well below the phone budget too.
    expect(times[times.length - 1]).toBeLessThan(200);
  });
});
