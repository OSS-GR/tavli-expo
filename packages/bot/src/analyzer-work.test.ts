/**
 * The work of one 2-ply hint (#219). The app's Hint asks for 2 ply in
 * Portes, Plakoto and Fevga (`hintPlies` in `apps/mobile/src/features/hint/`).
 * This test bounds the work of one such `rankTurns` call by the number of
 * positions the evaluator scores. That count is deterministic, unlike the
 * time, so the bound can be tight and never fails on a slow machine. The
 * README ("2-ply") has the numbers and the time per position.
 *
 * Asodio is not here: its hint stays at 1 ply, because its worst 2-ply
 * hint takes much longer than Plakoto's (#233). `pnpm --filter @tavli/bot
 * bench:hint` measures every game and preset with the same positions.
 */

import { describe, expect, it } from 'vitest';

import type { Dice } from '@tavli/engine';

import { createAnalyzer } from './index';
import { countingEvaluators, hintWorkPositions } from './testing/hint-work';

/**
 * The most positions one 2-ply hint may score, per game. About 1.3 times
 * the worst seen over 500 positions per game (Portes 14,501, Plakoto
 * 19,065, Fevga 13,649). Raise a bound only with a reason in the README:
 * the phone budget for a hint is 1 s.
 */
const MAX_POSITIONS = { portes: 19_000, plakoto: 25_000, fevga: 18_000 } as const;

const GAMES = ['portes', 'plakoto', 'fevga'] as const;

describe('the work of a 2-ply hint (#219)', () => {
  it.each(GAMES)(
    '%s: one hint scores at most its bound of positions',
    { timeout: 120_000 },
    (game) => {
      const { registry, count } = countingEvaluators();
      const analyzer = createAnalyzer({ evaluators: registry });
      // 60 positions from best play and 60 from random play.
      const positions = hintWorkPositions(game, 219, 60);
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
