import { describe, expect, it } from 'vitest';

import { createBoard, getPreset, plakoto } from '@tavli/engine';
import type { GameState, MotherRules, PlayerId, SideLayout } from '@tavli/engine';

import {
  PLAKOTO_DEFAULT_WEIGHTS,
  createPlakotoHeuristic,
  plakotoHeuristic,
  plakotoTurnResult,
} from './plakoto-heuristic';
import { PINNED, START, plakotoSideOf } from './plakoto-board';
import type { PlakotoSide } from './plakoto-board';
import { countPlakotoShots } from './plakoto-shots';
import { randomPlakotoPositions } from '../testing/random-plakoto-positions';

const start = plakoto.initialState({ startingPlayer: 'white' });

/** A Plakoto state. Each side in its own numbering; `off` fills the side up to 15. */
function position(white: SideLayout, black: SideLayout, toMove: PlayerId = 'white'): GameState {
  const fill = (side: SideLayout): SideLayout => {
    let on = 0;
    for (const n of Object.values(side.points ?? {})) on += n;
    return { ...side, off: 15 - on };
  };
  return {
    ...start,
    toMove,
    board: createBoard({ white: fill(white), black: fill(black) }, 'contrary'),
  };
}

const equity = (state: GameState): number => plakotoHeuristic.evaluate(state).equity;

/** A plain side for the shot counter: own point → count, and the pinned points. */
function side(points: Record<number, number>, pinned: readonly number[] = []): PlakotoSide {
  const s = new Array<number>(50).fill(0);
  for (const [p, n] of Object.entries(points)) s[Number(p)] = n;
  for (const p of pinned) s[PINNED + p] = 1;
  return s;
}

describe('plakoto heuristic: basic shape', () => {
  it('gives numbers in range, and equity = 2·win − 1 + winDouble − loseDouble', () => {
    for (const state of randomPlakotoPositions(11, 300)) {
      const e = plakotoHeuristic.evaluate(state);
      for (const p of [e.win, e.winDouble, e.loseDouble]) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
      expect(e.winDouble).toBeLessThanOrEqual(e.win + 1e-12);
      expect(e.loseDouble).toBeLessThanOrEqual(1 - e.win + 1e-12);
      expect(e.equity).toBeCloseTo(2 * e.win - 1 + e.winDouble - e.loseDouble, 12);
    }
  });

  it('is symmetric: the start is a little better for the player to roll', () => {
    const white = plakotoHeuristic.evaluate(start);
    const black = plakotoHeuristic.evaluate({ ...start, toMove: 'black' });
    expect(white.equity).toBeCloseTo(black.equity, 12);
    expect(white.equity).toBeGreaterThan(0);
    expect(white.equity).toBeLessThan(0.3);
  });

  it('knows a finished game', () => {
    const lost = position({ points: { 3: 2 } }, {}, 'white');
    expect(plakotoHeuristic.evaluate(lost)).toEqual({
      win: 0,
      winDouble: 0,
      loseDouble: 0,
      equity: -1,
    });
    const lostDouble = position({ points: { 3: 15 } }, {}, 'white');
    expect(equity(lostDouble)).toBe(-2);
  });

  it('takes its weights from the config object', () => {
    const pinned = position(
      { points: { 24: 1, 6: 14 }, pinned: [24] },
      { points: { 1: 1, 6: 14 } },
    );
    const soft = createPlakotoHeuristic({
      ...PLAKOTO_DEFAULT_WEIGHTS,
      motherPinned: 0,
      motherDouble: 0,
    });
    expect(soft.evaluate(pinned).equity).toBeGreaterThan(equity(pinned) + 0.5);
    expect(soft.id).toBe('plakoto-heuristic-v1');
    expect(soft.variant).toBe('plakoto');
  });
});

