import { describe, expect, it } from 'vitest';

import { createBoard, portes } from '@tavli/engine';
import type { GameState, PlayerId, SideLayout } from '@tavli/engine';

import { randomPositions } from '../testing/random-positions';
import { PORTES_DEFAULT_WEIGHTS, createPortesHeuristic, portesHeuristic } from './portes-heuristic';
import { hasContact, pips, sideOf } from './portes-board';
import {
  effectiveRacePips,
  keithCount,
  kleinmanWinChance,
  normalCdf,
  raceDoubleChance,
} from './race';
import { countShots } from './shots';

const start = portes.initialState({ startingPlayer: 'white' });

function position(white: SideLayout, black: SideLayout, toMove: PlayerId): GameState {
  return { ...start, toMove, board: createBoard({ white, black }, 'contrary') };
}

/** White's equity in a position where Black is to roll. */
function whiteEquityWaiting(white: SideLayout, black: SideLayout): number {
  return -portesHeuristic.evaluate(position(white, black, 'black')).equity;
}

/** A side array with checkers at the given own points; the rest are off. */
function side(points: Readonly<Record<number, number>>, bar = 0): number[] {
  const s = new Array<number>(26).fill(0);
  let on = bar;
  for (const [p, n] of Object.entries(points)) {
    s[Number(p)] = n;
    on += n;
  }
  s[25] = bar;
  s[0] = 15 - on;
  return s;
}

describe('portes heuristic: basic shape', () => {
  it('gives numbers in range, and equity = 2·win − 1 + winDouble − loseDouble', () => {
    for (const state of randomPositions(3, 300)) {
      const e = portesHeuristic.evaluate(state);
      for (const p of [e.win, e.winDouble, e.loseDouble]) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
      expect(e.winDouble).toBeLessThanOrEqual(e.win + 1e-12);
      expect(e.loseDouble).toBeLessThanOrEqual(1 - e.win + 1e-12);
      expect(e.equity).toBeCloseTo(2 * e.win - 1 + e.winDouble - e.loseDouble, 12);
      expect(Math.abs(e.equity)).toBeLessThanOrEqual(2);
    }
  });

  it('is symmetric: the start is a little better for the player to roll', () => {
    const white = portesHeuristic.evaluate(start);
    const black = portesHeuristic.evaluate({ ...start, toMove: 'black' });
    expect(white.equity).toBeCloseTo(black.equity, 12);
    expect(white.win).toBeGreaterThan(0.5);
    expect(white.win).toBeLessThan(0.6);
  });

  it('knows a finished game', () => {
    const won = position({ off: 15 }, { points: { 6: 15 } }, 'black');
    expect(portesHeuristic.evaluate(won)).toEqual({
      win: 0,
      winDouble: 0,
      loseDouble: 1,
      equity: -2,
    });
  });

  it('takes its weights from the config object', () => {
    const heavy = createPortesHeuristic({ ...PORTES_DEFAULT_WEIGHTS, barChecker: 3 });
    const hit = position(
      { points: { 13: 5, 8: 3, 6: 5, 24: 1 }, bar: 1 },
      { points: { 24: 2, 13: 5, 8: 3, 6: 5 } },
      'white',
    );
    expect(heavy.evaluate(hit).equity).toBeLessThan(portesHeuristic.evaluate(hit).equity);
    expect(heavy.id).toBe('portes-heuristic-v1');
  });
});

