/**
 * The pure parts of "your turn" pushes (#280): who gets a push after a
 * save, the text, the messages, and which tokens to drop. No Convex
 * types; `push.ts` holds the functions. See "Push" in
 * `docs/architecture/online-game-service.md`.
 */

import type { OnlineGamePace, PushMessage, PushResult } from '@tavli/contracts';
import type { PlayerId } from '@tavli/engine';

/** The most push tokens a player keeps (one per phone). A new one drops the oldest. */
export const MAX_PUSH_TOKENS_PER_PLAYER = 5;

/**
 * The text of a "your turn" push. English for now; the one place to
 * change it. It holds no names and no emails.
 */
export const TURN_PUSH_TEXT = {
  title: 'Your turn',
  body: 'An online game is waiting for your move.',
} as const;

/**
 * The side to tell "your turn" after a save, or `null` for no push.
 *
 * `before` is the side the server waited for before the save (for a new
 * game: the side of the player who started it, who is in the app), and
 * `after` the side it waits for now (`waitingFor`: the side to move, or
 * the side that must answer a question). A push goes out only in an async
 * game, and only when the wait moved to the other side. When the same
 * side plays again (an Asodio extra roll), or the match is over, there is
 * no push. A live game never pushes: both players are in the app.
 */
export function turnPushSide(
  pace: OnlineGamePace,
  before: PlayerId | null,
  after: PlayerId | null,
): PlayerId | null {
  if (pace !== 'async' || after === null || after === before) return null;
  return after;
}

/** One "your turn" message per token. */
export function turnMessages(tokens: readonly string[], gameId: string): PushMessage[] {
  return tokens.map((to) => ({ to, ...TURN_PUSH_TEXT, data: { gameId } }));
}

/** The tokens the push service called dead (`DeviceNotRegistered`). */
export function deadTokens(
  messages: readonly PushMessage[],
  results: readonly PushResult[],
): string[] {
  return messages
    .filter((_, i) => {
      const result = results[i];
      return result !== undefined && !result.ok && result.error === 'DeviceNotRegistered';
    })
    .map((message) => message.to);
}

/**
 * The rows to drop so that at most `MAX_PUSH_TOKENS_PER_PLAYER` remain:
 * the oldest ones. `rows` are a player's tokens, oldest first.
 */
export function tokensOverCap<T>(rows: readonly T[]): T[] {
  return rows.slice(0, Math.max(0, rows.length - MAX_PUSH_TOKENS_PER_PLAYER));
}
