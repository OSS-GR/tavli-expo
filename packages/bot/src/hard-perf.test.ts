/**
 * Decision time of the hard bot (the Portes net, 1-ply). The issue budget
 * (#147) is a median under 50 ms and a worst case under 300 ms in Node. The
 * real numbers are far lower (see the README, "The Portes net"), so the test
 * is safe on a slow CI machine.
 */

import { describe, expect, it } from 'vitest';

import { createSeededRng } from '@tavli/engine';

import { createBot } from './index';
import { randomPositions } from './testing/random-positions';

// The package has no DOM or Node types (`"types": []`).
declare const performance: { now(): number };

describe('hard decision time (Portes)', () => {
  it('has a median below 50 ms over 300 random positions', { timeout: 30_000 }, () => {
    const bot = createBot();
    const positions = randomPositions(2026, 300);
    const rng = createSeededRng(1);
    // Warm up the JIT (and decode the net) first.
    for (const state of positions.slice(0, 30)) {
      bot.chooseTurn(state, state.dice ?? [1, 2], 'hard', { rng });
    }
    // The fastest of 3 runs per position, so one GC pause cannot fail the test.
    const times = positions.map((state) => {
      let fastest = Infinity;
      for (let run = 0; run < 3; run += 1) {
        const t0 = performance.now();
        bot.chooseTurn(state, state.dice ?? [1, 2], 'hard', { rng });
        fastest = Math.min(fastest, performance.now() - t0);
      }
      return fastest;
    });
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)] ?? Infinity;
    expect(median).toBeLessThan(50);
    expect(times[times.length - 1]).toBeLessThan(300);
  });
});
