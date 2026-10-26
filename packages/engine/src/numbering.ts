/**
 * Point numbering (see `docs/rules/tavli-match.md`, "Board & notation").
 *
 * - **Own view:** each player numbers the points 1–24 along their own path.
 *   Point 24 is the first point. Point 1 is the deepest point in home.
 *   Checkers always move from higher to lower numbers.
 * - **Absolute view:** one fixed numbering of the physical points. We use
 *   White's own view. So for White, own point = absolute point.
 *
 * How Black's numbers map to absolute numbers depends on the direction of the
 * game:
 *
 * - `contrary` (Portes, Plakoto, Asodio): `q = 25 - p`.
 * - `parallel` (Fevga): `q = p > 12 ? p - 12 : p + 12`.
 *
 * Both formulas are their own inverse, so the same formula converts both ways.
 */

import { POINTS_ON_BOARD } from './constants';
import { EngineError } from './errors';
import type { PlayerId } from './player';

/** How the two players move relative to each other. */
export type Direction = 'contrary' | 'parallel';

/** A point number from 1 to 24. Plain number, checked at run time. */
export type PointNumber = number;

export function isPointNumber(value: unknown): value is PointNumber {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= POINTS_ON_BOARD;
}

function assertPoint(point: number, what: string): void {
  if (!isPointNumber(point)) {
    throw new EngineError('OUT_OF_RANGE', `${what} must be an integer from 1 to 24, got ${point}`);
  }
}

/** Converts a point number from one player's view to the other player's view. */
export function otherPlayerPoint(point: PointNumber, direction: Direction): PointNumber {
  assertPoint(point, 'point');
  if (direction === 'contrary') return POINTS_ON_BOARD + 1 - point;
  return point > 12 ? point - 12 : point + 12;
}

/** Converts a player's own point number to the absolute (White) number. */
export function ownToAbsolute(
  point: PointNumber,
  player: PlayerId,
  direction: Direction,
): PointNumber {
  assertPoint(point, 'own point');
  return player === 'white' ? point : otherPlayerPoint(point, direction);
}

/** Converts an absolute (White) point number to the player's own number. */
export function absoluteToOwn(
  point: PointNumber,
  player: PlayerId,
  direction: Direction,
): PointNumber {
  assertPoint(point, 'absolute point');
  return player === 'white' ? point : otherPlayerPoint(point, direction);
}