describe('plakoto heuristic: features', () => {
  it('a pin we hold is worth a lot more than a pin we suffer on the same point', () => {
    // White and Black share White's point 5 (Black's 20). Only who pins whom differs.
    const white = { points: { 24: 6, 13: 4, 8: 4, 5: 1 } };
    const black = { points: { 24: 6, 13: 4, 8: 4, 20: 1 } };
    const weHold = position(white, { ...black, pinned: [20] });
    const weSuffer = position({ ...white, pinned: [5] }, black);
    expect(equity(weHold)).toBeGreaterThan(equity(weSuffer) + 0.3);
  });

  it('a pin far from the pinned checker’s home is worth more', () => {
    // White pins a Black checker on Black's 20 (deep) or on Black's 8.
    const deep = position(
      { points: { 24: 8, 13: 6, 5: 1 } },
      { points: { 24: 8, 13: 6, 20: 1 }, pinned: [20] },
    );
    const shallow = position(
      { points: { 24: 8, 13: 6, 17: 1 } },
      { points: { 24: 8, 13: 6, 8: 1 }, pinned: [8] },
    );
    expect(equity(deep)).toBeGreaterThan(equity(shallow));
  });

  it('a pinned mother is nearly a lost double, whoever is to roll', () => {
    const white = { points: { 24: 1, 12: 7, 6: 7 }, pinned: [24] };
    const black = { points: { 1: 1, 12: 7, 6: 7 } };
    for (const toMove of ['white', 'black'] as const) {
      const e = plakotoHeuristic.evaluate(position(white, black, toMove));
      const mine = toMove === 'white' ? e : { ...e, equity: -e.equity };
      expect(mine.equity).toBeLessThan(-1.5);
    }
    const e = plakotoHeuristic.evaluate(position(white, black, 'white'));
    expect(e.win).toBeLessThan(0.1);
    expect(e.loseDouble).toBeGreaterThan(0.8);
    // Still a little better than resigning (−2): playing on keeps the draw chance.
    expect(e.equity).toBeGreaterThan(-2);
  });

  it('a lone mother in reach of the roller is worse than two checkers on the start', () => {
    // Black to roll. A Black checker on Black's 7 is 6 pips from White's start (Black's 1).
    const black = { points: { 19: 5, 7: 10 } };
    const alone = position({ points: { 24: 1, 8: 14 } }, black, 'black');
    const pair = position({ points: { 24: 2, 8: 13 } }, black, 'black');
    expect(equity(alone)).toBeGreaterThan(equity(pair) + 0.3);
  });

  it('more lone checkers in range cost the waiter more', () => {
    // Black to roll from Black's 13; White's lone checkers are on White's 17 and 18 (Black's 8 and 7).
    const black = { points: { 24: 5, 13: 10 } };
    const safe = position({ points: { 24: 5, 17: 2, 18: 2, 6: 6 } }, black, 'black');
    const one = position({ points: { 24: 5, 17: 1, 18: 2, 6: 7 } }, black, 'black');
    const two = position({ points: { 24: 5, 17: 1, 18: 1, 6: 8 } }, black, 'black');
    const blind = createPlakotoHeuristic({ ...PLAKOTO_DEFAULT_WEIGHTS, blotShare: 0, anyShot: 0 });
    const shotValue = (state: GameState) => equity(state) - blind.evaluate(state).equity;
    expect(shotValue(safe)).toBe(0);
    expect(shotValue(one)).toBeGreaterThan(0.05);
    expect(shotValue(two)).toBeGreaterThan(shotValue(one) + 0.05);
  });

  it('a prime with opponent checkers behind it counts', () => {
    // White holds 2–7 (a 6-prime) in front of Black's checkers on Black's 24 (White's 1).
    const primed = position(
      { points: { 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 13: 3 } },
      { points: { 24: 5, 6: 10 } },
    );
    const noPrime = createPlakotoHeuristic({ ...PLAKOTO_DEFAULT_WEIGHTS, prime: 0 });
    // A 6-prime is worth 1.5 logits: the chance to lose shrinks by about e^-1.5.
    const lose = (e: { win: number }) => 1 - e.win;
    expect(lose(plakotoHeuristic.evaluate(primed))).toBeLessThan(
      0.3 * lose(noPrime.evaluate(primed)),
    );
    // With no opponent checker behind it, the prime is worth nothing extra.
    const passed = position(
      { points: { 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 13: 3 } },
      { points: { 17: 5, 6: 10 } },
    );
    expect(equity(passed)).toBeCloseTo(noPrime.evaluate(passed).equity, 12);
  });

  it('the race evaluation grows with the pip lead', () => {
    let last = -Infinity;
    for (const p of [6, 5, 4, 3, 2, 1]) {
      const race = position({ points: { [p]: 15 } }, { points: { 3: 15 } });
      const e = equity(race);
      expect(e).toBeGreaterThan(last);
      last = e;
    }
  });
});

