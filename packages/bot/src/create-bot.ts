/**
 * `createBot` plugs the levels together (docs/architecture/bot-ai.md,
 * section 4.1). Every level but `random` runs the same pipeline:
 *
 * 1. the engine lists the legal turns (one per end position);
 * 2. the level's evaluator scores the end position of each turn (1-ply);
 * 3. a turn that wins the game at once is always taken;
 * 4. else the level's noise policy picks a turn: a softmax over the scores.
 *
 * | Level  | Evaluator           | Temperature                      |
 * | ------ | ------------------- | -------------------------------- |
 * | random | none                | uniform over the legal turns     |
 * | easy   | variant heuristic   | high (many small mistakes)       |
 * | medium | variant heuristic   | low (mostly the best turn)       |
 * | hard   | trained net         | low (like medium)                |
 *
 * The variant heuristics: Portes (`portes-heuristic.ts`), Plakoto
 * (`plakoto-heuristic.ts`), Fevga (`fevga-heuristic.ts`) and Asodio
 * (`asodio-heuristic.ts`). Hard has a trained net for Portes
 * (`portes-net.ts`, #147), Plakoto (`plakoto-net.ts`) and Fevga
 * (`fevga-net.ts`, #156); Asodio throws `NOT_IMPLEMENTED` for hard.
 * Easy for a variant with no evaluator falls back to a random turn, but
 * still takes a turn that wins at once. Medium and hard need an evaluator.
 */

import { BOT_DIFFICULTIES } from '@tavli/contracts';
import type { Dice, GameState, Rng, Turn, VariantId, VariantRegistry } from '@tavli/engine';
import { VARIANT_REGISTRY, getVariant } from '@tavli/engine';

import { questionOf, scoreAnswers } from './answer';
import { BotError } from './errors';
import { asodioHeuristic } from './evaluators/asodio-heuristic';
import { fevgaHeuristic } from './evaluators/fevga-heuristic';
import { fevgaNet } from './evaluators/fevga-net';
import { plakotoHeuristic } from './evaluators/plakoto-heuristic';
import { plakotoNet } from './evaluators/plakoto-net';
import { portesHeuristic } from './evaluators/portes-heuristic';
import { portesNet } from './evaluators/portes-net';
import { pickOne, randomUnit } from './random';
import { scoreTurns, scoreWithEngine } from './score';
import type {
  BotLevel,
  BotOptions,
  BotRegistry,
  ConfiguredBot,
  Difficulty,
  EvaluatorRegistry,
  LevelPolicy,
  TurnScore,
} from './types';

export { scoreTurns };

/** An empty registry: only `random` and the easy fallback work. */
export const EMPTY_EVALUATOR_REGISTRY: EvaluatorRegistry = new Map();

/**
 * The built-in evaluators: one heuristic per variant, for easy and medium,
 * and a trained net for hard in Portes, Plakoto and Fevga.
 */
export const DEFAULT_EVALUATORS: EvaluatorRegistry = new Map([
  ['portes', { easy: portesHeuristic, medium: portesHeuristic, hard: portesNet }],
  ['plakoto', { easy: plakotoHeuristic, medium: plakotoHeuristic, hard: plakotoNet }],
  ['fevga', { easy: fevgaHeuristic, medium: fevgaHeuristic, hard: fevgaNet }],
  ['asodio', { easy: asodioHeuristic, medium: asodioHeuristic }],
]);

/**
 * The noise of each level, as a softmax temperature in equity (points).
 * Set by self-play (see the README) so that medium beats easy about 75 % of
 * the time (bot-ai.md asks for 70 %+):
 *
 * - easy (0.15): about half of its turns are not the best, but most of
 *   those cost little; about 1 turn in 5 loses more than 0.1 points. It
 *   still beats random play about 99 % of the time.
 * - medium (0.01): small noise. It only mixes turns that are almost equal
 *   (average loss about 0.001 points per turn).
 * - hard (0.01): the same small noise as medium. The strength comes from
 *   the evaluator (the variant's net), not from less noise.
 */
export const DEFAULT_LEVEL_POLICIES: Readonly<Record<Difficulty, LevelPolicy>> = {
  easy: { temperature: 0.15 },
  medium: { temperature: 0.01 },
  hard: { temperature: 0.01 },
};

/** `random`: one uniformly random turn from the legal list (a pass is a one-item list). */
export function chooseRandomTurn(turns: readonly Turn[], rng: Rng): Turn {
  return pickOne(rng, turns);
}

/** The turns (or answers) that win the game now with the most points, or `[]`. */
function winningNow<T>(turns: readonly T[], scores: readonly TurnScore[]): T[] {
  let best: T[] = [];
  let bestPoints = 0;
  scores.forEach((s, i) => {
    const turn = turns[i];
    if (!s.gameOver || s.score <= 0 || turn === undefined) return;
    if (s.score > bestPoints) {
      bestPoints = s.score;
      best = [turn];
    } else if (s.score === bestPoints) {
      best.push(turn);
    }
  });
  return best;
}

