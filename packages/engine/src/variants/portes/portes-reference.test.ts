/**
 * Checks the fast move generator against a slow, simple one.
 *
 * The reference below follows the engine algorithm in `tavli-match.md`
 * word for word: try every order of the dice, every checker, no pruning;
 * keep the longest plays; apply the higher-die rule; compare the sets of
 * end positions.
 */

import { describe, expect, it } from 'vitest';

import { DIE_VALUES } from '../../dice';
import type { Dice, DieValue } from '../../dice';
import { opponent } from '../../player';
import type { GameState } from '../../state';
import { formatPosition } from '../../testing/position-notation';
import { randomPositions } from '../../testing/random-positions';
import { portes } from './index';

interface Side {
  own: number[]; // 0 = off, 1–24 own points, 25 = bar
  opp: number[]; // opponent checkers on own points 1–24
  oppBar: number;
}

function sideOf(state: GameState): Side {
  const me = state.toMove;
  const other = opponent(me);
  const own = Array.from({ length: 26 }, () => 0);
  const opp = Array.from({ length: 25 }, () => 0);
  state.board.points.forEach((point, i) => {
    const p = me === 'white' ? i + 1 : 24 - i;
    own[p] = point[me];
    opp[p] = point[other];
  });
  own[0] = state.board.off[me];
  own[25] = state.board.bar[me];
  return { own, opp, oppBar: state.board.bar[other] };
}

function key(side: Side): string {
  return `${side.own.join(',')}|${side.opp.join(',')}|${side.oppBar}`;
}

function step(side: Side, from: number, die: number): Side | null {
  const { own, opp } = side;
  if ((own[25] ?? 0) > 0 && from !== 25) return null;
  if ((own[from] ?? 0) === 0) return null;
  const to = from - die;
  if (to >= 1 && (opp[to] ?? 0) >= 2) return null;
  if (to < 1) {
    for (let p = 7; p <= 25; p += 1) if ((own[p] ?? 0) > 0) return null;
    for (let p = from + 1; p <= 6; p += 1) if (to < 0 && (own[p] ?? 0) > 0) return null;
  }
  const next: Side = { own: [...own], opp: [...opp], oppBar: side.oppBar };
  next.own[from] = (next.own[from] ?? 0) - 1;
  const land = Math.max(to, 0);
  next.own[land] = (next.own[land] ?? 0) + 1;
  if (land > 0 && next.opp[land] === 1) {
    next.opp[land] = 0;
    next.oppBar += 1;
  }
  return next;
}

/** End positions of all legal plays, by the book. */
function referenceFinals(state: GameState, dice: Dice): Set<string> {
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
  for (const order of orders) walk(sideOf(state), order, []);
  const most = Math.max(...plays.map((p) => p.dice.length));
  let best = plays.filter((p) => p.dice.length === most);
  const high = Math.max(a, b);
  if (most === 1 && a !== b && best.some((p) => p.dice[0] === high)) {
    best = best.filter((p) => p.dice[0] === high);
  }
  return new Set(best.map((p) => key(p.side)));
}

function engineFinals(state: GameState, dice: Dice): string[] {
  return portes.legalTurns(state, dice).map((turn) => {
    const next = portes.applyTurn({ ...state, dice }, turn);
    return key(sideOf({ ...next, toMove: state.toMove }));
  });
}

describe('Portes generator vs. the slow reference', () => {
  it('finds the same end positions, each once, in 400 random positions', () => {
    for (const state of randomPositions(23, 400, 3)) {
      const dice = state.dice ?? [1, 1];
      const mine = engineFinals(state, dice);
      const context = `${formatPosition(state.board)} (${state.toMove}, ${dice.join('-')})`;
      expect(new Set(mine).size, context).toBe(mine.length);
      expect(new Set(mine), context).toEqual(referenceFinals(state, dice));
    }
  });

  it('agrees on every roll in 25 random positions', () => {
    for (const state of randomPositions(57, 25, 11)) {
      for (const a of DIE_VALUES) {
        for (const b of DIE_VALUES) {
          if (b > a) continue;
          const dice: Dice = [a, b];
          expect(new Set(engineFinals(state, dice))).toEqual(referenceFinals(state, dice));
        }
      }
    }
  });
});