describe('portes heuristic: features', () => {
  // Black's back checkers sit on White's 1-point (Black's 24) and hit forward.
  const black: SideLayout = { points: { 24: 2, 13: 5, 8: 3, 6: 5 } };

  it('more exposed blots give a lower evaluation', () => {
    // Same pip count (167): break the 8-point into blots on 9 and 7, then also the 13-point.
    const safe: SideLayout = { points: { 24: 2, 13: 5, 8: 3, 6: 5 } };
    const oneBlot: SideLayout = { points: { 24: 2, 13: 5, 8: 2, 7: 1, 9: 0, 6: 5 } };
    const twoBlots: SideLayout = { points: { 24: 2, 13: 5, 8: 1, 9: 1, 7: 1, 6: 5 } };
    const threeBlots: SideLayout = {
      points: { 24: 2, 15: 1, 13: 3, 11: 1, 9: 1, 8: 1, 7: 1, 6: 5 },
    };
    const values = [safe, oneBlot, twoBlots, threeBlots].map((w) => whiteEquityWaiting(w, black));
    // oneBlot has one pip less (7 instead of 8), still it must be worse.
    expect(values[0]).toBeGreaterThan(values[1] ?? Infinity);
    expect(values[1]).toBeGreaterThan(values[2] ?? Infinity);
    expect(values[2]).toBeGreaterThan(values[3] ?? Infinity);
  });

  it('a blot in direct range is worse than one far away', () => {
    // A blot 6 pips in front of Black's back checkers (White's 7: 17 shots) or 10 pips
    // (White's 11: 3 shots). The race weight is off, so only the blot counts.
    const near: SideLayout = { points: { 13: 6, 7: 1, 6: 5, 5: 3 } };
    const far: SideLayout = { points: { 13: 5, 11: 1, 6: 6, 5: 3 } };
    const noRace = createPortesHeuristic({ ...PORTES_DEFAULT_WEIGHTS, race: 0 });
    const value = (w: SideLayout): number => -noRace.evaluate(position(w, black, 'black')).equity;
    expect(value(far)).toBeGreaterThan(value(near));
  });

  it('a closed board is better than an open one when the opponent is on the bar', () => {
    // Same pips (81): six home points made, or four points with spares.
    const closed: SideLayout = { points: { 6: 2, 5: 2, 4: 2, 3: 2, 2: 2, 1: 2, 13: 3 } };
    const open: SideLayout = { points: { 6: 3, 5: 3, 4: 3, 3: 3, 9: 3 } };
    const onBar: SideLayout = { points: { 6: 5, 8: 4, 13: 5 }, bar: 1 };
    expect(whiteEquityWaiting(closed, onBar)).toBeGreaterThan(whiteEquityWaiting(open, onBar));
  });

  it('a longer prime in front of the opponent is better', () => {
    // 4, 5 and 6 made points in a row from White's 9-point down; the rest on 13.
    const prime = (from: number, length: number): SideLayout => {
      const points: Record<number, number> = {};
      for (let p = from; p > from - length; p -= 1) points[p] = 2;
      const rest = 15 - 2 * length;
      points[13] = rest;
      return { points };
    };
    const noRace = createPortesHeuristic({ ...PORTES_DEFAULT_WEIGHTS, race: 0 });
    const value = (w: SideLayout): number => -noRace.evaluate(position(w, black, 'black')).equity;
    expect(value(prime(9, 5))).toBeGreaterThan(value(prime(9, 4)));
    expect(value(prime(9, 6))).toBeGreaterThan(value(prime(9, 5)));
  });

  it('an anchor in the opponent home is better than two blots there', () => {
    const anchored: SideLayout = { points: { 20: 2, 13: 5, 8: 3, 6: 5 } };
    const split: SideLayout = { points: { 22: 1, 18: 1, 13: 5, 8: 3, 6: 5 } };
    const opp: SideLayout = { points: { 13: 5, 8: 3, 6: 5, 2: 2 } };
    expect(whiteEquityWaiting(anchored, opp)).toBeGreaterThan(whiteEquityWaiting(split, opp));
  });

  it('a checker on the bar costs more than its pips against a strong board', () => {
    const opp: SideLayout = { points: { 6: 3, 5: 3, 4: 3, 3: 2, 13: 4 } };
    const heavy = createPortesHeuristic({ ...PORTES_DEFAULT_WEIGHTS, race: 0 });
    const onBar = position({ points: { 13: 6, 8: 3, 6: 5 }, bar: 1 }, opp, 'white');
    const safe = position({ points: { 13: 7, 8: 3, 6: 5 } }, opp, 'white');
    expect(heavy.evaluate(onBar).equity).toBeLessThan(heavy.evaluate(safe).equity);
  });

  it('the race evaluation grows with the pip lead', () => {
    // No contact: Black is all home, White has one runner on point p (7–18).
    const opp: SideLayout = { points: { 6: 4, 5: 4, 4: 4, 3: 3 } };
    let last = -Infinity;
    for (let p = 18; p >= 7; p -= 1) {
      const state = position({ points: { [p]: 1, 6: 4, 5: 4, 4: 3, 3: 3 } }, opp, 'white');
      const e = portesHeuristic.evaluate(state);
      expect(hasContact(sideOf(state, 'white'), sideOf(state, 'black'))).toBe(false);
      expect(e.equity).toBeGreaterThan(last);
      last = e.equity;
    }
  });

  it('the race evaluation of one side only goes down as the other side gets closer', () => {
    const me = side({ 6: 3, 5: 3, 4: 3, 3: 3, 2: 3 });
    let last = Infinity;
    for (let p = 12; p >= 4; p -= 1) {
      const them = side({ [p]: 2, 3: 4, 2: 4, 1: 3 }); // lower p = closer to the end
      const chance = kleinmanWinChance(effectiveRacePips(me), effectiveRacePips(them));
      expect(chance).toBeLessThanOrEqual(last);
      last = chance;
    }
  });
});

