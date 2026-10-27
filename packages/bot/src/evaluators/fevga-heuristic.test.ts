import { describe, expect, it } from 'vitest';

import { createBoard, fevga, getPreset, opponent } from '@tavli/engine';
import type { Dice, GameState, PlayerId, SideLayout } from '@tavli/engine';

import { randomFevgaPositions } from '../testing/random-fevga-positions';
import {
  fevgaHasContact,
  fevgaSideOf,
  otherPoint,
  playFevgaTurn,
  rearPoint,
  runnerLocked,
} from './fevga-board';
import {
  FEVGA_DEFAULT_WEIGHTS,
  FEVGA_FEATURES,
  FEVGA_HEURISTIC_ID,
  createFevgaHeuristic,
  fevgaHeuristic,
  runnerTargetOf,
  sideFeatures,
} from './fevga-heuristic';

const start = fevga.initialState({ startingPlayer: 'white' });

/** A layout with checkers on the given own points; the rest are off. */
function layout(points: Readonly<Record<number, number>>): SideLayout {
  let on = 0;
  for (const n of Object.values(points)) on += n;
  return { points, off: 15 - on };
}

/** A Fevga state. Each side writes its own point numbers. */
function position(
  white: Readonly<Record<number, number>>,
  black: Readonly<Record<number, number>>,
  toMove: PlayerId = 'white',
): GameState {
  return {
    ...start,
    toMove,
    board: createBoard({ white: layout(white), black: layout(black) }, 'parallel'),
  };
}

/** White's equity in a position where Black is to roll (White just moved). */
function whiteEquityWaiting(
  white: Readonly<Record<number, number>>,
  black: Readonly<Record<number, number>>,
): number {
  return -fevgaHeuristic.evaluate(position(white, black, 'black')).equity;
}

/** The same position with the colours swapped. */
function mirrored(state: GameState): GameState {
  const sideAsLayout = (player: PlayerId): SideLayout => {
    const side = fevgaSideOf(state, player);
    const points: Record<number, number> = {};
    for (let p = 1; p <= 24; p += 1) if ((side[p] ?? 0) > 0) points[p] = side[p] ?? 0;
    return { points, off: side[0] ?? 0 };
  };
  return {
    ...state,
    toMove: opponent(state.toMove),
    board: createBoard({ white: sideAsLayout('black'), black: sideAsLayout('white') }, 'parallel'),
  };
}

const feature = (name: (typeof FEVGA_FEATURES)[number]): number => FEVGA_FEATURES.indexOf(name);

