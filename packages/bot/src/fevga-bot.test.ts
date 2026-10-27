/**
 * The Fevga bot (#105): levels, legal turns, repeatability and wins.
 * Strength is in `fevga-strength.test.ts`, speed in `fevga-perf.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { createBoard, createSeededRng, fevga } from '@tavli/engine';
import type { Dice, GameState, Turn } from '@tavli/engine';

import { createFevgaHeuristic } from './evaluators/fevga-heuristic';
import { createBot } from './index';
import type { Evaluator } from './index';
import { randomFevgaPositions } from './testing/random-fevga-positions';

const bot = createBot();
const start = fevga.initialState({ startingPlayer: 'white' });

function position(
  white: Readonly<Record<number, number>>,
  black: Readonly<Record<number, number>>,
): GameState {
  const off = (points: Readonly<Record<number, number>>): number =>
    15 - Object.values(points).reduce((a, b) => a + b, 0);
  return {
    ...start,
    board: createBoard(
      { white: { points: white, off: off(white) }, black: { points: black, off: off(black) } },
      'parallel',
    ),
  };
}

const key = (turn: Turn): string => JSON.stringify(turn.moves);

describe('fevga bot', () => {
  it('plays easy, medium and hard (the Fevga net) for Fevga', () => {
    expect(bot.supportedLevels('fevga')).toEqual(['easy', 'medium', 'hard']);
    const dice: Dice = [6, 5];
    expect(() => bot.chooseTurn(start, dice, 'medium', { rng: createSeededRng(1) })).not.toThrow();
    expect(() => bot.chooseTurn(start, dice, 'hard', { rng: createSeededRng(1) })).not.toThrow();
  });

  it('always picks a turn from legalTurns, and the same seed gives the same turn', () => {
    for (const state of randomFevgaPositions(11, 80)) {
      const dice = state.dice ?? [1, 2];
      const legal = new Set(fevga.legalTurns(state, dice).map(key));
      for (const level of ['easy', 'medium', 'hard'] as const) {
        const a = bot.chooseTurn(state, dice, level, { rng: createSeededRng(7) });
        const b = bot.chooseTurn(state, dice, level, { rng: createSeededRng(7) });
        expect(legal.has(key(a))).toBe(true);
        expect(b).toEqual(a);
        expect(() => fevga.applyTurn(state, a)).not.toThrow();
      }
    }
  });

  it('moves only the runner at the start (the runner rule)', () => {
    for (const dice of [
      [6, 5],
      [3, 1],
      [2, 2],
    ] as const) {
      const turn = bot.chooseTurn(start, dice, 'medium', { rng: createSeededRng(1) });
      // One checker leaves 24; every other move continues from where the last one landed.
      const froms = turn.moves.map((m) => m.from);
      expect(froms.filter((f) => f === 24)).toHaveLength(1);
    }
  });

  it('never misses a win now, even easy with an evaluator that wants to lose', () => {
    // White has one checker left on W2; Black has none off: a bear-off wins 2 points.
    const state = position({ 2: 1 }, { 6: 15 });
    const dice: Dice = [1, 1];
    // No fast path, and it loves every position where the game goes on.
    const contrary: Evaluator = {
      id: 'contrary',
      variant: 'fevga',
      evaluate: () => ({ win: 0, winDouble: 0, loseDouble: 1, equity: -2 }),
    };
    const noisy = createBot({
      evaluators: new Map([['fevga', { easy: contrary, medium: contrary, hard: contrary }]]),
      policies: { easy: { temperature: 1000 } },
    });
    for (let seed = 0; seed < 20; seed += 1) {
      for (const b of [bot, noisy]) {
        for (const level of ['easy', 'medium', 'hard'] as const) {
          const turn = b.chooseTurn(state, dice, level, { rng: createSeededRng(seed) });
          const result = fevga.result(fevga.applyTurn(state, turn));
          expect(result).toEqual({ winner: 'white', points: 2, reason: 'borneOff' });
        }
      }
    }
  });

  it('medium loses almost nothing per turn; easy loses more', () => {
    const evaluator = createFevgaHeuristic();
    const loss = { easy: 0, medium: 0 };
    const positions = randomFevgaPositions(12, 150);
    for (const state of positions) {
      const dice = state.dice ?? [1, 2];
      const turns = fevga.legalTurns(state, dice);
      const scores = evaluator.scoreTurns?.(state, turns) ?? [];
      const best = Math.max(...scores.map((s) => s.score));
      for (const level of ['easy', 'medium'] as const) {
        const turn = bot.chooseTurn(state, dice, level, { rng: createSeededRng(5) });
        const i = turns.findIndex((t) => key(t) === key(turn));
        loss[level] += (best - (scores[i]?.score ?? -Infinity)) / positions.length;
      }
    }
    expect(loss.medium).toBeLessThan(0.01);
    expect(loss.easy).toBeGreaterThan(3 * loss.medium);
  });
});
