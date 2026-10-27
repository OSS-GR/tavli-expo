import { describe, expect, it } from 'vitest';

import { createBoard, portes } from '@tavli/engine';
import type { GameState, PlayerId, SideLayout } from '@tavli/engine';

import { scoreTurns } from '../score';
import { randomPositions } from '../testing/random-positions';
import type { Evaluator } from '../types';
import { hasContact, sideOf } from './portes-board';
import { portesHeuristic } from './portes-heuristic';
import {
  PORTES_NET_INPUTS,
  createSparseInput,
  encodePortes,
  loadPortesNet,
  portesNet,
  shippedPortesNet,
  toEvaluation,
} from './portes-net';
import { PORTES_NET_V1 } from './portes-net-weights';

const start = portes.initialState({ startingPlayer: 'white' });

function position(white: SideLayout, black: SideLayout, toMove: PlayerId): GameState {
  return { ...start, toMove, board: createBoard({ white, black }, 'contrary') };
}

/** The dense inputs of a position, from the view of its player to move. */
function dense(state: GameState): number[] {
  const input = createSparseInput();
  encodePortes(
    sideOf(state, state.toMove),
    sideOf(state, state.toMove === 'white' ? 'black' : 'white'),
    input,
  );
  const out = new Array<number>(PORTES_NET_INPUTS).fill(0);
  for (let k = 0; k < input.count; k += 1) out[input.index[k] ?? 0] = input.value[k] ?? 0;
  return out;
}

describe('portes net: inputs', () => {
  it('encodes the start: TD-Gammon units per point, pips, shots and the heuristic', () => {
    const x = dense(start);
    // Roller (White) own 24: 2 checkers → units 1 and 2 on.
    expect(x.slice(23 * 4, 23 * 4 + 4)).toEqual([1, 1, 0, 0]);
    // Own 6: 5 checkers → 1, 1, 1, (5 − 3) / 2.
    expect(x.slice(5 * 4, 5 * 4 + 4)).toEqual([1, 1, 1, 1]);
    // Own 8: 3 checkers.
    expect(x.slice(7 * 4, 7 * 4 + 4)).toEqual([1, 1, 1, 0]);
    // The waiter (Black) starts at 96 and has the same layout.
    expect(x.slice(96, 192)).toEqual(x.slice(0, 96));
    // Nothing on the bar or off; 167 pips each; no blots, so no shots.
    expect(x.slice(192, 196)).toEqual([0, 0, 0, 0]);
    expect(x[196]).toBeCloseTo(1.67, 12);
    expect(x[197]).toBeCloseTo(1.67, 12);
    expect(x.slice(198, 200)).toEqual([0, 0]);
    // A symmetric start: the heuristic's contact score is only the small edge of the roll.
    expect(x[200]).toBeGreaterThan(0);
    expect(x[200]).toBeLessThan(0.1);
  });

  it('is the same for both colours (each from its own view)', () => {
    for (const state of randomPositions(4, 60)) {
      const mirrored: GameState = {
        ...state,
        toMove: state.toMove === 'white' ? 'black' : 'white',
        board: {
          ...state.board,
          points: [...state.board.points]
            .reverse()
            .map((p) => ({ ...p, white: p.black, black: p.white })),
          bar: { white: state.board.bar.black, black: state.board.bar.white },
          off: { white: state.board.off.black, black: state.board.off.white },
          outside: { white: state.board.outside.black, black: state.board.outside.white },
        },
      };
      expect(dense(mirrored)).toEqual(dense(state));
    }
  });

  it('keeps every index in range', () => {
    for (const state of randomPositions(6, 200)) {
      const input = createSparseInput();
      const opp = state.toMove === 'white' ? 'black' : 'white';
      encodePortes(sideOf(state, state.toMove), sideOf(state, opp), input);
      for (let k = 0; k < input.count; k += 1) {
        expect(input.index[k]).toBeGreaterThanOrEqual(0);
        expect(input.index[k]).toBeLessThan(PORTES_NET_INPUTS);
      }
    }
  });
});

