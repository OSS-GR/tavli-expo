/**
 * The 1-ply scoring core, shared by `createBot` (turns) and `answer.ts`
 * (answers to a variant's question).
 */

import type { GameState, Turn, Variant } from '@tavli/engine';

import type { Evaluator, TurnScore } from './types';

/**
 * The generic 1-ply path: play each turn with the engine, then evaluate.
 * The evaluator scores a state for its `toMove`. Usually the opponent moves
 * next, so their equity is our loss. With a roll chain (Asodio extra rolls)
 * the same player may move again, and then the equity is ours.
 */
export function scoreWithEngine(
  variant: Variant,
  evaluator: Evaluator | undefined,
  state: GameState,
  turns: readonly Turn[],
): TurnScore[] {
  return turns.map((turn) => {
    const after = variant.applyTurn(state, turn);
    const result = variant.result(after);
    if (result !== null) {
      const points = result.winner === null ? 0 : result.points;
      return { score: result.winner === state.toMove ? points : -points, gameOver: true };
    }
    if (evaluator === undefined) return { score: 0, gameOver: false };
    const equity = evaluator.evaluate(after).equity;
    return { score: after.toMove === state.toMove ? equity : -equity, gameOver: false };
  });
}

/** Scores every turn for the mover, with the evaluator's fast path if it has one. */
export function scoreTurns(
  variant: Variant,
  evaluator: Evaluator,
  state: GameState,
  turns: readonly Turn[],
): readonly TurnScore[] {
  return evaluator.scoreTurns?.(state, turns) ?? scoreWithEngine(variant, evaluator, state, turns);
}
