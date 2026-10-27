/**
 * How the bot answers a variant's question (`Variant.prompt`), for example
 * Plakoto "resign or play on" after a mother is pinned
 * (`motherRule: "offerConcede"`).
 *
 * Each choice is scored like a turn (1-ply): the engine applies the answer
 * (`Variant.answerPrompt`), then the evaluator scores the new state from the
 * view of the player who answers, or the true points if the answer ends the
 * game. The level's noise policy (`pickTurn`) then picks a choice, so an
 * answer that wins at once is always taken, and the medium bot nearly always
 * takes the best one.
 *
 * For the Plakoto question: resigning loses 2 points, and playing on can
 * never lose more, so the evaluation of "play on" decides how often the bot
 * resigns. See the README.
 *
 * Some answers fix the dice of the player's next turn: the Asodio
 * "chooseDouble" question after a 1-2 (the Acey-Deucey presets; the owner
 * version `asodio.kafeneio` asks nothing). The answer sets `state.dice` to
 * `[d, d]` and the same player moves. Such an answer is worth the best turn
 * with those dice (1-ply over its legal turns), not the evaluation of the
 * position before the roll.
 */

import type { Dice, GameState, PlayerId, Variant, VariantPrompt } from '@tavli/engine';

import { BotError } from './errors';
import { scoreTurns, scoreWithEngine } from './score';
import type { Evaluator, TurnScore } from './types';

/**
 * The question `state` waits for. Throws `BotError('INVALID_REQUEST')` when
 * there is none, or the variant cannot take an answer.
 */
export function questionOf(variant: Variant, state: GameState): VariantPrompt {
  const prompt = variant.prompt?.(state) ?? null;
  if (prompt === null || variant.answerPrompt === undefined || prompt.choices.length === 0) {
    throw new BotError(
      'INVALID_REQUEST',
      `this "${state.variant}" state has no question to answer`,
    );
  }
  return prompt;
}

/** Scores each of `prompt.choices` for `prompt.player`. No evaluator: 0 unless the game ends. */
export function scoreAnswers(
  variant: Variant,
  evaluator: Evaluator | undefined,
  state: GameState,
  prompt: VariantPrompt,
): TurnScore[] {
  const player: PlayerId = prompt.player;
  const answer = variant.answerPrompt;
  if (answer === undefined) throw new BotError('INVALID_REQUEST', 'the variant takes no answers');
  return prompt.choices.map((choice) => {
    const next = answer.call(variant, state, player, choice);
    const result = variant.result(next);
    if (result !== null) {
      const points = result.winner === null ? 0 : result.points;
      return { score: result.winner === player ? points : -points, gameOver: true };
    }
    // The answer fixed the dice of the player's next turn (Asodio "chooseDouble"):
    // the answer is worth the best turn with those dice.
    if (next.dice !== null && next.toMove === player) return bestTurn(variant, evaluator, next);
    if (evaluator === undefined) return { score: 0, gameOver: false };
    const equity = evaluator.evaluate(next).equity;
    return { score: next.toMove === player ? equity : -equity, gameOver: false };
  });
}

/** The score of the best turn for `state.toMove` with `state.dice` (1-ply). */
function bestTurn(variant: Variant, evaluator: Evaluator | undefined, state: GameState): TurnScore {
  const dice = state.dice as Dice;
  const turns = variant.legalTurns(state, dice);
  const scores =
    evaluator === undefined
      ? scoreWithEngine(variant, undefined, state, turns)
      : scoreTurns(variant, evaluator, state, turns);
  // A turn that wins now beats any evaluation (as in `pickTurn`).
  const rank = (s: TurnScore): number => (s.gameOver && s.score > 0 ? 1000 + s.score : s.score);
  let best = scores[0] ?? { score: 0, gameOver: false };
  for (const s of scores) if (rank(s) > rank(best)) best = s;
  return best;
}