describe('fevga board helpers', () => {
  it('maps points like the rules doc: White 24 = Black 12, White 12 = Black 24', () => {
    expect(otherPoint(24)).toBe(12);
    expect(otherPoint(12)).toBe(24);
    expect(otherPoint(1)).toBe(13);
    for (let p = 1; p <= 24; p += 1) expect(otherPoint(otherPoint(p))).toBe(p);
  });

  it('reads both sides of the start in their own numbering', () => {
    for (const player of ['white', 'black'] as const) {
      const side = fevgaSideOf(start, player);
      expect(side[24]).toBe(15);
      expect(side.reduce((a, b) => a + b, 0)).toBe(15);
      expect(rearPoint(side)).toBe(24);
    }
  });

  it('plays a turn on a copy', () => {
    const dice: Dice = [6, 5];
    const me = fevgaSideOf(start, 'white');
    const [turn] = fevga.legalTurns(start, dice);
    if (turn === undefined) throw new Error('no turn');
    const after = playFevgaTurn(me, turn);
    expect(me[24]).toBe(15);
    expect(after).toEqual(fevgaSideOf(fevga.applyTurn({ ...start, dice }, turn), 'white'));
  });

  it('knows when contact is over', () => {
    expect(fevgaHasContact(fevgaSideOf(start, 'white'), fevgaSideOf(start, 'black'))).toBe(true);
    // Both sides home: White on W1–6, Black on its own 1–6 (W13–18). A pure race.
    const race = position({ 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 }, { 2: 5, 4: 5, 6: 5 });
    expect(fevgaHasContact(fevgaSideOf(race, 'white'), fevgaSideOf(race, 'black'))).toBe(false);
    // One White checker on W20 still has Black's home (W13–18) in front of it.
    const behind = position({ 20: 1, 1: 14 }, { 2: 5, 4: 5, 6: 5 });
    expect(fevgaHasContact(fevgaSideOf(behind, 'white'), fevgaSideOf(behind, 'black'))).toBe(true);
    // A Black checker on its own 20 (W8) still has White's W1–6 in front of it.
    const blackBehind = position({ 1: 15 }, { 20: 1, 2: 14 });
    const [w, b] = [fevgaSideOf(blackBehind, 'white'), fevgaSideOf(blackBehind, 'black')];
    expect(fevgaHasContact(w, b)).toBe(true);
  });

  it('runnerLocked agrees with the engine: a locked side never moves a checker from 24', () => {
    const target = runnerTargetOf(start.rules);
    expect(target).toBe(11);
    // White's runner on W15, not past Black's mother on W12 yet.
    const locked = position({ 24: 14, 15: 1 }, { 24: 15 });
    expect(runnerLocked(fevgaSideOf(locked, 'white'), target)).toBe(true);
    for (const turn of fevga.legalTurns(locked, [4, 2])) {
      // 15/11 frees the rest during the turn; any other first move keeps them locked.
      if (turn.moves[0]?.from === 15 && turn.moves[0].to === 11) continue;
      expect(turn.moves.some((m) => m.from === 24)).toBe(false);
    }
    // Through: the runner is on W10.
    const through = position({ 24: 14, 10: 1 }, { 24: 15 });
    expect(runnerLocked(fevgaSideOf(through, 'white'), target)).toBe(false);
    // Before the first move nothing is locked yet.
    expect(runnerLocked(fevgaSideOf(start, 'white'), target)).toBe(false);
    // No runner rule, no target.
    const rules = getPreset('fevga');
    expect(runnerTargetOf({ ...rules, movement: { ...rules.movement, runnerRule: false } })).toBe(
      null,
    );
    expect(
      runnerTargetOf({ ...rules, movement: { ...rules.movement, runnerTarget: 'reachQuarter' } }),
    ).toBe(12);
  });
});

