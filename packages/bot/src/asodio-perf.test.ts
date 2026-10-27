/**
 * Decision time of the medium Asodio bot. Like `perf.test.ts` (Portes): the
 * phone budget is 200 ms, and the Node bound here (median < 20 ms) is far
 * above the real numbers, so the test is safe on a slow CI machine.
 */

import { describe, expect, it } from 'vitest';

import { createSeededRng } from '@tavli/engine';
import type { Dice } from '@tavli/engine';

import { createBot } from './index';
import { randomAsodioPositions } from './testing/random-asodio-positions';

// The package has no DOM or Node types (`"types": []`).
declare const performance: { now(): number };

describe('medium asodio decision time', () => {
  it('has a median below 20 ms over 300 random positions', { timeout: 60_000 }, () => {
    const bot = createBot();
    const positions = randomAsodioPositions(2026, 300);
    const rng = createSeededRng(1);
    // Warm up the JIT first, like a game in progress.
    for (const state of positions.slice(0, 30)) {
      bot.chooseTurn(state, state.dice as Dice, 'medium', { rng });
    }
    // Best of 3 runs per position: one GC pause cannot fail the test.
    const times = positions.map((state) => {
      let fastest = Infinity;
      for (let run = 0; run < 3; run += 1) {
        const t0 = performance.now();
        bot.chooseTurn(state, state.dice as Dice, 'medium', { rng });
        fastest = Math.min(fastest, performance.now() - t0);
      }
      return fastest;
    });
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)] ?? Infinity;
    expect(median).toBeLessThan(20);
    // The worst case (a double with many plays) must stay well below the phone budget too.
    expect(times[times.length - 1]).toBeLessThan(200);
  });
});
