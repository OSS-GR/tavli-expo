/**
 * Checks the fast move generator against a slow, simple one.
 *
 * The reference (`src/testing/portes-oracle.ts`) follows the engine
 * algorithm in `tavli-match.md` word for word: try every order of the dice,
 * every checker, no pruning; keep the longest plays; apply the higher-die
 * rule; compare the sets of end positions.
 */

import { describe, expect, it } from 'vitest';

import { DISTINCT_ROLLS } from '../../dice';
import type { Dice } from '../../dice';
import type { GameState } from '../../state';
import { referenceFinals, sideKey, sideOf } from '../../testing/portes-oracle';
import { formatPosition } from '../../testing/position-notation';
import { randomPositions } from '../../testing/random-positions';
import { portes } from './index';

function engineFinals(state: GameState, dice: Dice): string[] {
  return portes.legalTurns(state, dice).map((turn) => {
    const next = portes.applyTurn({ ...state, dice }, turn);
    return sideKey(sideOf(next.board, state.toMove));
  });
}

describe('Portes generator vs. the slow reference', () => {
  it('finds the same end positions, each once, in 400 random positions', () => {
    for (const state of randomPositions(23, 400, 3)) {
      const dice = state.dice ?? [1, 1];
      const mine = engineFinals(state, dice);
      const context = `${formatPosition(state.board)} (${state.toMove}, ${dice.join('-')})`;
      expect(new Set(mine).size, context).toBe(mine.length);
      expect(new Set(mine), context).toEqual(referenceFinals(state, dice));
    }
  });

  it('agrees on every roll in 25 random positions', () => {
    for (const state of randomPositions(57, 25, 11)) {
      for (const { dice } of DISTINCT_ROLLS) {
        expect(new Set(engineFinals(state, dice))).toEqual(referenceFinals(state, dice));
      }
    }
  });
});
