/**
 * The Analyzer: ranks the legal turns for a roll, for hints and (later)
 * post-game review (docs/architecture/bot-ai.md, section 4.4).
 *
 * It uses the variant's best evaluator: the hard one (a trained net) when
 * there is one, else the medium one (a heuristic). At 1 ply it runs the
 * same core as the bot (`scoreTurns`), so its best turn is the turn the bot
 * plays at temperature 0. At 2 plies it also looks at each roll of the
 * next player and their best 1-ply reply, for the best candidates. There
 * is no randomness: the same state gives the same ranking.
 */

import type { Dice, DieValue, GameState, GameResult, PlayerId, Turn, Variant } from '@tavli/engine';
import { DIE_VALUES, VARIANT_REGISTRY, getVariant } from '@tavli/engine';

import { questionOf, scoreAnswers } from './answer';
import { checkDice, checkRegistry, defaultEvaluatorsFor } from './create-bot';
import { BotError } from './errors';
import { scoreTurns } from './score';
import type {
  Analyzer,
  BotRegistry,
  Evaluation,
  Evaluator,
  EvaluatorRegistry,
  RankOptions,
  RankedTurn,
  TurnScore,
} from './types';

/**
 * 2-ply: the number of best 1-ply turns that always get the deeper look.
 * Measured on 189 random positions of all games with more than one turn
 * (2-ply on the best 16): the 2-ply best turn was in the 1-ply top 3 in
 * 96 % of them, and outside the top 8 only twice.
 */
export const TWO_PLY_CANDIDATES = 8;

/**
 * 2-ply: a turn past the best `TWO_PLY_CANDIDATES` also gets the deeper
 * look when its 1-ply score is within this many points of the best (a near
 * tie), up to `TWO_PLY_MAX_CANDIDATES` turns in all.
 */
export const TWO_PLY_MARGIN = 0.02;

/**
 * 2-ply: at most this many turns get the deeper look. Some Asodio rolls have
 * dozens of near-equal turns, and each costs 21 replies, so the cap keeps a
 * hint fast.
 */
export const TWO_PLY_MAX_CANDIDATES = 16;

/** One roll of the two dice, with its chance: 1/36 for a double, 2/36 for the rest. */
interface WeightedRoll {
  readonly dice: Dice;
  readonly weight: number;
}

/** The 21 different rolls, higher die first. Their weights add up to 1. */
const ROLLS: readonly WeightedRoll[] = DIE_VALUES.flatMap((high) =>
  DIE_VALUES.filter((low) => low <= high).map((low: DieValue) => ({
    dice: [high, low] as Dice,
    weight: high === low ? 1 / 36 : 2 / 36,
  })),
);

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

/** The index of the best score (as in `compareScores`); the first one on a tie. */
function bestIndex(scores: readonly TurnScore[]): number {
  let best = 0;
  scores.forEach((score, i) => {
    if (compareScores(score, scores[best] as TurnScore) < 0) best = i;
  });
  return best;
}

/** An evaluation from the view of one player, with its equity as a plain number too. */
interface Valued {
  readonly evaluation: Evaluation;
  readonly equity: number;
}

