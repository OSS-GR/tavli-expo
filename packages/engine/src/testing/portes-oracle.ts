/**
 * A slow, simple Portes rules model, used only in tests. Not exported from
 * the package. It does not share code with the variant, so tests can check
 * the variant against it.
 *
 * It follows `docs/rules/portes.md` and the engine algorithm in
 * `tavli-match.md` word for word: one die at a time, bar checkers first,
 * no landing on a door, bear off only when all 15 are home. `referenceFinals`
 * tries every order of the dice and every checker, with no pruning.
 */

import type { BoardState } from '../board';
import type { Dice, DieValue } from '../dice';
import type { Move } from '../move';
import { opponent } from '../player';
import type { PlayerId } from '../player';
import type { GameState } from '../state';

/** One player's view of the board, in their own numbering. */
export interface Side {
  /** 0 = off, 1–24 own points, 25 = bar. */
  readonly own: number[];
  /** Opponent checkers on own points 1–24. */
  readonly opp: number[];
  oppBar: number;
}

/** The board seen by `player`. */
export function sideOf(board: BoardState, player: PlayerId): Side {
  const other = opponent(player);
  const own = new Array<number>(26).fill(0);
  const opp = new Array<number>(25).fill(0);
  for (let i = 0; i < 24; i += 1) {
    const point = board.points[i];
    if (point === undefined) continue;
    const p = player === 'white' ? i + 1 : 24 - i;
    own[p] = point[player];
    opp[p] = point[other];
  }
  own[0] = board.off[player];
  own[25] = board.bar[player];
  return { own, opp, oppBar: board.bar[other] };
}

/** A string that is equal for equal sides. */
export function sideKey(side: Side): string {
  return `${side.own.join(',')}|${side.opp.join(',')}|${side.oppBar}`;
}

/** True when one checker may move from `from` (1–24, or 25 = bar) with `die`. */
export function canStep(side: Side, from: number, die: number): boolean {
  const { own, opp } = side;
  // Movement rule 5: bar checkers enter before anything else moves.
  if ((own[25] ?? 0) > 0 && from !== 25) return false;
  if ((own[from] ?? 0) === 0) return false;
  const to = from - die;
  // Movement rules 2 and 3: no landing on a door.
  if (to >= 1) return (opp[to] ?? 0) < 2;
  // Bearing off: all checkers home, none on the bar.
  for (let p = 7; p <= 25; p += 1) if ((own[p] ?? 0) > 0) return false;
  // A larger die bears off only the highest checker.
  if (to < 0) for (let p = from + 1; p <= 6; p += 1) if ((own[p] ?? 0) > 0) return false;
  return true;
}

/** The move `canStep` allows, in engine form. */
export function stepMove(side: Side, from: number, die: DieValue): Move {
  const to = from - die;
  return {
    from: from === 25 ? 'bar' : from,
    to: to < 1 ? 'off' : to,
    die,
    capture: to >= 1 && side.opp[to] === 1 ? 'hit' : 'none',
  };
}

/** A copy that `playStep` can change. */
export function copySide(side: Side): Side {
  return { own: [...side.own], opp: [...side.opp], oppBar: side.oppBar };
}

/** Plays one checker that `canStep` allows. Changes `side` in place. */
export function playStep(side: Side, from: number, die: number): void {
  const land = Math.max(from - die, 0);
  side.own[from] = (side.own[from] ?? 0) - 1;
  side.own[land] = (side.own[land] ?? 0) + 1;
  if (land > 0 && side.opp[land] === 1) {
    // Hitting rule 1: the hit checker goes to the bar.
    side.opp[land] = 0;
    side.oppBar += 1;
  }
}

/** Plays one checker from `from` with `die`, or returns `null` if that is not legal. */
export function step(side: Side, from: number, die: number): Side | null {
  if (!canStep(side, from, die)) return null;
  const next = copySide(side);
  playStep(next, from, die);
  return next;
}

/** End positions (`sideKey`) of all legal plays, by the book. */
export function referenceFinals(state: GameState, dice: Dice): Set<string> {
  const [a, b] = dice;
  const orders: DieValue[][] =
    a === b
      ? [[a, a, a, a]]
      : [
          [a, b],
          [b, a],
        ];
  const plays: { side: Side; dice: DieValue[] }[] = [];
  const walk = (side: Side, order: DieValue[], used: DieValue[]): void => {
    const die = order[used.length];
    let moved = false;
    if (die !== undefined) {
      for (let from = 25; from >= 1; from -= 1) {
        const next = step(side, from, die);
        if (next === null) continue;
        moved = true;
        walk(next, order, [...used, die]);
      }
    }
    if (!moved) plays.push({ side, dice: used });
  };
  for (const order of orders) walk(sideOf(state.board, state.toMove), order, []);
  // Keep the plays that use the most dice; then the higher-die rule.
  const most = Math.max(...plays.map((p) => p.dice.length));
  let best = plays.filter((p) => p.dice.length === most);
  const high = Math.max(a, b);
  if (most === 1 && a !== b && best.some((p) => p.dice[0] === high)) {
    best = best.filter((p) => p.dice[0] === high);
  }
  return new Set(best.map((p) => sideKey(p.side)));
}
