import { describe, expect, it } from 'vitest';

import { createBoard, createSeededRng, portes, rollDice } from '@tavli/engine';
import type { Dice, GameState, SideLayout } from '@tavli/engine';

import { createBot } from '../create-bot';
import { randomInt } from '../random';
import {
  BEAROFF_MAX_CHECKERS,
  bearoffRolls,
  bearoffWinChance,
  endPositions,
  homeKey,
  meanRolls,
} from './bearoff';
import { portesHeuristic } from './portes-heuristic';
import { sideOf } from './portes-board';

/** A side array with checkers at the given own points; the rest are off. */
function side(points: Readonly<Record<number, number>>): number[] {
  const s = new Array<number>(26).fill(0);
  let on = 0;
  for (const [p, n] of Object.entries(points)) {
    s[Number(p)] = n;
    on += n;
  }
  s[0] = 15 - on;
  return s;
}

function rolls(points: Readonly<Record<number, number>>): ArrayLike<number> {
  const dist = bearoffRolls(side(points));
  if (dist === null) throw new Error('not in the table');
  return dist;
}

const start = portes.initialState({ startingPlayer: 'white' });

function layoutOf(points: Readonly<Record<number, number>>): SideLayout {
  let on = 0;
  for (const n of Object.values(points)) on += n;
  return { points, off: 15 - on };
}

describe('bear-off table', () => {
  it('knows the easy cases', () => {
    expect(rolls({ 1: 1 })[1]).toBeCloseTo(1, 12);
    expect(rolls({ 1: 2 })[1]).toBeCloseTo(1, 12);
    // One checker on the 6-point: 27 of the 36 rolls bear it off at once.
    expect(rolls({ 6: 1 })[1]).toBeCloseTo(27 / 36, 12);
    // Two on the 6-point: only 3-3, 4-4, 5-5 and 6-6 take both off in one roll.
    expect(rolls({ 6: 2 })[1]).toBeCloseTo(4 / 36, 12);
    // Four on the 1-point: a double takes all four, else two per roll.
    expect(rolls({ 1: 4 })[1]).toBeCloseTo(6 / 36, 12);
    expect(rolls({ 1: 4 })[2]).toBeCloseTo(30 / 36, 12);
  });

  it('gives a distribution, and more checkers take longer', () => {
    for (const points of [{ 6: 6 }, { 1: 1, 2: 2, 5: 3 }, { 3: 2 }]) {
      let total = 0;
      const dist = rolls(points);
      for (let k = 0; k < dist.length; k += 1) total += dist[k] ?? 0;
      expect(total).toBeCloseTo(1, 12);
    }
    expect(meanRolls(rolls({ 6: 2 }))).toBeGreaterThan(meanRolls(rolls({ 6: 1 })));
    expect(meanRolls(rolls({ 6: 6 }))).toBeGreaterThan(meanRolls(rolls({ 5: 6 })));
  });

  it('only covers sides with all checkers home and few left', () => {
    expect(BEAROFF_MAX_CHECKERS).toBe(6);
    expect(bearoffRolls(side({ 7: 1 }))).toBeNull();
    expect(bearoffRolls(side({ 6: 7 }))).toBeNull();
    const onBar = side({ 1: 1 });
    onBar[25] = 1;
    onBar[0] = 13;
    expect(bearoffRolls(onBar)).toBeNull();
  });

  it('the player on roll wins ties in the number of rolls', () => {
    expect(bearoffWinChance(rolls({ 1: 1 }), rolls({ 1: 1 }))).toBeCloseTo(1, 12);
    expect(bearoffWinChance(rolls({ 1: 4 }), rolls({ 1: 1 }))).toBeCloseTo(6 / 36, 12);
  });

  it('plays the roll exactly like the engine', () => {
    // White is home with 1–6 checkers; Black is home far away, so there is no contact.
    const rng = createSeededRng(8);
    for (let i = 0; i < 150; i += 1) {
      const points: Record<number, number> = {};
      const n = 1 + randomInt(rng, 6);
      for (let c = 0; c < n; c += 1) {
        const p = 1 + randomInt(rng, 6);
        points[p] = (points[p] ?? 0) + 1;
      }
      const state: GameState = {
        ...start,
        board: createBoard(
          { white: layoutOf(points), black: { points: { 6: 5, 5: 5, 4: 5 } } },
          'contrary',
        ),
      };
      const dice: Dice = rollDice(rng);
      const fromEngine = new Set(
        portes
          .legalTurns(state, dice)
          .map((turn) => homeKey(sideOf(portes.applyTurn({ ...state, dice }, turn), 'white'))),
      );
      const ours = new Set(endPositions(homeKey(sideOf(state, 'white')), dice[0], dice[1]));
      expect(ours, `${JSON.stringify(points)} with ${dice.join('-')}`).toEqual(fromEngine);
    }
  });

  it('matches real play: the evaluator agrees with played-out games', () => {
    // 6 checkers against 5: the race formula says about 52 %, the table about 80 %.
    const state: GameState = {
      ...start,
      board: createBoard(
        { white: layoutOf({ 1: 2, 2: 2, 3: 2 }), black: layoutOf({ 1: 1, 2: 2, 3: 2 }) },
        'contrary',
      ),
    };
    const predicted = portesHeuristic.evaluate(state).win;
    expect(predicted).toBeGreaterThan(0.75);
    const bot = createBot();
    const rng = createSeededRng(5);
    const games = 600;
    let wins = 0;
    for (let g = 0; g < games; g += 1) {
      let s = state;
      for (;;) {
        const result = portes.result(s);
        if (result !== null) {
          if (result.winner === 'white') wins += 1;
          break;
        }
        const dice = rollDice(rng);
        const rolled = { ...s, dice };
        s = portes.applyTurn(rolled, bot.chooseTurn(rolled, dice, 'medium', { rng }));
      }
    }
    expect(Math.abs(wins / games - predicted)).toBeLessThan(0.05);
  });
});
