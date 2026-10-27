/**
 * The Analyzer: ranks the legal turns for a roll, for hints and (later)
 * post-game review (docs/architecture/bot-ai.md, section 4.4).
 *
 * It uses the variant's best evaluator: the hard one (a trained net) when
 * there is one, else the medium one (a heuristic). It runs the same 1-ply
 * core as the bot (`scoreTurns`), so its best turn is the turn the bot
 * plays at temperature 0. There is no randomness: the same state gives the
 * same ranking.
 */

import type { Dice, GameState, GameResult, PlayerId, Turn, Variant } from '@tavli/engine';
import { VARIANT_REGISTRY, getVariant } from '@tavli/engine';

import { checkDice, checkRegistry, defaultEvaluatorsFor } from './create-bot';
import { BotError } from './errors';
import { scoreTurns } from './score';
import type {
  Analyzer,
  BotRegistry,
  Evaluation,
  Evaluator,
  EvaluatorRegistry,
  RankedTurn,
  TurnScore,
} from './types';

/** The options of `rankTurns`. */
export interface RankOptions {
  /** Search depth. Only 1 works today; 2 throws `NOT_IMPLEMENTED`. */
  readonly plies?: 1 | 2;
  /** Return only the best `top` turns (an integer >= 1). Default: all. */
  readonly top?: number;
}

/**
 * The same chances, seen from the other player. `win` becomes `1 − win`:
 * exact when a draw counts as half a win, like in the nets (the Asodio net
 * too). The Asodio heuristic leaves draws out of `win`, so with it (only in
 * a custom registry) the flipped `win` also holds the draws. The equity is
 * exact either way.
 */
function flip(evaluation: Evaluation): Evaluation {
  return {
    win: 1 - evaluation.win,
    winDouble: evaluation.loseDouble,
    loseDouble: evaluation.winDouble,
    equity: -evaluation.equity,
  };
}

/** The exact evaluation of a finished game, from the view of `player`. A draw is half a win, like in the nets. */
function fromResult(result: GameResult, player: PlayerId): Evaluation {
  if (result.winner === null) return { win: 0.5, winDouble: 0, loseDouble: 0, equity: 0 };
  const double = result.points >= 2 ? 1 : 0;
  if (result.winner === player) {
    return { win: 1, winDouble: double, loseDouble: 0, equity: result.points };
  }
  return { win: 0, winDouble: 0, loseDouble: double, equity: -result.points };
}

/** True for a turn that wins the game at once. The bot always takes one. */
function winsNow(score: TurnScore): boolean {
  return score.gameOver && score.score > 0;
}

/**
 * The order of the ranking: turns that win at once first (more points
 * first), then the rest by score. Ties keep the engine's order of
 * `legalTurns`, so the ranking is always the same.
 */
function compareScores(a: TurnScore, b: TurnScore): number {
  const wins = Number(winsNow(b)) - Number(winsNow(a));
  if (wins !== 0) return wins;
  return b.score - a.score;
}

/**
 * Builds an Analyzer. With no registry, it uses the engine's built-in
 * variants and `DEFAULT_EVALUATORS`. `policies` are ignored: the Analyzer
 * has no noise. Throws `BotError('INVALID_REGISTRY')` like `createBot`.
 *
 * - `rankTurns(state, dice, { plies, top })` returns every legal turn for
 *   `dice`, best first, for `state.toMove`. Each turn has its evaluation
 *   after the turn (from the mover's view, with `equity` equal to its
 *   score) and `equityLoss` against the best turn (0 for the best, never
 *   below 0). A forced turn or a pass is a list of one. Throws
 *   `NOT_IMPLEMENTED` for `plies: 2` and for a variant with no hard or
 *   medium evaluator, `INVALID_REQUEST` when `dice` differs from
 *   `state.dice` or `top` is not an integer >= 1, and the engine's
 *   errors for a finished game or an unknown variant.
 * - `evaluate(state)` returns the evaluation for `state.toMove`, before
 *   the roll. For a finished game it returns the true result.
 */
export function createAnalyzer(registry: BotRegistry = {}): Analyzer {
  const variants = registry.variants ?? VARIANT_REGISTRY;
  const evaluators: EvaluatorRegistry = registry.evaluators ?? defaultEvaluatorsFor(variants);
  checkRegistry(variants, evaluators);

  function bestEvaluator(state: GameState): Evaluator {
    const set = evaluators.get(state.variant);
    const evaluator = set?.hard ?? set?.medium;
    if (evaluator === undefined) {
      throw new BotError(
        'NOT_IMPLEMENTED',
        `no analyzer for "${state.variant}" yet (no hard or medium evaluator registered)`,
      );
    }
    return evaluator;
  }

  /** The evaluation after `turn`, from the view of the mover (`state.toMove`). */
  function evaluationAfter(
    variant: Variant,
    evaluator: Evaluator,
    state: GameState,
    turn: Turn,
    score: TurnScore,
  ): Evaluation {
    const after = variant.applyTurn(state, turn);
    const result = variant.result(after);
    if (result !== null) return fromResult(result, state.toMove);
    const raw = evaluator.evaluate(after);
    // An Asodio extra roll keeps the same player to move: then the view is already ours.
    const mine = after.toMove === state.toMove ? raw : flip(raw);
    // Use the score as the equity, so `equityLoss` and the evaluation agree exactly.
    return { ...mine, equity: score.score };
  }

  return {
    rankTurns(state: GameState, dice: Dice, opts: RankOptions = {}): readonly RankedTurn[] {
      const plies = opts.plies ?? 1;
      if (plies === 2) {
        throw new BotError('NOT_IMPLEMENTED', 'the 2-ply analysis is not built yet');
      }
      if (plies !== 1) {
        throw new BotError('INVALID_REQUEST', `plies must be 1 or 2, got ${String(plies)}`);
      }
      const top = opts.top;
      if (top !== undefined && !(Number.isInteger(top) && top >= 1)) {
        throw new BotError('INVALID_REQUEST', `top must be an integer >= 1, got ${top}`);
      }
      checkDice(state, dice);
      const variant = getVariant(variants, state.variant);
      // Check the evaluator first, so a missing one fails on a forced turn too.
      const evaluator = bestEvaluator(state);
      // `legalTurns` throws ILLEGAL_TURN on a finished game, and never returns an empty list.
      const turns = variant.legalTurns(state, dice);
      const rolled: GameState = { ...state, dice };
      const scores = scoreTurns(variant, evaluator, rolled, turns);

      const order = turns.map((_, i) => i);
      // `sort` is stable, so equal scores keep the engine's order.
      order.sort((a, b) => compareScores(scores[a] as TurnScore, scores[b] as TurnScore));
      const kept = top === undefined ? order : order.slice(0, top);
      const best = scores[order[0] as number] as TurnScore;

      return kept.map((i) => {
        const turn = turns[i] as Turn;
        const score = scores[i] as TurnScore;
        return {
          turn,
          evaluation: evaluationAfter(variant, evaluator, rolled, turn, score),
          equityLoss: Math.max(0, best.score - score.score),
        };
      });
    },

    evaluate(state: GameState): Evaluation {
      const variant = getVariant(variants, state.variant);
      const result = variant.result(state);
      if (result !== null) return fromResult(result, state.toMove);
      return bestEvaluator(state).evaluate(state);
    },
  };
}
