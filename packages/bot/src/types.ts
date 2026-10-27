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

/**
 * A bot level: the three app levels, plus `random` (a uniformly random legal
 * turn, for tests and as a baseline). The app only uses `Difficulty`.
 */
export type BotLevel = Difficulty | 'random';

/** All levels, weakest first. */
export const BOT_LEVELS: readonly BotLevel[] = ['random', 'easy', 'medium', 'hard'];

export function isBotLevel(value: unknown): value is BotLevel {
  return typeof value === 'string' && (BOT_LEVELS as readonly string[]).includes(value);
}

/** The score of one turn for the mover, from `Evaluator.scoreTurns`. */
export interface TurnScore {
  /**
   * The points won if the turn ends the game (`gameOver`), else minus the
   * opponent's equity after the turn.
   */
  readonly score: number;
  /** True if the turn bears off the last checker and wins the game. */
  readonly gameOver: boolean;
}

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

/** Scores a position: a heuristic or a neural net. */
export interface Evaluator {
  /** For example `'portes-heuristic-v1'`. Shows up in logs and tests. */
  readonly id: string;
  /** The variant it knows. Must match its key in the `EvaluatorRegistry`. */
  readonly variant: VariantId;
  /** Scores a position before the roll, from the view of `state.toMove`. */
  evaluate(state: GameState): Evaluation;
  /**
   * Optional fast path for the 1-ply search: scores each turn for
   * `state.toMove`. It must give the same result as playing each turn with
   * `variant.applyTurn` and then `evaluate` (or the true points at a game
   * end). Without it the bot uses that slower generic path.
   */
  scoreTurns?(state: GameState, turns: readonly Turn[]): readonly TurnScore[];
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
   * `level` is a `Difficulty` or `'random'`. Throws
   * `BotError('NOT_IMPLEMENTED')` when medium or hard has no evaluator for
   * this variant, and the engine's errors for a finished game or an unknown
   * variant.
   */
  chooseTurn(state: GameState, dice: Dice, level: BotLevel, opts: BotOptions): Turn;
  /**
   * Optional. Answers the variant's question (`Variant.prompt`), for example
   * Plakoto "resign or play on" after a mother is pinned. Returns one of
   * `prompt.choices`, for `prompt.player`. Bots from `createBot` have it.
   */
  chooseAnswer?(state: GameState, level: BotLevel, opts: BotOptions): string;
}

/** What `createBot` returns: a `Bot` that can also say which levels it plays. */
export interface ConfiguredBot extends Bot {
  /**
   * The app levels this bot can play for a variant, easiest first. Easy
   * works for every known variant (it falls back to random play); medium
   * and hard need an evaluator. An unknown variant gives `[]`. The app's
   * level picker uses this to enable a level.
   */
  supportedLevels(variant: VariantId): readonly Difficulty[];
  /**
   * Answers the question that `state` waits for (`Variant.prompt`), from
   * the view of `prompt.player`. Each choice is scored like a turn: the
   * engine applies it (`Variant.answerPrompt`), then the level's evaluator
   * scores the result (or the true points if the game ends). The level's
   * noise policy picks one; `random` picks one uniformly. Throws
   * `BotError('INVALID_REQUEST')` when there is no question, and
   * `NOT_IMPLEMENTED` like `chooseTurn`.
   */
  chooseAnswer(state: GameState, level: BotLevel, opts: BotOptions): string;
}

/** One ranked turn, best first. */
export interface RankedTurn {
  readonly turn: Turn;
  readonly evaluation: Evaluation;
  /** Equity lost against the best turn (0 for the best one). */
  readonly equityLoss: number;
}

/**
 * Hints and post-game review. It uses the same evaluators as the bot (the
 * variant's best one) and the same 1-ply core (`scoreTurns`). Build one
 * with `createAnalyzer` (`analyzer.ts`). There is no randomness.
 */
export interface Analyzer {
  /**
   * Every legal turn for `dice`, best first, for `state.toMove`. `top`
   * keeps only the best ones. `plies: 2` throws `BotError('NOT_IMPLEMENTED')`
   * for now.
   */
  rankTurns(
    state: GameState,
    dice: Dice,
    opts?: { readonly plies?: 1 | 2; readonly top?: number },
  ): readonly RankedTurn[];
  /** The evaluation of a position for `state.toMove`, before the roll. */
  evaluate(state: GameState): Evaluation;
}

/**
 * How a level picks among the scored turns (bot-ai.md, section 4.1).
 *
 * It draws a turn with chance ∝ `exp((score − best) / temperature)`, with the
 * score in equity (points). A high temperature makes more mistakes, but good
 * turns still come up more often than bad ones. 0 = always the best turn
 * (ties at random). A turn that wins the game at once is always taken.
 */
export interface LevelPolicy {
  readonly temperature: number;
}

/** The evaluators of one variant, by level. */
export type EvaluatorSet = Readonly<Partial<Record<Difficulty, Evaluator>>>;

/** Evaluators by variant id. */
export type EvaluatorRegistry = ReadonlyMap<VariantId, EvaluatorSet>;

/** What `createBot` plugs together. */
export interface BotRegistry {
  /** Where the bot finds the rules. Default: the engine's `VARIANT_REGISTRY`. */
  readonly variants?: VariantRegistry;
  /**
   * Evaluators by variant and level. Default: `DEFAULT_EVALUATORS` (a
   * heuristic per variant for easy and medium, a trained net for Portes,
   * Plakoto and Fevga hard), for the variants in `variants`.
   */
  readonly evaluators?: EvaluatorRegistry;
  /** Override the noise of a level. Default: `DEFAULT_LEVEL_POLICIES`. */
  readonly policies?: Readonly<Partial<Record<Difficulty, LevelPolicy>>>;
}