describe('race formulas', () => {
  it('normalCdf is accurate', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1)).toBeCloseTo(0.841345, 5);
    expect(normalCdf(-1.96)).toBeCloseTo(0.024998, 5);
  });

  it('Keith count adds the wastage of a bad bear-off shape', () => {
    // 3 on the 1-point (+4), 2 on the 2-point (+1), 5 on the 3-point (+2), empty 4, 5, 6 (+3).
    const s = side({ 1: 3, 2: 2, 3: 5 });
    expect(pips(s)).toBe(3 + 4 + 15);
    expect(keithCount(s)).toBe(22 + 4 + 1 + 2 + 3);
    // A smooth position has no wastage.
    expect(keithCount(side({ 6: 3, 5: 3, 4: 3 }))).toBe(45);
  });

  it('Kleinman: equal races favour the roller, and leads count more in short races', () => {
    expect(kleinmanWinChance(100, 100)).toBeGreaterThan(0.55);
    expect(kleinmanWinChance(100, 100)).toBeLessThan(0.65);
    expect(kleinmanWinChance(100, 110)).toBeGreaterThan(kleinmanWinChance(100, 100));
    expect(kleinmanWinChance(30, 40)).toBeGreaterThan(kleinmanWinChance(130, 140));
    expect(kleinmanWinChance(0, 10)).toBe(1);
    expect(kleinmanWinChance(10, 0)).toBe(0);
  });

  it('diplo chance: zero once the loser has borne off, high when far behind', () => {
    const winner = side({ 1: 2 });
    expect(raceDoubleChance(winner, side({ 6: 5, 5: 5 }), true)).toBe(0); // loser has 5 off
    const far = side({ 18: 5, 16: 5, 14: 5 });
    expect(raceDoubleChance(winner, far, true)).toBeGreaterThan(0.99);
  });
});

describe('shot counting', () => {
  /** Shots of one roller checker at one blot `distance` pips in front of it. */
  function shotsAt(distance: number): number {
    const roller = side({ 24: 1 });
    const waiter = side({ [25 - (24 - distance)]: 1 });
    return countShots(roller, waiter).any;
  }

  it('matches the standard table of direct and indirect shots', () => {
    // Distance: 1  2  3  4  5  6  7 8 9 10 11 12 15 16 18 20 24
    const table: Record<number, number> = {
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
      13: 0,
      14: 0,
      15: 1,
      16: 1,
      17: 0,
      18: 1,
      19: 0,
      20: 1,
      21: 0,
      22: 0,
      23: 0,
    };
    for (const [distance, shots] of Object.entries(table)) {
      expect(shotsAt(Number(distance)), `distance ${distance}`).toBe(shots);
    }
  });

  it('doors in between block indirect shots', () => {
    // Blot 8 away (6-2, 5-3, 4-4, 2-2). Doors 6 and 3 in front: only 2-6 via 2 and 5-3 via 5 stay.
    const roller = side({ 24: 1 });
    const blotAt = 25 - 16; // roller point 16 = waiter point 9
    const open = countShots(roller, side({ [blotAt]: 1 }));
    expect(open.any).toBe(6);
    // Waiter doors on roller points 18 and 21 (waiter 7 and 4).
    const blocked = countShots(roller, side({ [blotAt]: 1, 7: 2, 4: 2 }));
    // 6-2: via 22 (open) still works. 5-3: via 19 (open) still works.
    // 4-4: 24 → 20 → 16 is open. 2-2: 24 → 22 → 20 → 18 is a door: blocked.
    expect(blocked.any).toBe(5);
    expect(blocked.perBlot[blotAt]).toBe(5);
  });

  it('a roller checker on the bar must enter first', () => {
    // Waiter blot on the roller's 20 (entry with a 5) and on the roller's 10.
    const waiter = side({ 5: 1, 15: 1 });
    const oneOnBar = countShots(side({}, 1), waiter);
    // Enter with a 5 and hit (11 rolls), or enter with a 4 or 3 and hit with the 1 or 2 (4-1, 3-2).
    // The blot on 10 is 15 away from the bar: only 5-5 (25→20→15→10).
    expect(oneOnBar.perBlot[5]).toBe(15);
    expect(oneOnBar.perBlot[15]).toBe(1);
    // Two on the bar: only an entering checker can hit; 5-5 still has two moves left.
    const twoOnBar = countShots(side({}, 2), waiter);
    expect(twoOnBar.perBlot[5]).toBe(11);
    expect(twoOnBar.perBlot[15]).toBe(1);
    // Four on the bar with 5-5: all four dice enter, the far blot is safe.
    const fourOnBar = countShots(side({}, 4), waiter);
    expect(fourOnBar.perBlot[15]).toBe(0);
    // A closed entry point stops everything: a waiter door on the roller's 20 (waiter 5).
    const blocked = countShots(side({ 13: 1 }, 1), side({ 5: 2, 15: 1 }));
    // The blot on roller point 10 is 3 away from 13, but the roller must enter first (not
    // with a 5): 1-3, 2-3, 4-3, 6-3 (8 rolls), 3-3, and 1-1 (enter, then 13 → 12 → 11 → 10).
    // 5-3 cannot enter with the 5.
    expect(blocked.perBlot[15]).toBe(10);
  });

  it('counts each blot and the union', () => {
    const roller = side({ 24: 2 });
    const waiter = side({ [25 - 18]: 1, [25 - 23]: 1 });
    const shots = countShots(roller, waiter);
    expect(shots.perBlot[7]).toBe(17); // 6 away
    expect(shots.perBlot[2]).toBe(11); // 1 away
    expect(shots.any).toBeGreaterThan(17);
    expect(shots.any).toBeLessThan(28);
  });
});
