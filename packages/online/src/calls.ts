/**
 * The checks around each server call (#251): who calls, at which
 * version, and on time. Both servers use them: the Convex functions
 * (`apps/server/convex/games.ts`) and the in-memory server
 * (`memory-server.ts`). The servers keep only their storage and timer
 * parts.
 *
 * Everything here is pure. The clock is an argument (`now`, epoch
 * milliseconds). A failed check throws an `OnlineGameError`.
 */

import type { GameTransportErrorData, OnlineGamePace, OnlineGameStatus } from '@tavli/contracts';
import type { FlowEvent, MatchFlow, PerPlayer, PlayerId } from '@tavli/engine';

import { OnlineGameError, deadlineAfter, isTimedOut, sideOf } from './online-game';

/** The `actor` of the log events that the server plays itself. No player may use this id. */
export const SERVER_ACTOR = 'server';

const SERVER_EVENTS: ReadonlySet<FlowEvent['type']> = new Set([
  'start',
  'rollOpening',
  'roll',
  'nextGame',
  'timeout',
]);

/** Who played `event`: `SERVER_ACTOR` for server steps, else `callerId`. */
export function eventActor(event: FlowEvent, callerId: string): string {
  return SERVER_EVENTS.has(event.type) ? SERVER_ACTOR : callerId;
}

/**
 * Checks a `createGame` call: the caller must be one of the players, and
 * no player may use the id `SERVER_ACTOR`. (`createOnlineMatch` checks
 * that the two players differ.)
 */
export function checkNewGame(callerId: string, players: PerPlayer<string>): void {
  if (sideOf(players, callerId) === null) {
    throw new OnlineGameError('BAD_REQUEST', 'the caller must be one of the players');
  }
  // The move log marks server events with SERVER_ACTOR, so no player may use that id.
  if (players.white === SERVER_ACTOR || players.black === SERVER_ACTOR) {
    throw new OnlineGameError('BAD_REQUEST', `"${SERVER_ACTOR}" is not a valid player id`);
  }
}

/** The fields of a saved game that the call checks read. */
export interface SavedGame {
  readonly players: PerPlayer<string>;
  readonly version: number;
  readonly status: OnlineGameStatus;
  readonly turnDeadline: number | null;
}

/**
 * Checks a player's call on `game` (`null` when there is no such game):
 * the game exists, the caller is a player, and `expectedVersion` is the
 * saved version (`null`: no version check, as for resign). Returns the
 * game and the caller's side.
 */
export function checkCall<G extends SavedGame>(
  game: G | null,
  callerId: string,
  expectedVersion: number | null,
): { readonly game: G; readonly side: PlayerId } {
  if (game === null) throw new OnlineGameError('NOT_FOUND', 'no such game');
  const side = sideOf(game.players, callerId);
  if (side === null) throw new OnlineGameError('NOT_A_PLAYER', 'you are not a player of this game');
  if (expectedVersion !== null && expectedVersion !== game.version) {
    throw new OnlineGameError(
      'STALE_VERSION',
      `the game is at version ${game.version}, not ${expectedVersion}`,
    );
  }
  return { game, side };
}

/**
 * Checks who may watch `game` (`null` when there is no such game): only
 * its two players (#131). Returns the game, or `null` for a missing game
 * (the servers answer `null` or `NOT_FOUND` then). A stranger gets
 * `NOT_A_PLAYER`.
 */
export function checkViewer<G extends SavedGame>(game: G | null, callerId: string): G | null {
  if (game === null) return null;
  if (sideOf(game.players, callerId) === null) {
    throw new OnlineGameError('NOT_A_PLAYER', 'only the players may watch this game');
  }
  return game;
}

/**
 * True when a player's move or answer comes too late: the match runs and
 * its turn deadline has passed at `now`. Then the server saves the time
 * out instead of the call, and the call gets `TIMED_OUT_ERROR`.
 */
export function callTimedOut(game: SavedGame, now: number): boolean {
  return game.status === 'active' && isTimedOut(game.turnDeadline, now);
}

/**
 * The error of a call that came too late. The Convex functions return it
 * as a value (a thrown error would roll the saved time out back).
 */
export const TIMED_OUT_ERROR: GameTransportErrorData & { readonly code: 'TIMED_OUT' } = {
  code: 'TIMED_OUT',
  message: 'the turn time ran out',
};

/**
 * What a scheduled turn check for `version` must do at `now`:
 * - `skip`: the game is gone, changed since (a newer version), or over.
 * - `early`: the deadline is still ahead. Check again at the deadline.
 * - `due`: the time is up. Apply the time out.
 */
export function scheduledCheck(
  game: SavedGame | null,
  version: number,
  now: number,
): 'skip' | 'early' | 'due' {
  if (game === null || game.version !== version || game.status !== 'active') return 'skip';
  if (game.turnDeadline === null) return 'skip';
  return isTimedOut(game.turnDeadline, now) ? 'due' : 'early';
}

/** `finished` once the match has a winner, else `active`. */
export function matchStatus(flow: MatchFlow): OnlineGameStatus {
  return flow.match.status === 'finished' ? 'finished' : 'active';
}

/**
 * The turn deadline to save with `flow` at `now`: a full turn time from
 * now, or `null` when the match is over (no clock runs then).
 */
export function nextDeadline(pace: OnlineGamePace, flow: MatchFlow, now: number): number | null {
  return matchStatus(flow) === 'finished' ? null : deadlineAfter(pace, now);
}