describe('portes net: the shipped weights', () => {
  it('load, and stay under 200 KB', () => {
    const net = shippedPortesNet();
    expect(net.inputs).toBe(PORTES_NET_INPUTS);
    expect(net.hidden).toBeGreaterThanOrEqual(40);
    expect(net.w1.length).toBe(net.inputs * net.hidden);
    expect(PORTES_NET_V1.data.length).toBeLessThan(200_000);
    for (const w of net.w1) expect(Number.isFinite(w)).toBe(true);
  });

  it('reject a file with the wrong sizes', () => {
    expect(() => loadPortesNet({ ...PORTES_NET_V1, inputs: 10 })).toThrow(RangeError);
    expect(() => loadPortesNet({ ...PORTES_NET_V1, hidden: PORTES_NET_V1.hidden + 1 })).toThrow(
      RangeError,
    );
  });
});

describe('portes net: evaluation', () => {
  it('gives numbers in range, and equity = 2·win − 1 + winDouble − loseDouble', () => {
    for (const state of randomPositions(3, 300)) {
      const e = portesNet.evaluate(state);
      for (const p of [e.win, e.winDouble, e.loseDouble]) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
      expect(e.winDouble).toBeLessThanOrEqual(e.win + 1e-12);
      expect(e.loseDouble).toBeLessThanOrEqual(1 - e.win + 1e-12);
      expect(e.equity).toBeCloseTo(2 * e.win - 1 + e.winDouble - e.loseDouble, 12);
    }
  });

  it('caps the diplo chances at the win and loss chances', () => {
    expect(toEvaluation(0.3, 0.5, 0.9)).toEqual({
      win: 0.3,
      winDouble: 0.3,
      loseDouble: 0.7,
      equity: 2 * 0.3 - 1 + 0.3 - 0.7,
    });
  });

  it('uses the heuristic for a race (no contact)', () => {
    let races = 0;
    for (const state of randomPositions(8, 600, 1)) {
      const opp = state.toMove === 'white' ? 'black' : 'white';
      if (hasContact(sideOf(state, state.toMove), sideOf(state, opp))) continue;
      races += 1;
      expect(portesNet.evaluate(state)).toEqual(portesHeuristic.evaluate(state));
    }
    expect(races).toBeGreaterThan(0);
  });

  it('likes a closed board with the opponent on the bar', () => {
    // White to roll; Black has a checker on the bar against White's 6-point prime.
    const closed = position(
      { points: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3 } },
      { points: { 6: 4, 8: 3, 10: 3, 13: 4 }, bar: 1 },
      'white',
    );
    expect(portesNet.evaluate(closed).win).toBeGreaterThan(0.9);
    // The same board, but Black to roll and White on the bar against Black's prime.
    const lost = position(
      { points: { 6: 4, 8: 3, 10: 3, 13: 4 }, bar: 1 },
      { points: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3 } },
      'white',
    );
    expect(portesNet.evaluate(lost).win).toBeLessThan(0.1);
  });

  it('gives pinned values for fixed positions (catches a changed net or heuristic)', () => {
    // The last input is the heuristic's contact score, so a retuned
    // `PORTES_DEFAULT_WEIGHTS` changes these numbers: then retrain the net.
    const atStart = portesNet.evaluate(start);
    expect(atStart.win).toBeCloseTo(0.5305122, 6);
    expect(atStart.equity).toBeCloseTo(0.0743568, 6);
    // After White's 3-1 (8/5 6/5), Black to roll.
    const afterThreeOne = position(
      { points: { 24: 2, 13: 5, 8: 2, 6: 4, 5: 2 } },
      { points: { 24: 2, 13: 5, 8: 3, 6: 5 } },
      'black',
    );
    const e = portesNet.evaluate(afterThreeOne);
    expect(e.win).toBeCloseTo(0.4600347, 6);
    expect(e.equity).toBeCloseTo(-0.0943059, 6);
  });

  it('the fast path scores like the engine path (applyTurn, then evaluate)', () => {
    const slow: Evaluator = {
      id: 'slow',
      variant: 'portes',
      evaluate: (state) => portesNet.evaluate(state),
    };
    for (const state of randomPositions(17, 120, 3)) {
      const turns = portes.legalTurns(state, state.dice ?? [1, 2]);
      const fast = scoreTurns(portes, portesNet, state, turns);
      const generic = scoreTurns(portes, slow, state, turns);
      fast.forEach((s, i) => {
        expect(s.gameOver).toBe(generic[i]?.gameOver);
        expect(s.score).toBeCloseTo(generic[i]?.score ?? NaN, 12);
      });
    }
  });
});
