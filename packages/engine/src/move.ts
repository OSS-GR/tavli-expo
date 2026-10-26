/**
 * Moves and turns.
 *
 * A `Move` is one checker moved by one die. Its points are in the **mover's
 * own numbering** (1–24), like the notation in the rules docs. So the same
 * move generator works for both players.
 */

import { BAR_NUMBER, OFF_NUMBER } from './constants';
import type { Dice, DieValue } from './dice';
import type { PointNumber } from './numbering';
import type { PlayerId } from './player';

/**
 * Where a checker comes from: an own point, the bar (hit checkers), or
 * outside (Asodio checkers that have not entered yet). Both `bar` and
 * `outside` are written as 25 in notation.
 */
export type Origin = PointNumber | 'bar' | 'outside';

/** Where a checker goes: an own point, or off the board (written as 0). */
export type Destination = PointNumber | 'off';

/** What the move did to an opponent checker on the landing point. */
export type Capture = 'none' | 'hit' | 'pin';

export interface Move {
  readonly from: Origin;
  readonly to: Destination;
  /** The die used. Can be larger than the distance when bearing off. */
  readonly die: DieValue;
  readonly capture: Capture;
}

/**
 * All moves one player makes for one roll. Empty `moves` = pass (no legal
 * move). Asodio can give one player several rolls in a row; each roll is a
 * separate `Turn` (the turn state machine, #25, chains them).
 */
export interface Turn {
  readonly player: PlayerId;
  readonly dice: Dice;
  readonly moves: readonly Move[];
}

/** The notation number of an origin or destination: bar/outside = 25, off = 0. */
export function locationNumber(location: Origin | Destination): number {
  if (location === 'bar' || location === 'outside') return BAR_NUMBER;
  if (location === 'off') return OFF_NUMBER;
  return location;
}

/** Notation for one move, for example `13/8`, `25/22`, `6/0`, `13/8*` (hit or pin). */
export function formatMove(move: Move): string {
  const mark = move.capture === 'none' ? '' : '*';
  return `${locationNumber(move.from)}/${locationNumber(move.to)}${mark}`;
}

/** Notation for a turn: the moves joined by spaces, or `-` for a pass. */
export function formatTurn(turn: Turn): string {
  return turn.moves.length === 0 ? '-' : turn.moves.map(formatMove).join(' ');
}

export function sameMove(a: Move, b: Move): boolean {
  return a.from === b.from && a.to === b.to && a.die === b.die && a.capture === b.capture;
}

/** True when both turns have the same player, dice and moves in the same order. */
export function sameTurn(a: Turn, b: Turn): boolean {
  return (
    a.player === b.player &&
    a.dice[0] === b.dice[0] &&
    a.dice[1] === b.dice[1] &&
    a.moves.length === b.moves.length &&
    a.moves.every((move, i) => {
      const other = b.moves[i];
      return other !== undefined && sameMove(move, other);
    })
  );
}
