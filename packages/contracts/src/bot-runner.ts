/**
 * The bot port (ADR-0006).
 *
 * The app asks a bot for a move only through `BotRunner`. One runner runs the
 * bot on the same thread (`InlineBotRunner` in `@tavli/bot`). Later runners can
 * run it off the UI thread (a worklet) or on a server. The app code does not
 * change.
 *
 * A request is plain JSON: it carries a `seed`, not an RNG object. So it can
 * cross a thread or a network boundary as it is.
 */

import type { Dice, GameState, Turn, VariantId } from '@tavli/engine';

/** The bot levels. */
export const BOT_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

export type Difficulty = (typeof BOT_DIFFICULTIES)[number];

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (BOT_DIFFICULTIES as readonly string[]).includes(value);
}

/** One "please move" request. Plain JSON. */
export interface BotMoveRequest {
  /** Must match `state.variant`. */
  readonly variant: VariantId;
  readonly state: GameState;
  /** The current roll. The bot never sees future dice. */
  readonly dice: Dice;
  readonly difficulty: Difficulty;
  /**
   * Seeds the bot's own RNG (a safe integer). Use a new seed for each
   * request. The bot RNG is never the dice RNG.
   */
  readonly seed: number;
  /** Stop a deeper search after this many milliseconds. Easy ignores it. */
  readonly timeBudgetMs?: number;
}

export interface BotRunner {
  /**
   * Resolves with the full turn for `req.dice` (an empty `moves` list is a
   * pass). Rejects with `BotCancelledError` after `cancel()`, or with the
   * bot's error (for example an engine error for a finished game).
   */
  chooseMove(req: BotMoveRequest): Promise<Turn>;
  /**
   * Stops every request that has not finished yet, for example when the user
   * leaves the game. Their promises reject with `BotCancelledError`. The
   * runner stays usable for new requests.
   */
  cancel(): void;
}

/** The error a cancelled `chooseMove` rejects with. */
export class BotCancelledError extends Error {
  constructor(message = 'the bot move was cancelled') {
    super(message);
    this.name = 'BotCancelledError';
  }
}

/** True for a `BotCancelledError`. It checks the name, so it also works for errors sent from another thread. */
export function isBotCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'BotCancelledError';
}
