/**
 * "My games" (#296): the summary of one stored game for one of its
 * players, and the order of the list. Both servers use it: the Convex
 * `listMyGames` query (`apps/server/convex/games.ts`) and the in-memory
 * server (`memory-server.ts`). The servers only find the caller's games.
 *
 * Everything here is pure.
 */

import { MAX_LISTED_GAMES } from '@tavli/contracts';
import type { GameSummary } from '@tavli/contracts';

import { NO_TIMEOUTS, OnlineGameError, sideOf, toView } from './online-game';
import type { ViewInput } from './online-game';

/**
 * A summary drops `previousGame` and the end reason, so its input has
 * neither (no need to read them).
 */
export interface SummaryInput extends Omit<ViewInput, 'previousGame' | 'timeoutsInARow'> {
  /** The last saved change, in epoch milliseconds (server clock). */
  readonly updatedAt: number;
}

/**
 * The summary of a game for `playerId`. It holds the same facts as the
 * view (`toView`), so a list and an open game never disagree. Throws
 * `NOT_A_PLAYER` when `playerId` is not one of the two players.
 */
export function summarizeGame(input: SummaryInput, playerId: string): GameSummary {
  const mySide = sideOf(input.players, playerId);
  if (mySide === null) {
    throw new OnlineGameError('NOT_A_PLAYER', 'you are not a player of this game');
  }
  const view = toView({ ...input, previousGame: null, timeoutsInARow: NO_TIMEOUTS });
  return {
    gameId: view.gameId,
    status: view.status,
    choice: view.choice,
    presetId: view.match.rules.presetId,
    variant: view.game.state.variant,
    targetPoints: view.match.targetPoints,
    turnTimeMinutes: view.turnTimeMinutes,
    ranked: view.ranked,
    mySide,
    waitingFor: view.waitingFor,
    myTurn: view.waitingFor === mySide,
    score: { white: view.match.score.white, black: view.match.score.black },
    winner: view.match.winner,
    updatedAt: input.updatedAt,
    turnDeadline: view.turnDeadline,
    opponentId: view.players[mySide === 'white' ? 'black' : 'white'],
    opponentName: view.names[mySide === 'white' ? 'black' : 'white'],
  };
}

/** Sorts newest change first. Two changes at the same time: the larger game id first. */
export function newestFirst(a: GameSummary, b: GameSummary): number {
  if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
  if (a.gameId === b.gameId) return 0;
  return a.gameId < b.gameId ? 1 : -1;
}

/** The `MAX_LISTED_GAMES` newest of `summaries`, newest first. */
export function latestGames(summaries: Iterable<GameSummary>): GameSummary[] {
  return [...summaries].sort(newestFirst).slice(0, MAX_LISTED_GAMES);
}
