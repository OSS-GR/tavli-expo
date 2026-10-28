/**
 * The work of one 2-ply hint (#219, #237). The app's Hint asks for 2 ply
 * with the work budget of the preset, `TWO_PLY_HINT_BUDGETS` (`hintRankOptions`
 * in `apps/mobile/src/features/hint/`). This test checks that budget on
 * positions of every game and rules preset, from several seeds: one hint
 * never scores more than the budget plus one position (the evaluation of
 * the returned turn when no deeper look fit), or the 1-ply count when
 * that alone is larger. The count is deterministic, unlike the time, so
 * the check never fails on a slow machine. The README ("2-ply budget") has
 * the numbers and the time per position. `pnpm --filter @tavli/bot
 * bench:hint` measures more positions with the same helper.
 */

import { describe, expect, it } from 'vitest';

import type { Dice, GameState } from '@tavli/engine';

import { TWO_PLY_HINT_BUDGETS, createAnalyzer } from './index';
import type { RankOptions } from './index';
import { HINT_WORK_GAMES, countingEvaluators, hintWorkPositions } from './testing/hint-work';

/** The seeds of the positions: several, so one lucky seed cannot hide a slow tail. */
const SEEDS = [219, 233, 237] as const;

describe('the work of a 2-ply hint (#219, #237)', () => {
  it.each(HINT_WORK_GAMES)(
    '%s: one hint scores at most the budget',
    { timeout: 120_000 },
    (game) => {
      const { registry, count } = countingEvaluators();
      const analyzer = createAnalyzer({ evaluators: registry });
      const used = (state: GameState, opts: RankOptions): number => {
        const before = count();
        const ranked = analyzer.rankTurns(state, state.dice as Dice, opts);
        expect(ranked).toHaveLength(1);
        return count() - before;
      };
      const budget = TWO_PLY_HINT_BUDGETS[game];
      let worst = 0;
      for (const seed of SEEDS) {
        // 10 positions from best play and 10 from random play, per seed.
        for (const state of hintWorkPositions(game, seed, 10)) {
          const hint = used(state, { plies: 2, top: 1, budget });
          // The 1-ply scores always run in full (never near the budget in a real game).
          const oneply = used(state, { top: 1 });
          expect(hint).toBeLessThanOrEqual(Math.max(budget + 1, oneply));
          worst = Math.max(worst, hint);
        }
      }
      // The counter works: a 2-ply hint scores many positions.
      expect(worst).toBeGreaterThan(1000);
    },
  );

  it('the Asodio bench positions follow toMove and play the chosen double', () => {
    // Best play answers the Acey-Deucey 1-2 question; the state then holds the double.
    const positions = hintWorkPositions('asodio.aceyDeuceyGreek', 219, 40);
    const analyzer = createAnalyzer();
    const chosen = positions.filter((s) => s.variantData !== null && s.variantData !== undefined);
    expect(chosen.length).toBeGreaterThan(0);
    for (const state of chosen) expect(state.dice?.[0]).toBe(state.dice?.[1]);
    for (const state of positions) {
      expect(analyzer.rankTurns(state, state.dice as Dice, { top: 1 })).toHaveLength(1);
    }
  });
});
