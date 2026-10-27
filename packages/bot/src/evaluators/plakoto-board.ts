/**
 * A small, fast board for the Plakoto evaluator.
 *
 * Like the Portes board (`portes-board.ts`), each player gets one plain
 * array in that player's own numbering:
 *
 * | Index   | Meaning                                                     |
 * | ------- | ----------------------------------------------------------- |
 * | 0       | checkers borne off                                          |
 * | 1–24    | checkers on own point 1–24                                  |
 * | 25      | always 0 (Plakoto has no bar)                               |
 * | 25 + p  | 1 when this player's lone checker on own point p is pinned  |
 *
 * The first 26 entries have the same layout as a Portes `Side`, so the race
 * and bear-off code (`race.ts`, `bearoff.ts`) reads them as they are.
 *
 * Plakoto is a contrary game: own point `p` of one player is own point
 * `25 - p` of the other. Own point 24 is the start; the last checker there
 * is the mother (`docs/rules/plakoto.md`).
 */

import type { GameState, PlayerId, Turn } from '@tavli/engine';

/** One player's checkers and pins. Length 50. */
export type PlakotoSide = number[];

export const OFF = 0;
/** Own point 24: the start, where the mother sits. */
export const START = 24;
/** `side[PINNED + p]` is 1 when the side's checker on own point `p` is pinned. */
export const PINNED = 25;
const LENGTH = 50;

/** Reads one player's side from a state. */
export function plakotoSideOf(state: GameState, player: PlayerId): PlakotoSide {
  const { board } = state;
  const side: PlakotoSide = new Array<number>(LENGTH).fill(0);
  side[OFF] = board.off[player];
  const points = board.points;
  for (let i = 0; i < 24; i += 1) {
    const point = points[i];
    if (point === undefined) continue;
    const count = point[player];
    if (count === 0) continue;
    // Absolute point i + 1 is White's own number; Black's is 25 - (i + 1).
    const own = player === 'white' ? i + 1 : 24 - i;
    side[own] = count;
    if (point.pinned === player) side[PINNED + own] = 1;
  }
  return side;
}

/**
 * Plays a turn on copies of the two sides and returns them. It trusts the
 * turn: it comes from `legalTurns`. A move marked `pin` pins the lone
 * opponent checker on the landing point. When the mover's last checker
 * leaves a point where it pinned an opponent checker, that checker is free.
 */
export function playPlakotoTurn(
  mover: PlakotoSide,
  opponent: PlakotoSide,
  turn: Turn,
): [PlakotoSide, PlakotoSide] {
  const me = mover.slice();
  const them = opponent.slice();
  for (const move of turn.moves) {
    const from = move.from;
    if (typeof from !== 'number') continue;
    me[from] = (me[from] ?? 0) - 1;
    if (me[from] === 0) them[PINNED + 25 - from] = 0;
    if (move.to === 'off') {
      me[OFF] = (me[OFF] ?? 0) + 1;
      continue;
    }
    const to = move.to;
    if (typeof to !== 'number') continue;
    if (move.capture === 'pin') them[PINNED + 25 - to] = 1;
    me[to] = (me[to] ?? 0) + 1;
  }
  return [me, them];
}

/** True when the side has a pinned checker anywhere. */
export function hasPinned(side: PlakotoSide): boolean {
  for (let p = 1; p <= 24; p += 1) if (side[PINNED + p] === 1) return true;
  return false;
}

/** True when the side's mother is pinned (its lone checker on own point 24). */
export function motherPinned(side: PlakotoSide): boolean {
  return side[PINNED + START] === 1;
}

/**
 * True while a pin is still possible, or there is one: some checker of one
 * side still has an opponent checker in front of it, or a checker is pinned.
 */
export function plakotoContact(a: PlakotoSide, b: PlakotoSide): boolean {
  if (hasPinned(a) || hasPinned(b)) return true;
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
