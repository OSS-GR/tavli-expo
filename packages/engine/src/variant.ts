/**
 * The `Variant` plug-in interface (ADR-0002).
 *
 * Each game (Portes, Plakoto, Fevga, Asodio) is one `Variant`. The UI, the
 * bot and the server only talk to this interface. A variant is a plain object
 * of pure functions: no hidden state, no `Math.random`.
 */

import type { Dice } from './dice';
import { EngineError } from './errors';
import type { Move, Turn } from './move';
import type { Direction } from './numbering';
import type { PlayerId } from './player';
import type { RuleSet } from './rules';
import type { GameState, VariantId } from './state';

export interface InitialStateOptions {
  /** Who plays first. The opening roll that decides it belongs to the turn state machine (#25). */
  readonly startingPlayer: PlayerId;
  /**
   * The full rules for this game, for example `resolveRules('plakoto', {
   * mother: { motherRule: 'instant' } })`. They are embedded in the state.
   * Default: the variant's default preset (`DEFAULT_PRESET_BY_GAME`).
   *
   * The variant checks them with `validateRules` and throws
   * `EngineError('RULES_CONFLICT')` if it cannot play them (for example a
   * `'parallel'` direction in a contrary game).
   */
  readonly rules?: RuleSet;
}

/** Every `GameEndReason`, for run-time checks. */
export const GAME_END_REASONS = [
  'borneOff',
  'motherPinned',
  'bothMothersPinned',
  'deadlock',
  'resigned',
] as const satisfies readonly GameEndReason[];

/** Why a game ended. Variants add only the reasons they use. */
export type GameEndReason =
  /** A player bore off all 15 checkers. */
  | 'borneOff'
  /** Plakoto: a mother was pinned (2 points). */
  | 'motherPinned'
  /** Plakoto: both mothers were pinned (draw). */
  | 'bothMothersPinned'
  /** Asodio: no one can ever move again (draw). */
  | 'deadlock'
  /** A player resigned (for example Plakoto "offerConcede"). */
  | 'resigned';

// Typecheck fails if the list has a reason the type does not, or misses one.
type MissingReason = Exclude<GameEndReason, (typeof GAME_END_REASONS)[number]>;
const NO_MISSING_REASON: MissingReason extends never ? true : false = true;
void NO_MISSING_REASON;

export interface GameResult {
  /** `null` for a draw. */
  readonly winner: PlayerId | null;
  /**
   * Points for the winner: 1 = mono, 2 = diplo, 0 for a draw. Scoring flags
   * can give other values (`backgammonScores3`: 3; Asodio `perChecker`: 1
   * per checker the loser has not borne off).
   */
  readonly points: number;
  readonly reason: GameEndReason;
}

export interface Variant {
  readonly id: VariantId;
  /** How the players move relative to each other. Use it with the numbering helpers. */
  readonly direction: Direction;

  /** The start position, before the first roll (`dice: null`, `turnNumber: 1`). */
  initialState(options: InitialStateOptions): GameState;

  /**
   * Every legal full play for `dice` (from `state.toMove`'s side). Uses the
   * "use as much of the roll as possible" rules. Plays that end in the same
   * position are listed once. If no move is legal, returns one turn with
   * empty `moves` (a pass), never an empty list.
   */
  legalTurns(state: GameState, dice: Dice): readonly Turn[];

  /**
   * The single moves that may come next when a turn is played one move at
   * a time (the turn flow, #25). `state` is the state at the start of the
   * turn, `dice` the roll and `played` the moves already played this turn.
   *
   * A move is listed only when the turn can still be finished as a legal
   * play: `played`, this move and some more moves must form a turn that
   * `applyTurn` accepts. So a move that would leave part of the roll
   * unplayable, when another order plays all of it, is never listed.
   * Any order of a legal play works, not only the order `legalTurns` lists.
   *
   * Returns `[]` when `played` is already a full legal play (or the roll
   * has no legal move). Throws `ILLEGAL_TURN` when `played` is not a
   * prefix of a legal play, or the game is over.
   */
  nextMoves(state: GameState, dice: Dice, played: readonly Move[]): readonly Move[];

  /**
   * Plays `turn` and returns the next state: the other player to move,
   * `dice: null`, `turnNumber + 1`. A variant may keep the same player to
   * move when the roll gives another roll (Asodio extra rolls). Throws
   * `EngineError('ILLEGAL_TURN')` if the turn is not legal. Never changes
   * `state`.
   */
  applyTurn(state: GameState, turn: Turn): GameState;

  isGameOver(state: GameState): boolean;

  /** The result once the game is over, otherwise `null`. */
  result(state: GameState): GameResult | null;

  /**
   * Optional. The result when `player` resigns now. Leave it out to use the
   * shared rule of `resignGame` (mono or diplo from the board). A variant
   * adds it only when it scores a resignation in its own way.
   */
  resignResult?(state: GameState, player: PlayerId): GameResult;

  /**
   * Optional. A question the variant asks before play goes on, for example
   * Plakoto "resign or play on" after a mother is pinned
   * (`motherRule: "offerConcede"`). The variant keeps the question in
   * `state.variantData` and reads it back here. `null` when there is none.
   * The turn flow asks it after every turn.
   */
  prompt?(state: GameState): VariantPrompt | null;

  /**
   * Optional, with `prompt`. Applies the answer and returns the next state.
   * If the answer ends the game, `result` of the new state says so. If it
   * sets `dice` (Asodio: the chosen double), the turn flow starts that turn
   * with those dice, with no roll.
   * Throws `ILLEGAL_ACTION` for an answer that is not one of the choices.
   */
  answerPrompt?(state: GameState, player: PlayerId, choice: string): GameState;
}

/** A question a variant asks one player (see `Variant.prompt`). Plain JSON. */
export interface VariantPrompt {
  /** Who must answer. */
  readonly player: PlayerId;
  /** What is asked, for the UI text. For example `'motherPinned'` or `'chooseDouble'`. */
  readonly kind: string;
  /** The answers the player can give. For example `['resign', 'playOn']`. */
  readonly choices: readonly string[];
}

/** Variants by id. Holds functions, so it is not part of any saved state. */
export type VariantRegistry = ReadonlyMap<VariantId, Variant>;

/** Builds a registry. Throws `EngineError('DUPLICATE_VARIANT')` if two variants share an id. */
export function createVariantRegistry(variants: readonly Variant[]): VariantRegistry {
  const registry = new Map<VariantId, Variant>();
  for (const variant of variants) {
    if (registry.has(variant.id)) {
      throw new EngineError('DUPLICATE_VARIANT', `variant "${variant.id}" is registered twice`);
    }
    registry.set(variant.id, variant);
  }
  return registry;
}

/** Finds a variant. Throws `EngineError('UNKNOWN_VARIANT')` if it is missing. */
export function getVariant(registry: VariantRegistry, id: VariantId): Variant {
  const variant = registry.get(id);
  if (variant === undefined) {
    throw new EngineError('UNKNOWN_VARIANT', `no variant with id "${id}"`);
  }
  return variant;
}