describe('fevga heuristic: basic shape', () => {
  it('has an id and a variant', () => {
    expect(fevgaHeuristic.id).toBe(FEVGA_HEURISTIC_ID);
    expect(fevgaHeuristic.variant).toBe('fevga');
  });

  it('gives numbers in range, and equity = 2·win − 1 + winDouble − loseDouble', () => {
    for (const state of randomFevgaPositions(3, 300)) {
      const e = fevgaHeuristic.evaluate(state);
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

  it('is the same for White and Black (the colours are mirrors)', () => {
    const white = fevgaHeuristic.evaluate(start);
    const black = fevgaHeuristic.evaluate({ ...start, toMove: 'black' });
    expect(white.equity).toBeCloseTo(black.equity, 12);
    // The player to roll is a little ahead at the start.
    expect(white.win).toBeGreaterThan(0.5);
    expect(white.win).toBeLessThan(0.6);
    for (const state of randomFevgaPositions(4, 100)) {
      const a = fevgaHeuristic.evaluate(state);
      const b = fevgaHeuristic.evaluate(mirrored(state));
      expect(b.equity).toBeCloseTo(a.equity, 12);
    }
  });

  it('knows a finished game', () => {
    expect(fevgaHeuristic.evaluate(position({}, { 6: 15 }, 'black'))).toEqual({
      win: 0,
      winDouble: 0,
      loseDouble: 1,
      equity: -2,
    });
    expect(fevgaHeuristic.evaluate(position({ 1: 2 }, {}, 'white'))).toEqual({
      win: 0,
      winDouble: 0,
      loseDouble: 0,
      equity: -1,
    });
  });

  it('takes its weights from the config object', () => {
    // White's runner is locked and Black is through.
    const state = position({ 24: 14, 15: 1 }, { 24: 14, 9: 1 });
    const heavy = createFevgaHeuristic({ ...FEVGA_DEFAULT_WEIGHTS, runnerLock: 3 });
    expect(heavy.evaluate(state).equity).toBeLessThan(fevgaHeuristic.evaluate(state).equity);
  });

  it('scoreTurns gives the same scores as applyTurn + evaluate', () => {
    for (const state of randomFevgaPositions(5, 150)) {
      const dice = state.dice ?? [1, 2];
      const turns = fevga.legalTurns(state, dice);
      const fast = fevgaHeuristic.scoreTurns?.(state, turns) ?? [];
      turns.forEach((turn, i) => {
        const after = fevga.applyTurn(state, turn);
        const result = fevga.result(after);
        const slow =
          result === null
            ? -fevgaHeuristic.evaluate(after).equity
            : result.winner === state.toMove
              ? result.points
              : -result.points;
        expect(fast[i]?.gameOver).toBe(result !== null);
        expect(fast[i]?.score).toBeCloseTo(slow, 12);
      });
    }
  });

  it('scores a winning turn with its points: 2 if the loser has none off', () => {
    const state: GameState = { ...position({ 1: 1 }, { 6: 15 }), dice: [3, 1] };
    const turns = fevga.legalTurns(state, [3, 1]);
    const scores = fevgaHeuristic.scoreTurns?.(state, turns) ?? [];
    expect(scores.every((s) => s.gameOver && s.score === 2)).toBe(true);
    const single: GameState = { ...position({ 1: 1 }, { 6: 14 }), dice: [3, 1] };
    const one = fevgaHeuristic.scoreTurns?.(single, fevga.legalTurns(single, [3, 1])) ?? [];
    expect(one.every((s) => s.gameOver && s.score === 1)).toBe(true);
  });
});

describe('fevga heuristic: features', () => {
  it('a prime in front of the opponent beats the same points spread out', () => {
    // Black has 15 on its mother (W12). Same pips (120) for White both times.
    const black = { 24: 15 };
    const prime = whiteEquityWaiting({ 6: 3, 7: 3, 8: 3, 9: 3, 10: 3 }, black);
    const spread = whiteEquityWaiting({ 2: 3, 6: 3, 8: 3, 10: 3, 14: 3 }, black);
    expect(prime).toBeGreaterThan(spread);
    const state = position({ 6: 3, 7: 3, 8: 3, 9: 3, 10: 3 }, black, 'black');
    const f = sideFeatures(
      fevgaSideOf(state, 'black'),
      fevgaSideOf(state, 'white'),
      11,
      FEVGA_DEFAULT_WEIGHTS.primeShape,
    );
    expect(f[feature('prime')]).toBe(FEVGA_DEFAULT_WEIGHTS.primeShape[5]);
    expect(f[feature('pointsAhead')]).toBe(5);
  });

  it('a runner that is through beats a locked runner', () => {
    const black = { 24: 14, 9: 1 };
    expect(whiteEquityWaiting({ 24: 14, 11: 1 }, black)).toBeGreaterThan(
      whiteEquityWaiting({ 24: 14, 13: 1 }, black),
    );
  });

  it('counts the dice with no move: a runner blocked by six points cannot move', () => {
    // White's runner on W15 is locked. Black holds W9–14 (its own 21–24, 1 and 2).
    const state = position({ 24: 14, 15: 1 }, { 21: 3, 22: 3, 23: 3, 24: 3, 1: 1, 2: 2 });
    const f = sideFeatures(
      fevgaSideOf(state, 'white'),
      fevgaSideOf(state, 'black'),
      11,
      FEVGA_DEFAULT_WEIGHTS.primeShape,
    );
    expect(f[feature('stuck')]).toBe(6);
    expect(f[feature('runnerLock')]).toBe(1);
    // The engine agrees: every roll is a pass.
    for (const dice of [
      [6, 5],
      [1, 1],
      [3, 2],
    ] as const) {
      expect(fevga.legalTurns(state, dice).map((t) => t.moves.length)).toEqual([0]);
    }
    // The blocked side is far behind.
    expect(fevgaHeuristic.evaluate(state).win).toBeLessThan(0.2);
  });

  it('the race evaluation grows with the pip lead', () => {
    const black = { 2: 5, 4: 5, 6: 5 };
    const behind = whiteEquityWaiting({ 4: 5, 5: 5, 6: 5 }, black);
    const even = whiteEquityWaiting({ 2: 5, 4: 5, 6: 5 }, black);
    const ahead = whiteEquityWaiting({ 1: 5, 2: 5, 3: 5 }, black);
    expect(behind).toBeLessThan(even);
    expect(even).toBeLessThan(ahead);
  });

  it('a race with no checker off may be lost double', () => {
    // White has borne off 10; Black still has 15 far from home (W22–24), past White.
    const e = fevgaHeuristic.evaluate(position({ 1: 5 }, { 10: 5, 11: 5, 12: 5 }, 'white'));
    expect(e.win).toBeGreaterThan(0.99);
    expect(e.winDouble).toBeGreaterThan(0.9);
  });
});