/**
 * Builds an Analyzer. With no registry, it uses the engine's built-in
 * variants and `DEFAULT_EVALUATORS`. `policies` are ignored: the Analyzer
 * has no noise. Throws `BotError('INVALID_REGISTRY')` like `createBot`.
 *
 * - `rankTurns(state, dice, { plies, top })` returns every legal turn for
 *   `dice`, best first, for `state.toMove`. Each turn has its evaluation
 *   after the turn (from the mover's view) and `equityLoss` against the
 *   best turn (0 for the best, never below 0). A forced turn or a pass is
 *   a list of one. Throws `NOT_IMPLEMENTED` for a variant with no hard or
 *   medium evaluator, `INVALID_REQUEST` when `dice` differs from
 *   `state.dice`, `plies` is not 1 or 2, `top` is not an integer >= 1, or
 *   (at 2 plies) a question after a turn has no `answerPrompt`, and the
 *   engine's errors for a finished game or an unknown variant.
 * - `plies: 1` (the default): `evaluation.equity` is the bot's score of
 *   the turn.
 * - `plies: 2`: the best `TWO_PLY_CANDIDATES` turns at 1 ply, and the
 *   turns within `TWO_PLY_MARGIN` of the best (at most
 *   `TWO_PLY_MAX_CANDIDATES` in all), get a deeper look: the average over
 *   the 21 rolls of the next player of the result after their best 1-ply
 *   reply. They rank first, by that 2-ply equity (a turn that wins at once
 *   still ranks first). The other turns follow in their 1-ply order, with
 *   their 1-ply evaluation. Their `equityLoss` is their 1-ply loss, but
 *   never less than the last candidate's. See `twoPly` for the details.
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

  /**
   * The evaluation after `turn` from the view of `me`, with `score` (the
   * 1-ply score from the view of `state.toMove`) as its equity, so
   * `equityLoss` and the evaluation agree exactly.
   */
  function evaluationAfter(
    variant: Variant,
    evaluator: Evaluator,
    state: GameState,
    turn: Turn,
    score: TurnScore,
    me: PlayerId,
  ): Valued {
    const after = variant.applyTurn(state, turn);
    const equity = state.toMove === me ? score.score : -score.score;
    const result = variant.result(after);
    if (result !== null) return { evaluation: fromResult(result, me), equity };
    const raw = evaluator.evaluate(after);
    // An Asodio extra roll keeps the same player to move: then the view is already theirs.
    const mine = after.toMove === me ? raw : flip(raw);
    return { evaluation: { ...mine, equity }, equity };
  }

  /** The best 1-ply turn of `state.toMove` with `dice`, valued from the view of `me`. */
  function bestReply(
    variant: Variant,
    evaluator: Evaluator,
    state: GameState,
    dice: Dice,
    me: PlayerId,
  ): Valued {
    const rolled: GameState = { ...state, dice };
    const turns = variant.legalTurns(rolled, dice);
    const scores = scoreTurns(variant, evaluator, rolled, turns);
    const i = bestIndex(scores);
    return evaluationAfter(
      variant,
      evaluator,
      rolled,
      turns[i] as Turn,
      scores[i] as TurnScore,
      me,
    );
  }

  /**
   * The 2-ply value of `after` (the state after one of our turns, game not
   * over), from the view of `me` (who played that turn). The engine drives
   * every step, and the next player is always `toMove`:
   *
   * 1. A question (`Variant.prompt`, like Plakoto "resign or play on" or
   *    the Asodio chosen double) gets the best 1-ply answer of the player
   *    asked (`scoreAnswers`, as the bot answers), then play goes on. A
   *    question the variant cannot take an answer for (no `answerPrompt`)
   *    throws `BotError('INVALID_REQUEST')`, like `chooseAnswer`.
   * 2. A state that holds dice (the Asodio chosen double) plays those dice:
   *    the value is the best reply with them. No average.
   * 3. Else the value is the average over the 21 rolls of the best 1-ply
   *    reply of `toMove`. With an Asodio extra roll that is our own next
   *    roll, so the reply is ours.
   */
  function twoPly(variant: Variant, evaluator: Evaluator, after: GameState, me: PlayerId): Valued {
    let state = after;
    while ((variant.prompt?.(state) ?? null) !== null) {
      // `questionOf` throws INVALID_REQUEST when the variant cannot take the answer.
      const prompt = questionOf(variant, state);
      const scores = scoreAnswers(variant, evaluator, state, prompt);
      const choice = prompt.choices[bestIndex(scores)] as string;
      const answer = variant.answerPrompt as NonNullable<Variant['answerPrompt']>;
      state = answer.call(variant, state, prompt.player, choice);
      const result = variant.result(state);
      if (result !== null) {
        const evaluation = fromResult(result, me);
        return { evaluation, equity: evaluation.equity };
      }
    }
    if (state.dice !== null) return bestReply(variant, evaluator, state, state.dice, me);

    let win = 0;
    let winDouble = 0;
    let loseDouble = 0;
    let equity = 0;
    for (const { dice, weight } of ROLLS) {
      const reply = bestReply(variant, evaluator, state, dice, me);
      win += weight * reply.evaluation.win;
      winDouble += weight * reply.evaluation.winDouble;
      loseDouble += weight * reply.evaluation.loseDouble;
      equity += weight * reply.equity;
    }
    return { evaluation: { win, winDouble, loseDouble, equity }, equity };
  }

  return {
    rankTurns(state: GameState, dice: Dice, opts: RankOptions = {}): readonly RankedTurn[] {
      const plies = opts.plies ?? 1;
      if (plies !== 1 && plies !== 2) {
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
      const me = state.toMove;
      const scores = scoreTurns(variant, evaluator, rolled, turns);

      const order = turns.map((_, i) => i);
      // `sort` is stable, so equal scores keep the engine's order.
      order.sort((a, b) => compareScores(scores[a] as TurnScore, scores[b] as TurnScore));
      const best = scores[order[0] as number] as TurnScore;
      const oneVsBest = (i: number): number =>
        Math.max(0, best.score - (scores[i] as TurnScore).score);

      const oneVal = (i: number): Valued =>
        evaluationAfter(variant, evaluator, rolled, turns[i] as Turn, scores[i] as TurnScore, me);
      if (plies === 1) {
        const kept = top === undefined ? order : order.slice(0, top);
        return kept.map((i) => ({
          turn: turns[i] as Turn,
          evaluation: oneVal(i).evaluation,
          equityLoss: oneVsBest(i),
        }));
      }

      // 2-ply. The candidates, in their 1-ply order.
      const candidates = order
        .filter((i, rank) => rank < TWO_PLY_CANDIDATES || oneVsBest(i) <= TWO_PLY_MARGIN)
        .slice(0, TWO_PLY_MAX_CANDIDATES);
      const deep = candidates.map((i) => {
        const score = scores[i] as TurnScore;
        const after = variant.applyTurn(rolled, turns[i] as Turn);
        // A turn that ends the game needs no deeper look: its value is exact.
        const value =
          variant.result(after) !== null ? oneVal(i) : twoPly(variant, evaluator, after, me);
        return { i, score, value };
      });
      // Wins at once first, as at 1 ply, then by 2-ply equity. `sort` is
      // stable, so ties keep the 1-ply order.
      deep.sort((a, b) => {
        const wins = Number(winsNow(b.score)) - Number(winsNow(a.score));
        if (wins !== 0) return wins;
        return b.value.equity - a.value.equity;
      });
      const bestDeep = (deep[0] as (typeof deep)[number]).value.equity;
      const ranked: RankedTurn[] = deep.map(({ i, value }) => ({
        turn: turns[i] as Turn,
        evaluation: value.evaluation,
        equityLoss: Math.max(0, bestDeep - value.equity),
      }));
      // The other turns: 1-ply order and evaluation. Their loss is the 1-ply
      // loss, but never less than the last candidate's, so the list stays sorted.
      const floor = ranked[ranked.length - 1]?.equityLoss ?? 0;
      const inDeep = new Set(candidates);
      for (const i of order) {
        if (top !== undefined && ranked.length >= top) break;
        if (inDeep.has(i)) continue;
        ranked.push({
          turn: turns[i] as Turn,
          evaluation: oneVal(i).evaluation,
          equityLoss: Math.max(floor, oneVsBest(i)),
        });
      }
      return top === undefined ? ranked : ranked.slice(0, top);
    },

    evaluate(state: GameState): Evaluation {
      const variant = getVariant(variants, state.variant);
      const result = variant.result(state);
      if (result !== null) return fromResult(result, state.toMove);
      return bestEvaluator(state).evaluate(state);
    },
  };
}
