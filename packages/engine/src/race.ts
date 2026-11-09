/**
 * The race: no checker can ever touch an opponent checker again
 * (`docs/rules/tavli-match.md`, "Fast forward a race (app rule)").
 *
 * In a race nobody can hit, pin or block the other side any more, so each
 * side only rolls and moves home. The app offers to play such a game out
 * fast vs the bot. This check never changes a rule: every move still comes
 * from the variant.
 *
 * - **Contrary games** (Portes, Plakoto, Asodio): White moves from absolute
 *   24 down to 1, Black from 1 up to 24. It is a race when White's last
 *   checker (the highest absolute point) is below Black's last checker (the
 *   lowest absolute point).
 * - **Parallel games** (Fevga): both sides move the same way round. It is a
 *   race when no opponent checker stands in front of either side's last
 *   checker, on that side's path.
 * - A checker on the bar, a checker that has not entered yet (Asodio) or a
 *   pinned checker (Plakoto, Asodio) always means contact.
 */

import type { BoardState } from './board';
import { POINTS_ON_BOARD } from './constants';
import { absoluteToOwn, ownToAbsolute, type Direction } from './numbering';
import { PLAYERS, opponent, type PlayerId } from './player';
import type { GameState } from './state';

/** True when the game is a pure race: no hit, pin or block can ever happen again. */
export function isRace(state: GameState): boolean {
  return isRaceBoard(state.board, state.rules.movement.direction);
}

/** `isRace` for a board and a direction. */
export function isRaceBoard(board: BoardState, direction: Direction): boolean {
  for (const player of PLAYERS) {
    if (board.bar[player] > 0 || board.outside[player] > 0) return false;
  }
  if (board.points.some((point) => point.pinned !== null)) return false;
  return direction === 'contrary'
    ? !contraryContact(board)
    : !parallelAhead(board, 'white') && !parallelAhead(board, 'black');
}

/** Contrary games: White's last checker is not below Black's last checker. */
function contraryContact(board: BoardState): boolean {
  // White's last checker: the highest absolute point with a White checker.
  let whiteBack = 0;
  // Black's last checker: the lowest absolute point with a Black checker.
  let blackBack = POINTS_ON_BOARD + 1;
  board.points.forEach((point, index) => {
    const absolute = index + 1;
    if (point.white > 0) whiteBack = Math.max(whiteBack, absolute);
    if (point.black > 0) blackBack = Math.min(blackBack, absolute);
  });
  return whiteBack > blackBack;
}

/**
 * Parallel games: an opponent checker stands in front of `player`'s last
 * checker, on `player`'s path (own points below it). The last checker has
 * the longest way to go, so this covers every checker of `player`.
 */
function parallelAhead(board: BoardState, player: PlayerId): boolean {
  const other = opponent(player);
  let rear = 0;
  board.points.forEach((point, index) => {
    if (point[player] > 0) rear = Math.max(rear, absoluteToOwn(index + 1, player, 'parallel'));
  });
  for (let own = 1; own < rear; own += 1) {
    const point = board.points[ownToAbsolute(own, player, 'parallel') - 1];
    if (point !== undefined && point[other] > 0) return true;
  }
  return false;
}
