/**
 * The board model.
 *
 * The board is plain data (no classes), so it can go into JSON, the database
 * and the network as is. All helpers are pure: they never change their input.
 *
 * Layout:
 *
 * - `points` has 24 entries. Index `i` is absolute point `i + 1`
 *   (White's own numbering). Each entry counts both players' checkers.
 * - A point can hold checkers of both players only when one lone checker is
 *   pinned under the other player's checkers (Plakoto, Asodio). `pinned` says
 *   whose checker is at the bottom. In hitting games (Portes) and in Fevga,
 *   `pinned` is always `null` and at most one player is on a point.
 * - `bar`: checkers that were hit and wait to re-enter (Portes, Asodio with
 *   hitting). Notation number 25.
 * - `outside`: checkers that have not entered yet (Asodio start). Also
 *   notation number 25, but tracked apart from `bar`, because hit checkers
 *   must enter first and starting checkers need not (`asodio.md`).
 * - `off`: checkers borne off. Notation number 0.
 */

import { BAR_NUMBER, POINTS_ON_BOARD } from './constants';
import { EngineError } from './errors';
import { absoluteToOwn, ownToAbsolute } from './numbering';
import type { Direction, PointNumber } from './numbering';
import { PLAYERS } from './player';
import type { PerPlayer, PlayerId } from './player';
import { validateBoard } from './validate';

export interface PointState {
  readonly white: number;
  readonly black: number;
  /** Whose lone checker is pinned under the other player's checkers. */
  readonly pinned: PlayerId | null;
}

export interface BoardState {
  /** 24 points. Index `i` = absolute point `i + 1`. */
  readonly points: readonly PointState[];
  readonly bar: PerPlayer<number>;
  readonly outside: PerPlayer<number>;
  readonly off: PerPlayer<number>;
}

export const EMPTY_POINT: PointState = { white: 0, black: 0, pinned: null };

/** One player's checkers, written in that player's own numbering. */
export interface SideLayout {
  /** Own point number → checker count. */
  readonly points?: Readonly<Record<number, number>>;
  readonly bar?: number;
  readonly outside?: number;
  readonly off?: number;
  /** Own points where this player's lone checker is pinned by the opponent. */
  readonly pinned?: readonly PointNumber[];
}

/** A board with no checkers anywhere. Not a valid game board on its own. */
export function emptyBoard(): BoardState {
  return {
    points: Array.from({ length: POINTS_ON_BOARD }, () => EMPTY_POINT),
    bar: { white: 0, black: 0 },
    outside: { white: 0, black: 0 },
    off: { white: 0, black: 0 },
  };
}

/**
 * Builds a board from each player's own view. Each player must have exactly
 * 15 checkers in total. Throws `EngineError` if the result is not valid.
 *
 * Example (Portes start):
 * `createBoard({ white: { points: { 24: 2, 13: 5, 8: 3, 6: 5 } }, black: { ...same } }, 'contrary')`
 */
export function createBoard(layout: PerPlayer<SideLayout>, direction: Direction): BoardState {
  const points: { white: number; black: number; pinned: PlayerId | null }[] = Array.from(
    { length: POINTS_ON_BOARD },
    () => ({ white: 0, black: 0, pinned: null }),
  );
  for (const player of PLAYERS) {
    const side = layout[player];
    for (const [key, count] of Object.entries(side.points ?? {})) {
      const abs = ownToAbsolute(Number(key), player, direction);
      const point = points[abs - 1];
      if (point === undefined) throw new EngineError('OUT_OF_RANGE', `bad point ${key}`);
      point[player] += count;
    }
    for (const own of side.pinned ?? []) {
      const point = points[ownToAbsolute(own, player, direction) - 1];
      if (point === undefined) throw new EngineError('OUT_OF_RANGE', `bad point ${own}`);
      point.pinned = player;
    }
  }
  return validateBoard({
    points,
    bar: { white: layout.white.bar ?? 0, black: layout.black.bar ?? 0 },
    outside: { white: layout.white.outside ?? 0, black: layout.black.outside ?? 0 },
    off: { white: layout.white.off ?? 0, black: layout.black.off ?? 0 },
  });
}

/** The point at an absolute number (1–24). */
export function pointAt(board: BoardState, absolutePoint: PointNumber): PointState {
  const point = board.points[absolutePoint - 1];
  if (point === undefined || !Number.isInteger(absolutePoint)) {
    throw new EngineError('OUT_OF_RANGE', `absolute point must be 1 to 24, got ${absolutePoint}`);
  }
  return point;
}

/** How many checkers `player` has on their own point `ownPoint`. */
export function checkersAt(
  board: BoardState,
  player: PlayerId,
  ownPoint: PointNumber,
  direction: Direction,
): number {
  return pointAt(board, ownToAbsolute(ownPoint, player, direction))[player];
}

/** How many checkers `player` has on the 24 points. */
export function checkersOnPoints(board: BoardState, player: PlayerId): number {
  let total = 0;
  for (const point of board.points) total += point[player];
  return total;
}

/** All checkers of `player`: points + bar + outside + off. Always 15 in a valid board. */
export function totalCheckers(board: BoardState, player: PlayerId): number {
  return (
    checkersOnPoints(board, player) + board.bar[player] + board.outside[player] + board.off[player]
  );
}

/**
 * Pip count: the total number of pips `player` must still move to bear off
 * all checkers. A checker on own point `p` counts `p`. A checker on the bar
 * or outside counts 25. Borne-off checkers count 0. Pinned checkers count
 * like any other checker.
 */
export function pipCount(board: BoardState, player: PlayerId, direction: Direction): number {
  let pips = (board.bar[player] + board.outside[player]) * BAR_NUMBER;
  board.points.forEach((point, index) => {
    const count = point[player];
    if (count > 0) pips += count * absoluteToOwn(index + 1, player, direction);
  });
  return pips;
}
