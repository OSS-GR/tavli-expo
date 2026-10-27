/**
 * Time of a 2-ply hint (#212). The phone budget for a hint is < 1 s
 * (bot-ai.md, section 6.1). Node is many times faster than Hermes on a
 * phone, so the Node bound here (2 s) is loose and safe on a slow CI
 * machine. The README has the measured time.
 */

import { describe, expect, it } from 'vitest';

import { createBoard, portes } from '@tavli/engine';
import type { Dice } from '@tavli/engine';

import { createAnalyzer } from './index';

// The package has no DOM or Node types (`"types": []`).
declare const performance: { now(): number };

/** A typical middle game: both sides still have back checkers, so there is contact. */
const middleGame = {
  ...portes.initialState({ startingPlayer: 'white' }),
  board: createBoard(
    {
      white: { points: { 24: 2, 13: 4, 8: 3, 6: 4, 5: 2 } },
      black: { points: { 24: 1, 23: 1, 13: 5, 8: 2, 6: 4, 4: 2 } },
    },
    'contrary',
  ),
};
const dice: Dice = [4, 2];

describe('2-ply hint time', () => {
  it('ranks a middle-game Portes position in under 2 s', { timeout: 30_000 }, () => {
    const analyzer = createAnalyzer();
    // Warm up the JIT first, then keep the fastest of 3 runs (one GC pause cannot fail it).
    analyzer.rankTurns(middleGame, dice, { plies: 2 });
    let fastest = Infinity;
    for (let run = 0; run < 3; run += 1) {
      const t0 = performance.now();
      const ranked = analyzer.rankTurns(middleGame, dice, { plies: 2 });
      fastest = Math.min(fastest, performance.now() - t0);
      expect(ranked.length).toBeGreaterThan(1);
    }
    expect(fastest).toBeLessThan(2000);
  });
});
