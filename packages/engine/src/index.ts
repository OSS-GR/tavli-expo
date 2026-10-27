/**
 * The tavli game engine.
 *
 * This package is pure TypeScript. It must not import React, React Native,
 * network code or vendor SDKs. It must not call `Math.random`. Dice come
 * from an RNG that the caller passes in.
 *
 * See `packages/engine/README.md` for the model and how variants plug in.
 */

export { BAR_NUMBER, CHECKERS_PER_PLAYER, OFF_NUMBER, POINTS_ON_BOARD } from './constants';

export { EngineError } from './errors';
export type { EngineErrorCode } from './errors';

export { PLAYERS, isPlayerId, opponent } from './player';
export type { PerPlayer, PlayerId } from './player';

export { absoluteToOwn, isPointNumber, otherPlayerPoint, ownToAbsolute } from './numbering';
export type { Direction, PointNumber } from './numbering';

export {
  EMPTY_POINT,
  applyMoveToBoard,
  checkersAt,
  checkersOnPoints,
  createBoard,
  emptyBoard,
  pipCount,
  pointAt,
  totalCheckers,
} from './board';
export type { BoardState, PointState, SideLayout } from './board';

export { createSeededRng, rngFromState } from './rng';
export type { Rng, RngState, SeededRng } from './rng';

export { DIE_VALUES, diceMoves, isDieValue, isDouble, rollDice, rollDie } from './dice';
export type { Dice, DieValue } from './dice';

export { formatMove, formatTurn, locationNumber, sameMove, sameTurn } from './move';
export type { Capture, Destination, Move, Origin, Turn } from './move';

export { GAME_STATE_SCHEMA_VERSION, STANDARD_VARIANT_IDS, positionKey } from './state';
export type { GameState, JsonObject, JsonValue, StandardVariantId, VariantId } from './state';

export { PRESET_IDS, RULE_GROUPS, RULE_SCHEMA, isPresetId } from './rules';
export type {
  BearOffRules,
  BoardRules,
  CaptureRules,
  EntryRules,
  ExtraRollRules,
  FieldSpec,
  MatchRules,
  MotherRules,
  MovementRules,
  PresetId,
  PrimeRules,
  QuarterRules,
  RuleGroupName,
  RuleGroups,
  RuleOverrides,
  RuleSet,
  ScoringRules,
  SpecialRollRules,
} from './rules';
export { DEFAULT_PRESET_BY_GAME, getPreset, resolveRules } from './presets';
export { RULE_CONSTRAINTS, validateRules } from './rules-validate';
export type { RuleConstraint } from './rules-validate';

export { GAME_END_REASONS, createVariantRegistry, getVariant } from './variant';
export type {
  GameEndReason,
  GameResult,
  InitialStateOptions,
  Variant,
  VariantPrompt,
  VariantRegistry,
} from './variant';

export { BUILT_IN_VARIANTS, VARIANT_REGISTRY, portes } from './variants';
export { PORTES_START } from './variants/portes';
export { PLAKOTO_START, plakoto } from './variants/plakoto';

export {
  MATCH_SCHEMA_VERSION,
  createMatch,
  createRematch,
  gameRules,
  missingVariants,
  nextVariantId,
  pointsForLoss,
  recordGameResult,
  resignGame,
  resignMatch,
  startNextGame,
  validateMatch,
} from './match';
export type {
  CreateMatchOptions,
  GameRecord,
  Match,
  MatchStatus,
  RecordGameOptions,
} from './match';

export { validateBoard, validateGameState } from './validate';
export {
  parseGameState,
  parseMatch,
  parseRules,
  serializeGameState,
  serializeMatch,
  serializeRules,
} from './serialize';

export * from './flow';
