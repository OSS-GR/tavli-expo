/**
 * A small, fast board for the Fevga evaluator.
 *
 * Like `portes-board.ts`, it uses one plain array per player, in that
 * player's own numbering:
 *
 * - index 0: checkers borne off;
 * - index 1–24: checkers on own point 1–24;
 * - index 25: always 0 (Fevga has no bar). It keeps the layout of the
 *   Portes `Side`, so the race code (`race.ts`, `bearoff.ts`) works as is.
 *
 * Fevga has parallel movement (`docs/rules/fevga.md`, "Board & notation"):
 * own point `p` of one player is own point `p > 12 ? p - 12 : p + 12` of the
 * other. Both players move from their point 24 down to 1, and nobody is
 * ever hit.
 */

import type { GameState, PlayerId, Turn } from '@tavli/engine';

import { OFF } from './portes-board';
import type { Side } from './portes-board';

/** The same physical point in the other player's numbering. */
export function otherPoint(p: number): number {
  return p > 12 ? p - 12 : p + 12;
}

/** Reads one player's side from a Fevga state. */
export function fevgaSideOf(state: GameState, player: PlayerId): Side {
  const { board } = state;
  const side: Side = new Array<number>(26).fill(0);
  side[OFF] = board.off[player];
  for (let i = 0; i < 24; i += 1) {
    const count = board.points[i]?.[player] ?? 0;
    if (count === 0) continue;
    // Absolute point i + 1 is White's own number. For Black, otherPoint maps it.
    side[player === 'white' ? i + 1 : otherPoint(i + 1)] = count;
  }
  return side;
}

/**
 * Plays a turn on a copy of the mover's side. It trusts the turn: it comes
 * from `legalTurns`. There is no hitting, so the opponent does not change.
 */
export function playFevgaTurn(mover: Side, turn: Turn): Side {
  const me = mover.slice();
  for (const move of turn.moves) {
    const from = typeof move.from === 'number' ? move.from : 0;
    const to = move.to === 'off' ? OFF : move.to;
    me[from] = (me[from] ?? 0) - 1;
    me[to] = (me[to] ?? 0) + 1;
  }
  return me;
}

/** The own point of the side's last checker (the one furthest from home), or 0. */
export function rearPoint(side: Side): number {
  for (let p = 24; p >= 1; p -= 1) if ((side[p] ?? 0) > 0) return p;
  return 0;
}

/** True if `other` has a checker in front of `side`'s last checker (on its path). */
function hasCheckerAhead(side: Side, other: Side): boolean {
  const rear = rearPoint(side);
  for (let p = 1; p < rear; p += 1) if ((other[otherPoint(p)] ?? 0) > 0) return true;
  return false;
}

/**
 * True while one side can still block the other: some checker still has an
 * opponent checker in front of it. Once every checker has passed every
 * opponent checker, the game is a pure race.
 */
export function fevgaHasContact(a: Side, b: Side): boolean {
  return hasCheckerAhead(a, b) || hasCheckerAhead(b, a);
}

/**
 * The runner rule (`fevga.md`, movement rule 5): true while it keeps the
 * checkers on point 24 where they are. A checker has left 24, but none has
 * reached `target` (own point 11 by default) and none is off. `null` = the
 * rule is off. The same test as the engine's.
 */
export function runnerLocked(side: Side, target: number | null): boolean {
  if (target === null || (side[24] ?? 0) === 15 || (side[OFF] ?? 0) > 0) return false;
  for (let p = 1; p <= target; p += 1) if ((side[p] ?? 0) > 0) return false;
  return true;
}
