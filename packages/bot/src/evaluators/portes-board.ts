/**
 * A small, fast board for the Portes evaluator.
 *
 * The evaluator does not work on `GameState`. It works on one plain array per
 * player, each in that player's own numbering (like gnubg's board arrays):
 *
 * - index 0: checkers borne off;
 * - index 1–24: checkers on own point 1–24;
 * - index 25: checkers on the bar.
 *
 * Portes is a contrary game, so own point `p` of one player is own point
 * `25 - p` of the other.
 *
 * Arrays of small integers are fast to copy in V8 (`slice`). The engine uses
 * the same trick (`packages/engine/src/variants/portes/position.ts`).
 */

import type { GameState, PlayerId, Turn } from '@tavli/engine';

/** One player's checkers: [off, point 1, …, point 24, bar]. Length 26. */
export type Side = number[];

export const OFF = 0;
export const BAR = 25;

/** Reads one player's side from a state. Portes boards have no `outside` checkers. */
export function sideOf(state: GameState, player: PlayerId): Side {
  const { board } = state;
  const side: Side = new Array<number>(26).fill(0);
  side[OFF] = board.off[player];
  side[BAR] = board.bar[player] + board.outside[player];
  const points = board.points;
  for (let i = 0; i < 24; i += 1) {
    const point = points[i];
    if (point === undefined) continue;
    const count = point[player];
    if (count === 0) continue;
    // Absolute point i + 1 is White's own number; Black's is 25 - (i + 1).
    const own = player === 'white' ? i + 1 : 24 - i;
    side[own] = count;
  }
  return side;
}

/** Where a move starts or ends, as an index into `Side`. */
function index(location: number | 'bar' | 'outside' | 'off'): number {
  if (location === 'bar' || location === 'outside') return BAR;
  if (location === 'off') return OFF;
  return location;
}

/**
 * Plays a turn on copies of the two sides and returns them. It trusts the
 * turn: it comes from `legalTurns`. A hit sends the opponent checker on the
 * landing point to their bar.
 */
export function playTurn(mover: Side, opponent: Side, turn: Turn): [Side, Side] {
  const me = mover.slice();
  const them = opponent.slice();
  for (const move of turn.moves) {
    const from = index(move.from);
    const to = index(move.to);
    me[from] = (me[from] ?? 0) - 1;
    me[to] = (me[to] ?? 0) + 1;
    if (move.capture === 'hit' && to !== OFF) {
      const theirs = 25 - to;
      them[theirs] = (them[theirs] ?? 0) - 1;
      them[BAR] = (them[BAR] ?? 0) + 1;
    }
  }
  return [me, them];
}

/** Pip count: a checker on own point `p` counts `p`, on the bar 25. */
export function pips(side: Side): number {
  let total = 0;
  for (let p = 1; p <= 25; p += 1) total += (side[p] ?? 0) * p;
  return total;
}

/** Checkers still to bear off (on the board or the bar). */
export function checkersLeft(side: Side): number {
  return 15 - (side[OFF] ?? 0);
}

/**
 * True while a hit is still possible: some checker of one side has an
 * opponent checker in front of it. With the sides in their own numbering,
 * the contact is broken when every checker of `a` is past every checker
 * of `b`.
 */
export function hasContact(a: Side, b: Side): boolean {
  if ((a[BAR] ?? 0) > 0 || (b[BAR] ?? 0) > 0) return true;
  // The back checker of `a`, in `a`'s numbering.
  let backA = 0;
  for (let p = 24; p >= 1; p -= 1) {
    if ((a[p] ?? 0) > 0) {
      backA = p;
      break;
    }
  }
  // The back checker of `b`, written in `a`'s numbering (25 - own point).
  let backB = 25;
  for (let q = 24; q >= 1; q -= 1) {
    if ((b[q] ?? 0) > 0) {
      backB = 25 - q;
      break;
    }
  }
  return backA > backB;
}

/** True if `loser` has a checker on the bar or in the winner's home (own 19–24). */
export function isBackgammon(loser: Side): boolean {
  if ((loser[BAR] ?? 0) > 0) return true;
  for (let p = 19; p <= 24; p += 1) if ((loser[p] ?? 0) > 0) return true;
  return false;
}

/**
 * The points for the mover if the turn ends the game (the mover's last
 * checker is off), else `null`: 1, 2 for a diplo (the loser has none off),
 * or 3 for a backgammon when `triple` (`backgammonScores3`). The heuristic,
 * the net and the trainer all use it, so they score a game end the same.
 */
export function portesTurnPoints(mine: Side, theirs: Side, triple: boolean): number | null {
  if ((mine[OFF] ?? 0) !== 15) return null;
  if ((theirs[OFF] ?? 0) > 0) return 1;
  return triple && isBackgammon(theirs) ? 3 : 2;
}
