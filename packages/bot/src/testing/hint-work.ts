/**
 * The positions and the counter for the work of a 2-ply hint (#219, #233),
 * for tests and the bench only (not exported from the package).
 * `analyzer-work.test.ts` bounds the work with them, and
 * `scripts/bench-hint.ts` also times it.
 */

import {
  asodio,
  createSeededRng,
  fevga,
  getPreset,
  plakoto,
  portes,
  rollDice,
} from '@tavli/engine';
import type { GameState, PlayerId, RuleSet, Turn, Variant } from '@tavli/engine';

import { DEFAULT_EVALUATORS, createAnalyzer } from '../index';
import type { Evaluator, EvaluatorRegistry, EvaluatorSet } from '../index';
import { randomAsodioPositions } from './random-asodio-positions';
import { randomFevgaPositions } from './random-fevga-positions';
import { randomPlakotoPositions } from './random-plakoto-positions';
import { randomPositions } from './random-positions';

/** The default evaluators, each one counting the positions it scores. */
export function countingEvaluators(): { registry: EvaluatorRegistry; count: () => number } {
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
 * turn, with seeded dice: closer to a real game than random play. Play
 * follows `toMove`, and a state that holds dice (the Asodio chosen double)
 * plays them. A Plakoto mother question is answered "play on"; any other
 * question (the Acey-Deucey chosen double) gets the answer whose best turn
 * scores highest.
 */
export function bestPlayPositions(
  variant: Variant,
  seed: number,
  count: number,
  rules?: RuleSet,
): GameState[] {
  const analyzer = createAnalyzer();
  const rng = createSeededRng(seed);
  const fresh = () =>
    variant.initialState({ startingPlayer: 'white', ...(rules === undefined ? {} : { rules }) });
  const out: GameState[] = [];
  let state = fresh();
  while (out.length < count) {
    if (variant.result(state) !== null) state = fresh();
    const prompt = variant.prompt?.(state) ?? null;
    if (prompt !== null && variant.answerPrompt !== undefined) {
      state = bestAnswer(variant, state, prompt.player, prompt.choices, analyzer);
      continue;
    }
    const dice = state.dice ?? rollDice(rng);
    const rolled: GameState = { ...state, dice };
    out.push(rolled);
    const [best] = analyzer.rankTurns(rolled, dice, { top: 1 });
    if (best === undefined) throw new Error('no turn');
    state = variant.applyTurn(rolled, best.turn);
  }
  return out;
}

function bestAnswer(
  variant: Variant,
  state: GameState,
  player: PlayerId,
  choices: readonly string[],
  analyzer: ReturnType<typeof createAnalyzer>,
): GameState {
  const answer = variant.answerPrompt;
  if (answer === undefined) throw new Error('no answerPrompt');
  if (choices.includes('playOn')) return answer.call(variant, state, player, 'playOn');
  let best: GameState | null = null;
  let bestEquity = Number.NEGATIVE_INFINITY;
  for (const choice of choices) {
    const next = answer.call(variant, state, player, choice);
    // The answer fixes the dice of the same player's next turn.
    if (next.dice === null || variant.result(next) !== null) return next;
    const [top] = analyzer.rankTurns(next, next.dice, { top: 1 });
    const equity = top?.evaluation.equity ?? Number.NEGATIVE_INFINITY;
    if (best === null || equity > bestEquity) {
      best = next;
      bestEquity = equity;
    }
  }
  if (best === null) throw new Error('no answer');
  return best;
}

/** The games and rules presets the work of a hint is measured for. */
export const HINT_WORK_GAMES = [
  'portes',
  'plakoto',
  'fevga',
  'asodio.kafeneio',
  'asodio.aceyDeuceyGreek',
  'asodio.aceyDeuceyAmerican',
] as const;

export type HintWorkGame = (typeof HINT_WORK_GAMES)[number];

/**
 * `count` positions from best play, then `count` from random play (every
 * 5th state), all seeded. Portes, Plakoto and Fevga play their default
 * rules; Asodio plays the named preset.
 */
export function hintWorkPositions(game: HintWorkGame, seed: number, count: number): GameState[] {
  switch (game) {
    case 'portes':
      return [...bestPlayPositions(portes, seed, count), ...randomPositions(seed, count, 5)];
    case 'plakoto':
      return [
        ...bestPlayPositions(plakoto, seed, count),
        ...randomPlakotoPositions(seed, count, 5),
      ];
    case 'fevga':
      return [...bestPlayPositions(fevga, seed, count), ...randomFevgaPositions(seed, count, 5)];
    default: {
      const rules = getPreset(game);
      return [
        ...bestPlayPositions(asodio, seed, count, rules),
        ...randomAsodioPositions(seed, count, 5, rules),
      ];
    }
  }
}
