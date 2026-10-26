/**
 * The bot interfaces (docs/architecture/bot-ai.md, section 7).
 *
 * The bot talks to the rules only through the engine's `Variant` interface.
 * Everything here is pure and synchronous. The bot never sleeps and never
 * reads the clock; the app adds the human-like delay (`thinkingDelayMs`).
 */

import type { Difficulty } from '@tavli/contracts';
import type { Dice, GameState, Rng, Turn, VariantId, VariantRegistry } from '@tavli/engine';

export type { Difficulty };

/** Win chances from the view of the player to move (`state.toMove`). */
export interface Evaluation {
  /** P(win), 0..1. */
  readonly win: number;
  /** P(win 2 points or more: diplo / mars), 0..1. */
  readonly winDouble: number;
  /** P(lose 2 points or more), 0..1. */
  readonly loseDouble: number;
  /** Expected points, -2..+2 (more with `backgammonScores3`). */
  readonly equity: number;
}

/** Scores a position: a heuristic or (later) a neural net. */
export interface Evaluator {
  /** For example `'portes-heuristic-v1'`. Shows up in logs and tests. */
  readonly id: string;
  /** The variant it knows. Must match its key in the `EvaluatorRegistry`. */
  readonly variant: VariantId;
  /** Scores a position before the roll, from the view of `state.toMove`. */
  evaluate(state: GameState): Evaluation;
}

export interface BotOptions {
  /** The bot's own RNG: injected and seeded, never the dice RNG. */
  readonly rng: Rng;
  /** Stop a deeper search after this many milliseconds. Easy ignores it. */
  readonly timeBudgetMs?: number;
}

/** The main entry point. Pure and synchronous. */
export interface Bot {
  /**
   * Picks one full turn for `dice`, from `state.toMove`'s side. A pass is a
   * turn with empty `moves`. If `state.dice` is set, it must equal `dice`.
   *
   * Throws `BotError('NOT_IMPLEMENTED')` when the level has no evaluator for
   * this variant, and the engine's errors for a finished game or an unknown
   * variant.
   */
  chooseTurn(state: GameState, dice: Dice, difficulty: Difficulty, opts: BotOptions): Turn;
}

/** One ranked turn, best first. */
export interface RankedTurn {
  readonly turn: Turn;
  readonly evaluation: Evaluation;
  /** Equity lost against the best turn (0 for the best one). */
  readonly equityLoss: number;
}

/**
 * Hints and post-game review (later). It uses the same evaluators as the
 * bot. Not built yet: it comes with the medium bot (#28) or later.
 */
export interface Analyzer {
  rankTurns(
    state: GameState,
    dice: Dice,
    opts?: { readonly plies?: 1 | 2; readonly top?: number },
  ): readonly RankedTurn[];
  evaluate(state: GameState): Evaluation;
}

/** The evaluators of one variant, by level. */
export type EvaluatorSet = Readonly<Partial<Record<Difficulty, Evaluator>>>;

/** Evaluators by variant id. */
export type EvaluatorRegistry = ReadonlyMap<VariantId, EvaluatorSet>;

/** What `createBot` plugs together. */
export interface BotRegistry {
  /** Where the bot finds the rules. Default: the engine's `VARIANT_REGISTRY`. */
  readonly variants?: VariantRegistry;
  /** Evaluators for medium and hard. Default: none (only easy works). */
  readonly evaluators?: EvaluatorRegistry;
}
