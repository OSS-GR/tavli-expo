/**
 * Decision time of the hard bot (a net, 1-ply) for Portes, Plakoto, Fevga
 * and Asodio. The issue budget (#147, #156, #164) is a median under 50 ms and a worst
 * case under 300 ms in Node. The real numbers are far lower (see the
 * README), so the test is safe on a slow CI machine. It checks the 99th
 * percentile against 300 ms, not the single slowest position, so one pause
 * of a loaded CI runner cannot fail it.
 */

import { describe, expect, it } from 'vitest';

import { createSeededRng } from '@tavli/engine';
import type { GameState } from '@tavli/engine';

import { createBot } from './index';
import { randomAsodioPositions } from './testing/random-asodio-positions';
import { randomFevgaPositions } from './testing/random-fevga-positions';
import { randomPlakotoPositions } from './testing/random-plakoto-positions';
import { randomPositions } from './testing/random-positions';

// The package has no DOM or Node types (`"types": []`).
declare const performance: { now(): number };

const games: readonly [string, () => GameState[]][] = [
  ['Portes', () => randomPositions(2026, 300)],
  ['Plakoto', () => randomPlakotoPositions(2026, 300)],
  ['Fevga', () => randomFevgaPositions(2026, 300)],
  ['Asodio', () => randomAsodioPositions(2026, 300)],
];

describe('hard decision time', () => {
  for (const [name, positionsOf] of games) {
    it(
      `${name}: median below 50 ms, p99 below 300 ms over 300 random positions`,
      {
        timeout: 30_000,
      },
      () => {
        const bot = createBot();
        const positions = positionsOf();
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
        const p99 = times[Math.floor(times.length * 0.99)] ?? Infinity;
        expect(median).toBeLessThan(50);
        expect(p99).toBeLessThan(300);
      },
    );
  }
});
