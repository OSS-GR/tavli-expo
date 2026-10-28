/**
 * The work of one 2-ply hint (#219). The app's Hint asks for 2 ply in
 * Portes, Plakoto and Fevga (`hintPlies` in `apps/mobile/src/features/hint/`).
 * This test bounds the work of one such `rankTurns` call by the number of
 * positions the evaluator scores. That count is deterministic, unlike the
 * time, so the bound can be tight and never fails on a slow machine. The
 * README ("2-ply") has the numbers and the time per position.
 */

import { describe, expect, it } from 'vitest';

import { createSeededRng, fevga, plakoto, portes, rollDice } from '@tavli/engine';
import type { Dice, GameState, Turn, Variant } from '@tavli/engine';

import { DEFAULT_EVALUATORS, createAnalyzer } from './index';
import type { Evaluator, EvaluatorRegistry, EvaluatorSet } from './index';
import { randomFevgaPositions } from './testing/random-fevga-positions';
import { randomPlakotoPositions } from './testing/random-plakoto-positions';
import { randomPositions } from './testing/random-positions';

/**
 * The most positions one 2-ply hint may score, per game. About 1.3 times
 * the worst seen over 500 positions per game (Portes 14,501, Plakoto
 * 19,065, Fevga 13,649). Raise a bound only with a reason in the README:
 * the phone budget for a hint is 1 s.
 */
const MAX_POSITIONS = { portes: 19_000, plakoto: 25_000, fevga: 18_000 } as const;

/** The default evaluators, each one counting the positions it scores. */
function countingEvaluators(): { registry: EvaluatorRegistry; count: () => number } {
  let positions = 0;
  const counted = (evaluator: Evaluator): Evaluator => {
    const fast = evaluator.scoreTurns;
    return {
      id: evaluator.id,
      variant: evaluator.variant,
      evaluate: (state) => {
        positions += 1;
        return evaluator.evaluate(state);
      },
      ...(fast === undefined
        ? {}
        : {
            scoreTurns: (state: GameState, turns: readonly Turn[]) => {
              positions += turns.length;
              return fast.call(evaluator, state, turns);
            },
          }),
    };
  };
  const registry: EvaluatorRegistry = new Map(
    [...DEFAULT_EVALUATORS].map(([id, set]) => {
      const wrapped: EvaluatorSet = Object.fromEntries(
        Object.entries(set).map(([level, evaluator]) => [level, counted(evaluator)]),
      );
      return [id, wrapped];
    }),
  );
  return { registry, count: () => positions };
}

/**
 * Positions from games where both players play the Analyzer's best 1-ply
 * turn, with seeded dice: closer to a real game than random play. A
 * Plakoto mother question is answered "play on".
 */
function bestPlayPositions(variant: Variant, seed: number, count: number): GameState[] {
  const analyzer = createAnalyzer();
  const rng = createSeededRng(seed);
  const fresh = () => variant.initialState({ startingPlayer: 'white' });
  const out: GameState[] = [];
  let state = fresh();
  while (out.length < count) {
    if (variant.result(state) !== null) state = fresh();
    const prompt = variant.prompt?.(state) ?? null;
    if (prompt !== null && variant.answerPrompt !== undefined) {
      state = variant.answerPrompt(state, prompt.player, 'playOn');
      continue;
    }
    const dice = rollDice(rng);
    const rolled: GameState = { ...state, dice };
    out.push(rolled);
    const [best] = analyzer.rankTurns(rolled, dice, { top: 1 });
    if (best === undefined) throw new Error('no turn');
    state = variant.applyTurn(rolled, best.turn);
  }
  return out;
}

const GAMES = [
  ['portes', portes, () => randomPositions(219, 60, 5)],
  ['plakoto', plakoto, () => randomPlakotoPositions(219, 60, 5)],
  ['fevga', fevga, () => randomFevgaPositions(219, 60, 5)],
] as const;

describe('the work of a 2-ply hint (#219)', () => {
  it.each(GAMES)(
    '%s: one hint scores at most its bound of positions',
    { timeout: 120_000 },
    (game, variant, random) => {
      const { registry, count } = countingEvaluators();
      const analyzer = createAnalyzer({ evaluators: registry });
      const positions = [...bestPlayPositions(variant, 219, 60), ...random()];
      let worst = 0;
      for (const state of positions) {
        const before = count();
        const ranked = analyzer.rankTurns(state, state.dice as Dice, { plies: 2, top: 1 });
        expect(ranked).toHaveLength(1);
        worst = Math.max(worst, count() - before);
      }
      // The counter works: a 2-ply hint scores many positions.
      expect(worst).toBeGreaterThan(1000);
      expect(worst).toBeLessThanOrEqual(MAX_POSITIONS[game]);
    },
  );
});
