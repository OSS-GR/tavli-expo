/**
 * The error type the bot throws for its own problems.
 *
 * Rule problems (a finished game, an unknown variant, a bad seed) come from
 * the engine as `EngineError`. The bot does not wrap them.
 */

export type BotErrorCode =
  /** No bot for this level and variant yet (no evaluator is registered). */
  | 'NOT_IMPLEMENTED'
  /** The evaluator registry is wrong, for example an evaluator under the wrong variant id. */
  | 'INVALID_REGISTRY'
  /** The request does not fit together, for example `dice` differs from `state.dice`. */
  | 'INVALID_REQUEST';

export class BotError extends Error {
  readonly code: BotErrorCode;

  constructor(code: BotErrorCode, message: string) {
    super(message);
    this.name = 'BotError';
    this.code = code;
  }
}