/**
 * Picks a turn: one that wins now if any, else a softmax draw with
 * `temperature` (0 = the best turn, ties at random). `chooseAnswer` uses
 * it the same way for the choices of a question.
 */
export function pickTurn<T = Turn>(
  turns: readonly T[],
  scores: readonly TurnScore[],
  temperature: number,
  rng: Rng,
): T {
  const wins = winningNow(turns, scores);
  if (wins.length > 0) return pickOne(rng, wins);
  let max = -Infinity;
  for (const s of scores) if (s.score > max) max = s.score;
  if (!(temperature > 0)) {
    return pickOne(
      rng,
      turns.filter((_, i) => scores[i]?.score === max),
    );
  }
  const weights = scores.map((s) => Math.exp((s.score - max) / temperature));
  let total = 0;
  for (const weight of weights) total += weight;
  let draw = randomUnit(rng) * total;
  for (let i = 0; i < turns.length; i += 1) {
    draw -= weights[i] ?? 0;
    const turn = turns[i];
    if (draw < 0 && turn !== undefined) return turn;
  }
  // Rounding left a tiny rest: the last turn with a weight.
  return pickOne(
    rng,
    turns.filter((_, i) => (weights[i] ?? 0) > 0),
  );
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

function checkPolicies(policies: Readonly<Record<Difficulty, LevelPolicy>>): void {
  for (const [level, policy] of Object.entries(policies)) {
    if (!Number.isFinite(policy.temperature) || policy.temperature < 0) {
      throw new BotError(
        'INVALID_REGISTRY',
        `the ${level} temperature must be a number >= 0, got ${policy.temperature}`,
      );
    }
  }
}

/**
 * Builds a bot. With no registry, it uses the engine's built-in variants,
 * `DEFAULT_EVALUATORS` and `DEFAULT_LEVEL_POLICIES`. Throws
 * `BotError('INVALID_REGISTRY')` if an evaluator sits under the wrong
 * variant id or a temperature is not a number >= 0.
 */
export function createBot(registry: BotRegistry = {}): ConfiguredBot {
  const variants = registry.variants ?? VARIANT_REGISTRY;
  // The defaults only cover the variants this bot knows (a custom registry may lack Portes).
  const evaluators =
    registry.evaluators ??
    new Map([...DEFAULT_EVALUATORS].filter(([variantId]) => variants.has(variantId)));
  const policies = { ...DEFAULT_LEVEL_POLICIES, ...registry.policies };
  checkRegistry(variants, evaluators);
  checkPolicies(policies);

  return {
    supportedLevels(variant: VariantId): readonly Difficulty[] {
      if (!variants.has(variant)) return [];
      const set = evaluators.get(variant);
      return BOT_DIFFICULTIES.filter((level) => level === 'easy' || set?.[level] !== undefined);
    },
    chooseTurn(state: GameState, dice: Dice, level: BotLevel, opts: BotOptions): Turn {
      if (state.dice !== null && (state.dice[0] !== dice[0] || state.dice[1] !== dice[1])) {
        throw new BotError(
          'INVALID_REQUEST',
          `the state has dice ${state.dice.join('-')}, not ${dice.join('-')}`,
        );
      }
      const variant = getVariant(variants, state.variant);
      // `legalTurns` throws ILLEGAL_TURN on a finished game, and never returns an empty list.
      const turns = variant.legalTurns(state, dice);
      if (level === 'random') return chooseRandomTurn(turns, opts.rng);

      const evaluator = evaluators.get(state.variant)?.[level];
      // Check this before the forced-turn shortcut, so a missing level fails on every turn.
      if (evaluator === undefined && level !== 'easy') {
        throw new BotError(
          'NOT_IMPLEMENTED',
          `no ${level} bot for "${state.variant}" yet (no evaluator registered)`,
        );
      }
      if (turns.length === 1) return pickOne(opts.rng, turns);

      const rolled: GameState = { ...state, dice };
      if (evaluator === undefined) {
        // Easy with no evaluator yet: random, but never miss a win.
        const scores = scoreWithEngine(variant, undefined, rolled, turns);
        return pickTurn(turns, scores, Infinity, opts.rng);
      }
      const scores = scoreTurns(variant, evaluator, rolled, turns);
      return pickTurn(turns, scores, policies[level].temperature, opts.rng);
    },
    chooseAnswer(state: GameState, level: BotLevel, opts: BotOptions): string {
      const variant = getVariant(variants, state.variant);
      const prompt = questionOf(variant, state);
      if (level === 'random') return pickOne(opts.rng, prompt.choices);
      const evaluator = evaluators.get(state.variant)?.[level];
      if (evaluator === undefined && level !== 'easy') {
        throw new BotError(
          'NOT_IMPLEMENTED',
          `no ${level} bot for "${state.variant}" yet (no evaluator registered)`,
        );
      }
      const scores = scoreAnswers(variant, evaluator, state, prompt);
      // Easy with no evaluator: a random answer, but never miss a win.
      const temperature = evaluator === undefined ? Infinity : policies[level].temperature;
      return pickTurn(prompt.choices, scores, temperature, opts.rng);
    },
  };
}
