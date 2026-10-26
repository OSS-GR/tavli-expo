/**
 * Bot players for tavli (ADR-0006).
 *
 * This package is pure TypeScript. It depends only on `@tavli/engine` and
 * `@tavli/contracts`. No React, no `Math.random`, no clock, no sleeping.
 *
 * See `packages/bot/README.md`.
 */

export { BOT_DIFFICULTIES, isDifficulty } from '@tavli/contracts';

export type {
  Analyzer,
  Bot,
  BotOptions,
  BotRegistry,
  Difficulty,
  Evaluation,
  Evaluator,
  EvaluatorRegistry,
  EvaluatorSet,
  RankedTurn,
} from './types';

export { BotError } from './errors';
export type { BotErrorCode } from './errors';

export { EMPTY_EVALUATOR_REGISTRY, chooseRandomTurn, createBot } from './create-bot';
export { InlineBotRunner, runBotRequest } from './inline-runner';
export { FORCED_DELAY_MS, THINKING_DELAY_MS, thinkingDelayMs } from './thinking-delay';
export type { DelayRange } from './thinking-delay';
export { pickOne, randomInt, randomIntBetween } from './random';

export { playGame, simulate } from './simulate';
export type {
  GameFailure,
  GameOutcome,
  Pair,
  SimulateOptions,
  SimulationPlayer,
  SimulationResult,
  TurnEvent,
} from './simulate';
export {
  DEFAULT_SIMULATE_ARGS,
  SIMULATE_USAGE,
  formatSimulationReport,
  parseSimulateArgs,
  runSimulateCli,
} from './simulate-cli';
export type { CliIo, SimulateArgs } from './simulate-cli';