describe('plakoto shot counting', () => {
  it('matches the standard table of direct and indirect shots', () => {
    // Roller on own 13; the waiter's lone checker d pips in front (waiter point 25 - (13 - d)).
    const expected: Record<number, number> = {
      1: 11,
      2: 12,
      3: 14,
      4: 15,
      5: 15,
      6: 17,
      7: 6,
      8: 6,
      9: 5,
      10: 3,
      11: 2,
      12: 3,
    };
    for (const [d, shots] of Object.entries(expected)) {
      const q = 25 - (13 - Number(d));
      const result = countPlakotoShots(side({ 13: 2 }), side({ [q]: 1 }));
      expect(result.perBlot[q], `${d} away`).toBe(shots);
      expect(result.any).toBe(shots);
    }
  });

  it('doors and pins in between block combined shots', () => {
    // Blot 8 away (waiter point 20 = roller point 5); doors on roller 7–11 block 6-2, 5-3, 4-4, 2-2.
    const open = countPlakotoShots(side({ 13: 2 }), side({ 20: 1 }));
    const doors = { 14: 2, 15: 2, 16: 2, 17: 2, 18: 2 };
    const blocked = countPlakotoShots(side({ 13: 2 }), side({ 20: 1, ...doors }));
    expect(open.perBlot[20]).toBe(6);
    expect(blocked.perBlot[20]).toBe(0);
    // A point where the waiter pins a roller checker is a door too.
    const pinDoor = countPlakotoShots(side({ 13: 2, 9: 1 }, [9]), side({ 20: 1, 16: 1 }));
    expect(pinDoor.perBlot[20]).toBeLessThan(open.perBlot[20] ?? 0);
  });

  it('a pinned checker cannot shoot, and pinners and pinned checkers cannot be pinned', () => {
    expect(countPlakotoShots(side({ 13: 1 }, [13]), side({ 12: 2, 19: 1 })).any).toBe(0);
    // The waiter's lone checker on its 20 pins a roller checker (roller 5): not a target.
    expect(countPlakotoShots(side({ 13: 2, 5: 1 }, [5]), side({ 20: 1 })).any).toBe(0);
    // The waiter's lone checker is pinned by the roller already: not a target.
    expect(countPlakotoShots(side({ 13: 2, 5: 1 }), side({ 20: 1 }, [20])).any).toBe(0);
  });
});

describe('plakoto game end after a turn', () => {
  const rules = (motherRule: MotherRules['motherRule']): MotherRules => ({
    ...getPreset('plakoto').mother,
    motherRule,
  });
  // The mover pins the other side's mother (other's 24 = mover's 1).
  const mover = side({ 1: 1, 6: 14 });
  const moverStill = side({ 1: 1, 24: 2, 6: 12 });
  const other = side({ [START]: 1, 6: 14 }, [START]);

  it('follows the mother rule', () => {
    expect(plakotoTurnResult(mover, other, rules('offerConcede'))).toBeNull();
    expect(plakotoTurnResult(mover, other, rules('none'))).toBeNull();
    expect(plakotoTurnResult(mover, other, rules('instant'))).toBe(2);
    expect(plakotoTurnResult(mover, other, rules('federation'))).toBe(2);
    expect(plakotoTurnResult(moverStill, other, rules('federation'))).toBeNull();
    expect(plakotoTurnResult(moverStill, other, rules('instant'))).toBe(2);
  });

  it('gives a draw when both mothers are pinned, and the bear-off points', () => {
    const bothPinned = side({ 1: 1, [START]: 1, 6: 13 }, [START]);
    const otherPinner = side({ [START]: 1, 1: 1, 6: 13 }, [START]);
    expect(plakotoTurnResult(bothPinned, otherPinner, rules('offerConcede'))).toBe(0);
    expect(plakotoTurnResult(side({ 0: 15 }), side({ 0: 1, 3: 14 }), rules('none'))).toBe(1);
    expect(plakotoTurnResult(side({ 0: 15 }), side({ 3: 15 }), rules('offerConcede'))).toBe(2);
  });
});

describe('plakoto board', () => {
  it('reads pins from the state in each player’s own numbering', () => {
    const state = position({ points: { 24: 1, 6: 14 }, pinned: [24] }, { points: { 1: 1, 6: 14 } });
    const white = plakotoSideOf(state, 'white');
    const black = plakotoSideOf(state, 'black');
    expect(white[24]).toBe(1);
    expect(white[PINNED + 24]).toBe(1);
    expect(black[1]).toBe(1);
    expect(black[PINNED + 1]).toBe(0);
    expect(white[0]).toBe(0);
  });
});
