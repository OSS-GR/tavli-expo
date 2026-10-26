/**
 * `createBot` plugs the levels together.
 *
 * - **Easy** picks a uniformly random legal turn (`chooseRandomTurn`).
 * - **Medium / hard** need an `Evaluator` for the variant in the registry.
 *   With one, the bot plays 1-ply: it plays each legal turn, scores the end
 *   position and keeps the best (ties broken by the RNG). Without one, it
 *   throws `BotError('NOT_IMPLEMENTED')`. The medium bot (#28) adds a
 *   heuristic evaluator and the noise policy here; the hard bot (#52) adds a
 *   neural net and 2-ply.
 */

import type { Dice, GameState, Rng, Turn, Variant, VariantRegistry } from '@tavli/engine';
import { VARIANT_REGISTRY, getVariant } from '@tavli/engine';

import { BotError } from './errors';
import { pickOne } from './random';
import type {
  Bot,
  BotOptions,
  BotRegistry,
  Difficulty,
  Evaluator,
  EvaluatorRegistry,
} from './types';

/** An empty registry: only easy works. */
export const EMPTY_EVALUATOR_REGISTRY: EvaluatorRegistry = new Map();

/** Easy: one uniformly random turn from the legal list (a pass is a one-item list). */
export function chooseRandomTurn(turns: readonly Turn[], rng: Rng): Turn {
  return pickOne(rng, turns);
}

/** Points for the mover once the game is over: + for a win, − for a loss, 0 for a draw. */
function finalScore(variant: Variant, after: GameState, mover: GameState['toMove']): number | null {
  const result = variant.result(after);
  if (result === null) return null;
  if (result.winner === null) return 0;
  return result.winner === mover ? result.points : -result.points;
}

/** 1-ply: the turn whose end position is best for the mover. Ties are broken at random. */
function chooseBestTurn(
  variant: Variant,
  evaluator: Evaluator,
  state: GameState,
  turns: readonly Turn[],
  rng: Rng,
): Turn {
  if (turns.length === 1) return pickOne(rng, turns);
  let best: Turn[] = [];
  let bestScore = -Infinity;
  for (const turn of turns) {
    const after = variant.applyTurn(state, turn);
    // After the turn the opponent is to move, so their equity is our loss.
    const score = finalScore(variant, after, state.toMove) ?? -evaluator.evaluate(after).equity;
    if (score > bestScore) {
      bestScore = score;
      best = [turn];
    } else if (score === bestScore) {
      best.push(turn);
    }
  }
  return pickOne(rng, best);
}

function checkRegistry(variants: VariantRegistry, evaluators: EvaluatorRegistry): void {
  for (const [variantId, set] of evaluators) {
    if (!variants.has(variantId)) {
      throw new BotError('INVALID_REGISTRY', `evaluators for unknown variant "${variantId}"`);
    }
    for (const [level, evaluator] of Object.entries(set)) {
      if (evaluator !== undefined && evaluator.variant !== variantId) {
        throw new BotError(
          'INVALID_REGISTRY',
          `evaluator "${evaluator.id}" is for "${evaluator.variant}", but it is registered for "${variantId}" ${level}`,
        );
      }
    }
  }
}

/**
 * Builds a bot. With no registry, it uses the engine's built-in variants and
 * no evaluators, so only easy works. Throws `BotError('INVALID_REGISTRY')` if
 * an evaluator sits under the wrong variant id.
 */
export function createBot(registry: BotRegistry = {}): Bot {
  const variants = registry.variants ?? VARIANT_REGISTRY;
  const evaluators = registry.evaluators ?? EMPTY_EVALUATOR_REGISTRY;
  checkRegistry(variants, evaluators);

  return {
    chooseTurn(state: GameState, dice: Dice, difficulty: Difficulty, opts: BotOptions): Turn {
      if (state.dice !== null && (state.dice[0] !== dice[0] || state.dice[1] !== dice[1])) {
        throw new BotError(
          'INVALID_REQUEST',
          `the state has dice ${state.dice.join('-')}, not ${dice.join('-')}`,
        );
      }
      const variant = getVariant(variants, state.variant);
      // `legalTurns` throws ILLEGAL_TURN on a finished game, and never returns an empty list.
      const turns = variant.legalTurns(state, dice);
      if (difficulty === 'easy') return chooseRandomTurn(turns, opts.rng);

      const evaluator = evaluators.get(state.variant)?.[difficulty];
      if (evaluator === undefined) {
        throw new BotError(
          'NOT_IMPLEMENTED',
          `no ${difficulty} bot for "${state.variant}" yet (no evaluator registered)`,
        );
      }
      return chooseBestTurn(variant, evaluator, { ...state, dice }, turns, opts.rng);
    },
  };
}
