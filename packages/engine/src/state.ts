/**
 * The game state.
 *
 * `GameState` is plain, readonly, JSON-safe data. There are no classes,
 * no `undefined` values, no `Map`s and no functions in it. So it can be
 * saved in Convex, sent over the network and compared in tests as is.
 * Engine functions never change a state; they return a new one.
 *
 * The state never stores what can be computed from the board and the rules,
 * for example the Asodio loading phase, a locked quarter or whether the
 * Plakoto mother is pinned. Compute those when you need them.
 */

import type { BoardState } from './board';
import type { Dice } from './dice';
import type { PlayerId } from './player';
import type { RuleSet } from './rules';

/**
 * The version of the `GameState` shape. Bump it when the shape changes.
 *
 * - 1: `rules` was a reference (`{ id, version }`).
 * - 2: `rules` is the full, resolved `RuleSet` (#57). `validateGameState`
 *   still reads version 1 and upgrades it.
 */
export const GAME_STATE_SCHEMA_VERSION = 2;

/** Any JSON value. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonObject;

export type JsonObject = { readonly [key: string]: JsonValue };

/**
 * A variant id, for example `'portes'`. A plain string, so custom house-rule
 * variants (#58) can add ids without changing the engine.
 */
export type VariantId = string;

/** The ids of the four games in `docs/rules/`. */
export const STANDARD_VARIANT_IDS = ['portes', 'plakoto', 'fevga', 'asodio'] as const;

export type StandardVariantId = (typeof STANDARD_VARIANT_IDS)[number];

export interface GameState {
  readonly schemaVersion: typeof GAME_STATE_SCHEMA_VERSION;
  readonly variant: VariantId;
  /**
   * The full rules of this game. Embedded (not a reference), so a saved game
   * keeps its rules even when a preset changes later. Two online players
   * must have the same `rules`.
   */
  readonly rules: RuleSet;
  readonly board: BoardState;
  /** The player whose turn it is. */
  readonly toMove: PlayerId;
  /** The current roll, or `null` before the player has rolled. */
  readonly dice: Dice | null;
  /** 1 for the first turn of the game. Goes up by one each turn. */
  readonly turnNumber: number;
  /**
   * Extra data a variant or the turn state machine needs, for example the
   * Asodio chosen double or a pending Plakoto "resign or play on" choice.
   * `null` when not used. Must be JSON.
   */
  readonly variantData: JsonObject | null;
}

/**
 * A short string that is the same for two states when the position and the
 * player to move are the same. Dice and turn number are not part of it.
 * Bots use it as a cache key.
 */
export function positionKey(state: GameState): string {
  const { board } = state;
  const points = board.points
    .map((p) => `${p.white}.${p.black}${p.pinned === null ? '' : p.pinned[0]}`)
    .join(',');
  const side = (player: PlayerId): string =>
    `${board.bar[player]}.${board.outside[player]}.${board.off[player]}`;
  return `${state.variant}|${state.toMove[0]}|${points}|${side('white')}|${side('black')}`;
}
