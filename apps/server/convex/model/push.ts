/**
 * The pure parts of "your turn" pushes (#280): who gets a push after a
 * save, the text, the messages, which tokens to drop or retry. No Convex
 * types; `push.ts` holds the functions. See "Push" in
 * `docs/architecture/online-game-service.md`.
 */

import type { OnlineGamePace, PushErrorCode, PushMessage, PushResult } from '@tavli/contracts';
import type { MatchFlow, PlayerId } from '@tavli/engine';
import { waitingFor } from '@tavli/online';

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

/** What the server waits for: a side, in one game of the match. */
export interface TurnWait {
  /** The side to move or to answer, or `null` (no game yet, or the match is over). */
  readonly side: PlayerId | null;
  /** Which game of the match: the number of games already finished. */
  readonly game: number;
}

/** What the server waits for in `flow`. */
export function turnWait(flow: MatchFlow): TurnWait {
  return { side: waitingFor(flow), game: flow.match.games.length };
}

/**
 * The side to tell "your turn" after a save, or `null` for no push.
 *
 * `before` is what the server waited for before the save (for a new game:
 * nobody), `after` what it waits for now (`waitingFor`: the side to move,
 * or the side that must answer a question). `caller` is the side of the
 * player who caused the save, or `null` for the server (a time out).
 *
 * A push goes out only in an async game, never to the caller (they are in
 * the app), and only when the wait moved to the other side, or a new game
 * of the match started: a time out ends a game, and the next one may wait
 * for the same side again. When the same side plays again in the same
 * game (an Asodio extra roll), or the match is over, there is no push. A
 * live game never pushes: both players are in the app.
 */
export function turnPushSide(
  pace: OnlineGamePace,
  before: TurnWait,
  after: TurnWait,
  caller: PlayerId | null,
): PlayerId | null {
  if (pace !== 'async' || after.side === null || after.side === caller) return null;
  if (after.side === before.side && after.game === before.game) return null;
  return after.side;
}

/**
 * The seconds the push service may keep a "your turn" push: the time left
 * until the turn deadline, rounded down. After the deadline the turn is
 * lost anyway, so a late "your turn" would be wrong. `null` when no full
 * second is left, or the game has no deadline: then send nothing.
 */
export function turnPushTtl(turnDeadline: number | null, now: number): number | null {
  if (turnDeadline === null) return null;
  const seconds = Math.floor((turnDeadline - now) / 1000);
  return seconds >= 1 ? seconds : null;
}

/**
 * One "your turn" message per token, with `high` priority (the phone shows
 * it at once) and `ttlSeconds` from `turnPushTtl`.
 */
export function turnMessages(
  tokens: readonly string[],
  gameId: string,
  ttlSeconds: number,
): PushMessage[] {
  return tokens.map((to) => ({
    to,
    ...TURN_PUSH_TEXT,
    data: { gameId },
    priority: 'high',
    ttlSeconds,
  }));
}

/** The tokens whose result failed with one of `codes`. */
function tokensFailedWith(
  messages: readonly PushMessage[],
  results: readonly PushResult[],
  codes: ReadonlySet<PushErrorCode>,
): string[] {
  return messages
    .filter((_, i) => {
      const result = results[i];
      return result !== undefined && !result.ok && codes.has(result.error);
    })
    .map((message) => message.to);
}

const DEAD_ERRORS: ReadonlySet<PushErrorCode> = new Set(['DeviceNotRegistered']);

/** The tokens the push service called dead (`DeviceNotRegistered`). */
export function deadTokens(
  messages: readonly PushMessage[],
  results: readonly PushResult[],
): string[] {
  return tokensFailedWith(messages, results, DEAD_ERRORS);
}

/** How long a failed push waits before its one retry. */
export const PUSH_RETRY_MS = 30_000;

/** How many times a failed push is sent again. */
export const MAX_PUSH_RETRIES = 1;

/** The errors worth one more try: the push service or the network was busy. */
const RETRY_ERRORS: ReadonlySet<PushErrorCode> = new Set(['Failed', 'MessageRateExceeded']);

/** The tokens to send again later (`Failed` or `MessageRateExceeded`). */
export function retryTokens(
  messages: readonly PushMessage[],
  results: readonly PushResult[],
): string[] {
  return tokensFailedWith(messages, results, RETRY_ERRORS);
}

/**
 * The rows to drop so that at most `MAX_PUSH_TOKENS_PER_PLAYER` remain:
 * the oldest ones. `rows` are a player's tokens, oldest first. The row of
 * `keep` (the token just registered) is never dropped, even when it is not
 * the newest: two rows can have the same `updatedAt`, and the server clock
 * of another call can be ahead.
 */
export function tokensOverCap<T extends { readonly token: string }>(
  rows: readonly T[],
  keep: string,
): T[] {
  const over = rows.length - MAX_PUSH_TOKENS_PER_PLAYER;
  if (over <= 0) return [];
  return rows.filter((row) => row.token !== keep).slice(0, over);
}
