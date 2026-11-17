/**
 * The record of one game of an online match (#604), for the game review.
 * Both servers run these checks: the Convex `gameRecord` query
 * (`apps/server/convex/games.ts`) and the in-memory server. Pure.
 *
 * A record is the match log from its `start` event to the end of the
 * game: `replay` rebuilds the match as it stood when that game ended.
 * Only a game that is over has a record, so the review never helps a
 * player during play:
 *
 * - an earlier game of the match: the log holds the `nextGame` event that
 *   started the game after it (the server starts it at once);
 * - the last game of a finished match.
 *
 * The `start` event names the sides, never a player id: a record never
 * carries another player's id.
 */
import type { FlowEvent } from '@tavli/engine';

import { OnlineGameError } from './online-game';

/** The sides in a record's `start` event, in place of the player ids. */
const SIDE_NAMES = { white: 'white', black: 'black' } as const;

/**
 * Checks the game number of a record call: a whole number from 1.
 * Throws `BAD_REQUEST`.
 */
export function checkGameNumber(gameNumber: number): void {
  if (!Number.isSafeInteger(gameNumber) || gameNumber < 1) {
    throw new OnlineGameError('BAD_REQUEST', 'the game number is a whole number from 1');
  }
}

/**
 * The log of the record of game `gameNumber` (`GameRecord.log`) from the
 * match log `events` (oldest
 * first, from `start`; it may stop at the `nextGame` event that ended
 * that game). `finished` is true when the match is over. Throws
 * `BAD_REQUEST` for a bad game number and `ILLEGAL_ACTION` for a game that
 * is not over (or not played yet).
 */
export function gameRecordLog(
  events: readonly FlowEvent[],
  gameNumber: number,
  finished: boolean,
): FlowEvent[] {
  checkGameNumber(gameNumber);
  const [start, ...rest] = events;
  if (start === undefined || start.type !== 'start') {
    throw new Error('a match log starts with a start event');
  }
  const log: FlowEvent[] = [{ ...start, players: { ...SIDE_NAMES } }];
  // The games started so far: game 1 at `start`, then one per `nextGame`.
  let game = 1;
  for (const event of rest) {
    if (event.type === 'nextGame') {
      // Game `gameNumber` ended here: the next one starts.
      if (game === gameNumber) return log;
      game += 1;
    }
    log.push(event);
  }
  // The last game is over only when the match is.
  if (finished && game === gameNumber) return log;
  throw new OnlineGameError('ILLEGAL_ACTION', 'this game is not over');
}
