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
  BotLevel,
  BotOptions,
  BotRegistry,
  ConfiguredBot,
  Difficulty,
  Evaluation,
  Evaluator,
  EvaluatorRegistry,
  EvaluatorSet,
  LevelPolicy,
  RankedTurn,
  TurnScore,
} from './types';
export { BOT_LEVELS, isBotLevel } from './types';

export { BotError } from './errors';
export type { BotErrorCode } from './errors';

export {
  DEFAULT_EVALUATORS,
  DEFAULT_LEVEL_POLICIES,
  EMPTY_EVALUATOR_REGISTRY,
  chooseRandomTurn,
  createBot,
  pickTurn,
  scoreTurns,
} from './create-bot';
export {
  PORTES_DEFAULT_WEIGHTS,
  PORTES_HEURISTIC_ID,
  createPortesHeuristic,
  evaluateSides,
  portesHeuristic,
} from './evaluators/portes-heuristic';
export type { PortesWeights } from './evaluators/portes-heuristic';
export {
  PORTES_NET_INPUTS,
  createPortesNetEvaluator,
  loadPortesNet,
  portesNet,
  portesNetGame,
  shippedPortesNet,
} from './evaluators/portes-net';
export type { PortesNet, PortesNetFile } from './evaluators/portes-net';
export { createNetEvaluator, loadNet } from './evaluators/net';
export type { Net, NetFile, NetGame } from './evaluators/net';
export {
  PLAKOTO_NET_INPUTS,
  createPlakotoNetEvaluator,
  loadPlakotoNet,
  plakotoNet,
  plakotoNetGame,
  shippedPlakotoNet,
} from './evaluators/plakoto-net';
export {
  FEVGA_NET_INPUTS,
  createFevgaNetEvaluator,
  fevgaNet,
  fevgaNetGame,
  loadFevgaNet,
  shippedFevgaNet,
} from './evaluators/fevga-net';
export {
  FEVGA_DEFAULT_WEIGHTS,
  FEVGA_HEURISTIC_ID,
  createFevgaHeuristic,
  evaluateFevgaSides,
  fevgaHeuristic,
} from './evaluators/fevga-heuristic';
export type { FevgaWeights } from './evaluators/fevga-heuristic';
export {
  PLAKOTO_DEFAULT_WEIGHTS,
  PLAKOTO_HEURISTIC_ID,
  createPlakotoHeuristic,
  evaluatePlakotoSides,
  plakotoHeuristic,
} from './evaluators/plakoto-heuristic';
export type { PlakotoWeights } from './evaluators/plakoto-heuristic';
export {
  ASODIO_DEFAULT_WEIGHTS,
  ASODIO_HEURISTIC_ID,
  asodioHeuristic,
  createAsodioHeuristic,
  evaluateAsodioSides,
} from './evaluators/asodio-heuristic';
export type { AsodioWeights } from './evaluators/asodio-heuristic';
export { InlineBotRunner, runBotAnswer, runBotRequest } from './inline-runner';
export { FORCED_DELAY_MS, THINKING_DELAY_MS, thinkingDelayMs } from './thinking-delay';
export type { DelayRange } from './thinking-delay';
export { pickOne, randomInt, randomIntBetween, randomUnit } from './random';

export { playGame, simulate } from './simulate';
export type {
  AnswerEvent,
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
