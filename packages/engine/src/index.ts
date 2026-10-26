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
export type { GameState, JsonObject, JsonValue, RulesRef, VariantId } from './state';

export { createVariantRegistry, getVariant } from './variant';
export type {
  GameEndReason,
  GameResult,
  InitialStateOptions,
  Variant,
  VariantRegistry,
} from './variant';

export { validateBoard, validateGameState } from './validate';
export { parseGameState, serializeGameState } from './serialize';
